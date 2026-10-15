import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Cake, Check, Heart, Pencil, Rabbit, RotateCcw, X } from "lucide-react";
import { auth, db, isFirebaseConfigured } from "./firebase";
import "./characterWorld.css";

type Lang = "ko" | "en" | "zh";
type Role = "belle" | "partner";
type BelleSpecies = "cat" | "rabbit";
type PetMood = "idle" | "walk" | "love" | "sleep" | "happy";

type CharacterProfile = {
  role: Role;
  name: string;
  birthday: string;
  message: string;
  species: BelleSpecies | "dog";
};

type CharacterWorldProps = {
  lang: Lang;
  onBack: () => void;
};

const STORAGE_KEY = "forbelle_character_profiles_v1";
const characterAsset = (fileName: string) => `${import.meta.env.BASE_URL}characters/${fileName}`;

const defaults: Record<Role, CharacterProfile> = {
  belle: {
    role: "belle",
    name: "Belle",
    birthday: "",
    message: "오늘도 같이 놀자 ♡",
    species: "cat"
  },
  partner: {
    role: "partner",
    name: "우리 강아지",
    birthday: "",
    message: "Belle 곁을 지키는 중",
    species: "dog"
  }
};

const copy = {
  ko: {
    eyebrow: "OUR LITTLE GARDEN",
    title: "우리 둘만의 작은 정원",
    subtitle: "가만히 두어도 둘이 산책하고, 쉬고, 서로를 찾아가요.",
    back: "홈으로",
    edit: "내 캐릭터 꾸미기",
    saved: "저장했어요",
    save: "저장하기",
    cancel: "닫기",
    name: "이름",
    birthday: "생일",
    message: "한마디",
    choose: "Belle의 친구 선택",
    cat: "아기 고양이",
    rabbit: "아기 토끼",
    dog: "아기 강아지",
    local: "이 기기에 안전하게 저장 중",
    synced: "둘의 기기에 동기화됨",
    syncWait: "Firebase 연결 시 자동 동기화",
    birthdayToday: "오늘은 생일!",
    meet: "서로 만나기",
    emptyBirthday: "생일을 등록해 주세요"
  },
  en: {
    eyebrow: "OUR LITTLE GARDEN",
    title: "Our little garden",
    subtitle: "They wander, rest, and find each other all on their own.",
    back: "Home",
    edit: "Edit my character",
    saved: "Saved",
    save: "Save",
    cancel: "Close",
    name: "Name",
    birthday: "Birthday",
    message: "A little note",
    choose: "Choose Belle's friend",
    cat: "Baby kitten",
    rabbit: "Baby rabbit",
    dog: "Baby puppy",
    local: "Saved safely on this device",
    synced: "Synced between us",
    syncWait: "Will sync when Firebase connects",
    birthdayToday: "Birthday today!",
    meet: "Meet in the middle",
    emptyBirthday: "Add a birthday"
  },
  zh: {
    eyebrow: "OUR LITTLE GARDEN",
    title: "只属于我们的小花园",
    subtitle: "它们会自己散步、休息，也会去寻找彼此。",
    back: "回到主页",
    edit: "装扮我的角色",
    saved: "已保存",
    save: "保存",
    cancel: "关闭",
    name: "名字",
    birthday: "生日",
    message: "一句话",
    choose: "选择 Belle 的伙伴",
    cat: "小猫",
    rabbit: "小兔",
    dog: "小狗",
    local: "已安全保存在此设备",
    synced: "已在两人设备间同步",
    syncWait: "连接 Firebase 后自动同步",
    birthdayToday: "今天生日！",
    meet: "一起见面",
    emptyBirthday: "请填写生日"
  }
};

function loadLocalProfiles(): Record<Role, CharacterProfile> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Record<Role, CharacterProfile>>;
    return {
      belle: { ...defaults.belle, ...stored.belle, role: "belle" },
      partner: { ...defaults.partner, ...stored.partner, role: "partner", species: "dog" }
    };
  } catch {
    return defaults;
  }
}

function isBirthdayToday(value: string) {
  if (!value) return false;
  const today = new Date();
  const date = new Date(`${value}T00:00:00`);
  return date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

export default function CharacterWorld({ lang, onBack }: CharacterWorldProps) {
  const t = copy[lang];
  const currentRole: Role = auth?.currentUser?.email?.toLowerCase() === "belle@kim.com" ? "belle" : "partner";
  const [profiles, setProfiles] = useState<Record<Role, CharacterProfile>>(loadLocalProfiles);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CharacterProfile>(() => loadLocalProfiles()[currentRole]);
  const [syncState, setSyncState] = useState<"local" | "synced" | "waiting">(
    isFirebaseConfigured && auth?.currentUser ? "waiting" : "local"
  );
  const [saved, setSaved] = useState(false);
  const [mood, setMood] = useState<Record<Role, PetMood>>({ belle: "idle", partner: "idle" });
  const [positions, setPositions] = useState({ belle: 25, partner: 72 });
  const [directions, setDirections] = useState({ belle: 1, partner: -1 });
  const actionTimer = useRef<number | null>(null);

  useEffect(() => {
    document.querySelector<HTMLElement>(".main-content")?.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const belleAsset = profiles.belle.species === "rabbit"
    ? characterAsset("belle-rabbit.webp")
    : characterAsset("belle-cat.webp");

  const persistLocal = (next: Record<Role, CharacterProfile>) => {
    setProfiles(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
      setSyncState("local");
      return;
    }

    const unsubscribers = (["belle", "partner"] as Role[]).map((role) =>
      onSnapshot(
        doc(db, "couple_characters", role),
        (snapshot) => {
          if (snapshot.exists()) {
            const remote = snapshot.data() as Partial<CharacterProfile>;
            setProfiles((current) => {
              const next = {
                ...current,
                [role]: {
                  ...defaults[role],
                  ...remote,
                  role,
                  species: role === "partner" ? "dog" : remote.species === "rabbit" ? "rabbit" : "cat"
                }
              } as Record<Role, CharacterProfile>;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              return next;
            });
          }
          setSyncState("synced");
        },
        () => setSyncState("local")
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    if (!editing) setDraft(profiles[currentRole]);
  }, [profiles, currentRole, editing]);

  const runScene = (forcedMeet = false) => {
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const meet = forcedMeet || Math.random() < 0.3;
    if (meet) {
      setPositions({ belle: 45, partner: 57 });
      setDirections({ belle: 1, partner: -1 });
      setMood({ belle: "love", partner: "love" });
      return;
    }

    const belleX = 20 + Math.round(Math.random() * 45);
    const partnerX = 35 + Math.round(Math.random() * 44);
    setPositions((old) => {
      setDirections({ belle: belleX >= old.belle ? 1 : -1, partner: partnerX >= old.partner ? 1 : -1 });
      return { belle: belleX, partner: partnerX };
    });
    const moods: PetMood[] = ["walk", "idle", "happy", "sleep"];
    setMood({
      belle: moods[Math.floor(Math.random() * moods.length)],
      partner: moods[Math.floor(Math.random() * moods.length)]
    });
  };

  useEffect(() => {
    const schedule = () => {
      actionTimer.current = window.setTimeout(() => {
        runScene();
        schedule();
      }, 6200 + Math.random() * 2600);
    };
    schedule();
    return () => {
      if (actionTimer.current) window.clearTimeout(actionTimer.current);
    };
  }, []);

  const saveProfile = async () => {
    const clean: CharacterProfile = {
      ...draft,
      role: currentRole,
      name: draft.name.trim() || defaults[currentRole].name,
      message: draft.message.trim(),
      species: currentRole === "partner" ? "dog" : draft.species === "rabbit" ? "rabbit" : "cat"
    };
    const next = { ...profiles, [currentRole]: clean };
    persistLocal(next);
    setSyncState(isFirebaseConfigured && auth?.currentUser ? "waiting" : "local");

    if (isFirebaseConfigured && db && auth?.currentUser) {
      try {
        await setDoc(doc(db, "couple_characters", currentRole), {
          ...clean,
          ownerEmail: auth.currentUser.email || "",
          updatedAt: serverTimestamp()
        }, { merge: true });
        setSyncState("synced");
      } catch {
        setSyncState("local");
      }
    }
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      setEditing(false);
    }, 650);
  };

  const statusText = syncState === "synced" ? t.synced : syncState === "waiting" ? t.syncWait : t.local;
  const profileList = useMemo(() => [profiles.belle, profiles.partner], [profiles]);

  return (
    <section className="character-world" aria-labelledby="character-world-title">
      <div className="character-world-topbar">
        <button type="button" className="character-back" onClick={onBack}>
          <RotateCcw size={16} /> {t.back}
        </button>
        <span className={`character-sync ${syncState}`}><i /> {statusText}</span>
      </div>

      <header className="character-world-heading">
        <span>{t.eyebrow}</span>
        <h2 id="character-world-title">{t.title}</h2>
        <p>{t.subtitle}</p>
      </header>

      <div className="character-stage">
        <div className="stage-sun" />
        <div className="stage-cloud cloud-one" />
        <div className="stage-cloud cloud-two" />
        <div className="stage-hill hill-back" />
        <div className="stage-hill hill-front" />
        <div className="stage-flowers" aria-hidden="true">✿ · ❀ · ✿</div>

        <button
          type="button"
          className={`roaming-pet belle ${mood.belle}`}
          style={{ left: `${positions.belle}%` }}
          onClick={() => currentRole === "belle" && setEditing(true)}
          aria-label={`${profiles.belle.name} ${t.edit}`}
        >
          <span className="pet-thought">{mood.belle === "love" ? "♡" : mood.belle === "sleep" ? "Zzz" : mood.belle === "happy" ? "♪" : ""}</span>
          <img src={belleAsset} alt="" style={{ transform: `scaleX(${directions.belle})` }} />
          <span className="pet-name">{profiles.belle.name}</span>
          {isBirthdayToday(profiles.belle.birthday) && <span className="birthday-pin">🎂</span>}
        </button>

        <button
          type="button"
          className={`roaming-pet partner ${mood.partner}`}
          style={{ left: `${positions.partner}%` }}
          onClick={() => currentRole === "partner" && setEditing(true)}
          aria-label={`${profiles.partner.name} ${t.edit}`}
        >
          <span className="pet-thought">{mood.partner === "love" ? "♡" : mood.partner === "sleep" ? "Zzz" : mood.partner === "happy" ? "♪" : ""}</span>
          <img src={characterAsset("partner-puppy.webp")} alt="" style={{ transform: `scaleX(${directions.partner})` }} />
          <span className="pet-name">{profiles.partner.name}</span>
          {isBirthdayToday(profiles.partner.birthday) && <span className="birthday-pin">🎂</span>}
        </button>
      </div>

      <div className="character-controls">
        <button type="button" onClick={() => runScene(true)}><Heart size={16} fill="currentColor" /> {t.meet}</button>
        <button type="button" className="primary" onClick={() => { setDraft(profiles[currentRole]); setEditing(true); }}>
          <Pencil size={16} /> {t.edit}
        </button>
      </div>

      <div className="character-profiles">
        {profileList.map((profile) => (
          <article key={profile.role} className="character-profile-row">
            <img src={profile.role === "partner" ? characterAsset("partner-puppy.webp") : profile.species === "rabbit" ? characterAsset("belle-rabbit.webp") : characterAsset("belle-cat.webp")} alt="" />
            <div>
              <div className="profile-name-line">
                <h3>{profile.name}</h3>
                <span>{profile.species === "cat" ? t.cat : profile.species === "rabbit" ? t.rabbit : t.dog}</span>
              </div>
              <p>{profile.message || "♡"}</p>
              <small><Cake size={13} /> {profile.birthday || t.emptyBirthday}</small>
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <div className="character-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditing(false)}>
          <div className="character-editor" role="dialog" aria-modal="true" aria-label={t.edit}>
            <div className="editor-handle" />
            <button type="button" className="editor-close" onClick={() => setEditing(false)} aria-label={t.cancel}><X size={20} /></button>
            <span className="editor-kicker">{currentRole === "belle" ? "BELLE" : "MY PUPPY"}</span>
            <h3>{t.edit}</h3>

            {currentRole === "belle" && (
              <fieldset className="species-picker">
                <legend>{t.choose}</legend>
                {(["cat", "rabbit"] as BelleSpecies[]).map((species) => (
                  <button
                    key={species}
                    type="button"
                    className={draft.species === species ? "selected" : ""}
                    onClick={() => setDraft({ ...draft, species })}
                  >
                    <img src={characterAsset(`belle-${species}.webp`)} alt="" />
                    <span>{species === "cat" ? t.cat : t.rabbit}</span>
                    {draft.species === species && <Check size={16} />}
                  </button>
                ))}
              </fieldset>
            )}

            <label>{t.name}<input maxLength={16} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>{t.birthday}<input type="date" value={draft.birthday} onChange={(e) => setDraft({ ...draft, birthday: e.target.value })} /></label>
            <label>{t.message}<input maxLength={40} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></label>
            <button type="button" className="editor-save" onClick={saveProfile}>
              {saved ? <Check size={18} /> : currentRole === "belle" ? <Rabbit size={18} /> : <Heart size={18} />}
              {saved ? t.saved : t.save}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
