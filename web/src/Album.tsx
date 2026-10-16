import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Settings2,
  Trash2,
  X
} from "lucide-react";
import { auth, db } from "./firebase";
import { ALBUM_BUCKET, isSupabaseConfigured, supabase } from "./supabase";
import { compressAlbumImage, MAX_ALBUM_FILES, validateAlbumFile } from "./albumImage";
import "./album.css";

type Lang = "ko" | "en" | "zh";

type AlbumPhoto = {
  id: string;
  displayPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  bytes: number;
  caption: string;
  location: string;
  takenDate: string;
  albumTag: string;
  likedBy: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: number;
};

type UploadItem = { name: string; progress: number; error?: string };

type Props = {
  lang: Lang;
  nickname: string;
  onBack: () => void;
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const Album: React.FC<Props> = ({ lang, nickname, onBack }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, { thumb: string; display: string }>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [takenDate, setTakenDate] = useState(today);
  const [albumTag, setAlbumTag] = useState("우리의 일상");
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [formError, setFormError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const tr = (ko: string, en: string, zh: string) => lang === "en" ? en : lang === "zh" ? zh : ko;
  const uid = auth?.currentUser?.uid || "";

  useEffect(() => {
    if (!db) return;
    const albumQuery = query(collection(db, "album_photos"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(albumQuery, (snapshot) => {
      const next = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          displayPath: data.displayPath || "",
          thumbnailPath: data.thumbnailPath || "",
          width: data.width || 1,
          height: data.height || 1,
          bytes: data.bytes || 0,
          caption: data.caption || "",
          location: data.location || "",
          takenDate: data.takenDate || "",
          albumTag: data.albumTag || tr("우리의 일상", "Our days", "我们的日常"),
          likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
          createdBy: data.createdBy || "",
          createdByName: data.createdByName || "",
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : undefined
        } satisfies AlbumPhoto;
      });
      setPhotos(next);
      setLoading(false);
      setLoadError("");
    }, () => {
      setLoading(false);
      setLoadError(tr("앨범 정보를 불러오지 못했어요.", "Could not load the album.", "无法载入相册。"));
    });
    return unsubscribe;
  }, [lang]);

  useEffect(() => {
    if (!supabase || photos.length === 0) {
      setUrls({});
      return;
    }
    const client = supabase;
    let cancelled = false;
    const loadSignedUrls = async () => {
      const paths = photos.flatMap((photo) => [photo.thumbnailPath, photo.displayPath]).filter(Boolean);
      const { data, error } = await client.storage.from(ALBUM_BUCKET).createSignedUrls(paths, 60 * 60);
      if (cancelled || error || !data) return;
      const byPath = new Map(data.map((entry) => [entry.path, entry.signedUrl]));
      const next: Record<string, { thumb: string; display: string }> = {};
      photos.forEach((photo) => {
        const thumb = byPath.get(photo.thumbnailPath);
        const display = byPath.get(photo.displayPath);
        if (thumb && display) next[photo.id] = { thumb, display };
      });
      setUrls(next);
    };
    void loadSignedUrls();
    const refresh = window.setInterval(loadSignedUrls, 50 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [photos]);

  useEffect(() => {
    if (!activeId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveId(null);
      if (event.key === "ArrowLeft") moveLightbox(-1);
      if (event.key === "ArrowRight") moveLightbox(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tags = useMemo(() => Array.from(new Set(photos.map((photo) => photo.albumTag).filter(Boolean))), [photos]);
  const filtered = useMemo(() => filter === "all" ? photos : photos.filter((photo) => photo.albumTag === filter), [filter, photos]);
  const groups = useMemo(() => {
    const map = new Map<string, AlbumPhoto[]>();
    filtered.forEach((photo) => {
      const key = photo.takenDate?.slice(0, 7) || "unknown";
      map.set(key, [...(map.get(key) || []), photo]);
    });
    return Array.from(map.entries());
  }, [filtered]);
  const activePhoto = photos.find((photo) => photo.id === activeId) || null;

  const formatMonth = (key: string) => {
    if (key === "unknown") return tr("날짜를 기록하지 않은 추억", "Undated memories", "未记录日期的回忆");
    const date = new Date(`${key}-01T00:00:00`);
    const locale = lang === "en" ? "en-US" : lang === "zh" ? "zh-TW" : "ko-KR";
    return date.toLocaleDateString(locale, { year: "numeric", month: "long" });
  };

  const chooseFiles = (selected: FileList | null) => {
    setFormError("");
    if (!selected) return;
    const next = Array.from(selected).slice(0, MAX_ALBUM_FILES);
    try {
      next.forEach(validateAlbumFile);
      setFiles(next);
      setUploadItems(next.map((file) => ({ name: file.name, progress: 0 })));
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid";
      setFormError(code === "too_large"
        ? tr("사진 한 장은 30MB 이하여야 해요.", "Each photo must be under 30MB.", "每张照片须小于 30MB。")
        : tr("지원되는 이미지 파일을 선택해주세요.", "Choose supported image files.", "请选择支持的图片文件。"));
    }
  };

  const setItemProgress = (index: number, patch: Partial<UploadItem>) => {
    setUploadItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const upload = async () => {
    if (!supabase || !uid || files.length === 0 || uploading) return;
    setUploading(true);
    setFormError("");
    let successCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const photoId = crypto.randomUUID();
      const basePath = `album/${uid}/${photoId}`;
      const displayPath = `${basePath}/display.webp`;
      const thumbnailPath = `${basePath}/thumb.webp`;
      const uploadedPaths: string[] = [];
      try {
        setItemProgress(index, { progress: 8, error: undefined });
        const compressed = await compressAlbumImage(file);
        setItemProgress(index, { progress: 45 });
        const displayResult = await supabase.storage.from(ALBUM_BUCKET).upload(displayPath, compressed.display, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false
        });
        if (displayResult.error) throw displayResult.error;
        uploadedPaths.push(displayPath);
        setItemProgress(index, { progress: 68 });
        const thumbnailResult = await supabase.storage.from(ALBUM_BUCKET).upload(thumbnailPath, compressed.thumbnail, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false
        });
        if (thumbnailResult.error) throw thumbnailResult.error;
        uploadedPaths.push(thumbnailPath);
        setItemProgress(index, { progress: 88 });
        await addDoc(collection(db, "album_photos"), {
          displayPath,
          thumbnailPath,
          width: compressed.width,
          height: compressed.height,
          bytes: compressed.bytes,
          caption: caption.trim(),
          location: location.trim(),
          takenDate,
          albumTag: albumTag.trim() || tr("우리의 일상", "Our days", "我们的日常"),
          likedBy: [],
          createdBy: uid,
          createdByName: nickname || auth.currentUser?.email || "ForBelle",
          createdAt: serverTimestamp()
        });
        successCount += 1;
        setItemProgress(index, { progress: 100 });
      } catch (error) {
        if (uploadedPaths.length) await supabase.storage.from(ALBUM_BUCKET).remove(uploadedPaths);
        const message = error instanceof Error ? error.message : "upload_failed";
        setItemProgress(index, { progress: 0, error: message });
      }
    }

    setUploading(false);
    if (successCount === files.length) {
      setFiles([]);
      setCaption("");
      setLocation("");
      setAlbumTag(tr("우리의 일상", "Our days", "我们的日常"));
      setUploadItems([]);
      setUploadOpen(false);
    } else {
      setFormError(tr(`${successCount}장은 저장했고, 실패한 사진은 다시 확인해주세요.`, `${successCount} saved. Check the failed photos.`, `已保存 ${successCount} 张，请检查失败的照片。`));
    }
  };

  const toggleLike = async (photo: AlbumPhoto) => {
    if (!uid) return;
    const liked = photo.likedBy.includes(uid);
    await updateDoc(doc(db, "album_photos", photo.id), {
      likedBy: liked ? arrayRemove(uid) : arrayUnion(uid)
    });
  };

  const removePhoto = async (photo: AlbumPhoto) => {
    if (!supabase || photo.createdBy !== uid) return;
    if (!window.confirm(tr("이 추억을 앨범에서 삭제할까요?", "Delete this memory?", "要删除这段回忆吗？"))) return;
    const { error } = await supabase.storage.from(ALBUM_BUCKET).remove([photo.displayPath, photo.thumbnailPath]);
    if (error) {
      window.alert(tr("사진 파일을 삭제하지 못했어요.", "Could not delete the image files.", "无法删除图片文件。"));
      return;
    }
    await deleteDoc(doc(db, "album_photos", photo.id));
    setActiveId(null);
  };

  const moveLightbox = (direction: -1 | 1) => {
    if (!activeId || filtered.length < 2) return;
    const index = filtered.findIndex((photo) => photo.id === activeId);
    const next = (index + direction + filtered.length) % filtered.length;
    setActiveId(filtered[next].id);
  };

  return (
    <main className="album-page">
      <header className="album-header">
        <button className="album-icon-button" onClick={onBack} aria-label={tr("홈으로", "Back home", "返回主页")}><ArrowLeft /></button>
        <div>
          <span>FOR BELLE · PRIVATE ARCHIVE</span>
          <h1>{tr("우리의 앨범", "Our album", "我们的相册")}</h1>
        </div>
        <button className="album-upload-button" onClick={() => setUploadOpen(true)} disabled={!isSupabaseConfigured}>
          <ImagePlus size={19} /> <span>{tr("사진 추가", "Add photos", "添加照片")}</span>
        </button>
      </header>

      {!isSupabaseConfigured ? (
        <section className="album-setup">
          <Settings2 size={34} />
          <p className="album-eyebrow">ONE-TIME SETUP</p>
          <h2>{tr("사진 저장소 연결만 남았어요", "Connect photo storage", "只需连接照片存储")}</h2>
          <p>{tr("앨범 화면과 보안 설정은 준비됐어요. Supabase 무료 프로젝트의 URL과 Publishable Key를 연결하면 바로 사용할 수 있어요.", "The album and security layer are ready. Add the Supabase project URL and publishable key to start.", "相册和安全设置已就绪。添加 Supabase 项目 URL 和发布密钥即可使用。")}</p>
          <code>VITE_SUPABASE_URL · VITE_SUPABASE_PUBLISHABLE_KEY</code>
        </section>
      ) : (
        <>
          <section className="album-intro">
            <p className="album-eyebrow">{photos.length ? `${photos.length} MEMORIES` : "OUR FIRST FRAME"}</p>
            <h2>{tr("둘이 본 순간은 오래 남으니까", "The moments we share stay longer", "一起看见的瞬间，会停留更久")}</h2>
            <p>{tr("날짜와 장소를 따라 천천히 다시 보는 우리만의 기록", "A quiet record of us, arranged by date and place.", "按日期与地点，慢慢重温只属于我们的记录。")}</p>
          </section>

          <nav className="album-filters" aria-label={tr("앨범 필터", "Album filters", "相册筛选")}>
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{tr("모든 순간", "All moments", "所有瞬间")}</button>
            {tags.map((tag) => <button key={tag} className={filter === tag ? "active" : ""} onClick={() => setFilter(tag)}>{tag}</button>)}
          </nav>

          {loading ? (
            <div className="album-state"><LoaderCircle className="spin" /><p>{tr("추억을 펼치는 중...", "Opening memories...", "正在展开回忆…")}</p></div>
          ) : loadError ? (
            <div className="album-state"><p>{loadError}</p></div>
          ) : groups.length === 0 ? (
            <button className="album-empty" onClick={() => setUploadOpen(true)}>
              <span><ImagePlus size={30} /></span>
              <strong>{tr("첫 번째 사진을 놓아주세요", "Place your first photo", "放入第一张照片")}</strong>
              <small>{tr("아이폰 사진첩에서 한 번에 12장까지 선택할 수 있어요.", "Choose up to 12 photos from your iPhone.", "可从 iPhone 相册一次选择最多 12 张。")}</small>
            </button>
          ) : (
            <div className="album-timeline">
              {groups.map(([month, monthPhotos], groupIndex) => (
                <motion.section key={month} className="album-month" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: groupIndex * 0.05 }}>
                  <div className="album-month-heading"><span>{String(groupIndex + 1).padStart(2, "0")}</span><h3>{formatMonth(month)}</h3><i /></div>
                  <motion.div className="album-grid" layout>
                    <AnimatePresence>
                      {monthPhotos.map((photo, index) => (
                        <motion.button
                          layout
                          key={photo.id}
                          className={`album-photo ${index % 7 === 0 ? "album-photo-wide" : ""}`}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          onClick={() => setActiveId(photo.id)}
                        >
                          {urls[photo.id]?.thumb ? <img src={urls[photo.id].thumb} alt={photo.caption || photo.albumTag} loading="lazy" /> : <span className="album-photo-loading" />}
                          <span className="album-photo-shade" />
                          <span className="album-photo-copy"><b>{photo.takenDate?.slice(5).replace("-", ".")}</b>{photo.location && <small><MapPin size={11} /> {photo.location}</small>}</span>
                          {photo.likedBy.length > 0 && <Heart className="album-photo-heart" size={17} fill="currentColor" />}
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </motion.section>
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {uploadOpen && (
          <motion.div className="album-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(event) => event.target === event.currentTarget && !uploading && setUploadOpen(false)}>
            <motion.section className="album-upload-sheet" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 330 }}>
              <div className="album-sheet-handle" />
              <div className="album-sheet-title"><div><span>{tr("새로운 기억", "New memory", "新的回忆")}</span><h2>{tr("사진을 앨범에 놓기", "Add to our album", "放入我们的相册")}</h2></div><button onClick={() => !uploading && setUploadOpen(false)}><X /></button></div>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => chooseFiles(event.target.files)} />
              <button className="album-file-picker" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <ImagePlus size={25} /><span><strong>{files.length ? tr(`${files.length}장 선택됨`, `${files.length} selected`, `已选择 ${files.length} 张`) : tr("아이폰 사진첩 열기", "Open photo library", "打开照片图库")}</strong><small>{tr("최대 12장 · 자동 WebP 압축", "Up to 12 · automatic WebP compression", "最多 12 张 · 自动 WebP 压缩")}</small></span>
              </button>
              <div className="album-form-grid">
                <label><span>{tr("날짜", "Date", "日期")}</span><input type="date" value={takenDate} onChange={(event) => setTakenDate(event.target.value)} /></label>
                <label><span>{tr("앨범", "Album", "相册")}</span><input value={albumTag} maxLength={30} onChange={(event) => setAlbumTag(event.target.value)} placeholder={tr("우리의 일상", "Our days", "我们的日常")} /></label>
                <label className="full"><span>{tr("장소", "Place", "地点")}</span><input value={location} maxLength={60} onChange={(event) => setLocation(event.target.value)} placeholder={tr("예: 광안리 바다", "e.g. Gwangalli Beach", "例如：广安里海边")} /></label>
                <label className="full"><span>{tr("한 줄 기억", "A little note", "一句回忆")}</span><textarea value={caption} maxLength={180} onChange={(event) => setCaption(event.target.value)} placeholder={tr("그날의 마음을 짧게 남겨요", "Leave a small note from that day", "写下那天的一点心情")} /></label>
              </div>
              {uploadItems.length > 0 && <div className="album-upload-list">{uploadItems.map((item, index) => <div key={`${item.name}-${index}`} className={item.error ? "failed" : ""}><span>{item.name}</span><b>{item.error ? tr("실패", "Failed", "失败") : `${item.progress}%`}</b><i style={{ width: `${item.progress}%` }} /></div>)}</div>}
              {formError && <p className="album-form-error">{formError}</p>}
              <button className="album-submit" disabled={!files.length || uploading || !isSupabaseConfigured} onClick={upload}>{uploading ? <><LoaderCircle className="spin" size={18} /> {tr("사진을 정리하는 중", "Preparing photos", "正在整理照片")}</> : tr("우리 앨범에 저장", "Save to our album", "保存到我们的相册")}</button>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activePhoto && (
          <motion.div className="album-lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(event) => { touchStartRef.current = event.clientX; }} onPointerUp={(event) => { if (touchStartRef.current === null) return; const delta = event.clientX - touchStartRef.current; if (Math.abs(delta) > 55) moveLightbox(delta > 0 ? -1 : 1); touchStartRef.current = null; }}>
            <button className="album-lightbox-close" onClick={() => setActiveId(null)}><X /></button>
            {filtered.length > 1 && <><button className="album-lightbox-prev" onClick={() => moveLightbox(-1)}><ChevronLeft /></button><button className="album-lightbox-next" onClick={() => moveLightbox(1)}><ChevronRight /></button></>}
            <motion.figure key={activePhoto.id} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }}>
              {urls[activePhoto.id]?.display && <img src={urls[activePhoto.id].display} alt={activePhoto.caption || activePhoto.albumTag} />}
              <figcaption>
                <div><span>{activePhoto.albumTag}</span><h2>{activePhoto.caption || tr("말없이도 선명한 순간", "A moment clear without words", "无需言语也清晰的瞬间")}</h2><p><CalendarDays size={14} /> {activePhoto.takenDate}{activePhoto.location && <><i>·</i><MapPin size={14} /> {activePhoto.location}</>}</p></div>
                <div className="album-lightbox-actions"><button className={activePhoto.likedBy.includes(uid) ? "liked" : ""} onClick={() => void toggleLike(activePhoto)}><Heart fill="currentColor" /> <span>{activePhoto.likedBy.length || ""}</span></button>{activePhoto.createdBy === uid && <button onClick={() => void removePhoto(activePhoto)}><Trash2 /></button>}</div>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};

export default Album;

