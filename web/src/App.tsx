import React, { useEffect, useMemo, useRef, useState } from "react";
import { songs, Song } from "./songs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  X,
  Menu,
  Music,
  Edit3,
  PlayCircle,
  Link as LinkIcon,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  MessageSquarePlus
} from "lucide-react";

type Cue = {
  startMs: number;
  endMs: number;
  text: string;
  twText?: string;
};

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type AppMode = "home" | "editor" | "viewer" | "request";

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
  const [requests, setRequests] = useState<string[]>(() => {
    const saved = localStorage.getItem("belle_requests");
    return saved ? JSON.parse(saved) : [];
  });

  const saveRequest = (url: string) => {
    const newRequests = [url, ...requests];
    setRequests(newRequests);
    localStorage.setItem("belle_requests", JSON.stringify(newRequests));
  };

  const removeRequest = (index: number) => {
    const newRequests = requests.filter((_, i) => i !== index);
    setRequests(newRequests);
    localStorage.setItem("belle_requests", JSON.stringify(newRequests));
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
  };

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
        setParseError("Failed to load song data.");
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
      setParseError("프로젝트 파일 파싱 실패.");
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
      setShareMessage("먼저 YouTube 영상을 불러오세요.");
      return;
    }
    if (!vttUrl) {
      setShareMessage("VTT/SRT 공개 URL을 입력하세요.");
      return;
    }
    const link = buildShareLink();
    try {
      await navigator.clipboard.writeText(link);
      setShareMessage("공유 링크가 복사되었습니다.");
    } catch {
      setShareMessage("복사 실패. 아래 링크를 수동으로 복사하세요.");
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
      setParseError("VTT 또는 SRT 자막을 입력하세요.");
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
      setParseError("자막 파싱 실패. VTT 또는 SRT 형식을 확인하세요.");
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
      setManualMessage("대만어 가사를 먼저 입력하세요.");
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
      setManualMessage("먼저 영상을 재생하세요.");
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
      setManualMessage("수동 타이밍 완료. 적용 버튼을 눌러주세요.");
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
      setManualMessage("수동 타이밍 결과가 없습니다.");
      return;
    }
    const invalid = manualCues.some(
      (c) => c.startMs < 0 || c.endMs < 0 || c.endMs <= c.startMs
    );
    if (invalid) {
      setManualMessage("아직 끝 시간이 없는 줄이 있습니다. 재생하면서 탭을 더 눌러주세요.");
      return;
    }
    setCues(manualCues.map((c) => ({ ...c })));
  };

  const onLoadYoutube = () => {
    const id = extractYouTubeId(youtubeUrl);
    if (!id) {
      setParseError("유효한 YouTube 링크를 입력하세요.");
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
        setParseError("외부 자막/가사 불러오기 실패. URL과 CORS 설정을 확인하세요.");
      }
    })();
  }, []);

  return (
    <div className="layout-container">
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <button className="home-btn" onClick={goToHome}>
            <Home size={18} />
            Home
          </button>
          <button className="close-btn" onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>
        <div className="sidebar-actions">
          <button className="btn editor-btn" onClick={goToEditor}>
            <Edit3 size={16} />
            새 작업 (Editor)
          </button>
          <button className="btn editor-btn" style={{ marginTop: 8 }} onClick={goToRequest}>
            <MessageSquarePlus size={16} />
            申請歌曲
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
              No songs added.
            </li>
          )}
        </ul>
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
            <h1>只屬於我最愛的 Belle 的空間</h1>
            <p>我們的歌，我們的時間</p>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {mode === "home" && (
            <motion.section
              key="home"
              className="panel welcome-screen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Music size={64} style={{ color: "#D4B996", marginBottom: 24 }} />
              </motion.div>
              <h2>歡迎光臨！</h2>
              <p>之後我會再持續更新的。</p>
              <p>請繼續關注喔，謝謝你。</p>
              <p style={{ marginTop: 16, fontWeight: 500 }}>我是 good boy。</p>
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
              <h2 style={{ marginBottom: 24 }}>申請歌曲</h2>
              <p style={{ marginBottom: 24 }}>請輸入你想要的歌曲的 YouTube 影片網址。</p>

              <div className="row" style={{ width: "100%", maxWidth: 600 }}>
                <input
                  className="input"
                  placeholder="YouTube URL..."
                  value={requestUrl}
                  onChange={(e) => setRequestUrl(e.target.value)}
                />
                <button
                  className="btn primary"
                  onClick={() => {
                    if (requestUrl.trim()) {
                      saveRequest(requestUrl.trim());
                      setRequestSent(true);
                      setRequestUrl("");
                      setTimeout(() => setRequestSent(false), 3000);
                    }
                  }}
                >
                  送出
                </button>
              </div>
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
                  已收到申請！
                </motion.div>
              )}
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
                  placeholder="YouTube 링크"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                <button className="btn" onClick={onLoadYoutube}>
                  <PlayCircle size={18} />
                  영상 불러오기
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
              {activeCue ? activeCue.twText ?? activeCue.text : "재생 중..."}
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
                대만어 가사 (줄 단위)
              </label>
              <textarea
                className="textarea"
                value={lyricsInput}
                onChange={(e) => setLyricsInput(e.target.value)}
                placeholder="예)\n你好\n阮的心"
              />
              <div className="row" style={{ marginTop: 8 }}>
                <label className="btn small" style={{ width: "100%", cursor: "pointer" }}>
                  <Upload size={14} />
                  파일 업로드
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
                타임코드 자막 (VTT/SRT)
              </label>
              <textarea
                className="textarea"
                value={vttInput}
                onChange={(e) => setVttInput(e.target.value)}
                placeholder="WEBVTT... 또는 SRT"
              />
              <div className="row" style={{ marginTop: 8 }}>
                <label className="btn small" style={{ width: "100%", cursor: "pointer" }}>
                  <Upload size={14} />
                  파일 업로드
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
            <h2>수동 타이밍 (Whisper 없이)</h2>
            <p className="label">
              재생 중에 탭을 눌러 줄별 시작/끝 시간을 기록합니다.
            </p>
            <div className="row">
              <button className="btn" onClick={startManualSync}>
                <PlayCircle size={16} />
                수동 타이밍 시작
              </button>
              <button
                className="btn primary"
                onClick={tapManualSync}
                disabled={!manualActive}
              >
                <CheckCircle size={16} />
                탭/다음 줄
              </button>
              <button className="btn" onClick={applyManualCues}>
                <CheckCircle size={16} />
                수동 결과 적용
              </button>
            </div>
            {manualCues.length > 0 && (
              <div className="row">
                <span className="label">
                  진행: {manualIndex + 1} / {manualCues.length}
                </span>
                <span className="label">
                  현재 줄: {manualCues[manualIndex]?.twText ?? ""}
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
              파싱 & 자동 매핑
            </button>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={exportProject}>
                <Download size={16} />
                프로젝트 내보내기(JSON)
              </button>
              <label className="btn" style={{ cursor: "pointer" }}>
                <Upload size={16} />
                프로젝트 불러오기
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
              <label className="label">전체 오프셋: {globalOffsetMs}ms</label>
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
                이전 줄
              </button>
              <button
                className="btn"
                onClick={() =>
                  seekToCue(Math.min(cues.length - 1, activeIndex + 1))
                }
              >
                다음 줄
              </button>
              <button
                className="btn"
                onClick={() => setDebugTimes((v) => !v)}
              >
                디버그: {debugTimes ? "ON" : "OFF"}
              </button>
            </div>
            {parseError && (
              <p className="error">
                <AlertCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                {parseError}
              </p>
            )}
            {/* Request List - Editor Only */}
            <div style={{ marginTop: 24, padding: 16, background: "#f9f9f9", borderRadius: 12 }}>
              <div className="row space">
                <h3>💌 신청곡 목록 ({requests.length})</h3>
                <span className="label" style={{ fontSize: 12 }}>로컬 저장소 (이 브라우저에서만 보임)</span>
              </div>
              {requests.length === 0 ? (
                <p className="label">아직 신청곡이 없습니다.</p>
              ) : (
                <ul className="song-list" style={{ maxHeight: 200, overflowY: "auto" }}>
                  {requests.map((req, idx) => (
                    <li key={idx} style={{ background: "#fff", padding: 8, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span className="song-title" style={{ fontSize: 13, wordBreak: "break-all" }}>{req}</span>
                      <div className="row" style={{ gap: 4, margin: 0 }}>
                        <button className="btn small" onClick={() => setYoutubeUrl(req)}>
                          <PlayCircle size={14} />
                        </button>
                        <button className="btn small" onClick={() => {
                          navigator.clipboard.writeText(req);
                        }}>
                          <LinkIcon size={14} />
                        </button>
                        <button className="btn small" onClick={() => removeRequest(idx)}>
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

        {/* Share Actions - Editor Only */}
        {mode === "editor" && (
          <motion.section
            className="panel actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2>공유 링크 생성</h2>
            <p className="label">
              VTT/SRT와 가사를 공개 URL에 올린 뒤 링크만 공유하면 자동으로 자막이 로딩됩니다.
            </p>
            <div className="row">
              <input
                className="input"
                placeholder="VTT/SRT 공개 URL"
                value={vttUrl}
                onChange={(e) => setVttUrl(e.target.value)}
              />
              <input
                className="input"
                placeholder="가사 TXT URL (선택)"
                value={lyricsUrl}
                onChange={(e) => setLyricsUrl(e.target.value)}
              />
              <button className="btn primary" onClick={copyShareLink}>
                <LinkIcon size={16} />
                링크 복사
              </button>
            </div>
            <div className="row">
              <input
                className="input"
                readOnly
                value={shareLink}
                placeholder="여기에 공유 링크가 표시됩니다."
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
              <h2>매핑 결과</h2>
              <div className="row">
                <button className="btn" onClick={() => downloadText("lyrics.vtt", toVtt(cues))}>
                  VTT 다운로드
                </button>
                <button className="btn" onClick={() => downloadText("lyrics.lrc", toLrc(cues))}>
                  LRC 다운로드
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
                    텍스트 수정
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
                <h3>텍스트 수정</h3>
                <textarea
                  className="textarea"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <div className="row">
                  <button className="btn primary" onClick={applyEdit}>
                    적용
                  </button>
                  <button className="btn" onClick={() => setEditIndex(null)}>
                    취소
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {isSidebarOpen && <div className="overlay" onClick={() => setIsSidebarOpen(false)} />}
      </div>
    </div>
  );
};

export default App;
