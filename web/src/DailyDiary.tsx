import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  FileText,
  Heart,
  Home,
  LoaderCircle,
  Lock,
  Unlock
} from "lucide-react";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { loadLocalProfiles } from "./CharacterWorld";

type Lang = "ko" | "en" | "zh";
type Role = "belle" | "partner";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type DailyDiaryEntry = {
  date: string; // YYYY-MM-DD
  role: Role;
  authorName: string;
  content: string; // TipTap HTML content
  isShared: boolean; // false by default (private until toggled ON)
  heartedByPartner?: boolean;
  updatedAtMs?: number;
};

type DiaryIndexMap = Record<
  string,
  {
    belleWritten?: boolean;
    belleShared?: boolean;
    partnerWritten?: boolean;
    partnerShared?: boolean;
    updatedAtMs?: number;
  }
>;

type DailyDiaryProps = {
  lang: Lang;
  onBack: () => void;
};

const DIARY_LOCAL_STORAGE_KEY = "forbelle_daily_diary_entries_v1";
const DIARY_INDEX_STORAGE_KEY = "forbelle_daily_diary_index_v1";

export function getLocalTodayDateStr(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalTodayDateStr(dt);
}

function formatReadableDate(dateStr: string, lang: Lang): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const locale = lang === "en" ? "en-US" : lang === "zh" ? "zh-TW" : "ko-KR";
  return dt.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

function getTimelineDateParts(dateStr: string, lang: Lang): { md: string; dow: string; dayNum: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const locale = lang === "en" ? "en-US" : lang === "zh" ? "zh-TW" : "ko-KR";
  const dow = dt.toLocaleDateString(locale, { weekday: "short" });
  return {
    md: `${m}.${String(d).padStart(2, "0")}`,
    dow,
    dayNum: String(d)
  };
}

function hasMeaningfulContent(htmlOrText: string): boolean {
  if (!htmlOrText) return false;
  const plain = htmlOrText
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return plain.length > 0 || /<img\b/i.test(htmlOrText);
}

function normalizeHtmlContent(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<")) return raw;
  return trimmed
    .split(/\n+/)
    .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
}

function loadLocalDiaryMap(): Record<string, DailyDiaryEntry> {
  try {
    return JSON.parse(localStorage.getItem(DIARY_LOCAL_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveLocalDiaryEntry(entry: DailyDiaryEntry) {
  try {
    const map = loadLocalDiaryMap();
    map[`${entry.date}_${entry.role}`] = entry;
    localStorage.setItem(DIARY_LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota error
  }
}

function loadLocalDiaryIndex(): DiaryIndexMap {
  try {
    return JSON.parse(localStorage.getItem(DIARY_INDEX_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function DailyDiary({ lang, onBack }: DailyDiaryProps) {
  const tr = (ko: string, en: string, zh: string) =>
    lang === "en" ? en : lang === "zh" ? zh : ko;

  const currentEmail =
    auth?.currentUser?.email?.toLowerCase() ||
    localStorage.getItem("belle_user_email")?.toLowerCase() ||
    "";
  const myRole: Role = currentEmail === "belle@kim.com" ? "belle" : "partner";
  const partnerRole: Role = myRole === "belle" ? "partner" : "belle";

  const profiles = useMemo(() => loadLocalProfiles(), []);
  const myName = profiles[myRole].name || (myRole === "belle" ? "Belle" : "우리 강아지");
  const partnerName =
    profiles[partnerRole].name || (partnerRole === "belle" ? "Belle" : "우리 강아지");

  const [todayDateStr, setTodayDateStr] = useState<string>(() => getLocalTodayDateStr());
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalTodayDateStr());
  const [activePage, setActivePage] = useState<"mine" | "partner">("mine");
  const [diaryFont, setDiaryFont] = useState<"handwriting" | "serif" | "round">(() => {
    const saved = localStorage.getItem("belle_diary_font_style_v1");
    return saved === "serif" || saved === "round" || saved === "handwriting"
      ? saved
      : "handwriting";
  });

  const handleCycleDiaryFont = (e: React.MouseEvent) => {
    e.stopPropagation();
    const order: Array<"handwriting" | "serif" | "round"> = ["handwriting", "serif", "round"];
    const next = order[(order.indexOf(diaryFont) + 1) % order.length];
    setDiaryFont(next);
    try {
      localStorage.setItem("belle_diary_font_style_v1", next);
    } catch {
      // ignore storage errors
    }
  };

  const emptyEntry = (date: string, role: Role): DailyDiaryEntry => ({
    date,
    role,
    authorName: role === myRole ? myName : partnerName,
    content: "",
    isShared: false,
    heartedByPartner: false,
    updatedAtMs: 0
  });

  const [myEntry, setMyEntry] = useState<DailyDiaryEntry>(() => {
    const today = getLocalTodayDateStr();
    return loadLocalDiaryMap()[`${today}_${myRole}`] || emptyEntry(today, myRole);
  });

  const [partnerEntry, setPartnerEntry] = useState<DailyDiaryEntry>(() => {
    const today = getLocalTodayDateStr();
    return loadLocalDiaryMap()[`${today}_${partnerRole}`] || emptyEntry(today, partnerRole);
  });

  const [diaryIndex, setDiaryIndex] = useState<DiaryIndexMap>(loadLocalDiaryIndex);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const todayRef = useRef(todayDateStr);
  todayRef.current = todayDateStr;
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const myEntryRef = useRef(myEntry);
  myEntryRef.current = myEntry;
  const saveTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef<boolean>(false);
  const hydratingEditorRef = useRef<boolean>(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const timelineStripRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: tr(
          "오늘의 마음을 천천히 적어보세요…",
          "Write what is on your heart today…",
          "慢慢写下今天的心情吧…"
        )
      }),
      Image
    ],
    editorProps: {
      attributes: {
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        "data-gramm": "false",
        "data-gramm_editor": "false",
        "data-enable-grammarly": "false"
      }
    },
    content: normalizeHtmlContent(myEntry.content),
    editable: true,
    onUpdate: ({ editor: ed }) => {
      if (hydratingEditorRef.current) return;
      const html = ed.getHTML();
      const nextEntry: DailyDiaryEntry = {
        ...myEntryRef.current,
        content: html,
        updatedAtMs: Date.now()
      };
      scheduleAutoSave(nextEntry);
    }
  });

  useEffect(() => {
    if (!editor?.view?.dom) return;
    editor.view.dom.setAttribute("spellcheck", "false");
    editor.view.dom.setAttribute("autocorrect", "off");
    editor.view.dom.setAttribute("autocapitalize", "off");
  }, [editor]);

  const setEditorHtmlSafely = (rawContent: string) => {
    if (!editor) return;
    const normalized = normalizeHtmlContent(rawContent);
    if (editor.getHTML() === normalized) return;
    hydratingEditorRef.current = true;
    editor.commands.setContent(normalized || "", false);
    hydratingEditorRef.current = false;
  };

  // Automatic midnight date rollover (00:00 -> advances to new day automatically)
  useEffect(() => {
    const checkDateRollover = () => {
      const nowToday = getLocalTodayDateStr();
      if (nowToday !== todayRef.current) {
        const wasOnToday = selectedDateRef.current === todayRef.current;
        todayRef.current = nowToday;
        setTodayDateStr(nowToday);
        if (wasOnToday) {
          void flushPendingSave().then(() => {
            setSelectedDate(nowToday);
          });
        }
      }
    };
    const timer = window.setInterval(checkDateRollover, 15000);
    window.addEventListener("focus", checkDateRollover);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkDateRollover);
    };
  }, []);

  // Build a continuous 21-day horizontal date timeline centered around selectedDate / today
  const timelineDates = useMemo(() => {
    const list: string[] = [];
    for (let i = -14; i <= 4; i++) {
      list.push(shiftDateString(selectedDate, i));
    }
    return list;
  }, [selectedDate]);

  // Smoothly center the active date button inside the horizontal timeline strip
  useEffect(() => {
    const container = timelineStripRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLElement>(".diary-timeline-item.active");
    if (!activeBtn) return;
    const targetLeft =
      activeBtn.offsetLeft - container.clientWidth / 2 + activeBtn.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [selectedDate]);

  const persistEntryToCloud = async (entryToSave: DailyDiaryEntry) => {
    saveLocalDiaryEntry(entryToSave);

    const hasWritten = hasMeaningfulContent(entryToSave.content);
    const curIdx = loadLocalDiaryIndex();
    const prevDateMeta = curIdx[entryToSave.date] || {};
    const nextDateMeta = {
      ...prevDateMeta,
      ...(entryToSave.role === "belle"
        ? { belleWritten: hasWritten, belleShared: entryToSave.isShared && hasWritten }
        : { partnerWritten: hasWritten, partnerShared: entryToSave.isShared && hasWritten }),
      updatedAtMs: Date.now()
    };
    const nextIndex: DiaryIndexMap = {
      ...curIdx,
      [entryToSave.date]: nextDateMeta
    };
    setDiaryIndex(nextIndex);
    localStorage.setItem(DIARY_INDEX_STORAGE_KEY, JSON.stringify(nextIndex));

    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
      setSaveState("saved");
      return true;
    }

    setSaveState("saving");
    const docId = `__diary_${entryToSave.date}_${entryToSave.role}`;
    const nowMs = Date.now();
    try {
      await Promise.all([
        setDoc(
          doc(db, "topics", docId),
          {
            ...entryToSave,
            isSystemState: true,
            isDiaryEntry: true,
            createdBy: auth.currentUser.email || "",
            updatedAtMs: nowMs,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        ),
        setDoc(
          doc(db, "topics", "__diary_index"),
          {
            isSystemState: true,
            isDiaryIndex: true,
            dates: {
              [entryToSave.date]: nextDateMeta
            },
            updatedAtMs: nowMs
          },
          { merge: true }
        )
      ]);
      setSaveState(dirtyRef.current ? "dirty" : "saved");
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  };

  const flushPendingSave = async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dirtyRef.current) return true;
    dirtyRef.current = false;
    return await persistEntryToCloud(myEntryRef.current);
  };

  const scheduleAutoSave = (nextEntry: DailyDiaryEntry) => {
    myEntryRef.current = nextEntry;
    setMyEntry(nextEntry);
    saveLocalDiaryEntry(nextEntry);
    dirtyRef.current = true;
    setSaveState("dirty");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      dirtyRef.current = false;
      void persistEntryToCloud(nextEntry);
    }, 600);
  };

  // Toggle Share status immediately in real time
  const handleToggleShare = async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    const nextEntry: DailyDiaryEntry = {
      ...myEntryRef.current,
      isShared: !myEntryRef.current.isShared,
      updatedAtMs: Date.now()
    };
    myEntryRef.current = nextEntry;
    setMyEntry(nextEntry);
    await persistEntryToCloud(nextEntry);
  };

  const handleTogglePartnerHeart = async () => {
    const nextPartner: DailyDiaryEntry = {
      ...partnerEntry,
      heartedByPartner: !partnerEntry.heartedByPartner
    };
    setPartnerEntry(nextPartner);
    saveLocalDiaryEntry(nextPartner);
    if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
    const partnerDocId = `__diary_${selectedDate}_${partnerRole}`;
    await setDoc(
      doc(db, "topics", partnerDocId),
      {
        heartedByPartner: nextPartner.heartedByPartner,
        isSystemState: true
      },
      { merge: true }
    ).catch(() => {});
  };

  // Subscribe to selectedDate's Belle & Partner diary documents + __diary_index
  useEffect(() => {
    const localMap = loadLocalDiaryMap();
    const initialMine = localMap[`${selectedDate}_${myRole}`] || emptyEntry(selectedDate, myRole);
    const initialPartner =
      localMap[`${selectedDate}_${partnerRole}`] || emptyEntry(selectedDate, partnerRole);

    dirtyRef.current = false;
    myEntryRef.current = initialMine;
    setMyEntry(initialMine);
    setPartnerEntry(initialPartner);
    setSaveState("saved");
    setEditorHtmlSafely(initialMine.content);

    if (!isFirebaseConfigured || !db || !auth?.currentUser) return;

    const myDocId = `__diary_${selectedDate}_${myRole}`;
    const partnerDocId = `__diary_${selectedDate}_${partnerRole}`;

    const unsubMine = onSnapshot(
      doc(db, "topics", myDocId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Partial<DailyDiaryEntry> & { title?: string };
        if (dirtyRef.current) return;
        const remoteMs = data.updatedAtMs || 0;
        const localMs = myEntryRef.current.updatedAtMs || 0;
        if (remoteMs >= localMs) {
          const combinedContent =
            data.content ||
            (data.title ? `<p><strong>${data.title}</strong></p>` : "");
          const merged: DailyDiaryEntry = {
            ...emptyEntry(selectedDate, myRole),
            ...myEntryRef.current,
            ...data,
            content: combinedContent,
            date: selectedDate,
            role: myRole
          };
          myEntryRef.current = merged;
          setMyEntry(merged);
          saveLocalDiaryEntry(merged);
          setEditorHtmlSafely(merged.content);
        }
      },
      () => {}
    );

    const unsubPartner = onSnapshot(
      doc(db, "topics", partnerDocId),
      (snap) => {
        if (!snap.exists()) {
          setPartnerEntry(emptyEntry(selectedDate, partnerRole));
          return;
        }
        const data = snap.data() as Partial<DailyDiaryEntry> & { title?: string };
        const combinedContent =
          data.content ||
          (data.title ? `<p><strong>${data.title}</strong></p>` : "");
        const merged: DailyDiaryEntry = {
          ...emptyEntry(selectedDate, partnerRole),
          ...data,
          content: combinedContent,
          date: selectedDate,
          role: partnerRole
        };
        setPartnerEntry(merged);
        saveLocalDiaryEntry(merged);
      },
      () => {}
    );

    const unsubIndex = onSnapshot(
      doc(db, "topics", "__diary_index"),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { dates?: DiaryIndexMap };
        if (data.dates) {
          setDiaryIndex((prev) => {
            const merged = { ...prev, ...data.dates };
            localStorage.setItem(DIARY_INDEX_STORAGE_KEY, JSON.stringify(merged));
            return merged;
          });
        }
      },
      () => {}
    );

    return () => {
      unsubMine();
      unsubPartner();
      unsubIndex();
    };
  }, [selectedDate, myRole, partnerRole, editor]);

  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === "hidden") {
        void flushPendingSave();
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      void flushPendingSave();
    };
  }, []);

  const handleSelectDate = async (nextDate: string) => {
    if (!nextDate || nextDate === selectedDate) return;
    await flushPendingSave();
    setSelectedDate(nextDate);
  };

  const myHasWritten = hasMeaningfulContent(myEntry.content);
  const partnerHasWritten = hasMeaningfulContent(partnerEntry.content);
  const partnerIsShared = Boolean(partnerEntry.isShared && partnerHasWritten);

  const topicSaveLabel =
    saveState === "saving"
      ? tr("저장 중...", "Saving...", "保存中...")
      : saveState === "dirty"
        ? tr("작성 중...", "Writing...", "编辑中...")
        : saveState === "error"
          ? tr("다시 저장", "Retry", "重试")
          : tr("저장됨", "Saved", "已保存");

  return (
    <motion.section
      key="topics"
      className={`topics-workspace diary-font-${diaryFont}`}
      data-diary-font={diaryFont}
      spellCheck={false}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      {/* Unified Topbar with Integrated Horizontal Date Timeline */}
      <header className="topics-topbar diary-unified-topbar">
        <div className="diary-topbar-main">
          <button
            type="button"
            className="topics-home-button diary-always-home"
            onClick={onBack}
            aria-label={tr("홈으로", "Back home", "返回主页")}
          >
            <Home size={19} />
          </button>

          <div className="topics-heading diary-heading-nav">
            <span>
              <Heart size={9} fill="currentColor" />{" "}
              {tr("둘만의 다이어리 · 오늘의 기록", "OUR DIARY · DAILY NOTES", "我们俩的日记 · 每日记录")}
            </span>
            <div className="diary-heading-date-row">
              <button
                type="button"
                className="diary-date-step-btn"
                onClick={() => void handleSelectDate(shiftDateString(selectedDate, -1))}
                aria-label={tr("이전 날짜", "Previous day", "前一天")}
              >
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                className="diary-date-title-btn"
                onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
                title={tr("달력에서 날짜 선택", "Pick date from calendar", "从日历选择日期")}
              >
                <h2>{formatReadableDate(selectedDate, lang)}</h2>
                {selectedDate === todayDateStr && (
                  <em className="diary-today-chip">{tr("오늘", "Today", "今天")}</em>
                )}
              </button>

              <button
                type="button"
                className="diary-date-step-btn"
                onClick={() => void handleSelectDate(shiftDateString(selectedDate, 1))}
                aria-label={tr("다음 날짜", "Next day", "后一天")}
              >
                <ChevronRight size={16} />
              </button>

              {selectedDate !== todayDateStr && (
                <button
                  type="button"
                  className="diary-return-today-btn"
                  onClick={() => void handleSelectDate(todayDateStr)}
                >
                  {tr("오늘로", "Today", "今天")}
                </button>
              )}

              <input
                ref={dateInputRef}
                type="date"
                className="hidden-date-input"
                value={selectedDate}
                onChange={(e) => e.target.value && void handleSelectDate(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className={`topic-save-status ${saveState}`}
            onClick={() => saveState === "error" && void flushPendingSave()}
            disabled={saveState !== "error"}
          >
            <span className="topic-save-icon" aria-hidden="true">
              {saveState === "saving" ? (
                <LoaderCircle className="topic-spin" size={15} />
              ) : saveState === "error" ? (
                <CloudOff size={15} />
              ) : saveState === "saved" ? (
                <Heart size={15} fill="currentColor" />
              ) : (
                <Cloud size={15} />
              )}
            </span>
            <span>{topicSaveLabel}</span>
          </button>

          {/* Share Toggle Button (Private by default -> Shared with Partner) */}
          <button
            type="button"
            role="switch"
            aria-checked={myEntry.isShared}
            className={`topics-new-button diary-share-pill ${myEntry.isShared ? "shared" : "private"}`}
            onClick={() => void handleToggleShare()}
            title={
              myEntry.isShared
                ? tr("클릭하면 나만 보기로 전환됩니다", "Click to make private", "点击切换为私密")
                : tr("클릭하면 상대방도 내 오늘 일기를 볼 수 있어요", "Click to share with partner", "点击向对方公开今日日记")
            }
          >
            {myEntry.isShared ? <Unlock size={15} /> : <Lock size={15} />}
            <span>
              {myEntry.isShared
                ? tr("상대방에게 공개 중", "Shared", "已公开")
                : tr("비공개", "Private", "私密")}
            </span>
          </button>
        </div>

        {/* Continuous Horizontal Date Timeline Bar integrated inside Topbar */}
        <div
          ref={timelineStripRef}
          className="diary-date-timeline"
          role="tablist"
          aria-label={tr("날짜 타임라인", "Date timeline", "日期时间轴")}
        >
          {timelineDates.map((dStr) => {
            const isSelected = dStr === selectedDate;
            const isToday = dStr === todayDateStr;
            const parts = getTimelineDateParts(dStr, lang);
            const meta = diaryIndex[dStr];
            const belleWrote = Boolean(
              meta?.belleWritten ||
                (dStr === selectedDate &&
                  ((myRole === "belle" && myHasWritten) ||
                    (partnerRole === "belle" && partnerHasWritten)))
            );
            const partnerWrote = Boolean(
              meta?.partnerWritten ||
                (dStr === selectedDate &&
                  ((myRole === "partner" && myHasWritten) ||
                    (partnerRole === "partner" && partnerHasWritten)))
            );
            return (
              <button
                key={dStr}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`diary-timeline-item ${isSelected ? "active" : ""} ${isToday ? "today" : ""}`}
                onClick={() => void handleSelectDate(dStr)}
              >
                <span className="tl-dow">{isToday ? tr("오늘", "Today", "今天") : parts.dow}</span>
                <strong className="tl-md">{parts.md}</strong>
                <span className="tl-dots" aria-hidden="true">
                  {belleWrote && <i className="tl-dot belle" />}
                  {partnerWrote && <i className="tl-dot partner" />}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Editor Shell:
          - Desktop (> 960px): Side-by-Side 2 Pages (My Diary Left + Partner's Diary Right)
          - Mobile/Tablet (<= 960px): Single Paper with inline [내 일기 | 벨 일기] switcher */}
      <div className="topic-editor-shell diary-spread-shell">
        <div className="diary-spread-grid">
          {/* ===============================================================
              PAGE 1 (LEFT ON DESKTOP): MY DIARY PAPER
              =============================================================== */}
          <div
            className={`topic-editor-page diary-sheet-mine ${activePage === "mine" ? "mobile-visible" : "mobile-hidden"}`}
            onClick={() => editor?.chain().focus().run()}
          >
            <Heart className="topic-page-heart" size={22} fill="currentColor" aria-hidden="true" />

            <div className="topic-editor-date diary-paper-meta-row">
              <span className="diary-paper-date-label">
                <Calendar size={13} />
                {formatReadableDate(selectedDate, lang)} ·{" "}
                <strong className="diary-page-owner-name">
                  {myName}{tr("의 일기", "'s Diary", "的日记")}
                </strong>
              </span>

              {/* Mobile-only inline switcher inside the paper header */}
              <div
                className="diary-inline-tabs mobile-only-tabs"
                role="tablist"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePage === "mine"}
                  className={`diary-inline-tab ${activePage === "mine" ? "active" : ""}`}
                  onClick={() => setActivePage("mine")}
                >
                  <span>{myName}</span>
                  <small>{myEntry.isShared ? "🔓" : "🔒"}</small>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePage === "partner"}
                  className={`diary-inline-tab ${activePage === "partner" ? "active" : ""}`}
                  onClick={() => setActivePage("partner")}
                >
                  <span>{partnerName}</span>
                  <small>{partnerIsShared ? "🔓" : "🔒"}</small>
                </button>
              </div>

              {/* Desktop badge showing my current privacy state */}
              <span className={`diary-desktop-privacy-tag ${myEntry.isShared ? "shared" : "private"}`}>
                {myEntry.isShared
                  ? tr("🔓 상대방에게 공개 중", "🔓 Shared", "🔓 已公开")
                  : tr("🔒 비공개 (나만 보기)", "🔒 Private", "🔒 私密")}
              </span>
            </div>

            <div className="topic-writing-note diary-writing-note-row">
              <span className="diary-writing-note-text">
                <Heart size={10} fill="currentColor" />
                <span>
                  {myEntry.isShared
                    ? tr(
                        `마음 가는 대로, 천천히 · ${partnerName}님도 함께 볼 수 있어요`,
                        `Slowly, in your own words · Shared with ${partnerName}`,
                        `跟随心意，慢慢写 · 已向 ${partnerName} 公开`
                      )
                    : tr(
                        "마음 가는 대로, 천천히 · 상단 [비공개] 버튼을 누르면 상대방에게 공개됩니다",
                        "Slowly, in your own words · Toggle Share above to reveal to partner",
                        "跟随心意，慢慢写 · 点击顶部按钮即可向对方公开"
                      )}
                </span>
              </span>

              <button
                type="button"
                className="diary-font-chip"
                onClick={handleCycleDiaryFont}
                title={tr("글씨체 바꾸기", "Switch diary font", "切换日记字体")}
              >
                ✦{" "}
                {diaryFont === "handwriting"
                  ? tr("감성 손글씨", "Handwriting", "手写体")
                  : diaryFont === "serif"
                    ? tr("고운 편지체", "Warm Serif", "信笺体")
                    : tr("포근 돋움체", "Soft Round", "圆润体")}
              </button>
            </div>

            <EditorContent
              editor={editor}
              className={`topic-editor-content font-${diaryFont}`}
              spellCheck={false}
            />

            {myEntry.heartedByPartner && (
              <div className="diary-paper-heart-note" onClick={(e) => e.stopPropagation()}>
                <Heart size={12} fill="currentColor" />
                <span>
                  {partnerName}
                  {tr("님이 이 일기를 읽고 마음을 남겼어요", " read this entry and left a heart", " 读了这篇日记并留下了爱心")}
                </span>
              </div>
            )}
          </div>

          {/* ===============================================================
              PAGE 2 (RIGHT ON DESKTOP): PARTNER'S DIARY PAPER
              =============================================================== */}
          <div
            className={`topic-editor-page diary-sheet-partner ${activePage === "partner" ? "mobile-visible" : "mobile-hidden"}`}
          >
            <Heart className="topic-page-heart" size={22} fill="currentColor" aria-hidden="true" />

            <div className="topic-editor-date diary-paper-meta-row">
              <span className="diary-paper-date-label">
                <Calendar size={13} />
                {formatReadableDate(selectedDate, lang)} ·{" "}
                <strong className="diary-page-owner-name">
                  {partnerName}{tr("의 일기", "'s Diary", "的日记")}
                </strong>
              </span>

              {/* Mobile-only inline switcher inside the paper header */}
              <div
                className="diary-inline-tabs mobile-only-tabs"
                role="tablist"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePage === "mine"}
                  className={`diary-inline-tab ${activePage === "mine" ? "active" : ""}`}
                  onClick={() => setActivePage("mine")}
                >
                  <span>{myName}</span>
                  <small>{myEntry.isShared ? "🔓" : "🔒"}</small>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePage === "partner"}
                  className={`diary-inline-tab ${activePage === "partner" ? "active" : ""}`}
                  onClick={() => setActivePage("partner")}
                >
                  <span>{partnerName}</span>
                  <small>{partnerIsShared ? "🔓" : "🔒"}</small>
                </button>
              </div>

              <span className={`diary-desktop-privacy-tag ${partnerIsShared ? "shared" : "private"}`}>
                {partnerIsShared
                  ? tr("🔓 공개됨", "🔓 Shared", "🔓 已公开")
                  : tr("🔒 비공개", "🔒 Private", "🔒 未公开")}
              </span>
            </div>

            <p className="topic-writing-note">
              <Heart size={10} fill="currentColor" />
              <span>
                {partnerName}
                {tr("님의 하루 기록", "'s note for this day", " 的今日记录")}
              </span>
            </p>

            {partnerIsShared ? (
              <div>
                <div
                  className={`topic-editor-content diary-readonly-prose font-${diaryFont}`}
                  spellCheck={false}
                  dangerouslySetInnerHTML={{ __html: normalizeHtmlContent(partnerEntry.content) }}
                />
                <div className="diary-partner-heart-row">
                  <button
                    type="button"
                    className={`diary-heart-reaction-btn ${partnerEntry.heartedByPartner ? "active" : ""}`}
                    onClick={() => void handleTogglePartnerHeart()}
                  >
                    <Heart size={13} fill={partnerEntry.heartedByPartner ? "currentColor" : "none"} />
                    <span>
                      {partnerEntry.heartedByPartner
                        ? tr("마음을 전했어요 ♥", "Heart sent ♥", "已送出爱心 ♥")
                        : tr("잘 읽었어 하트 남기기 ♡", "Leave a heart ♡", "留下已读爱心 ♡")}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="topic-empty-state diary-paper-empty">
                <span className="topic-empty-icon">
                  {partnerHasWritten ? <Lock size={24} /> : <FileText size={26} />}
                  <Heart size={11} fill="currentColor" />
                </span>
                <p>
                  {partnerHasWritten
                    ? tr(
                        `${partnerName}님이 오늘의 일기를 작성했어요.`,
                        `${partnerName} has written a diary for this day.`,
                        `${partnerName} 已经写下了这一天的日记。`
                      )
                    : tr(
                        `아직 작성된 ${partnerName}님의 일기가 없어요.`,
                        `No diary entry from ${partnerName} for this day yet.`,
                        `${partnerName} 还没有写下这一天的日记。`
                      )}
                </p>
                <span className="diary-empty-sub">
                  {partnerHasWritten
                    ? tr(
                        `${partnerName}님이 상단 [비공개 → 공개] 토글을 켜면 여기에 일기가 바로 열립니다.`,
                        `When ${partnerName} turns on the Share toggle, it will appear right here.`,
                        `当 ${partnerName} 打开顶部公开开关后，日记内容会立即显示在这里。`
                      )
                    : tr(
                        "일기를 작성하고 공개로 설정하면 함께 읽을 수 있어요.",
                        "Once written and shared, you can read it together here.",
                        "写下日记并设为公开后即可一起阅读。"
                      )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
