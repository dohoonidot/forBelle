import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { songs, Song } from "./songs";
import { motion, AnimatePresence } from "framer-motion";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, writeBatch, where } from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db, storage, isFirebaseConfigured } from "./firebase";
import CharacterWorld from "./CharacterWorld";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import {
  Home,
  X,
  Menu,
  Music,
  Edit3,
  Settings,
  PlayCircle,
  Link as LinkIcon,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  MessageSquarePlus,
  FolderPlus,
  FilePlus,
  ChevronRight,
  ChevronDown,
  Heart,
  Calendar,
  MapPin,
  Sparkles,
  Maximize2,
  Images,
  MessageCircleQuestion,
  SlidersHorizontal,
  Smartphone,
  ArrowUpRight,
  LockKeyhole,
  PawPrint
} from "lucide-react";

type Cue = {
  startMs: number;
  endMs: number;
  text: string;
  twText?: string;
};

type RequestItem = {
  id: string;
  url: string;
  createdAt?: number;
  createdBy?: string;
  createdByName?: string;
};

type ChatMessage = {
  id: string;
  text: string;
  createdAt?: number;
  createdBy?: string;
  createdByName?: string;
  createdByPhotoURL?: string;
};

type TopicNode = {
  id: string;
  name: string;
  type: "folder" | "file";
  parentId?: string | null;
  content?: string;
  updatedAt?: number;
  createdBy?: string;
  defaultKey?: string;
};

type Profile = {
  nickname?: string;
  lang?: Lang;
  onboardingDone?: boolean;
  photoURL?: string;
  lineHeight?: number;
};

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type AppMode = "home" | "editor" | "viewer" | "request" | "message" | "topics" | "characters";
type Lang = "ko" | "en" | "zh";

type TopicTreeProps = {
  node: TopicNode;
  nodes: TopicNode[];
  expandedFolders: string[];
  toggleFolder: (id: string) => void;
  selectTopic: (node: TopicNode) => void;
  selectedId: string | null;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  createTopicNode: (type: "folder" | "file", parentId: string | null) => void;
  onRename: (node: TopicNode) => void;
  onDelete: (node: TopicNode) => void;
  onMove: (id: string, parentId: string | null) => void;
  editingId: string | null;
  editingName: string;
  setEditingName: (v: string) => void;
  onSaveRename: (id: string) => void;
  onCancelRename: () => void;
  tr: (ko: string, en: string, zh: string) => string;
  depth: number;
  onOpenContextMenu: (x: number, y: number, node: TopicNode) => void;
};

const TopicTreeNode = ({
  node,
  nodes,
  expandedFolders,
  toggleFolder,
  selectTopic,
  selectedId,
  selectedFolderId,
  onSelectFolder,
  createTopicNode,
  onRename,
  onDelete,
  onMove,
  editingId,
  editingName,
  setEditingName,
  onSaveRename,
  onCancelRename,
  tr,
  depth,
  onOpenContextMenu
}: TopicTreeProps) => {
  const children = nodes.filter((n) => n.parentId === node.id);
  const isFolder = node.type === "folder";
  const isExpanded = isFolder && expandedFolders.includes(node.id);
  const isEditing = editingId === node.id;
  const indent = depth * 12;
  const isSelected = selectedId === node.id || (isFolder && selectedFolderId === node.id);

  return (
    <li style={{ marginBottom: 2, borderBottom: "1px solid #eee" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "20px 16px 1fr",
          alignItems: "center",
          columnGap: 6,
          padding: "4px 6px",
          borderRadius: 6,
          marginLeft: indent,
          background: isSelected ? "#EEE7DD" : "transparent"
        }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", node.id);
        }}
        onDragOver={(e) => {
          if (isFolder) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!isFolder) return;
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          if (id && id !== node.id) onMove(id, node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu(e.clientX, e.clientY, node);
        }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (!touch) return;
          const timer = window.setTimeout(() => {
            onOpenContextMenu(touch.clientX, touch.clientY, node);
          }, 500);
          const clear = () => window.clearTimeout(timer);
          e.currentTarget.addEventListener("touchend", clear, { once: true });
          e.currentTarget.addEventListener("touchmove", clear, { once: true });
          e.currentTarget.addEventListener("touchcancel", clear, { once: true });
        }}
      >
        {isFolder ? (
          <button className="btn small" onClick={() => toggleFolder(node.id)} style={{ padding: "2px 4px" }}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <div style={{ width: 20 }} />
        )}
        <div style={{ width: 16, textAlign: "center" }}>{isFolder ? "📁" : "📄"}</div>
        {isEditing ? (
          <input
            className="input"
            style={{ minWidth: 0 }}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveRename(node.id);
              if (e.key === "Escape") onCancelRename();
            }}
            onBlur={() => onSaveRename(node.id)}
            autoFocus
          />
        ) : (
          <button
            className="btn small"
            style={{
              justifyContent: "flex-start",
              padding: "2px 4px",
              fontSize: 12
            }}
            onClick={() => {
              if (isFolder) {
                toggleFolder(node.id);
                onSelectFolder(node.id);
              } else {
                selectTopic(node);
              }
            }}
          >
            {node.name}
          </button>
        )}
      </div>
      {isFolder && isExpanded && children.length > 0 && (
        <ul className="song-list" style={{ marginTop: 2 }}>
          {children.map((child) => (
            <TopicTreeNode
              key={child.id}
              node={child}
              nodes={nodes}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              selectTopic={selectTopic}
              selectedId={selectedId}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              createTopicNode={createTopicNode}
              onRename={onRename}
              onDelete={onDelete}
              onMove={onMove}
              editingId={editingId}
              editingName={editingName}
              setEditingName={setEditingName}
              onSaveRename={onSaveRename}
              onCancelRename={onCancelRename}
              tr={tr}
              depth={depth + 1}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

const POLL_MS = 150;

const timeToMs = (raw: string): number | null => {
  const cleaned = raw.trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})[\.,](\d{1,3})$/);
  if (!match) return null;
  const [, hh, mm, ss, msRaw] = match;
  const ms = Number(msRaw.padEnd(3, "0"));
  return (
    Number(hh) * 3600000 + Number(mm) * 60000 + Number(ss) * 1000 + ms
  );
};

const formatMs = (ms: number): string => {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const milli = clamped % 1000;
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const mmm = String(milli).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
};

const parseVtt = (input: string): Cue[] => {
  const lines = input.replace(/\uFEFF/g, "").split(/\r?\n/);
  const cues: Cue[] = [];
  let i = 0;
  if (lines[0]?.startsWith("WEBVTT")) i += 1;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (line.includes("-->")) {
      const [startRaw, endRaw] = line.split("-->").map((v) => v.trim());
      const startMs = timeToMs(startRaw);
      const endMs = timeToMs(endRaw.split(" ")[0] ?? "");
      i += 1;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i += 1;
      }
      if (startMs !== null && endMs !== null) {
        cues.push({ startMs, endMs, text: textLines.join("\n") });
      }
      continue;
    }
    i += 1;
  }
  return cues;
};

const parseSrt = (input: string): Cue[] => {
  const lines = input.replace(/\uFEFF/g, "").split(/\r?\n/);
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (/^\d+$/.test(line)) {
      i += 1;
    }
    const timeLine = lines[i]?.trim() ?? "";
    if (!timeLine.includes("-->")) {
      i += 1;
      continue;
    }
    const [startRaw, endRaw] = timeLine.split("-->").map((v) => v.trim());
    const startMs = timeToMs(startRaw.replace(",", "."));
    const endMs = timeToMs(endRaw.replace(",", ".").split(" ")[0] ?? "");
    i += 1;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i += 1;
    }
    if (startMs !== null && endMs !== null) {
      cues.push({ startMs, endMs, text: textLines.join("\n") });
    }
  }
  return cues;
};

const parseLyricsLines = (input: string): string[] =>
  input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const mapLyricsToCues = (cues: Cue[], lines: string[]): Cue[] => {
  if (cues.length === 0) return [];
  if (lines.length === 0) return cues.map((c) => ({ ...c }));
  if (cues.length === lines.length) {
    return cues.map((c, idx) => ({ ...c, twText: lines[idx] }));
  }
  if (cues.length > lines.length) {
    return cues.map((c, idx) => {
      const lineIndex = Math.min(
        lines.length - 1,
        Math.floor((idx * lines.length) / cues.length)
      );
      return { ...c, twText: lines[lineIndex] };
    });
  }

  const grouped: string[][] = Array.from({ length: cues.length }, () => []);
  lines.forEach((line, idx) => {
    const cueIndex = Math.min(
      cues.length - 1,
      Math.floor((idx * cues.length) / lines.length)
    );
    grouped[cueIndex].push(line);
  });
  return cues.map((c, idx) => ({ ...c, twText: grouped[idx].join("\n") }));
};

const extractYouTubeId = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "") || null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.searchParams.get("v")) return url.searchParams.get("v");
      if (url.pathname.startsWith("/embed/"))
        return url.pathname.split("/embed/")[1] ?? null;
      if (url.pathname.startsWith("/shorts/"))
        return url.pathname.split("/shorts/")[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
};

const toVtt = (cues: Cue[]): string => {
  const body = cues
    .map((c) => {
      const text = c.twText ?? c.text;
      return `${formatMs(c.startMs)} --> ${formatMs(c.endMs)}\n${text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
};

const toLrc = (cues: Cue[]): string => {
  const lines = cues.map((c) => {
    const totalSeconds = Math.max(0, Math.floor(c.startMs / 1000));
    const cs = Math.floor((c.startMs % 1000) / 10);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const tag = `[${String(m).padStart(2, "0")}:${String(s).padStart(
      2,
      "0"
    )}.${String(cs).padStart(2, "0")}]`;
    const text = (c.twText ?? c.text).replace(/\n+/g, " ");
    return `${tag}${text}`;
  });
  return `${lines.join("\n")}\n`;
};

const downloadText = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const App: React.FC = () => {
  const playerRef = useRef<any>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [globalOffsetMs, setGlobalOffsetMs] = useState(0);
  const [vttInput, setVttInput] = useState("");
  const [lyricsInput, setLyricsInput] = useState("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [debugTimes, setDebugTimes] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [manualActive, setManualActive] = useState(false);
  const [manualIndex, setManualIndex] = useState(0);
  const [manualCues, setManualCues] = useState<Cue[]>([]);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [vttUrl, setVttUrl] = useState("");
  const [lyricsUrl, setLyricsUrl] = useState("");
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // view mode vs editor mode (default: home)
  const [mode, setMode] = useState<AppMode>("home");
  const [requestUrl, setRequestUrl] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [topicNodes, setTopicNodes] = useState<TopicNode[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [topicContent, setTopicContent] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicName, setEditingTopicName] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TopicNode;
  } | null>(null);
  const initializingTopicsRef = useRef(false);
  const saveTopicTimer = useRef<number | null>(null);
  const [adminEmailInput, setAdminEmailInput] = useState(() => localStorage.getItem("belle_user_email") || "belle@kim.com");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  // Wait for Firebase to restore its browser-local session before deciding
  // whether to show the login screen. This enables reliable auto-login on
  // each phone/PC after the first successful sign-in.
  const [authLoading, setAuthLoading] = useState(true);
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("belle_lang");
    if (saved === "ko" || saved === "en" || saved === "zh") return saved;
    return "ko";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [nickname, setNickname] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string>("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [lineHeight, setLineHeight] = useState(0.5);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [upcomingPreviewId, setUpcomingPreviewId] = useState<string | null>(null);

  const firebaseReady = isFirebaseConfigured && Boolean(auth && db);
  const tr = (ko: string, en: string, zh: string) => {
    if (lang === "en") return en;
    if (lang === "zh") return zh;
    return ko;
  };

  const upcomingFeatures = [
    {
      id: "gallery",
      icon: Images,
      step: tr("다음 업데이트", "Next update", "下次更新"),
      title: tr("우리의 추억 갤러리", "Our memory gallery", "我们的回忆相册"),
      description: tr(
        "사진을 날짜와 여행별로 모으고, 손가락으로 넘겨보는 둘만의 앨범",
        "A private album organized by date and trip, made for swiping together.",
        "按日期与旅行整理照片，轻轻滑动就能一起回看的专属相册。"
      )
    },
    {
      id: "question",
      icon: MessageCircleQuestion,
      step: tr("준비 중", "In the works", "正在准备"),
      title: tr("오늘, 우리에게 묻기", "A question for us", "今天，问问我们"),
      description: tr(
        "매일 하나의 질문에 각자 답하고 서로의 마음을 발견하는 시간",
        "One gentle question a day, with a space for both of your answers.",
        "每天一个温柔的问题，留给彼此回答并重新发现对方。"
      )
    },
    {
      id: "customize",
      icon: SlidersHorizontal,
      step: tr("준비 중", "In the works", "正在准备"),
      title: tr("우리답게 꾸미기", "Make it ours", "装扮成我们的样子"),
      description: tr(
        "대표 사진, 시작일, 기념일과 문구를 둘이 직접 바꾸는 공간",
        "Change the cover, start date, anniversaries and little messages together.",
        "一起更换封面、开始日期、纪念日和专属文字。"
      )
    },
    {
      id: "iphone",
      icon: Smartphone,
      step: tr("마지막 단계", "Final touch", "最后一步"),
      title: tr("아이폰 홈 화면에 쏙", "Made for your iPhone", "装进 iPhone 主屏幕"),
      description: tr(
        "주소창 없이 앱처럼 열고, 둘만의 아이콘으로 바로 들어오기",
        "Open it like an app, without browser chrome, from your own home-screen icon.",
        "从专属图标直接打开，隐藏地址栏，像真正的 App 一样使用。"
      )
    }
  ];
  const activeUpcomingFeature = upcomingFeatures.find((feature) => feature.id === upcomingPreviewId) ?? null;

  // Couple D-Day calculations (First met: September 23, 2025 in Busan)
  const dDayInfo = useMemo(() => {
    const start = new Date(2025, 8, 23); // 2025-09-23
    const now = new Date();
    const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysTogether = Math.max(1, Math.floor((nowMidnight - startMidnight) / (1000 * 60 * 60 * 24)) + 1);

    const calcMilestone = (days: number, nameKo: string, nameEn: string, nameZh: string) => {
      const targetDate = new Date(startMidnight + (days - 1) * (1000 * 60 * 60 * 24));
      const targetMidnight = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
      const remainDays = Math.ceil((targetMidnight - nowMidnight) / (1000 * 60 * 60 * 24));
      const dateStr = `${targetDate.getFullYear()}.${String(targetDate.getMonth() + 1).padStart(2, "0")}.${String(targetDate.getDate()).padStart(2, "0")}`;
      return {
        days,
        name: tr(nameKo, nameEn, nameZh),
        dateStr,
        remainDays,
        isPassed: remainDays <= 0,
        isNext: false
      };
    };

    const calcYearMilestone = (years: number, nameKo: string, nameEn: string, nameZh: string) => {
      const targetDate = new Date(start.getFullYear() + years, start.getMonth(), start.getDate());
      const targetMidnight = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
      const remainDays = Math.ceil((targetMidnight - nowMidnight) / (1000 * 60 * 60 * 24));
      const dateStr = `${targetDate.getFullYear()}.${String(targetDate.getMonth() + 1).padStart(2, "0")}.${String(targetDate.getDate()).padStart(2, "0")}`;
      return {
        days: years * 365,
        name: tr(nameKo, nameEn, nameZh),
        dateStr,
        remainDays,
        isPassed: remainDays <= 0,
        isNext: false
      };
    };

    const milestones = [
      calcMilestone(100, "100일", "100 Days", "100天"),
      calcMilestone(200, "200일", "200 Days", "200天"),
      calcMilestone(300, "300일", "300 Days", "300天"),
      calcYearMilestone(1, "1주년", "1st Anniversary", "1周年"),
      calcMilestone(400, "400일", "400 Days", "400天"),
      calcMilestone(500, "500일", "500 Days", "500天"),
      calcYearMilestone(2, "2주년", "2nd Anniversary", "2周年")
    ];

    const nextUpcoming = milestones.find((m) => m.remainDays > 0);
    if (nextUpcoming) {
      nextUpcoming.isNext = true;
    }

    return {
      daysTogether,
      milestones,
      nextUpcoming
    };
  }, [lang]);
  const formatDate = (ms?: number) => {
    if (!ms) return "";
    const locale = lang === "en" ? "en-US" : lang === "zh" ? "zh-TW" : "ko-KR";
    return new Date(ms).toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const loadProfile = async (uid: string) => {
    if (!firebaseReady) return;
    setProfileLoading(true);
    try {
      const snap = await getDoc(doc(db, "profiles", uid));
      if (!snap.exists()) {
        setNickname("");
        setShowSettings(true);
        return;
      }
      const data = snap.data() as Profile;
      setNickname(data.nickname ?? "");
      setProfilePhotoUrl(data.photoURL ?? "");
      if (data.lang === "ko" || data.lang === "en" || data.lang === "zh") {
        setLang(data.lang);
      }
      if (typeof data.lineHeight === "number") {
        setLineHeight(data.lineHeight);
      }
      setShowSettings(!data.onboardingDone);
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!firebaseReady || !auth.currentUser) return;
    const trimmed = nickname.trim();
    await setDoc(
      doc(db, "profiles", auth.currentUser.uid),
      { nickname: trimmed, lang, photoURL: profilePhotoUrl || "", lineHeight, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setProfileMessage(tr("닉네임이 변경되었습니다.", "Nickname updated.", "昵称已更新。"));
  };

  const updateLineHeight = async (value: number) => {
    setLineHeight(value);
    if (adminAuthed && firebaseReady && auth.currentUser) {
      await setDoc(
        doc(db, "profiles", auth.currentUser.uid),
        { lineHeight: value, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!firebaseReady || !auth.currentUser) return;
    const ref = storageRef(storage, `avatars/${auth.currentUser.uid}`);
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);
    setProfilePhotoUrl(url);
    await setDoc(
      doc(db, "profiles", auth.currentUser.uid),
      { photoURL: url, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setProfileMessage(tr("프로필 사진이 업데이트되었습니다.", "Profile photo updated.", "头像已更新。"));
  };

  const completeOnboarding = async () => {
    setShowSettings(false);
    if (!firebaseReady || !auth.currentUser) return;
    await setDoc(
      doc(db, "profiles", auth.currentUser.uid),
      { onboardingDone: true, updatedAt: serverTimestamp() },
      { merge: true }
    );
  };

  const updateLang = async (next: Lang) => {
    setLang(next);
    if (adminAuthed && firebaseReady && auth.currentUser) {
      await setDoc(
        doc(db, "profiles", auth.currentUser.uid),
        { lang: next, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await syncDefaultTopicNames(next);
    }
  };

  const defaultTopicName = (key: string, langValue: Lang) => {
    if (key === "root_folder") {
      return langValue === "en" ? "Daily Topics" : langValue === "zh" ? "今日主题" : "오늘의 주제";
    }
    if (key === "root_note") {
      return langValue === "en" ? "First note" : langValue === "zh" ? "第一条笔记" : "첫 노트";
    }
    return "Untitled";
  };

  const syncDefaultTopicNames = async (langValue: Lang) => {
    if (!firebaseReady || !adminAuthed) return;
    const q = query(
      collection(db, "topics"),
      where("defaultKey", "in", ["root_folder", "root_note"])
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() as { defaultKey?: string };
      const key = data.defaultKey;
      if (!key) return;
      batch.set(docSnap.ref, { name: defaultTopicName(key, langValue), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  };

  const createDefaultTopics = async () => {
    if (!firebaseReady || !adminAuthed) return;
    if (initializingTopicsRef.current) return;
    initializingTopicsRef.current = true;
    try {
      const folderName = defaultTopicName("root_folder", lang);
      const noteName = defaultTopicName("root_note", lang);
      const folderRef = await addDoc(collection(db, "topics"), {
        name: folderName,
        type: "folder",
        parentId: null,
        content: "",
        defaultKey: "root_folder",
        createdBy: auth.currentUser?.email ?? "",
        updatedAt: serverTimestamp()
      });
      const noteRef = await addDoc(collection(db, "topics"), {
        name: noteName,
        type: "file",
        parentId: folderRef.id,
        content: "",
        defaultKey: "root_note",
        createdBy: auth.currentUser?.email ?? "",
        updatedAt: serverTimestamp()
      });
      setExpandedFolders((prev) => (prev.includes(folderRef.id) ? prev : [...prev, folderRef.id]));
      setSelectedTopicId(noteRef.id);
      setSelectedFolderId(folderRef.id);
      setTopicContent("");
    } finally {
      initializingTopicsRef.current = false;
    }
  };

  const subscribeTopics = () => {
    if (!firebaseReady) return () => {};
    setTopicsLoading(true);
    const q = query(collection(db, "topics"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as {
            name?: string;
            type?: "folder" | "file";
            parentId?: string | null;
            content?: string;
            updatedAt?: Timestamp;
            createdBy?: string;
          };
          return {
            id: docSnap.id,
            name: data.name ?? "Untitled",
            type: data.type ?? "file",
            parentId: data.parentId ?? null,
            content: data.content ?? "",
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : undefined,
            createdBy: data.createdBy ?? ""
          };
        });
        setTopicNodes(items);
        if (items.length === 0) {
          setSelectedTopicId(null);
          setSelectedFolderId(null);
          void createDefaultTopics();
        }
        setTopicsLoading(false);
      },
      () => setTopicsLoading(false)
    );
    return unsub;
  };

  const createTopicNode = async (type: "folder" | "file", parentId: string | null) => {
    if (!firebaseReady || !adminAuthed) return;
    const name = type === "folder" ? tr("새 폴더", "New folder", "新建文件夹") : tr("새 노트", "New note", "新建笔记");
    const docRef = await addDoc(collection(db, "topics"), {
      name,
      type,
      parentId: parentId ?? null,
      content: "",
      createdBy: auth.currentUser?.email ?? "",
      updatedAt: serverTimestamp()
    });
    if (parentId) {
      setExpandedFolders((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]));
      setSelectedFolderId(parentId);
    }
    if (type === "file") {
      setSelectedTopicId(docRef.id);
      setTopicContent("");
    } else {
      setExpandedFolders((prev) => (prev.includes(docRef.id) ? prev : [...prev, docRef.id]));
    }
  };

  const updateTopicContent = (id: string, content: string) => {
    setTopicContent(content);
    if (!firebaseReady || !adminAuthed) return;
    if (saveTopicTimer.current) window.clearTimeout(saveTopicTimer.current);
    saveTopicTimer.current = window.setTimeout(async () => {
      await setDoc(
        doc(db, "topics", id),
        { content, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }, 800);
  };

  const insertLink = () => {
    if (!editor) return;
    const url = window.prompt(tr("링크 URL을 입력하세요", "Enter link URL", "输入链接 URL"));
    if (!url) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImage = () => {
    if (!editor) return;
    const url = window.prompt(tr("이미지 URL을 입력하세요", "Enter image URL", "输入图片 URL"));
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const toolbarBtnStyle = (active?: boolean) => ({
    background: active ? "#222" : undefined,
    color: active ? "#fff" : undefined
  });

  const startRenameTopic = (node: TopicNode) => {
    setEditingTopicId(node.id);
    setEditingTopicName(node.name);
  };

  const saveRenameTopic = async (id: string) => {
    if (!firebaseReady || !adminAuthed) return;
    const name = editingTopicName.trim() || tr("새 노트", "New note", "新建笔记");
    await setDoc(doc(db, "topics", id), { name, updatedAt: serverTimestamp() }, { merge: true });
    setEditingTopicId(null);
    setEditingTopicName("");
  };

  const cancelRename = () => {
    setEditingTopicId(null);
    setEditingTopicName("");
  };

  const openContextMenu = (x: number, y: number, node: TopicNode) => {
    setContextMenu({ x, y, node });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const deleteTopicNode = async (node: TopicNode) => {
    if (!firebaseReady || !adminAuthed) return;
    const batch = writeBatch(db);
    const collectIds = (n: TopicNode) => {
      batch.delete(doc(db, "topics", n.id));
      topicNodes.filter((c) => c.parentId === n.id).forEach(collectIds);
    };
    collectIds(node);
    await batch.commit();
    if (selectedTopicId === node.id) {
      setSelectedTopicId(null);
      setTopicContent("");
    }
  };

  const moveTopicNode = async (id: string, parentId: string | null) => {
    if (!firebaseReady || !adminAuthed) return;
    await setDoc(
      doc(db, "topics", id),
      { parentId: parentId ?? null, updatedAt: serverTimestamp() },
      { merge: true }
    );
  };

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
        placeholder: tr("여기에 내용을 작성하세요. Markdown처럼 작성해도 됩니다.", "Write here. Markdown-like syntax is okay.", "在此编写内容，可使用类似 Markdown 的语法。")
      }),
      Image
    ],
    content: "",
    editable: true,
    onUpdate: ({ editor }) => {
      if (selectedTopicId) {
        updateTopicContent(selectedTopicId, editor.getHTML());
      }
    }
  });

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const selectTopic = (node: TopicNode) => {
    if (node.type !== "file") return;
    setSelectedTopicId(node.id);
    setTopicContent(node.content ?? "");
    setSelectedFolderId(node.parentId ?? null);
  };

  const subscribeMessages = () => {
    if (!firebaseReady) return () => {};
    setMessagesLoading(true);
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as { text?: string; createdAt?: Timestamp; createdBy?: string; createdByName?: string; createdByPhotoURL?: string };
          return {
            id: docSnap.id,
            text: data.text ?? "",
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : undefined,
            createdBy: data.createdBy ?? "",
            createdByName: data.createdByName ?? "",
            createdByPhotoURL: data.createdByPhotoURL ?? ""
          };
        });
        setMessages(items.filter((m) => m.text));
        setMessagesLoading(false);
      },
      () => setMessagesLoading(false)
    );
    return unsub;
  };

  const sendMessage = async () => {
    if (!firebaseReady || !adminAuthed) return;
    const text = messageInput.trim();
    if (!text) return;
    await addDoc(collection(db, "messages"), {
      text,
      createdBy: auth.currentUser?.email ?? "",
      createdByName: nickname.trim(),
      createdByPhotoURL: profilePhotoUrl || "",
      createdAt: serverTimestamp()
    });
    setMessageInput("");
  };

  const loadRequests = async () => {
    if (!firebaseReady) return;
    setRequestsLoading(true);
    try {
      const q = query(collection(db, "song_requests"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as { url?: string; createdAt?: Timestamp; createdBy?: string; createdByName?: string };
        return {
          id: docSnap.id,
          url: data.url ?? "",
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : undefined,
          createdBy: data.createdBy ?? "",
          createdByName: data.createdByName ?? ""
        };
      });
      setRequests(items.filter((item) => item.url));
    } finally {
      setRequestsLoading(false);
    }
  };

  const saveRequest = async (url: string) => {
    if (!firebaseReady) {
      setRequestError(tr("Firebase 설정이 필요합니다. README를 확인하세요.", "Firebase setup is required. Check the README.", "需要 Firebase 配置。请查看 README。"));
      return;
    }
    if (!adminAuthed) {
      setRequestError(tr("로그인이 필요합니다.", "Login is required.", "需要登录。"));
      return;
    }
    try {
      await addDoc(collection(db, "song_requests"), {
        url,
        createdBy: auth.currentUser?.email ?? "",
        createdByName: nickname.trim(),
        createdAt: serverTimestamp()
      });
      setRequestSent(true);
      setRequestError(null);
      if (adminAuthed) loadRequests();
    } catch {
      setRequestError(tr("신청 저장에 실패했습니다. 잠시 후 다시 시도하세요.", "Failed to save the request. Try again later.", "保存请求失败，请稍后再试。"));
    }
  };

  const removeRequest = async (id: string) => {
    if (!firebaseReady) return;
    await deleteDoc(doc(db, "song_requests", id));
    setRequests((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAdminLogin = async () => {
    const email = adminEmailInput.trim();
    const password = adminPasswordInput.trim();
    if (!email) {
      setAdminError(tr("이메일을 선택하세요.", "Select an email.", "请选择邮箱。"));
      return;
    }

    if (!firebaseReady || !auth) {
      setAdminError(tr("Firebase 연결을 초기화하지 못했습니다.", "Could not initialize Firebase.", "无法初始化 Firebase。"));
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      localStorage.removeItem("belle_simple_authed");
      localStorage.setItem("belle_user_email", email);
      setAdminPasswordInput("");
      setAdminError(null);
    } catch {
      setAdminError(tr("이메일 또는 비밀번호가 맞지 않습니다.", "Incorrect email or password.", "邮箱或密码不正确。"));
    }
  };

  const handleAdminLogout = async () => {
    localStorage.removeItem("belle_simple_authed");
    localStorage.removeItem("belle_user_email");
    if (auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.warn("Logout error:", err);
      }
    }
    setAdminAuthed(false);
    setRequests([]);
    setNickname("");
    setShowSettings(false);
  };

  const goToHome = () => {
    setVideoId(null);
    setYoutubeUrl("");
    setVttUrl("");
    setLyricsUrl("");
    setVttInput("");
    setLyricsInput("");
    setCues([]);
    setMode("home");

    // URL 초기화
    window.history.pushState({}, "", window.location.pathname);
    setIsSidebarOpen(false);
  };

  const goToEditor = () => {
    setMode("editor");
    setIsSidebarOpen(false);
  };

  const goToRequest = () => {
    setMode("request");
    setIsSidebarOpen(false);
    setRequestUrl("");
    setRequestSent(false);
    setRequestError(null);
  };

  const goToMessage = () => {
    setMode("message");
    setIsSidebarOpen(false);
  };

  const goToTopics = () => {
    setMode("topics");
    setIsSidebarOpen(false);
  };

  const goToCharacters = () => {
    setMode("characters");
    setIsSidebarOpen(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      document.querySelector<HTMLElement>(".main-content")?.scrollTo({ top: 0, behavior: "auto" });
    });
  };

  useEffect(() => {
    // Clear sessions created by the former local-only login. Only a real
    // Firebase Auth session is allowed to unlock Firestore-backed features.
    localStorage.removeItem("belle_simple_authed");
    if (!firebaseReady || !auth) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAdminAuthed(true);
        setAuthLoading(false);
        setMode("home");
        void loadProfile(user.uid);
      } else {
        setAdminAuthed(false);
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, [firebaseReady]);

  useEffect(() => {
    if (!adminAuthed || mode !== "message") return;
    const unsub = subscribeMessages();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [adminAuthed, mode]);

  useEffect(() => {
    if (!adminAuthed || mode !== "topics") return;
    const unsub = subscribeTopics();
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [adminAuthed, mode]);

  useEffect(() => {
    if (!editor) return;
    if (!selectedTopicId) {
      setTopicContent("");
      editor.commands.setContent("");
      return;
    }
    const node = topicNodes.find((n) => n.id === selectedTopicId);
    const content = node?.content ?? "";
    setTopicContent(content);
    editor.commands.setContent(content || "", false);
  }, [editor, selectedTopicId, topicNodes]);

  useEffect(() => {
    localStorage.setItem("belle_lang", lang);
  }, [lang]);

  useEffect(() => {
    if (adminAuthed && firebaseReady) {
      loadRequests();
    }
  }, [adminAuthed, firebaseReady]);

  const loadSong = (song: Song) => {
    setVideoId(song.videoId);
    setYoutubeUrl(`https://youtu.be/${song.videoId}`);
    setVttUrl(song.vttUrl ?? "");
    setLyricsUrl(song.lyricsUrl ?? "");

    // 뷰어 모드로 전환
    setMode("viewer");
    setIsSidebarOpen(false); // 모바일에서 선택 후 닫기

    // URL 업데이트
    const url = new URL(window.location.href);
    url.searchParams.set("v", song.videoId);
    if (song.vttUrl) url.searchParams.set("vtt", song.vttUrl);
    else url.searchParams.delete("vtt");
    if (song.lyricsUrl) url.searchParams.set("lyrics", song.lyricsUrl);
    else url.searchParams.delete("lyrics");
    window.history.pushState({}, "", url.toString());

    // 데이터 로드
    (async () => {
      try {
        const [vttText, lyricsText] = await Promise.all([
          song.vttUrl ? fetchText(song.vttUrl) : Promise.resolve(""),
          song.lyricsUrl ? fetchText(song.lyricsUrl) : Promise.resolve("")
        ]);
        if (vttText) setVttInput(vttText);
        if (lyricsText) setLyricsInput(lyricsText);
        if (vttText) parseAndMap(vttText, lyricsText);
      } catch {
        setParseError(tr("노래 데이터 로드에 실패했습니다.", "Failed to load song data.", "加载歌曲数据失败。"));
      }
    })();

    // 모바일에서 사이드바 닫기
    setIsSidebarOpen(false);
  };

  const fetchText = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch_failed:${url}`);
    return res.text();
  };

  const exportProject = () => {
    const payload = {
      version: 1,
      videoId,
      youtubeUrl,
      vttInput,
      lyricsInput,
      globalOffsetMs,
      cues
    };
    downloadText("tw-lyrics-project.json", JSON.stringify(payload, null, 2));
  };

  const importProject = async (file: File) => {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (typeof data?.videoId === "string") {
        setVideoId(data.videoId);
        setYoutubeUrl(data.youtubeUrl ?? `https://youtu.be/${data.videoId}`);
      }
      if (typeof data?.vttInput === "string") setVttInput(data.vttInput);
      if (typeof data?.lyricsInput === "string")
        setLyricsInput(data.lyricsInput);
      if (typeof data?.globalOffsetMs === "number")
        setGlobalOffsetMs(data.globalOffsetMs);
      if (Array.isArray(data?.cues)) {
        setCues(
          data.cues.map((c: any) => ({
            startMs: Number(c.startMs),
            endMs: Number(c.endMs),
            text: String(c.text ?? ""),
            twText: typeof c.twText === "string" ? c.twText : undefined
          }))
        );
      } else if (typeof data?.vttInput === "string") {
        parseAndMap(data.vttInput, data.lyricsInput ?? "");
      }
    } catch {
      setParseError(tr("프로젝트 파일 파싱 실패.", "Failed to parse project file.", "项目文件解析失败。"));
    }
  };

  const buildShareLink = () => {
    if (!videoId || !vttUrl) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("v", videoId);
    url.searchParams.set("vtt", vttUrl);
    if (lyricsUrl) {
      url.searchParams.set("lyrics", lyricsUrl);
    } else {
      url.searchParams.delete("lyrics");
    }
    return url.toString();
  };

  const shareLink = useMemo(
    () => buildShareLink(),
    [videoId, vttUrl, lyricsUrl]
  );

  const copyShareLink = async () => {
    setShareMessage(null);
    if (!videoId) {
      setShareMessage(tr("먼저 YouTube 영상을 불러오세요.", "Load a YouTube video first.", "请先加载 YouTube 视频。"));
      return;
    }
    if (!vttUrl) {
      setShareMessage(tr("VTT/SRT 공개 URL을 입력하세요.", "Enter a public VTT/SRT URL.", "请输入公开的 VTT/SRT 链接。"));
      return;
    }
    const link = buildShareLink();
    try {
      await navigator.clipboard.writeText(link);
      setShareMessage(tr("공유 링크가 복사되었습니다.", "Share link copied.", "分享链接已复制。"));
    } catch {
      setShareMessage(tr("복사 실패. 아래 링크를 수동으로 복사하세요.", "Copy failed. Please copy the link below.", "复制失败，请手动复制下方链接。"));
    }
  };

  useEffect(() => {
    if (window.YT?.Player) return;
    const existing = document.getElementById("yt-iframe-api");
    if (existing) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.id = "yt-iframe-api";
    document.body.appendChild(tag);
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    const startPolling = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => {
        const player = playerRef.current;
        if (!player?.getCurrentTime) return;
        const seconds = player.getCurrentTime();
        if (typeof seconds === "number") {
          setCurrentMs(Math.floor(seconds * 1000));
        }
      }, POLL_MS);
    };

    startPolling();
    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!videoId || !playerHostRef.current) return;

    const createPlayer = () => {
      if (playerRef.current) {
        playerRef.current.cueVideoById(videoId);
        return;
      }
      playerRef.current = new window.YT.Player(playerHostRef.current, {
        width: "100%",
        height: "360",
        videoId,
        playerVars: { controls: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (event: any) => {
            event.target.cueVideoById(videoId);
          }
        }
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = () => {
        createPlayer();
      };
    }
  }, [videoId]);

  const activeIndex = useMemo(() => {
    const t = currentMs + globalOffsetMs;
    return cues.findIndex((c) => t >= c.startMs && t <= c.endMs);
  }, [cues, currentMs, globalOffsetMs]);

  const activeCue = activeIndex >= 0 ? cues[activeIndex] : null;

  const parseAndMap = (vttText: string, lyricsText: string) => {
    setParseError(null);
    const trimmedVtt = vttText.trim();
    if (!trimmedVtt) {
      setParseError(tr("VTT 또는 SRT 자막을 입력하세요.", "Enter VTT or SRT captions.", "请输入 VTT 或 SRT 字幕。"));
      return;
    }
    let parsed: Cue[] = [];
    if (trimmedVtt.startsWith("WEBVTT")) {
      parsed = parseVtt(trimmedVtt);
    } else if (trimmedVtt.includes("-->")) {
      parsed = parseVtt(trimmedVtt);
      if (parsed.length === 0) {
        parsed = parseSrt(trimmedVtt);
      }
    }
    if (parsed.length === 0) {
      setParseError(tr("자막 파싱 실패. VTT 또는 SRT 형식을 확인하세요.", "Failed to parse captions. Check VTT/SRT format.", "字幕解析失败，请检查 VTT/SRT 格式。"));
      return;
    }
    const lines = parseLyricsLines(lyricsText);
    const mapped = mapLyricsToCues(parsed, lines);
    setCues(mapped);
  };

  const applyParsing = () => {
    parseAndMap(vttInput, lyricsInput);
  };

  const getPlayerTimeMs = () => {
    const player = playerRef.current;
    if (!player?.getCurrentTime) return null;
    const seconds = player.getCurrentTime();
    if (typeof seconds !== "number") return null;
    return Math.floor(seconds * 1000);
  };

  const startManualSync = () => {
    setManualMessage(null);
    const lines = parseLyricsLines(lyricsInput);
    if (lines.length === 0) {
      setManualMessage(tr("대만어 가사를 먼저 입력하세요.", "Enter Taiwanese lyrics first.", "请先输入台语歌词。"));
      return;
    }
    const initial = lines.map((line) => ({
      startMs: -1,
      endMs: -1,
      text: line,
      twText: line
    }));
    setManualCues(initial);
    setManualIndex(0);
    setManualActive(true);
  };

  const tapManualSync = () => {
    setManualMessage(null);
    if (!manualActive || manualCues.length === 0) return;
    const t = getPlayerTimeMs();
    if (t === null) {
      setManualMessage(tr("먼저 영상을 재생하세요.", "Play the video first.", "请先播放视频。"));
      return;
    }
    const isFirstTap =
      manualIndex === 0 && (manualCues[0]?.startMs ?? -1) < 0;
    setManualCues((prev) => {
      const next = prev.map((c) => ({ ...c }));
      const current = next[manualIndex];
      if (!current) return next;
      if (manualIndex === 0 && current.startMs < 0) {
        current.startMs = t;
        return next;
      }
      if (current.startMs < 0) {
        current.startMs = t;
        return next;
      }
      if (current.endMs < 0) {
        current.endMs = t;
      }
      if (manualIndex < next.length - 1) {
        const nextCue = next[manualIndex + 1];
        if (nextCue && nextCue.startMs < 0) nextCue.startMs = t;
      }
      return next;
    });

    if (manualIndex >= manualCues.length - 1) {
      setManualActive(false);
      setManualMessage(tr("수동 타이밍 완료. 적용 버튼을 눌러주세요.", "Manual timing complete. Click apply.", "手动计时完成，请点击应用。"));
      return;
    }

    if (isFirstTap) {
      return;
    }
    setManualIndex((idx) => Math.min(manualCues.length - 1, idx + 1));
  };

  const applyManualCues = () => {
    setManualMessage(null);
    if (manualCues.length === 0) {
      setManualMessage(tr("수동 타이밍 결과가 없습니다.", "No manual timing results.", "没有手动计时结果。"));
      return;
    }
    const invalid = manualCues.some(
      (c) => c.startMs < 0 || c.endMs < 0 || c.endMs <= c.startMs
    );
    if (invalid) {
      setManualMessage(tr("아직 끝 시간이 없는 줄이 있습니다. 재생하면서 탭을 더 눌러주세요.", "Some lines have no end time. Tap more during playback.", "还有行没有结束时间，请播放时继续点击。"));
      return;
    }
    setCues(manualCues.map((c) => ({ ...c })));
  };

  const onLoadYoutube = () => {
    const id = extractYouTubeId(youtubeUrl);
    if (!id) {
      setParseError(tr("유효한 YouTube 링크를 입력하세요.", "Enter a valid YouTube link.", "请输入有效的 YouTube 链接。"));
      return;
    }
    setParseError(null);
    setVideoId(id);
  };

  const adjustCurrentCue = (deltaMs: number) => {
    if (activeIndex < 0) return;
    setCues((prev) =>
      prev.map((c, idx) =>
        idx === activeIndex
          ? { ...c, startMs: c.startMs + deltaMs, endMs: c.endMs + deltaMs }
          : c
      )
    );
  };

  const seekToCue = (index: number) => {
    const cue = cues[index];
    if (!cue) return;
    const player = playerRef.current;
    if (player?.seekTo) {
      player.seekTo(cue.startMs / 1000, true);
    }
  };

  const selectEdit = (idx: number) => {
    const cue = cues[idx];
    setEditIndex(idx);
    setEditText(cue.twText ?? cue.text);
  };

  const applyEdit = () => {
    if (editIndex === null) return;
    setCues((prev) =>
      prev.map((c, idx) =>
        idx === editIndex ? { ...c, twText: editText } : c
      )
    );
    setEditIndex(null);
  };

  const readFileToText = async (file: File, setText: (t: string) => void) => {
    const text = await file.text();
    setText(text);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("v");
    const vttUrl = params.get("vtt");
    const lyricsUrl = params.get("lyrics");
    if (v) {
      setVideoId(v);
      setYoutubeUrl(`https://youtu.be/${v}`);
    }
    if (!vttUrl && !lyricsUrl) return;
    if (vttUrl) setVttUrl(vttUrl);
    if (lyricsUrl) setLyricsUrl(lyricsUrl);

    const fetchText = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch_failed:${url}`);
      return res.text();
    };

    (async () => {
      try {
        const [vttText, lyricsText] = await Promise.all([
          vttUrl ? fetchText(vttUrl) : Promise.resolve(""),
          lyricsUrl ? fetchText(lyricsUrl) : Promise.resolve("")
        ]);
        if (vttText) setVttInput(vttText);
        if (lyricsText) setLyricsInput(lyricsText);
        // if (vttText) parseAndMap(vttText, lyricsText); // 초기 로딩 시 파싱은 선택사항
      } catch {
        setParseError(tr("외부 자막/가사 불러오기 실패. URL과 CORS 설정을 확인하세요.", "Failed to load external captions/lyrics. Check URL and CORS.", "外部字幕/歌词加载失败，请检查 URL 和 CORS。"));
      }
    })();
  }, []);

  if (authLoading) {
    return (
      <div className="layout-container">
        <div className="main-content">
          <section className="panel welcome-screen" style={{ maxWidth: 520, margin: "40px auto" }}>
            <h2 style={{ marginBottom: 12 }}>{tr("로그인 확인 중...", "Checking login...", "正在检查登录...")}</h2>
            <p className="label">{tr("잠시만 기다려주세요.", "Please wait a moment.", "请稍等片刻。")}</p>
          </section>
        </div>
      </div>
    );
  }

  if (!adminAuthed) {
    return (
      <div className="layout-container">
        <div className="main-content">
          <section className="panel welcome-screen" style={{ maxWidth: 520, margin: "40px auto" }}>
            <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
              <div className="row" style={{ gap: 8, margin: 0 }}>
                <button className="btn small" onClick={() => updateLang("ko")}>한국어</button>
                <button className="btn small" onClick={() => updateLang("en")}>English</button>
                <button className="btn small" onClick={() => updateLang("zh")}>中文</button>
              </div>
            </div>
            <div className="row space" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{tr("로그인", "Login", "登录")}</h2>
            </div>
            <p className="label" style={{ marginBottom: 16 }}>
              {tr("Belle은 belle@kim.com으로 로그인하세요.", "Belle, please log in as belle@kim.com.", "Belle 请使用 belle@kim.com 登录。")}
            </p>
            <div className="row" style={{ width: "100%", maxWidth: 520 }}>
              <select
                className="input"
                value={adminEmailInput}
                onChange={(e) => setAdminEmailInput(e.target.value)}
                style={{ maxWidth: 220 }}
              >
                <option value="admin@forbelle.local">admin@forbelle.local</option>
                <option value="belle@kim.com">belle@kim.com</option>
              </select>
              <input
                className="input"
                type="password"
                placeholder={tr("비밀번호 입력", "Password", "输入密码")}
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdminLogin();
                }}
              />
              <button className="btn primary" onClick={handleAdminLogin}>
                {tr("로그인", "Login", "登录")}
              </button>
            </div>
            {adminError && (
              <p className="error" style={{ marginTop: 12 }}>
                <AlertCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                {adminError}
              </p>
            )}
            <p className="label" style={{ fontSize: 12, marginTop: 8 }}>
              {tr("로그인 상태는 이 브라우저에 유지됩니다.", "Login stays in this browser.", "登录状态会保存在此浏览器。")}
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="layout-container">
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          {mode === "topics" ? (
            <button className="home-btn" onClick={goToHome}>
              <ChevronRight size={18} />
              {tr("뒤로가기", "Back", "返回")}
            </button>
          ) : (
            <button className="home-btn" onClick={goToHome}>
              <Home size={18} />
              {tr("홈", "Home", "主页")}
            </button>
          )}
          <button className="close-btn" onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>

        {mode === "topics" ? (
          <>
            <div className="sidebar-actions">
              <button className="btn editor-btn" onClick={() => createTopicNode("folder", selectedFolderId ?? null)}>
                <FolderPlus size={16} />
                {tr("새 폴더", "New folder", "新建文件夹")}
              </button>
              <button className="btn editor-btn" style={{ marginTop: 8 }} onClick={() => createTopicNode("file", selectedFolderId ?? null)}>
                <FilePlus size={16} />
                {tr("새 노트", "New note", "新建笔记")}
              </button>
            </div>
            <div style={{ padding: "0 12px 12px", overflowY: "auto" }}>
              {topicsLoading ? (
                <p className="label">{tr("불러오는 중...", "Loading...", "加载中...")}</p>
              ) : topicNodes.length === 0 ? (
                <p className="label">{tr("폴더나 노트를 만들어 주세요.", "Create a folder or note.", "请创建文件夹或笔记。")}</p>
              ) : (
                <ul className="song-list" style={{ marginTop: 0 }}>
                  {topicNodes
                        .filter((n) => n.parentId == null)
                        .map((node) => (
                          <TopicTreeNode
                            key={node.id}
                            node={node}
                            nodes={topicNodes}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            selectTopic={selectTopic}
                            selectedId={selectedTopicId}
                            selectedFolderId={selectedFolderId}
                            onSelectFolder={setSelectedFolderId}
                            createTopicNode={createTopicNode}
                            onRename={startRenameTopic}
                            onDelete={deleteTopicNode}
                            onMove={moveTopicNode}
                            editingId={editingTopicId}
                            editingName={editingTopicName}
                            setEditingName={setEditingTopicName}
                            onSaveRename={saveRenameTopic}
                            onCancelRename={cancelRename}
                            tr={tr}
                            depth={0}
                            onOpenContextMenu={openContextMenu}
                          />
                        ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="sidebar-actions">
              <button className="btn editor-btn" onClick={goToEditor}>
                <Edit3 size={16} />
                {tr("새 작업 (Editor)", "New Work (Editor)", "新建 (编辑器)")}
              </button>
              <button className="btn editor-btn" style={{ marginTop: 8 }} onClick={goToRequest}>
                <MessageSquarePlus size={16} />
                {tr("신청곡", "Requests", "点歌")}
              </button>
              <button className="btn editor-btn" style={{ marginTop: 8 }} onClick={goToMessage}>
                <MessageSquarePlus size={16} />
                {tr("상대에게 한마디", "Message", "对他说句话")}
              </button>
              <button className="btn editor-btn" style={{ marginTop: 8 }} onClick={goToTopics}>
                <FolderPlus size={16} />
                {tr("오늘의 주제", "Daily Topics", "今日主题")}
              </button>
              <button className="btn editor-btn" style={{ marginTop: 8 }} onClick={goToCharacters}>
                <PawPrint size={16} />
                {tr("우리 캐릭터", "Our Characters", "我们的角色")}
              </button>
            </div>
            <ul className="song-list">
              {songs.map((song) => (
                <li
                  key={song.id}
                  className={videoId === song.videoId ? "active" : ""}
                >
                  <button onClick={() => loadSong(song)}>
                    {song.coverUrl ? (
                      <img
                        src={song.coverUrl}
                        alt={song.title}
                        className="song-cover"
                      />
                    ) : (
                      <div
                        className="song-cover"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#E3D8C7",
                          color: "#FFF"
                        }}
                      >
                        <Music size={20} />
                      </div>
                    )}
                    <span className="song-title">{song.title}</span>
                  </button>
                </li>
              ))}
              {songs.length === 0 && (
                <li className="empty-message">
                  <Music size={48} style={{ opacity: 0.2, marginBottom: 8 }} />
                  <br />
                  {tr("추가된 곡이 없습니다.", "No songs added.", "暂无歌曲。")}
                </li>
              )}
            </ul>
            <div className="sidebar-actions" style={{ marginTop: "auto" }}>
              <button className="btn editor-btn" onClick={() => setShowSettings(true)}>
                <Settings size={16} />
                {tr("설정", "Settings", "设置")}
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Main Content */}
      <div className="main-content">
        <header className="header">
          <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div
            className="header-text"
            onClick={goToHome}
            style={{ cursor: "pointer" }}
          >
            <h1>{tr("가장 사랑하는 Belle을 위한 공간", "A space just for my beloved Belle", "只属于我最爱的 Belle 的空间")}</h1>
            <p>{tr("우리의 노래, 우리의 시간", "Our songs, our time", "我们的歌，我们的时间")}</p>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {mode === "home" && (
            <motion.section
              key="home"
              className="panel display"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              style={{ padding: "0 0 40px" }}
            >
              <div className="couple-home-container">
                {/* Hero Couple Card */}
                <motion.div
                  className="couple-hero-card"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className="couple-photo-wrapper"
                    onClick={() => setPhotoModalOpen(true)}
                    title={tr("클릭하여 사진 크게 보기", "Click to enlarge photo", "点击放大照片")}
                  >
                    <img
                      src="./images/busan_couple.jpg"
                      alt="Busan Beach and Bridge"
                      className="couple-photo-img"
                    />
                    <div className="couple-photo-overlay">
                      <div className="couple-photo-top-bar">
                        <span className="couple-tag location">
                          <MapPin size={14} />
                          {tr("부산 (Busan)", "Busan, Korea", "韩国釜山")}
                        </span>
                        <span className="couple-tag zoom-hint">
                          <Maximize2 size={12} />
                          {tr("사진 확대", "Enlarge", "放大照片")}
                        </span>
                      </div>

                      <div className="couple-photo-bottom-bar">
                        <div className="couple-memory-caption">
                          <h3>{tr("우리의 이야기가 시작된 곳", "Where our story began", "我们故事开始的地方")}</h3>
                          <p>{tr("2025. 09. 23 • 부산 광안리 해변 & 부산대교", "Sep 23, 2025 • Busan Beach & Grand Bridge", "2025. 09. 23 • 釜山海滩与大海桥")}</p>
                        </div>
                        <div className="couple-dday-badge">
                          <Heart size={18} fill="#FFFFFF" />
                          <span>D+{dDayInfo.daysTogether}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="couple-card-body">
                    <div className="couple-counter-section">
                      <div className="couple-counter-lead">
                        <Sparkles size={16} color="#E26D5C" />
                        {tr("우리가 처음 손잡고 만난 날로부터", "Since the very first day we met", "从我们相识相聚的那天起")}
                      </div>
                      <div className="couple-counter-number">
                        {tr("함께한 지", "Together for", "相伴第")} <span>{dDayInfo.daysTogether}</span> {tr("일째", "Days", "天")}
                      </div>
                      <div className="couple-counter-sub">
                        2025. 09. 23 ~ {tr("지금 이 순간까지", "Right this moment", "直到此时此刻")} ❤️
                      </div>
                    </div>

                    <div className="couple-letter">
                      <p>
                        {tr(
                          "가장 사랑하는 Belle을 위한 특별한 공간입니다.",
                          "A very special space dedicated to my beloved Belle.",
                          "为了我最爱的 Belle 所打造的专属天地。"
                        )}
                      </p>
                      <p>
                        {tr(
                          "부산의 따뜻한 바닷바람과 파도 소리처럼, 우리가 함께 듣는 모든 음악과 추억들을 여기에 차곡차곡 담아둘게요.",
                          "Just like the gentle sea breeze and waves of Busan, all our melodies and memories will be cherished right here.",
                          "正如釜山温暖的海风与浪花般，我们将共同聆听的旋律与记忆悉心珍藏于此。"
                        )}
                      </p>
                      <p className="highlight">
                        {tr(
                          "앞으로도 계속 함께할 시간들을 기대해. 고마워요 Belle! ✨",
                          "Looking forward to all our future days together. Thank you Belle! ✨",
                          "期待未来与你一同度过的每一个明天。谢谢你 Belle！✨"
                        )}
                      </p>
                    </div>

                    {/* Milestones / Anniversaries Timeline */}
                    <div className="milestones-section">
                      <div className="milestones-title">
                        <Calendar size={16} />
                        <span>{tr("우리의 소중한 기념일들", "Our Anniversaries", "我们的纪念日")}</span>
                      </div>
                      <div className="milestones-grid">
                        {dDayInfo.milestones.map((milestone, idx) => (
                          <div
                            key={idx}
                            className={`milestone-item ${milestone.isNext ? "active" : ""} ${milestone.isPassed ? "passed" : ""}`}
                          >
                            <div className="milestone-name">
                              {milestone.isNext && "⭐ "}
                              {milestone.name}
                            </div>
                            <div className="milestone-date">{milestone.dateStr}</div>
                            <div className="milestone-dday">
                              {milestone.isPassed
                                ? tr("지남 ✓", "Passed ✓", "已达成 ✓")
                                : `D-${milestone.remainDays}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Quick Navigation Cards */}
                <motion.div
                  className="couple-actions-section"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.5 }}
                >
                  <div className="couple-section-heading">
                    <div>
                      <span>{tr("지금 함께하기", "Together now", "现在一起体验")}</span>
                      <h2>{tr("둘만의 작은 세계", "Our little world", "只属于我们的世界")}</h2>
                    </div>
                    <Heart size={18} fill="currentColor" />
                  </div>
                  <div className="couple-actions-grid">
                    <button
                      type="button"
                      className="couple-action-card music"
                      onClick={() => {
                        if (songs.length > 0) loadSong(songs[0]);
                        else setMode("viewer");
                      }}
                    >
                      <div className="couple-action-icon">
                        <Music size={22} />
                      </div>
                      <div className="couple-action-title">{tr("우리의 노래", "Our Music", "我们的歌")}</div>
                      <div className="couple-action-desc">
                        {tr("싱크 가사와 함께 감상", "Listen with lyrics", "同步歌词聆听")}
                      </div>
                    </button>

                    <button type="button" className="couple-action-card message" onClick={goToMessage}>
                      <div className="couple-action-icon">
                        <MessageSquarePlus size={22} />
                      </div>
                      <div className="couple-action-title">{tr("상대에게 한마디", "Sweet Messages", "对他说句话")}</div>
                      <div className="couple-action-desc">
                        {tr("실시간 사랑의 메시지", "Real-time notes & chat", "实时甜蜜留言")}
                      </div>
                    </button>

                    <button type="button" className="couple-action-card topic" onClick={goToTopics}>
                      <div className="couple-action-icon">
                        <FolderPlus size={22} />
                      </div>
                      <div className="couple-action-title">{tr("오늘의 주제 & 일기", "Our Diary", "今日主题与日记")}</div>
                      <div className="couple-action-desc">
                        {tr("둘만의 소중한 기록", "Shared notes & memories", "记录专属回忆")}
                      </div>
                    </button>

                    <button type="button" className="couple-action-card request" onClick={goToRequest}>
                      <div className="couple-action-icon">
                        <PlayCircle size={22} />
                      </div>
                      <div className="couple-action-title">{tr("신청곡 보내기", "Song Request", "点播歌曲")}</div>
                      <div className="couple-action-desc">
                        {tr("함께 듣고 싶은 노래", "Share songs to listen", "想一起听的歌")}
                      </div>
                    </button>

                    <button type="button" className="couple-action-card characters" onClick={goToCharacters}>
                      <div className="character-card-preview" aria-hidden="true">
                        <img src={`${import.meta.env.BASE_URL}characters/belle-cat.webp`} alt="" />
                        <img src={`${import.meta.env.BASE_URL}characters/partner-puppy.webp`} alt="" />
                      </div>
                      <div className="character-card-copy">
                        <div className="couple-action-icon"><PawPrint size={20} /></div>
                        <div>
                          <div className="couple-action-title">{tr("우리 캐릭터", "Our Characters", "我们的角色")}</div>
                          <div className="couple-action-desc">
                            {tr("둘이 뛰노는 작은 정원", "A garden where we wander", "一起玩耍的小花园")}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="couple-private-note">
                    <LockKeyhole size={14} />
                    {tr("우리 둘만 로그인해서 보는 공간", "A private place, visible only to us", "只有我们登录后才能看到的空间")}
                  </div>
                </motion.div>

                <motion.section
                  className="upcoming-section"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22, duration: 0.55 }}
                >
                  <div className="upcoming-heading">
                    <span>{tr("COMING SOON", "COMING SOON", "即将公开")}</span>
                    <h2>{tr("앞으로 이곳에 생길 것들", "What comes next", "接下来会来到这里的功能")}</h2>
                    <p>{tr("한 번에 하나씩, 우리에게 꼭 필요한 기능부터 만들게요.", "One thoughtful feature at a time, starting with what matters most to us.", "一次做好一个，从我们最需要的功能开始。")}</p>
                  </div>

                  <div className="upcoming-list">
                    {upcomingFeatures.map((feature, index) => {
                      const Icon = feature.icon;
                      return (
                        <motion.button
                          type="button"
                          className="upcoming-item"
                          key={feature.id}
                          onClick={() => setUpcomingPreviewId(feature.id)}
                          whileTap={{ scale: 0.985 }}
                        >
                          <span className="upcoming-number">{String(index + 1).padStart(2, "0")}</span>
                          <span className="upcoming-icon"><Icon size={20} /></span>
                          <span className="upcoming-copy">
                            <small>{feature.step}</small>
                            <strong>{feature.title}</strong>
                            <span>{feature.description}</span>
                          </span>
                          <ArrowUpRight className="upcoming-arrow" size={18} />
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.section>
              </div>

              {/* Fullscreen Photo Lightbox Modal */}
              <AnimatePresence>
                {photoModalOpen && (
                  <motion.div
                    className="couple-lightbox"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setPhotoModalOpen(false)}
                  >
                    <motion.div
                      className="couple-lightbox-content"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="couple-lightbox-close"
                        onClick={() => setPhotoModalOpen(false)}
                        title={tr("닫기", "Close", "关闭")}
                      >
                        <X size={20} />
                      </button>
                      <img
                        src="./images/busan_couple.jpg"
                        alt="Busan Beach and Bridge at Sunset"
                        className="couple-lightbox-img"
                      />
                      <div className="couple-lightbox-footer">
                        <h4>
                          {tr(
                            "2025년 9월 23일, 우리의 사랑이 시작된 부산의 바다",
                            "Sep 23, 2025 • Where our love began in Busan",
                            "2025年 9月 23日，我们的爱开始的釜山之海"
                          )}
                        </h4>
                        <p>
                          {tr(
                            "부산 바다와 대교의 노을빛 아래 손잡고 걸었던 그날의 설렘을 영원히 기억하며. ❤️",
                            "Cherishing the excitement of walking hand in hand under the sunset of Busan bridge and ocean. ❤️",
                            "永远珍藏在釜山大桥与大海的落日余晖下手牵手漫步的那份心动。❤️"
                          )}
                        </p>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {createPortal(
                <AnimatePresence>
                  {activeUpcomingFeature && (
                    <motion.div
                      className="feature-preview-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setUpcomingPreviewId(null)}
                    >
                      <motion.div
                        className="feature-preview-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="feature-preview-title"
                        initial={{ opacity: 0, y: 32, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.98 }}
                        transition={{ type: "spring", damping: 28, stiffness: 320 }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="feature-preview-handle" />
                        <button
                          type="button"
                          className="feature-preview-close"
                          onClick={() => setUpcomingPreviewId(null)}
                          aria-label={tr("닫기", "Close", "关闭")}
                        >
                          <X size={19} />
                        </button>
                        <div className="feature-preview-icon">
                          <activeUpcomingFeature.icon size={26} />
                        </div>
                        <span className="feature-preview-status">{activeUpcomingFeature.step}</span>
                        <h3 id="feature-preview-title">{activeUpcomingFeature.title}</h3>
                        <p>{activeUpcomingFeature.description}</p>
                        <div className="feature-preview-promise">
                          <Heart size={15} fill="currentColor" />
                          {tr("곧 우리 둘이 직접 써볼 수 있게 준비할게요.", "We’ll make this ready for the two of us soon.", "很快就会准备好，让我们一起使用。")}
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body
              )}
            </motion.section>
          )}

          {mode === "request" && (
            <motion.section
              key="request"
              className="panel welcome-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <h2 style={{ marginBottom: 24 }}>{tr("신청곡", "Song Request", "点歌")}</h2>
              <p style={{ marginBottom: 24 }}>
                {tr("원하는 곡의 YouTube 링크를 입력하세요.", "Enter the YouTube URL of the song you want.", "请输入你想要的歌曲的 YouTube 链接。")}
              </p>

              <div className="row" style={{ width: "100%", maxWidth: 600 }}>
                <input
                  className="input"
                  placeholder={tr("YouTube URL...", "YouTube URL...", "YouTube 链接...")}
                  value={requestUrl}
                  onChange={(e) => setRequestUrl(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={() => {
                    const trimmed = requestUrl.trim();
                    if (!trimmed) return;
                    setRequestSent(false);
                    setRequestError(null);
                    void saveRequest(trimmed).then(() => {
                      setRequestUrl("");
                      setTimeout(() => setRequestSent(false), 3000);
                    });
                  }}
                >
                  {tr("보내기", "Submit", "提交")}
                </button>
              </div>
              {requestError && (
                <p className="error" style={{ marginTop: 12 }}>
                  <AlertCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                  {requestError}
                </p>
              )}
              {requestSent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: 16,
                    padding: "12px 24px",
                    background: "#E8F5E9",
                    color: "#2E7D32",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                  }}
                >
                  <CheckCircle size={18} />
                  {tr("신청을 받았습니다!", "Request received!", "已收到申请！")}
                </motion.div>
              )}

              <div style={{ marginTop: 24, width: "100%", maxWidth: 720 }}>
                <div className="row space" style={{ marginBottom: 8 }}>
                  <span className="label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <MessageSquarePlus size={14} />
                    {tr("신청곡 목록", "Request list", "点歌列表")}
                  </span>
                  <button className="btn small" onClick={loadRequests} disabled={requestsLoading}>
                    {tr("새로고침", "Refresh", "刷新")}
                  </button>
                </div>
                {requestsLoading ? (
                  <p className="label">{tr("불러오는 중...", "Loading...", "加载中...")}</p>
                ) : requests.length === 0 ? (
                  <p className="label">{tr("아직 신청곡이 없습니다.", "No requests yet.", "还没有点歌。")}</p>
                ) : (
                  <ul className="song-list" style={{ maxHeight: 240, overflowY: "auto" }}>
                    {requests.map((req) => (
                      <li key={req.id} style={{ padding: 6, borderRadius: 8 }}>
                        <div className="song-title" style={{ fontSize: 12, wordBreak: "break-all" }}>
                          {req.url}
                        </div>
                        <div className="label" style={{ fontSize: 11, opacity: 0.8 }}>
                          {(req.createdByName || req.createdBy || tr("알 수 없음", "Unknown", "未知"))}
                          {req.createdAt ? ` · ${formatDate(req.createdAt)}` : ""}
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <button className="btn small" onClick={() => removeRequest(req.id)}>
                            <X size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.section>
          )}

          {mode === "message" && (
            <motion.section
              key="message"
              className="panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h2 style={{ marginBottom: 8 }}>{tr("상대에게 한마디", "Message", "对他说句话")}</h2>
              <p className="label" style={{ marginBottom: 16 }}>
                {tr("서로에게 짧은 메시지를 남겨보세요.", "Leave short messages to each other.", "给对方留下短消息吧。")}
              </p>
              <div
                className="chat-box"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  maxHeight: 320,
                  overflowY: "auto",
                  padding: 12,
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid #eee"
                }}
              >
                {messagesLoading ? (
                  <p className="label">{tr("불러오는 중...", "Loading...", "加载中...")}</p>
                ) : messages.length === 0 ? (
                  <p className="label">{tr("아직 메시지가 없습니다.", "No messages yet.", "还没有消息。")}</p>
                ) : (
                  messages.map((m) => {
                    const currentUserEmail = auth?.currentUser?.email || localStorage.getItem("belle_user_email");
                    const mine = Boolean(m.createdBy && m.createdBy === currentUserEmail);
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: mine ? "flex-end" : "flex-start",
                          maxWidth: "80%"
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end" }}>
                          {m.createdByPhotoURL ? (
                            <img
                              src={m.createdByPhotoURL}
                              alt="avatar"
                              style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
                            />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#eee" }} />
                          )}
                          <div
                            style={{
                              background: mine ? "#D9C9B6" : "#F2F2F2",
                              color: "#222",
                              padding: "8px 12px",
                              borderRadius: 12,
                              whiteSpace: "pre-wrap"
                            }}
                          >
                            {m.text}
                          </div>
                        </div>
                        <div className="label" style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                          {(m.createdByName || m.createdBy || tr("알 수 없음", "Unknown", "未知"))}
                          {m.createdAt ? ` · ${formatDate(m.createdAt)}` : ""}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <input
                  className="input"
                  placeholder={tr("메시지를 입력하세요", "Type a message", "输入消息")}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button className="btn primary" onClick={sendMessage}>
                  {tr("보내기", "Send", "发送")}
                </button>
              </div>
            </motion.section>
          )}

          {mode === "characters" && (
            <CharacterWorld key="characters" lang={lang} onBack={goToHome} />
          )}

          {mode === "topics" && (
            <motion.section
              key="topics"
              className="panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="row space" style={{ marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>{tr("오늘의 주제", "Daily Topics", "今日主题")}</h2>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}>
                    B
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}>
                    I
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("underline"))} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
                    U
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("strike"))} onClick={() => editor?.chain().focus().toggleStrike().run()}>
                    S
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                    {tr("• 목록", "Bullets", "项目")}
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                    {tr("1. 목록", "Numbered", "编号")}
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("taskList"))} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
                    {tr("체크", "Tasks", "任务")}
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
                    {tr("인용", "Quote", "引用")}
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("codeBlock"))} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
                    {tr("코드", "Code", "代码")}
                  </button>
                  <button className="btn small" style={toolbarBtnStyle(editor?.isActive("link"))} onClick={insertLink}>
                    {tr("링크", "Link", "链接")}
                  </button>
                  <button className="btn small" onClick={insertImage}>
                    {tr("이미지", "Image", "图片")}
                  </button>
                  <button className="btn small" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                    {tr("표", "Table", "表格")}
                  </button>
                  <select
                    className="input"
                    style={{ width: 56, fontSize: 12, padding: "4px 6px" }}
                    value={String(lineHeight)}
                    onChange={(e) => updateLineHeight(Number(e.target.value))}
                  >
                    {Array.from({ length: 20 }, (_, i) => {
                      const value = ((i + 1) / 10).toFixed(1);
                      return (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff", minHeight: 360 }}>
                {selectedTopicId ? (
                  <div style={{ minHeight: 360 }}>
                    <div
                      onClick={() => editor?.chain().focus().run()}
                      style={{
                        minHeight: 360,
                        padding: "8px 4px 12px",
                        borderRadius: 0,
                        background: "#fcfbf9",
                        border: "none",
                        borderBottom: "1px solid #e6e6e6",
                        outline: "none"
                      }}
                    >
                      <EditorContent
                        editor={editor}
                        style={{
                          minHeight: 340,
                          fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", \"Book Antiqua\", Palatino, serif",
                          fontSize: 15,
                          lineHeight
                        }}
                      />
                    </div>
                  </div>
                ) : topicNodes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 12px" }}>
                    <p className="label" style={{ marginBottom: 12 }}>
                      {tr("폴더나 노트를 먼저 만들어 주세요.", "Create a folder or note first.", "请先创建文件夹或笔记。")}
                    </p>
                    <div className="row" style={{ justifyContent: "center", gap: 8 }}>
                      <button className="btn small" onClick={() => createTopicNode("folder", null)}>
                        <FolderPlus size={14} />
                        {tr("새 폴더", "New folder", "新建文件夹")}
                      </button>
                      <button className="btn small" onClick={() => createTopicNode("file", null)}>
                        <FilePlus size={14} />
                        {tr("새 노트", "New note", "新建笔记")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="label">{tr("왼쪽에서 노트를 선택하세요.", "Select a note on the left.", "请选择左侧的笔记。")}</p>
                )}
              </div>
            </motion.section>
          )}

          {mode === "editor" && (
            <motion.section
              key="editor-input"
              className="panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="row">
                <input
                  className="input"
                  placeholder={tr("YouTube 링크", "YouTube URL", "YouTube 链接")}
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                <button className="btn" onClick={onLoadYoutube}>
                  <PlayCircle size={18} />
                  {tr("영상 불러오기", "Load video", "加载视频")}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <motion.section
          className={`panel display ${!videoId ? "hidden" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: videoId ? 1 : 0 }}
          layout
        >
          <div className="player" ref={playerHostRef} />
        </motion.section>

        <motion.section
          className={`panel display ${!videoId ? "hidden" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: videoId ? 1 : 0 }}
          layout
        >
          <div className="lyrics">
            <div className="line prev">
              {activeIndex > 0
                ? cues[activeIndex - 1]?.twText ?? cues[activeIndex - 1]?.text
                : ""}
            </div>
            <div className="line current">
              {activeCue ? activeCue.twText ?? activeCue.text : tr("재생 중...", "Playing...", "播放中...")}
              {debugTimes && activeCue && (
                <div className="time">{formatMs(activeCue.startMs)} - {formatMs(activeCue.endMs)}</div>
              )}
            </div>
            <div className="line next">
              {activeIndex >= 0 && activeIndex < cues.length - 1
                ? cues[activeIndex + 1]?.twText ?? cues[activeIndex + 1]?.text
                : ""}
            </div>
          </div>
        </motion.section>

        {mode === "editor" && (
          <motion.section
            className="panel grid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div>
              <label className="label">
                <Music size={14} style={{ display: "inline", marginRight: 4 }} />
                {tr("대만어 가사 (줄 단위)", "Taiwanese lyrics (per line)", "台语歌词（逐行）")}
              </label>
              <textarea
                className="textarea"
                value={lyricsInput}
                onChange={(e) => setLyricsInput(e.target.value)}
                placeholder={tr("예)\n你好\n阮的心", "e.g.\n你好\n阮的心", "例如\n你好\n阮的心")}
              />
              <div className="row" style={{ marginTop: 8 }}>
                <label className="btn small" style={{ width: "100%", cursor: "pointer" }}>
                  <Upload size={14} />
                  {tr("파일 업로드", "Upload file", "上传文件")}
                  <input
                    type="file"
                    accept=".txt,.lrc"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) readFileToText(file, setLyricsInput);
                    }}
                  />
                </label>
              </div>
            </div>
            <div>
              <label className="label">
                <CheckCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                {tr("타임코드 자막 (VTT/SRT)", "Timed captions (VTT/SRT)", "时间码字幕（VTT/SRT）")}
              </label>
              <textarea
                className="textarea"
                value={vttInput}
                onChange={(e) => setVttInput(e.target.value)}
                placeholder={tr("WEBVTT... 또는 SRT", "WEBVTT... or SRT", "WEBVTT... 或 SRT")}
              />
              <div className="row" style={{ marginTop: 8 }}>
                <label className="btn small" style={{ width: "100%", cursor: "pointer" }}>
                  <Upload size={14} />
                  {tr("파일 업로드", "Upload file", "上传文件")}
                  <input
                    type="file"
                    accept=".vtt,.srt,.txt"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) readFileToText(file, setVttInput);
                    }}
                  />
                </label>
              </div>
            </div>
          </motion.section>
        )}

        {mode === "editor" && (
          <motion.section
            className="panel actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2>{tr("수동 타이밍 (Whisper 없이)", "Manual timing (no Whisper)", "手动计时（无需 Whisper）")}</h2>
            <p className="label">
              {tr("재생 중에 탭을 눌러 줄별 시작/끝 시간을 기록합니다.", "Tap during playback to record start/end times per line.", "播放时点击记录每行开始/结束时间。")}
            </p>
            <div className="row">
              <button className="btn" onClick={startManualSync}>
                <PlayCircle size={16} />
                {tr("수동 타이밍 시작", "Start manual timing", "开始手动计时")}
              </button>
              <button
                className="btn primary"
                onClick={tapManualSync}
                disabled={!manualActive}
              >
                <CheckCircle size={16} />
                {tr("탭/다음 줄", "Tap / Next line", "点击/下一行")}
              </button>
              <button className="btn" onClick={applyManualCues}>
                <CheckCircle size={16} />
                {tr("수동 결과 적용", "Apply manual result", "应用手动结果")}
              </button>
            </div>
            {manualCues.length > 0 && (
              <div className="row">
                <span className="label">
                  {tr("진행", "Progress", "进度")}: {manualIndex + 1} / {manualCues.length}
                </span>
                <span className="label">
                  {tr("현재 줄", "Current line", "当前行")}: {manualCues[manualIndex]?.twText ?? ""}
                </span>
              </div>
            )}
            {manualMessage && (
              <p className="error">
                <AlertCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                {manualMessage}
              </p>
            )}
          </motion.section>
        )}

        {/* Actions Panel - Editor Only */}
        {/* Actions Panel - Editor Only */}
        {mode === "editor" && (
          <motion.section
            className="panel actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <button className="btn primary" onClick={applyParsing}>
              <PlayCircle size={16} />
              {tr("파싱 & 자동 매핑", "Parse & auto-map", "解析并自动匹配")}
            </button>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={exportProject}>
                <Download size={16} />
                {tr("프로젝트 내보내기(JSON)", "Export project (JSON)", "导出项目 (JSON)")}
              </button>
              <label className="btn" style={{ cursor: "pointer" }}>
                <Upload size={16} />
                {tr("프로젝트 불러오기", "Import project", "导入项目")}
                <input
                  type="file"
                  accept=".json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importProject(file);
                  }}
                />
              </label>
            </div>
            <div className="row">
              <label className="label">{tr("전체 오프셋", "Global offset", "全局偏移")} : {globalOffsetMs}ms</label>
              <input
                type="range"
                min={-3000}
                max={3000}
                step={100}
                value={globalOffsetMs}
                onChange={(e) => setGlobalOffsetMs(Number(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
            <div className="row">
              <button className="btn" onClick={() => adjustCurrentCue(-100)}>
                -0.1s
              </button>
              <button className="btn" onClick={() => adjustCurrentCue(100)}>
                +0.1s
              </button>
              <button
                className="btn"
                onClick={() => seekToCue(Math.max(0, activeIndex - 1))}
              >
                {tr("이전 줄", "Previous line", "上一行")}
              </button>
              <button
                className="btn"
                onClick={() =>
                  seekToCue(Math.min(cues.length - 1, activeIndex + 1))
                }
              >
                {tr("다음 줄", "Next line", "下一行")}
              </button>
              <button
                className="btn"
                onClick={() => setDebugTimes((v) => !v)}
              >
                {tr("디버그", "Debug", "调试")}: {debugTimes ? "ON" : "OFF"}
              </button>
            </div>
            {parseError && (
              <p className="error">
                <AlertCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                {parseError}
              </p>
            )}
          </motion.section>
        )}

        {/* Share Actions - Editor Only */}
        {mode === "editor" && (
          <motion.section
            className="panel actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2>{tr("공유 링크 생성", "Create share link", "生成分享链接")}</h2>
            <p className="label">
              {tr(
                "VTT/SRT와 가사를 공개 URL에 올린 뒤 링크만 공유하면 자동으로 자막이 로딩됩니다.",
                "Upload VTT/SRT and lyrics to a public URL and share the link to auto-load captions.",
                "将 VTT/SRT 和歌词上传到公开链接，分享链接即可自动加载字幕。"
              )}
            </p>
            <div className="row">
              <input
                className="input"
                placeholder={tr("VTT/SRT 공개 URL", "Public VTT/SRT URL", "公开 VTT/SRT 链接")}
                value={vttUrl}
                onChange={(e) => setVttUrl(e.target.value)}
              />
              <input
                className="input"
                placeholder={tr("가사 TXT URL (선택)", "Lyrics TXT URL (optional)", "歌词 TXT 链接（可选）")}
                value={lyricsUrl}
                onChange={(e) => setLyricsUrl(e.target.value)}
              />
              <button className="btn primary" onClick={copyShareLink}>
                <LinkIcon size={16} />
                {tr("링크 복사", "Copy link", "复制链接")}
              </button>
            </div>
            <div className="row">
              <input
                className="input"
                readOnly
                value={shareLink}
                placeholder={tr("여기에 공유 링크가 표시됩니다.", "Your share link will appear here.", "分享链接会显示在这里。")}
              />
            </div>
            {shareMessage && (
              <p className="error" style={{ background: "#E8F5E9", color: "#2E7D32" }}>
                <CheckCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                {shareMessage}
              </p>
            )}
          </motion.section>
        )}



        {/* Mapping Results - Hidden in View Mode unless cues exist, but buttons hidden */}


        {/* Mapping Results - Editor Only */}
        {mode === "editor" && (
          <motion.section
            className="panel list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="row space">
              <h2>{tr("매핑 결과", "Mapping results", "映射结果")}</h2>
              <div className="row">
                <button className="btn" onClick={() => downloadText("lyrics.vtt", toVtt(cues))}>
                  {tr("VTT 다운로드", "Download VTT", "下载 VTT")}
                </button>
                <button className="btn" onClick={() => downloadText("lyrics.lrc", toLrc(cues))}>
                  {tr("LRC 다운로드", "Download LRC", "下载 LRC")}
                </button>
              </div>
            </div>
            <div className="cue-list">
              {cues.map((cue, idx) => (
                <div key={`${cue.startMs}-${idx}`} className={`cue ${idx === activeIndex ? "active" : ""}`}>
                  <div className="cue-time">
                    {formatMs(cue.startMs)} → {formatMs(cue.endMs)}
                  </div>
                  <div className="cue-text">
                    {(cue.twText ?? cue.text).split("\n").map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                  <button className="btn small" onClick={() => selectEdit(idx)}>
                    {tr("텍스트 수정", "Edit text", "编辑文本")}
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}


        {
          editIndex !== null && (
            <div className="modal">
              <div className="modal-body">
                <h3>{tr("텍스트 수정", "Edit text", "编辑文本")}</h3>
                <textarea
                  className="textarea"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <div className="row">
                  <button className="btn primary" onClick={applyEdit}>
                    {tr("적용", "Apply", "应用")}
                  </button>
                  <button className="btn" onClick={() => setEditIndex(null)}>
                    {tr("취소", "Cancel", "取消")}
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {showSettings && (
          <div className="modal" onClick={completeOnboarding}>
            <div className="modal-body" onClick={(e) => e.stopPropagation()}>
              <h3>{tr("설정", "Settings", "设置")}</h3>
              <p className="label" style={{ marginBottom: 12 }}>
                {tr("언어 설정", "Language", "语言设置")}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn small"
                  onClick={() => updateLang("ko")}
                  style={lang === "ko" ? { background: "#222", color: "#fff" } : undefined}
                >
                  한국어
                </button>
                <button
                  className="btn small"
                  onClick={() => updateLang("en")}
                  style={lang === "en" ? { background: "#222", color: "#fff" } : undefined}
                >
                  English
                </button>
                <button
                  className="btn small"
                  onClick={() => updateLang("zh")}
                  style={lang === "zh" ? { background: "#222", color: "#fff" } : undefined}
                >
                  中文
                </button>
              </div>
              <p className="label" style={{ marginTop: 16, marginBottom: 8 }}>
                {tr("닉네임 설정", "Nickname", "昵称设置")} · {tr("당신이 이 곳에서 사용하고 싶은 이름을 설정하세요", "Set the name you want to use here", "设置你在这里想使用的名字")}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  placeholder={tr("닉네임 입력", "Enter nickname", "输入昵称")}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
                <button className="btn primary" onClick={saveProfile} disabled={profileLoading}>
                  {tr("저장", "Save", "保存")}
                </button>
              </div>
              <p className="label" style={{ marginTop: 16, marginBottom: 8 }}>
                {tr("프로필 사진", "Profile photo", "头像")}
              </p>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt="profile"
                    style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#eee" }} />
                )}
                <label className="btn small" style={{ cursor: "pointer" }}>
                  {tr("업로드", "Upload", "上传")}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleAvatarUpload(file);
                    }}
                  />
                </label>
              </div>
              {profileMessage && (
                <p className="label" style={{ marginTop: 8, color: "#2E7D32" }}>
                  {profileMessage}
                </p>
              )}
              {profileLoading && (
                <p className="label" style={{ marginTop: 8 }}>
                  {tr("불러오는 중...", "Loading...", "加载中...")}
                </p>
              )}
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" onClick={handleAdminLogout}>
                  {tr("로그아웃", "Logout", "退出")}
                </button>
                <button className="btn primary" onClick={completeOnboarding}>
                  {tr("닫기", "Close", "关闭")}
                </button>
              </div>
            </div>
          </div>
        )}

        {contextMenu && (
          <div
            className="modal"
            onClick={closeContextMenu}
            style={{ background: "transparent" }}
          >
            <div
              style={{
                position: "fixed",
                top: contextMenu.y,
                left: contextMenu.x,
                background: "#ffffff",
                border: "1px solid #e6e6e6",
                borderRadius: 12,
                padding: 8,
                minWidth: 180,
                zIndex: 9999,
                boxShadow: "0 12px 28px rgba(0,0,0,0.14)",
                backdropFilter: "blur(6px)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "grid", gap: 6 }}>
                {contextMenu.node.type === "folder" && (
                  <>
                    <button
                      className="btn small"
                      style={{ justifyContent: "flex-start" }}
                      onClick={() => {
                        createTopicNode("folder", contextMenu.node.id);
                        closeContextMenu();
                      }}
                    >
                      <FolderPlus size={14} />
                      {tr("새 폴더", "New folder", "新建文件夹")}
                    </button>
                    <button
                      className="btn small"
                      style={{ justifyContent: "flex-start" }}
                      onClick={() => {
                        createTopicNode("file", contextMenu.node.id);
                        closeContextMenu();
                      }}
                    >
                      <FilePlus size={14} />
                      {tr("새 노트", "New note", "新建笔记")}
                    </button>
                    <div style={{ height: 1, background: "#eee", margin: "2px 0" }} />
                  </>
                )}
                <button
                  className="btn small"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => {
                    startRenameTopic(contextMenu.node);
                    closeContextMenu();
                  }}
                >
                  <Edit3 size={14} />
                  {tr("이름 변경", "Rename", "重命名")}
                </button>
                <button
                  className="btn small"
                  style={{ justifyContent: "flex-start", color: "#B42318" }}
                  onClick={() => {
                    deleteTopicNode(contextMenu.node);
                    closeContextMenu();
                  }}
                >
                  <X size={14} />
                  {tr("삭제", "Delete", "删除")}
                </button>
              </div>
            </div>
          </div>
        )}

        {isSidebarOpen && <div className="overlay" onClick={() => setIsSidebarOpen(false)} />}
      </div>
    </div>
  );
};

export default App;
