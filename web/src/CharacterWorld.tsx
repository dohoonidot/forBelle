import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Cake,
  Camera,
  Check,
  Compass,
  DoorOpen,
  Flower2,
  Gift,
  Heart,
  Home,
  LoaderCircle,
  MapPin,
  MessageCircleHeart,
  Moon,
  Music,
  Navigation,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Sun,
  Sunset,
  Trees,
  X
} from "lucide-react";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { compressAvatarDataUrl } from "./albumImage";
import "./characterWorld.css";

type Lang = "ko" | "en" | "zh";
type Role = "belle" | "partner";
type BelleSpecies = "cat" | "rabbit";
type PetMood = "idle" | "walk" | "run" | "jump" | "love" | "sleep" | "happy" | "snack";
type TimeThemeMode = "day" | "sunset" | "night";
type TimeOfDay = "day" | "sunset" | "night";

export type WorldMapId =
  | "flower_forest"
  | "garden"
  | "starlight_pond"
  | "belle_house"
  | "partner_house";

type CoopActionType =
  | "pet"
  | "hug"
  | "kiss"
  | "feed"
  | "flower"
  | "dance"
  | "jump"
  | "highfive"
  | "photo"
  | "nap";

export type InteractiveSpotId =
  | "wish_mailbox"
  | "couple_tree"
  | "flower_picnic"
  | "garden_bench"
  | "campfire"
  | "sparkle_pond"
  | "star_observatory"
  | "forest_swing"
  | "tea_table"
  | "cozy_rug"
  | "bed"
  | "jukebox";

export type WorldEnvironmentProps = {
  campfireLit?: boolean;
  coupleTreeExp?: number;
  lastWateredBy?: Role;
  petalShowerAtMs?: number;
  meteorShowerAtMs?: number;
  jukeboxPlaying?: boolean;
  affectionExp?: number;
  interactionCount?: number;
  lastInteractionText?: string;
  lastInteractionAtMs?: number;
};

export type CharacterProfile = {
  role: Role;
  name: string;
  birthday: string;
  message: string;
  species: BelleSpecies | "dog";
  photoUrl?: string;
  // Real-time multiplayer & persistent state fields
  x?: number;
  y?: number;
  direction?: 1 | -1;
  currentMap?: WorldMapId;
  liveMood?: PetMood;
  activeSpotId?: InteractiveSpotId | null;
  speechText?: string;
  speechAtMs?: number;
  actionAtMs?: number;
  lastActiveMs?: number;
};

type Point2D = {
  x: number;
  y: number;
};

type GardenGiftNote = {
  id: string;
  icon: "gift" | "letter" | "strawberry" | "flower";
  message: string;
  fromRole: Role;
  fromName: string;
  mapId?: WorldMapId;
  x: number;
  y: number;
  createdAtMs: number;
};

type DecorationType =
  | "flower_pink"
  | "flower_lavender"
  | "flower_sun"
  | "bench_lamp"
  | "picnic_basket"
  | "tea_table"
  | "plush_cushion"
  | "fairy_lantern"
  | "potted_plant";

type PlacedDecoration = {
  id: string;
  type: DecorationType;
  mapId: WorldMapId;
  x: number;
  y: number;
  placedBy: Role;
};

type CoopEventPayload = {
  id: string;
  type: CoopActionType;
  fromRole: Role;
  mapId: WorldMapId;
  centerX: number;
  centerY: number;
  affectionGain?: number;
  createdAtMs: number;
};

type ContextMenuState = {
  targetType: "me" | "partner" | "ground";
  clientX: number;
  clientY: number;
  stageX: number;
  stageY: number;
};

type CharacterWorldProps = {
  lang: Lang;
  onBack: () => void;
  userPhotoUrl?: string;
  onUserPhotoChange?: (dataUrl: string) => Promise<void> | void;
  onBelleSpeciesChange?: (species: BelleSpecies) => void;
};

export const CHARACTER_STORAGE_KEY = "forbelle_character_profiles_v1";
const GARDEN_GIFT_STORAGE_KEY = "forbelle_garden_gift_v1";
const GARDEN_DECORS_STORAGE_KEY = "forbelle_garden_decors_v2";
const GARDEN_WORLD_PROPS_STORAGE_KEY = "forbelle_garden_world_props_v1";
const GARDEN_TIME_THEME_KEY = "forbelle_garden_time_theme_v1";

const characterAsset = (fileName: string) => `${import.meta.env.BASE_URL}characters/${fileName}`;

const ALL_PRELOAD_ASSETS = [
  "belle-cat.webp",
  "belle-cat-run.webp",
  "belle-cat-sleep.webp",
  "belle-cat-snack.webp",
  "belle-rabbit.webp",
  "belle-rabbit-run.webp",
  "belle-rabbit-sleep.webp",
  "belle-rabbit-snack.webp",
  "partner-puppy.webp",
  "partner-puppy-run.webp",
  "partner-puppy-sleep.webp",
  "partner-puppy-snack.webp",
  "garden-meadow-bg.webp",
  "belle-room-bg.webp",
  "partner-room-bg.webp",
  "belle-cottage.webp",
  "partner-cottage.webp",
  "garden-bench-prop.webp",
  "garden-flowerbed-prop.webp",
  "garden-flowerbed-lavender.webp",
  "garden-flowerbed-sunflower.webp"
];

const DEFAULT_DECORS: PlacedDecoration[] = [
  { id: "default-bed-left", type: "flower_pink", mapId: "garden", x: 24, y: 74, placedBy: "belle" },
  { id: "default-bed-right", type: "flower_lavender", mapId: "garden", x: 76, y: 72, placedBy: "partner" }
];

const DECOR_CATALOG: Array<{
  type: DecorationType;
  sprite?: string;
  emoji: string;
  label: Record<Lang, string>;
}> = [
  {
    type: "flower_pink",
    sprite: "garden-flowerbed-prop.webp",
    emoji: "🌷",
    label: { ko: "핑크 튤립 화단", en: "Pink Tulip Bed", zh: "粉色郁金香花坛" }
  },
  {
    type: "flower_lavender",
    sprite: "garden-flowerbed-lavender.webp",
    emoji: "🪻",
    label: { ko: "라벤더 장미 화단", en: "Lavender Rose Bed", zh: "薰衣草玫瑰花坛" }
  },
  {
    type: "flower_sun",
    sprite: "garden-flowerbed-sunflower.webp",
    emoji: "🌻",
    label: { ko: "햇살 데이지 화단", en: "Sunny Daisy Bed", zh: "阳光雏菊花坛" }
  },
  {
    type: "bench_lamp",
    sprite: "garden-bench-prop.webp",
    emoji: "🪑",
    label: { ko: "정원 나무 벤치", en: "Garden Bench", zh: "花园木长椅" }
  }
];

const VALID_MAPS: WorldMapId[] = [
  "garden",
  "belle_house",
  "partner_house"
];

const defaults: Record<Role, CharacterProfile> = {
  belle: {
    role: "belle",
    name: "Belle",
    birthday: "",
    message: "오늘도 같이 놀자 ♡",
    species: "cat",
    photoUrl: "",
    x: 40,
    y: 66,
    direction: 1,
    currentMap: "garden",
    liveMood: "idle",
    activeSpotId: null,
    lastActiveMs: 0
  },
  partner: {
    role: "partner",
    name: "우리 강아지",
    birthday: "",
    message: "Belle 곁을 지키는 중",
    species: "dog",
    photoUrl: "",
    x: 60,
    y: 66,
    direction: -1,
    currentMap: "garden",
    liveMood: "idle",
    activeSpotId: null,
    lastActiveMs: 0
  }
};

const GIFT_ICONS: Record<GardenGiftNote["icon"], string> = {
  gift: "🎁",
  letter: "💌",
  strawberry: "🍓",
  flower: "🌷"
};

const LEVEL_TIERS = [
  { level: 1, minExp: 0, nextExp: 100, ko: "설레는 첫걸음", en: "Sweet Beginning", zh: "心动初遇", badge: "🌱" },
  { level: 2, minExp: 100, nextExp: 250, ko: "다정한 산책 단짝", en: "Stroll Buddies", zh: "散步伙伴", badge: "🌷" },
  { level: 3, minExp: 250, nextExp: 500, ko: "달콤한 짝꿍", en: "Sweetheart Duo", zh: "甜蜜搭档", badge: "🍓" },
  { level: 4, minExp: 500, nextExp: 900, ko: "꿀떨어지는 커플", en: "Honey Couple", zh: "蜜意情侣", badge: "💞" },
  { level: 5, minExp: 900, nextExp: 1500, ko: "별빛 소울메이트", en: "Starlight Soulmates", zh: "星光伴侣", badge: "🌟" },
  { level: 6, minExp: 1500, nextExp: 2300, ko: "영원한 사랑꾼", en: "Eternal Lovers", zh: "永恒恋人", badge: "👑" }
];

export function getCoupleLevelInfo(rawExp = 0, lang: Lang = "ko") {
  const exp = Math.max(0, Math.round(rawExp));
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    const tier = LEVEL_TIERS[i];
    if (exp >= tier.minExp) {
      if (i === LEVEL_TIERS.length - 1 && exp >= tier.nextExp) {
        const extraLevels = Math.floor((exp - tier.minExp) / 800);
        const curMin = tier.minExp + extraLevels * 800;
        const curNext = curMin + 800;
        const pct = Math.min(100, Math.round(((exp - curMin) / 800) * 100));
        return {
          level: tier.level + extraLevels,
          title: lang === "en" ? tier.en : lang === "zh" ? tier.zh : tier.ko,
          badge: tier.badge,
          exp,
          curMin,
          curNext,
          pct
        };
      }
      const span = Math.max(1, tier.nextExp - tier.minExp);
      const pct = Math.min(100, Math.round(((exp - tier.minExp) / span) * 100));
      return {
        level: tier.level,
        title: lang === "en" ? tier.en : lang === "zh" ? tier.zh : tier.ko,
        badge: tier.badge,
        exp,
        curMin: tier.minExp,
        curNext: tier.nextExp,
        pct
      };
    }
  }
  return {
    level: 1,
    title: lang === "en" ? LEVEL_TIERS[0].en : lang === "zh" ? LEVEL_TIERS[0].zh : LEVEL_TIERS[0].ko,
    badge: "🌱",
    exp: 0,
    curMin: 0,
    curNext: 100,
    pct: 0
  };
}

const SPOT_RESTING_MOOD: Partial<Record<InteractiveSpotId, PetMood>> = {
  garden_bench: "happy",
  campfire: "snack",
  couple_tree: "love",
  flower_picnic: "snack",
  sparkle_pond: "happy",
  star_observatory: "love",
  forest_swing: "happy",
  tea_table: "snack",
  cozy_rug: "love",
  bed: "sleep",
  jukebox: "happy",
  wish_mailbox: "happy"
};

const copy = {
  ko: {
    eyebrow: "OUR COZY 2.5D COUPLE WORLD",
    title: "둘만의 정원",
    subtitle: "길목과 문을 지나 5개 공간을 여행하고, 캐릭터나 바닥을 우클릭(모바일 꾹 누르기)해 다정하게 교감해요.",
    back: "홈으로",
    edit: "내 캐릭터·프로필 설정",
    saved: "저장했어요",
    save: "저장하기",
    cancel: "닫기",
    name: "이름",
    birthday: "생일",
    message: "한마디",
    choose: "Belle의 캐릭터 선택",
    cat: "아기 고양이",
    rabbit: "아기 토끼",
    dog: "아기 강아지",
    photoLabel: "본인 프로필 사진",
    photoUpload: "내 사진 등록",
    photoChange: "사진 변경",
    photoRemove: "사진 삭제",
    photoUploading: "사진 처리 중...",
    photoError: "사진을 불러오지 못했어요. 다른 이미지로 시도해 주세요.",
    local: "이 기기에 저장됨",
    synced: "실시간 동기화 중",
    syncWait: "연결 대기 중",
    birthdayToday: "오늘은 생일!",
    leaveGift: "선물·쪽지 놓기",
    emptyBirthday: "생일을 등록해 주세요",
    tapHintDefault: "바닥 탭: 이동 · 캐릭터/바닥 우클릭(모바일 꾹 누르기): 교감 & 메뉴 열기",
    tapHintDecor: "꾸미기 모드: 원하는 바닥 위치를 탭하면 소품이 배치돼요 (소품 탭 시 삭제)",
    timeDay: "밝은 낮",
    timeSunset: "노을빛",
    timeNight: "별밤",
    mapFlowerForest: "사랑나무 꽃숲",
    mapGarden: "중앙 정원 광장",
    mapStarlightPond: "반딧불 연못",
    mapBelleHouse: "Belle의 집",
    mapPartnerHouse: "강아지 집",
    shortForest: "🌸 꽃숲",
    shortGarden: "🌳 중앙정원",
    shortPond: "⛲ 연못",
    shortBelleHouse: "🏡 벨의집",
    shortPartnerHouse: "🏡 강아지집",
    enterBelleHouse: "Belle의 집 들어가기",
    enterPartnerHouse: "강아지 집 들어가기",
    exitToGarden: "중앙 정원으로 나가기",
    onlyMyCharacterNotice: "내 캐릭터만 직접 조종·수정할 수 있어요 ♡",
    partnerOnline: "실시간 접속 중",
    partnerOffline: "쉬는 중",
    followPartner: "따라가기",
    approachPartnerBtn: "옆으로 가기",
    coopPet: "쓰다듬기",
    coopHug: "포옹·코맞대기",
    coopKiss: "하트 뽀뽀 날리기",
    coopFeed: "딸기 먹여주기",
    coopFlower: "꽃 선물하기",
    coopDance: "같이 신나게 춤추기",
    coopJump: "같이 폴짝 점프",
    coopHighfive: "하이파이브",
    coopPhoto: "커플 기념 찰칵",
    coopNap: "나란히 낮잠",
    decorateBtn: "정원·방 꾸미기",
    decorateDone: "꾸미기 완료",
    decorateReset: "기본 배치로",
    speechPlaceholder: "말풍선 입력 (예: 이리 와~ ♡)",
    speechSend: "띄우기",
    quickChips: ["♡", "보고싶어!", "이리 와~ 🐾", "사랑해 💞", "우리 집 가자 🏡"],
    pettedReaction: "쓰담쓰담 좋아요 ♡",
    hugReaction: "꼭 안아줬어요 💞",
    kissReaction: "쪽! 하트 뽀뽀 받으세요 💋💘",
    snackReaction: "아~ 딸기 달콤해! 🍓",
    flowerReaction: "향기로운 꽃 선물 🌷",
    danceReaction: "랄랄라 같이 춤춰요 🎶💃",
    jumpReaction: "신난다 폴짝! ✨",
    highfiveReaction: "짝! 완벽한 하이파이브 🙌✨",
    photoReaction: "하나 둘 셋 치즈~ 찰칵! 📸💖",
    napReaction: "새근새근... Zzz",
    bedReaction: "폭신폭신 침대 최고야 Zzz",
    tableReaction: "달콤한 티타임 🍓♪",
    rugReaction: "우리 집 폭신 러그가 제일 아늑해 🧶♡",
    jukeboxReaction: "로맨틱한 멜로디가 흘러나와요 📻🎵",
    jukeboxCoopReaction: "둘이 함께 음악을 들으며 흔들흔들 🎶💞",
    benchReaction: "벤치에 앉으니 살랑살랑 바람이 좋아 🍃",
    benchCoopReaction: "둘이 나란히 벤치에 앉으니까 너무 행복해 💞",
    campfireOnReaction: "모닥불을 피웠어요! 포근하고 따뜻해 🔥🍓",
    campfireOffReaction: "모닥불 앞에서 도란도란 이야기해요 🧺",
    campfireCoopReaction: "둘이 모닥불 앞에 앉아 달콤한 불멍 타임 🔥💛",
    treeWaterReaction: "사랑나무야 쑥쑥 자라라! 💧🌸",
    treeCoopReaction: "둘이 함께 가꾼 사랑나무에서 꽃비가 내려요 🌸💞",
    picnicReaction: "꽃밭 피크닉 매트에서 도시락 냠냠 🧺🍓",
    picnicCoopReaction: "둘이 오붓하게 꽃밭 피크닉 데이트 🧺💞",
    pondReaction: "첨벙첨벙! 연못 물장구 시원해 🐠🫧",
    pondCoopReaction: "연못 위로 반딧불이와 수련이 피어올라요 ✨🪷",
    swingReaction: "살랑살랑 통나무 그네 타기 🎶🌿",
    swingCoopReaction: "둘이 나란히 그네 타며 콧노래 흥얼흥얼 🎶💞",
    mailboxReaction: "우체통에 설레는 마음을 담아요 📮💌",
    starReaction: "별자리 망원경 너머로 별똥별이 떨어져요 🌠",
    starCoopReaction: "둘이 함께 본 밤하늘에 별똥별 쇼가 펼쳐져요 🌠💞",
    bedCoopReaction: "나란히 누워서 꿀잠 자요 Zzz 💞🌙",
    tableCoopReaction: "마주 앉아 달콤한 커플 티파티 🫖🍓💞",
    rugCoopReaction: "거실 러그에 나란히 앉아 꽁냥꽁냥 🧶💞",
    spotMailboxLabel: "소원 우체통",
    spotTreeLabel: "사랑나무",
    spotPicnicLabel: "꽃밭 피크닉",
    spotBenchLabel: "가로등 벤치",
    spotCampfireLabel: "별빛 모닥불",
    spotPondLabel: "반딧불 연못",
    spotStarLabel: "별자리 전망대",
    spotSwingLabel: "통나무 그네",
    spotTableLabel: "다과 테이블",
    spotRugLabel: "폭신 거실 러그",
    spotBedLabel: "침실 침대",
    spotJukeboxLabel: "감성 주크박스",
    giftModalTitle: "이 자리에 작은 선물·쪽지 놓기",
    giftModalDesc: "지금 내 캐릭터가 서 있는 자리에 작은 선물을 놓아두면 상대가 발견할 수 있어요.",
    giftIconLabel: "아이콘 선택",
    giftMessageLabel: "쪽지 내용",
    giftPlaceholder: "예: 오늘도 생각나서 정원에 선물 두고 가요 ♡",
    giftPlaceBtn: "여기에 놓아두기",
    giftFrom: "님이 남긴 선물",
    giftRemove: "선물 거두기",
    editProfileBtn: "내 프로필·사진 설정",
    myCharacterBadge: "나",
    menuTitleMe: "내 캐릭터 메뉴",
    menuTitlePartner: "상대 캐릭터와 교감",
    menuTitleGround: "정원·공간 메뉴",
    walkHereBtn: "여기로 걸어가기",
    openActionMenuBtn: "교감·메뉴",
    affectionTitle: "우리 커플 애정도 & 레벨",
    affectionDesc: "쓰다듬기, 포옹, 뽀뽀, 함께 앉기, 사랑나무 물주기로 애정도가 올라가요!"
  },
  en: {
    eyebrow: "OUR COZY 2.5D COUPLE WORLD",
    title: "Our Garden",
    subtitle: "Travel across 5 connected spaces and right-click (or long-press on mobile) to interact.",
    back: "Home",
    edit: "Edit my character & profile",
    saved: "Saved",
    save: "Save",
    cancel: "Close",
    name: "Name",
    birthday: "Birthday",
    message: "A little note",
    choose: "Choose Belle's character",
    cat: "Baby kitten",
    rabbit: "Baby rabbit",
    dog: "Baby puppy",
    photoLabel: "My profile photo",
    photoUpload: "Add my photo",
    photoChange: "Change photo",
    photoRemove: "Remove",
    photoUploading: "Processing...",
    photoError: "Could not load this image. Please try another photo.",
    local: "Saved on device",
    synced: "Live sync connected",
    syncWait: "Connecting...",
    birthdayToday: "Birthday today!",
    leaveGift: "Leave gift note",
    emptyBirthday: "Add a birthday",
    tapHintDefault: "Tap ground: Walk · Right-click (or Long-press): Couple Actions & Menu",
    tapHintDecor: "Decorate mode: Tap the ground to place item (tap item to remove)",
    timeDay: "Bright Day",
    timeSunset: "Sunset",
    timeNight: "Starry Night",
    mapFlowerForest: "Love Tree Grove",
    mapGarden: "Center Garden Plaza",
    mapStarlightPond: "Firefly Pond",
    mapBelleHouse: "Belle's House",
    mapPartnerHouse: "Puppy's House",
    shortForest: "🌸 Grove",
    shortGarden: "🌳 Plaza",
    shortPond: "⛲ Pond",
    shortBelleHouse: "🏡 Belle's",
    shortPartnerHouse: "🏡 Puppy's",
    enterBelleHouse: "Enter Belle's House",
    enterPartnerHouse: "Enter Puppy's House",
    exitToGarden: "Back to Plaza",
    onlyMyCharacterNotice: "You can only control and edit your own character ♡",
    partnerOnline: "Online now",
    partnerOffline: "Resting",
    followPartner: "Follow",
    approachPartnerBtn: "Go next to",
    coopPet: "Pet Gently",
    coopHug: "Hug & Nuzzle",
    coopKiss: "Blow a Kiss",
    coopFeed: "Feed Strawberry",
    coopFlower: "Give Flower",
    coopDance: "Dance Together",
    coopJump: "Jump Together",
    coopHighfive: "High-Five",
    coopPhoto: "Take Couple Photo",
    coopNap: "Cozy Nap",
    decorateBtn: "Decorate Space",
    decorateDone: "Done Decorating",
    decorateReset: "Reset Default",
    speechPlaceholder: "Say something overhead...",
    speechSend: "Say",
    quickChips: ["♡", "Miss you!", "Come here~ 🐾", "Love you 💞", "Visit my house 🏡"],
    pettedReaction: "Love being petted ♡",
    hugReaction: "Warmest hug 💞",
    kissReaction: "Muah! Flying kiss for you 💋💘",
    snackReaction: "Yum yum strawberry! 🍓",
    flowerReaction: "A sweet flower for you 🌷",
    danceReaction: "Dancing happily together 🎶💃",
    jumpReaction: "Yay hop hop! ✨",
    highfiveReaction: "High-five! 🙌✨",
    photoReaction: "One, two, three, cheese! 📸💖",
    napReaction: "Sweet dreams... Zzz",
    bedReaction: "Cozy bed nap Zzz",
    tableReaction: "Sweet tea time 🍓♪",
    rugReaction: "So soft and cozy on the rug 🧶♡",
    jukeboxReaction: "Sweet melody playing 📻🎵",
    jukeboxCoopReaction: "Listening to our favorite song together 🎶💞",
    benchReaction: "Breezy and peaceful on the bench 🍃",
    benchCoopReaction: "Sitting side by side on our bench 💞",
    campfireOnReaction: "Lit the warm campfire! 🔥🍓",
    campfireOffReaction: "Cozy chat by the firepit 🧺",
    campfireCoopReaction: "Warm campfire night together 🔥💛",
    treeWaterReaction: "Grow tall, our love tree! 💧🌸",
    treeCoopReaction: "Pink blossom shower from our love tree 🌸💞",
    picnicReaction: "Sweet picnic in the flower meadow 🧺🍓",
    picnicCoopReaction: "Lovely flower picnic date for two 🧺💞",
    pondReaction: "Splash splash by the lotus pond! 🐠🫧",
    pondCoopReaction: "Fireflies glowing over the pond ✨🪷",
    swingReaction: "Swaying gently on the forest swing 🎶🌿",
    swingCoopReaction: "Swinging side by side under the trees 🎶💞",
    mailboxReaction: "Checking our wish mailbox 📮💌",
    starReaction: "A shooting star across the sky! 🌠",
    starCoopReaction: "Watching a meteor shower together 🌠💞",
    bedCoopReaction: "Sweet dreams side by side Zzz 💞🌙",
    tableCoopReaction: "Sweet tea party for two 🫖🍓💞",
    rugCoopReaction: "Cuddling on the living room rug 🧶💞",
    spotMailboxLabel: "Wish Mailbox",
    spotTreeLabel: "Love Tree",
    spotPicnicLabel: "Flower Picnic",
    spotBenchLabel: "Garden Bench",
    spotCampfireLabel: "Campfire",
    spotPondLabel: "Firefly Pond",
    spotStarLabel: "Stargaze Hill",
    spotSwingLabel: "Forest Swing",
    spotTableLabel: "Tea Table",
    spotRugLabel: "Cozy Rug",
    spotBedLabel: "Canopy Bed",
    spotJukeboxLabel: "Music Box",
    giftModalTitle: "Leave a gift note right here",
    giftModalDesc: "Place a tiny gift right where your character is standing.",
    giftIconLabel: "Choose icon",
    giftMessageLabel: "Sweet note",
    giftPlaceholder: "e.g. Left a little surprise here for you today ♡",
    giftPlaceBtn: "Place here",
    giftFrom: "left a gift",
    giftRemove: "Pick up",
    editProfileBtn: "Profile & Photo",
    myCharacterBadge: "ME",
    menuTitleMe: "My Character Menu",
    menuTitlePartner: "Interact with Partner",
    menuTitleGround: "World Menu",
    walkHereBtn: "Walk Here",
    openActionMenuBtn: "Actions",
    affectionTitle: "Couple Level & Affection",
    affectionDesc: "Earn affection hearts by petting, hugging, kissing, sitting together, and watering our tree!"
  },
  zh: {
    eyebrow: "OUR COZY 2.5D COUPLE WORLD",
    title: "我们俩的花园",
    subtitle: "穿过小径与木门探索5个空间，右键点击（手机长按）角色或地面即可互动。",
    back: "回到主页",
    edit: "设置我的角色与资料",
    saved: "已保存",
    save: "保存",
    cancel: "关闭",
    name: "名字",
    birthday: "生日",
    message: "一句话",
    choose: "选择 Belle 的角色",
    cat: "小猫",
    rabbit: "小兔",
    dog: "小狗",
    photoLabel: "我的个人头像",
    photoUpload: "上传我的照片",
    photoChange: "更换照片",
    photoRemove: "删除",
    photoUploading: "处理中...",
    photoError: "无法读取该照片，请尝试其他图片。",
    local: "已保存在本地",
    synced: "实时同步中",
    syncWait: "连接中...",
    birthdayToday: "今天生日！",
    leaveGift: "留下小礼物",
    emptyBirthday: "请填写生日",
    tapHintDefault: "点击地面：移动 · 右键点击（手机长按）角色或地面：打开互动菜单",
    tapHintDecor: "装扮模式：点击地面放置装饰物（点击已有装饰物可移除）",
    timeDay: "晴朗白天",
    timeSunset: "暖阳黄昏",
    timeNight: "星光夜晚",
    mapFlowerForest: "爱情树花林",
    mapGarden: "中央花园广场",
    mapStarlightPond: "萤火虫池塘",
    mapBelleHouse: "Belle 的小屋",
    mapPartnerHouse: "小狗的小屋",
    shortForest: "🌸 花林",
    shortGarden: "🌳 广场",
    shortPond: "⛲ 池塘",
    shortBelleHouse: "🏡 Belle家",
    shortPartnerHouse: "🏡 小狗家",
    enterBelleHouse: "进入 Belle 的小屋",
    enterPartnerHouse: "进入小狗的小屋",
    exitToGarden: "回到中央广场",
    onlyMyCharacterNotice: "只能操控与修改自己的角色哦 ♡",
    partnerOnline: "实时在线",
    partnerOffline: "休息中",
    followPartner: "跟随",
    approachPartnerBtn: "过去贴贴",
    coopPet: "摸摸头",
    coopHug: "拥抱贴贴",
    coopKiss: "飞吻爱心",
    coopFeed: "喂草莓零食",
    coopFlower: "送小花",
    coopDance: "一起跳舞",
    coopJump: "一起跳跳",
    coopHighfive: "击掌庆贺",
    coopPhoto: "情侣纪念拍照",
    coopNap: "并肩午睡",
    decorateBtn: "装扮空间",
    decorateDone: "完成装扮",
    decorateReset: "恢复默认",
    speechPlaceholder: "输入头顶气泡文字...",
    speechSend: "发送",
    quickChips: ["♡", "好想你！", "快过来~ 🐾", "最爱你 💞", "来我家玩 🏡"],
    pettedReaction: "最喜欢摸摸头啦 ♡",
    hugReaction: "紧紧抱住你 💞",
    kissReaction: "啾~ 给你飞吻 💋💘",
    snackReaction: "草莓真甜！🍓",
    flowerReaction: "送你一朵香香的花 🌷",
    danceReaction: "一起开心地跳舞吧 🎶💃",
    jumpReaction: "开心跳一跳！✨",
    highfiveReaction: "耶！默契击掌 🙌✨",
    photoReaction: "一二三，茄子！📸💖",
    napReaction: "呼呼午睡中... Zzz",
    bedReaction: "软绵绵的床最舒服啦 Zzz",
    tableReaction: "甜甜的下午茶 🍓♪",
    rugReaction: "客厅的软地毯最温馨啦 🧶♡",
    jukeboxReaction: "流淌着浪漫的旋律 📻🎵",
    jukeboxCoopReaction: "两个人一起听歌摇摆 🎶💞",
    benchReaction: "坐在长椅上吹风真舒服 🍃",
    benchCoopReaction: "肩并肩坐在长椅上好幸福 💞",
    campfireOnReaction: "点燃篝火啦！暖洋洋的 🔥🍓",
    campfireOffReaction: "围在篝火旁聊聊天 🧺",
    campfireCoopReaction: "两个人一起围炉烤火真甜蜜 🔥💛",
    treeWaterReaction: "给我们的爱情树浇浇水 💧🌸",
    treeCoopReaction: "爱情树洒下了浪漫的花瓣雨 🌸💞",
    picnicReaction: "在花田野餐垫上享用了点心 🧺🍓",
    picnicCoopReaction: "甜蜜的花田野餐约会 🧺💞",
    pondReaction: "在池塘边踩水玩真凉快 🐠🫧",
    pondCoopReaction: "池塘上升起了萤火虫与睡莲微光 ✨🪷",
    swingReaction: "在森林木秋千上轻轻摇晃 🎶🌿",
    swingCoopReaction: "两个人并肩荡秋千真浪漫 🎶💞",
    mailboxReaction: "看看心愿邮筒里的信 📮💌",
    starReaction: "看！望远镜那边有流星划过 🌠",
    starCoopReaction: "两个人一起看漫天流星雨 🌠💞",
    bedCoopReaction: "并肩躺在床上做个好梦 Zzz 💞🌙",
    tableCoopReaction: "面对面享受甜蜜下午茶 🫖🍓💞",
    rugCoopReaction: "在地毯上贴贴休息 🧶💞",
    spotMailboxLabel: "心愿邮筒",
    spotTreeLabel: "爱情树",
    spotPicnicLabel: "花田野餐",
    spotBenchLabel: "街灯长椅",
    spotCampfireLabel: "星光篝火",
    spotPondLabel: "萤火池塘",
    spotStarLabel: "观星山丘",
    spotSwingLabel: "森林秋千",
    spotTableLabel: "下午茶桌",
    spotRugLabel: "软绵地毯",
    spotBedLabel: "温馨床铺",
    spotJukeboxLabel: "浪漫点唱机",
    giftModalTitle: "在这里留下小礼物与纸条",
    giftModalDesc: "在你角色站立的位置放一份小礼物，对方就能发现。",
    giftIconLabel: "选择图标",
    giftMessageLabel: "纸条内容",
    giftPlaceholder: "例如：今天也很想你，在花园留了小礼物给你 ♡",
    giftPlaceBtn: "放在这里",
    giftFrom: "留下的小礼物",
    giftRemove: "收起礼物",
    editProfileBtn: "修改资料与头像",
    myCharacterBadge: "我",
    menuTitleMe: "我的角色菜单",
    menuTitlePartner: "与对方互动",
    menuTitleGround: "空间菜单",
    walkHereBtn: "走到这里",
    openActionMenuBtn: "互动菜单",
    affectionTitle: "情侣等级与爱意值",
    affectionDesc: "摸摸头、拥抱、飞吻、一起坐下或给爱情树浇水都能增加爱意值！"
  }
};

function sanitizeMapId(raw?: string): WorldMapId {
  if (raw && (VALID_MAPS as string[]).includes(raw)) {
    return raw as WorldMapId;
  }
  return "garden";
}

export function loadLocalProfiles(): Record<Role, CharacterProfile> {
  try {
    const stored = JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY) || "{}") as Partial<Record<Role, CharacterProfile>>;
    return {
      belle: {
        ...defaults.belle,
        ...stored.belle,
        role: "belle",
        species: stored.belle?.species === "rabbit" ? "rabbit" : "cat",
        currentMap: sanitizeMapId(stored.belle?.currentMap),
        x: typeof stored.belle?.x === "number" ? clamp(stored.belle.x, 12, 88) : defaults.belle.x,
        y: typeof stored.belle?.y === "number" ? clamp(stored.belle.y, 46, 86) : defaults.belle.y,
        direction: stored.belle?.direction === -1 ? -1 : 1,
        liveMood: stored.belle?.liveMood || "idle",
        activeSpotId: stored.belle?.activeSpotId ?? null,
        lastActiveMs: stored.belle?.lastActiveMs || 0
      },
      partner: {
        ...defaults.partner,
        ...stored.partner,
        role: "partner",
        species: "dog",
        currentMap: sanitizeMapId(stored.partner?.currentMap),
        x: typeof stored.partner?.x === "number" ? clamp(stored.partner.x, 12, 88) : defaults.partner.x,
        y: typeof stored.partner?.y === "number" ? clamp(stored.partner.y, 46, 86) : defaults.partner.y,
        direction: stored.partner?.direction === 1 ? 1 : -1,
        liveMood: stored.partner?.liveMood || "idle",
        activeSpotId: stored.partner?.activeSpotId ?? null,
        lastActiveMs: stored.partner?.lastActiveMs || 0
      }
    };
  } catch {
    return defaults;
  }
}

function loadLocalGift(): GardenGiftNote | null {
  try {
    const raw = localStorage.getItem(GARDEN_GIFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GardenGiftNote;
    if (!parsed || !parsed.message) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadLocalDecors(): PlacedDecoration[] {
  try {
    const raw = localStorage.getItem(GARDEN_DECORS_STORAGE_KEY);
    if (!raw) return DEFAULT_DECORS;
    const parsed = JSON.parse(raw) as PlacedDecoration[];
    if (!Array.isArray(parsed)) return DEFAULT_DECORS;
    return parsed;
  } catch {
    return DEFAULT_DECORS;
  }
}

function loadLocalWorldProps(): WorldEnvironmentProps {
  try {
    const raw = localStorage.getItem(GARDEN_WORLD_PROPS_STORAGE_KEY);
    if (!raw) {
      return {
        campfireLit: true,
        coupleTreeExp: 2,
        jukeboxPlaying: true,
        affectionExp: 120,
        interactionCount: 8
      };
    }
    const parsed = JSON.parse(raw) as WorldEnvironmentProps;
    return {
      campfireLit: parsed.campfireLit ?? true,
      coupleTreeExp: typeof parsed.coupleTreeExp === "number" ? parsed.coupleTreeExp : 2,
      lastWateredBy: parsed.lastWateredBy,
      petalShowerAtMs: parsed.petalShowerAtMs,
      meteorShowerAtMs: parsed.meteorShowerAtMs,
      jukeboxPlaying: parsed.jukeboxPlaying ?? true,
      affectionExp: typeof parsed.affectionExp === "number" ? parsed.affectionExp : 120,
      interactionCount: typeof parsed.interactionCount === "number" ? parsed.interactionCount : 8,
      lastInteractionText: parsed.lastInteractionText,
      lastInteractionAtMs: parsed.lastInteractionAtMs
    };
  } catch {
    return {
      campfireLit: true,
      coupleTreeExp: 2,
      jukeboxPlaying: true,
      affectionExp: 120,
      interactionCount: 8
    };
  }
}

function loadSavedTimeTheme(): TimeThemeMode {
  const saved = localStorage.getItem(GARDEN_TIME_THEME_KEY);
  if (saved === "day" || saved === "sunset" || saved === "night") return saved;
  // Default to bright, vivid DAY mode so the garden is never dark or muddy unless chosen!
  return "day";
}

function isBirthdayToday(value: string) {
  if (!value) return false;
  const today = new Date();
  const date = new Date(`${value}T00:00:00`);
  return date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function resolveWalkableTarget(rawX: number, rawY: number, mapId: WorldMapId): Point2D {
  const isHouse = mapId === "belle_house" || mapId === "partner_house";
  const minX = isHouse ? 14 : 10;
  const maxX = isHouse ? 86 : 90;
  const minY = isHouse ? 48 : 46;
  const maxY = isHouse ? 85 : 86;

  let x = clamp(Math.round(rawX), minX, maxX);
  let y = clamp(Math.round(rawY), minY, maxY);

  if (mapId === "garden") {
    if (x < 26 && y < 52) y = 53;
    if (x > 74 && y < 52) y = 53;
  } else if (mapId === "starlight_pond") {
    if (x >= 52 && x <= 74 && y >= 66 && y <= 76) {
      x = x < 63 ? 50 : 76;
    }
  }
  return { x, y };
}

function getCoupleTreeStage(exp = 0): { level: number; emoji: string; badge: string } {
  if (exp >= 10) return { level: 4, emoji: "🌳", badge: "Lv.4 ✨" };
  if (exp >= 5) return { level: 3, emoji: "🌸", badge: "Lv.3 🌸" };
  if (exp >= 2) return { level: 2, emoji: "🌷", badge: "Lv.2 🌷" };
  return { level: 1, emoji: "🌱", badge: "Lv.1 🌱" };
}

function getPoseAsset(basePrefix: "belle-cat" | "belle-rabbit" | "partner-puppy", currentMood: PetMood) {
  if (currentMood === "sleep") {
    return characterAsset(`${basePrefix}-sleep.webp`);
  }
  if (currentMood === "snack") {
    return characterAsset(`${basePrefix}-snack.webp`);
  }
  if (currentMood === "jump") {
    return characterAsset(`${basePrefix}-run.webp`);
  }
  return characterAsset(`${basePrefix}.webp`);
}

export default function CharacterWorld({
  lang,
  onBack,
  userPhotoUrl,
  onUserPhotoChange,
  onBelleSpeciesChange
}: CharacterWorldProps) {
  const t = copy[lang];
  const currentEmail =
    auth?.currentUser?.email?.toLowerCase() ||
    localStorage.getItem("belle_user_email")?.toLowerCase() ||
    "";
  const currentRole: Role = currentEmail === "belle@kim.com" ? "belle" : "partner";
  const otherRole: Role = currentRole === "belle" ? "partner" : "belle";

  const [profiles, setProfiles] = useState<Record<Role, CharacterProfile>>(loadLocalProfiles);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CharacterProfile>(() => loadLocalProfiles()[currentRole]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [syncState, setSyncState] = useState<"local" | "synced" | "waiting">(
    isFirebaseConfigured && auth?.currentUser ? "waiting" : "local"
  );
  const [saved, setSaved] = useState(false);
  const [ownershipNotice, setOwnershipNotice] = useState("");

  // Bright by default ("day"), persisted when changed
  const [timeMode, setTimeMode] = useState<TimeThemeMode>(loadSavedTimeTheme);
  const timeOfDay: TimeOfDay = timeMode;

  const updateTimeTheme = (nextTheme: TimeThemeMode) => {
    setTimeMode(nextTheme);
    localStorage.setItem(GARDEN_TIME_THEME_KEY, nextTheme);
  };

  // Persistent map, position, direction, mood, and active spot
  const [maps, setMaps] = useState<Record<Role, WorldMapId>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: sanitizeMapId(initial.belle.currentMap),
      partner: sanitizeMapId(initial.partner.currentMap)
    };
  });
  const currentMap = maps[currentRole];

  const [activeSpots, setActiveSpots] = useState<Record<Role, InteractiveSpotId | null>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: initial.belle.activeSpotId ?? null,
      partner: initial.partner.activeSpotId ?? null
    };
  });

  const [mood, setMood] = useState<Record<Role, PetMood>>(() => {
    const initial = loadLocalProfiles();
    const resolveInitialMood = (role: Role): PetMood => {
      const spot = initial[role].activeSpotId;
      if (spot && SPOT_RESTING_MOOD[spot]) return SPOT_RESTING_MOOD[spot]!;
      if (initial[role].liveMood && initial[role].liveMood !== "walk" && initial[role].liveMood !== "run") {
        return initial[role].liveMood!;
      }
      return "idle";
    };
    return {
      belle: resolveInitialMood("belle"),
      partner: resolveInitialMood("partner")
    };
  });

  const [positions, setPositions] = useState<Record<Role, Point2D>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: { x: initial.belle.x ?? 40, y: initial.belle.y ?? 66 },
      partner: { x: initial.partner.x ?? 60, y: initial.partner.y ?? 66 }
    };
  });

  const [directions, setDirections] = useState<Record<Role, 1 | -1>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: initial.belle.direction ?? 1,
      partner: initial.partner.direction ?? -1
    };
  });

  const [moveDurations, setMoveDurations] = useState<Record<Role, number>>({ belle: 1.8, partner: 1.8 });
  const [speechBubble, setSpeechBubble] = useState<Partial<Record<Role, string>>>({});
  const [speechDraft, setSpeechDraft] = useState("");
  const [tapTarget, setTapTarget] = useState<{ x: number; y: number; key: number } | null>(null);
  const [burstHearts, setBurstHearts] = useState<Array<{ id: number; x: number; y: number; symbol?: string; label?: string }>>([]);
  const [cameraFlashActive, setCameraFlashActive] = useState(false);
  const [mapTransitionBanner, setMapTransitionBanner] = useState<string>("");

  // Context Menu (Right-click on PC / Long-press on Mobile)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [affectionModalOpen, setAffectionModalOpen] = useState(false);
  const [minimapExpanded, setMinimapExpanded] = useState(false);

  // Shared Interactive Environment Props (Campfire, Love Tree, Affection & Level)
  const [worldProps, setWorldProps] = useState<WorldEnvironmentProps>(loadLocalWorldProps);
  const [petalShowerActive, setPetalShowerActive] = useState<boolean>(false);
  const [meteorShowerActive, setMeteorShowerActive] = useState<boolean>(false);
  const [pondSplashActive, setPondSplashActive] = useState<boolean>(false);

  // Decorations
  const [decorations, setDecorations] = useState<PlacedDecoration[]>(loadLocalDecors);
  const [decorating, setDecorating] = useState(false);
  const [selectedDecorType, setSelectedDecorType] = useState<DecorationType>("flower_pink");

  // Gift Note
  const [gardenGift, setGardenGift] = useState<GardenGiftNote | null>(loadLocalGift);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftOpenView, setGiftOpenView] = useState(false);
  const [giftIconDraft, setGiftIconDraft] = useState<GardenGiftNote["icon"]>("gift");
  const [giftTextDraft, setGiftTextDraft] = useState("");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moodResetTimers = useRef<Partial<Record<Role, number>>>({});
  const portalTimerRef = useRef<number | null>(null);
  const petalTimerRef = useRef<number | null>(null);
  const meteorTimerRef = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const lastProcessedCoopId = useRef<string>("");
  const lastProcessedPetalMs = useRef<number>(0);
  const lastProcessedMeteorMs = useRef<number>(0);
  const lastSynergySpotRef = useRef<string>("");
  const lastRemoteSpeechAt = useRef<Record<Role, number>>({ belle: 0, partner: 0 });
  const lastRemoteActionAt = useRef<Record<Role, number>>({ belle: 0, partner: 0 });
  const lastRemoteSyncMs = useRef<Record<Role, number>>({
    belle: loadLocalProfiles().belle.lastActiveMs || 0,
    partner: loadLocalProfiles().partner.lastActiveMs || 0
  });
  const initialLoadDone = useRef<Record<Role, boolean>>({ belle: false, partner: false });

  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const directionsRef = useRef(directions);
  directionsRef.current = directions;
  const mapsRef = useRef(maps);
  mapsRef.current = maps;
  const activeSpotsRef = useRef(activeSpots);
  activeSpotsRef.current = activeSpots;
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const worldPropsRef = useRef(worldProps);
  worldPropsRef.current = worldProps;

  useEffect(() => {
    document.querySelector<HTMLElement>(".main-content")?.scrollTo({ top: 0, behavior: "auto" });
    ALL_PRELOAD_ASSETS.forEach((file) => {
      const img = new Image();
      img.src = characterAsset(file);
    });
    return () => {
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
      if (portalTimerRef.current) window.clearTimeout(portalTimerRef.current);
      if (petalTimerRef.current) window.clearTimeout(petalTimerRef.current);
      if (meteorTimerRef.current) window.clearTimeout(meteorTimerRef.current);
    };
  }, []);

  const triggerPetalShower = () => {
    setPetalShowerActive(true);
    if (petalTimerRef.current) window.clearTimeout(petalTimerRef.current);
    petalTimerRef.current = window.setTimeout(() => setPetalShowerActive(false), 5500);
  };

  const triggerMeteorShower = () => {
    setMeteorShowerActive(true);
    if (meteorTimerRef.current) window.clearTimeout(meteorTimerRef.current);
    meteorTimerRef.current = window.setTimeout(() => setMeteorShowerActive(false), 5000);
  };

  const belleBasePrefix = profiles.belle.species === "rabbit" ? "belle-rabbit" : "belle-cat";
  const belleSprite = getPoseAsset(belleBasePrefix, mood.belle);
  const partnerSprite = getPoseAsset("partner-puppy", mood.partner);

  const persistLocal = (next: Record<Role, CharacterProfile>) => {
    setProfiles(next);
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(next));
    if (next.belle.species === "cat" || next.belle.species === "rabbit") {
      onBelleSpeciesChange?.(next.belle.species);
    }
  };

  // Immediately save my character's latest position/map/mood/spot to localStorage so reload never loses state
  const persistMyLiveStateLocally = (patch: Partial<CharacterProfile>) => {
    setProfiles((current) => {
      const updatedRoleProfile: CharacterProfile = {
        ...current[currentRole],
        ...patch,
        role: currentRole,
        lastActiveMs: patch.lastActiveMs ?? Date.now()
      };
      const next = {
        ...current,
        [currentRole]: updatedRoleProfile
      };
      localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const persistWorldPropsLocal = (nextProps: WorldEnvironmentProps) => {
    worldPropsRef.current = nextProps;
    setWorldProps(nextProps);
    localStorage.setItem(GARDEN_WORLD_PROPS_STORAGE_KEY, JSON.stringify(nextProps));
  };

  // Push my real-time state to both topics/__garden_{role} and couple_characters/{role}
  const syncMyStateToCloud = async (patch: Partial<CharacterProfile>) => {
    const nowMs = Date.now();
    persistMyLiveStateLocally({ ...patch, lastActiveMs: nowMs });
    lastRemoteSyncMs.current[currentRole] = nowMs;

    if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
    const email = auth.currentUser.email || "";
    const basePayload = {
      ...patch,
      role: currentRole,
      ownerEmail: email,
      createdBy: email,
      lastActiveMs: nowMs
    };
    const results = await Promise.allSettled([
      setDoc(
        doc(db, "topics", currentRole === "belle" ? "__garden_belle" : "__garden_partner"),
        { ...basePayload, isSystemState: true, syncedAtMs: nowMs },
        { merge: true }
      ),
      setDoc(
        doc(db, "couple_characters", currentRole),
        { ...basePayload, updatedAt: serverTimestamp() },
        { merge: true }
      )
    ]);
    if (results.some((r) => r.status === "fulfilled")) {
      setSyncState("synced");
    } else {
      setSyncState("local");
    }
  };

  const syncWorldStateToCloud = async (patch: Record<string, unknown>) => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
    const nowMs = Date.now();
    const email = auth.currentUser.email || "";
    await Promise.allSettled([
      setDoc(
        doc(db, "topics", "__garden_world"),
        { ...patch, isSystemState: true, createdBy: email, syncedAtMs: nowMs },
        { merge: true }
      ),
      setDoc(
        doc(db, "character_world", "main"),
        { ...patch, updatedAt: serverTimestamp() },
        { merge: true }
      )
    ]);
  };

  // Gain Couple Affection EXP & sync across both screens
  const addAffectionExp = async (gain: number, labelText: string, burstPos?: Point2D, symbol = "💞") => {
    const cur = worldPropsRef.current;
    const nextExp = (cur.affectionExp || 120) + gain;
    const nextCount = (cur.interactionCount || 8) + 1;
    const nowMs = Date.now();
    const nextProps: WorldEnvironmentProps = {
      ...cur,
      affectionExp: nextExp,
      interactionCount: nextCount,
      lastInteractionText: `${labelText} (+${gain} ♥)`,
      lastInteractionAtMs: nowMs
    };
    persistWorldPropsLocal(nextProps);
    if (burstPos) {
      triggerHeartBurst(burstPos.x, burstPos.y, symbol, `+${gain} ♥`);
    }
    await syncWorldStateToCloud({ worldProps: nextProps });
  };

  useEffect(() => {
    if (!userPhotoUrl) return;
    setProfiles((current) => {
      if (current[currentRole].photoUrl === userPhotoUrl) return current;
      const next = {
        ...current,
        [currentRole]: { ...current[currentRole], photoUrl: userPhotoUrl }
      };
      localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [userPhotoUrl, currentRole]);

  const triggerHeartBurst = (x: number, y: number, symbol?: string, label?: string) => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setBurstHearts((prev) => [...prev.slice(-6), { id, x, y, symbol, label }]);
    window.setTimeout(() => {
      setBurstHearts((prev) => prev.filter((item) => item.id !== id));
    }, 1650);
  };

  const setTemporaryMood = (role: Role, nextMood: PetMood, durationMs: number, bubbleText?: string) => {
    if (moodResetTimers.current[role]) {
      window.clearTimeout(moodResetTimers.current[role]);
    }
    moodRef.current = { ...moodRef.current, [role]: nextMood };
    setMood((prev) => ({ ...prev, [role]: nextMood }));
    if (bubbleText) {
      setSpeechBubble((prev) => ({ ...prev, [role]: bubbleText }));
    }
    moodResetTimers.current[role] = window.setTimeout(() => {
      const spot = activeSpotsRef.current[role];
      const fallbackMood: PetMood = (spot && SPOT_RESTING_MOOD[spot]) || "idle";
      moodRef.current = { ...moodRef.current, [role]: fallbackMood };
      setMood((prev) => ({ ...prev, [role]: fallbackMood }));
      if (bubbleText) {
        setSpeechBubble((prev) => {
          const copyBubble = { ...prev };
          delete copyBubble[role];
          return copyBubble;
        });
      }
    }, durationMs);
  };

  const animateCharacterTo = (
    role: Role,
    target: Point2D,
    moveMood: PetMood = "walk",
    endMood: PetMood = "idle",
    bubbleAfter?: string,
    endDurationMs = 3400,
    forcedDirection?: 1 | -1
  ) => {
    const current = positionsRef.current[role];
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const dist = Math.hypot(dx, dy);
    const durationSec = clamp(dist * 0.048, 0.9, 2.3);

    setMoveDurations((d) => ({ ...d, [role]: durationSec }));
    const nextDir: 1 | -1 =
      forcedDirection ?? (Math.abs(dx) > 1 ? (dx >= 0 ? 1 : -1) : directionsRef.current[role]);
    directionsRef.current = { ...directionsRef.current, [role]: nextDir };
    positionsRef.current = { ...positionsRef.current, [role]: target };
    setDirections((dir) => ({ ...dir, [role]: nextDir }));
    setPositions((prev) => ({ ...prev, [role]: target }));

    if (dist > 1.5) {
      setTemporaryMood(role, moveMood, durationSec * 1000);
      if (endMood !== "idle" || bubbleAfter) {
        window.setTimeout(() => {
          setTemporaryMood(role, endMood, endDurationMs, bubbleAfter);
        }, durationSec * 1000);
      }
    } else if (endMood !== "idle" || bubbleAfter) {
      setTemporaryMood(role, endMood, endDurationMs, bubbleAfter);
    }

    return { durationSec, nextDir };
  };

  // Move ONLY the current user's character and persist + sync to Firestore
  const moveMyCharacterTo = (
    target: Point2D,
    moveMood: PetMood = "walk",
    endMood: PetMood = "idle",
    bubbleAfter?: string,
    endDurationMs = 3200,
    spotId: InteractiveSpotId | null = null,
    forcedDirection?: 1 | -1
  ) => {
    activeSpotsRef.current = { ...activeSpotsRef.current, [currentRole]: spotId };
    setActiveSpots((prev) => ({ ...prev, [currentRole]: spotId }));

    const { durationSec, nextDir } = animateCharacterTo(
      currentRole,
      target,
      moveMood,
      endMood,
      bubbleAfter,
      endDurationMs,
      forcedDirection
    );
    const nowMs = Date.now();
    const persistedMood: PetMood =
      endMood !== "idle" ? endMood : (spotId && SPOT_RESTING_MOOD[spotId]) || "idle";

    void syncMyStateToCloud({
      x: target.x,
      y: target.y,
      direction: nextDir,
      currentMap: mapsRef.current[currentRole],
      liveMood: persistedMood,
      activeSpotId: spotId,
      actionAtMs: nowMs,
      ...(bubbleAfter ? { speechText: bubbleAfter, speechAtMs: nowMs } : {})
    });
    return durationSec;
  };

  const executeCoopEventLocally = (evt: CoopEventPayload) => {
    if (evt.mapId && mapsRef.current[otherRole] !== evt.mapId) {
      mapsRef.current = { ...mapsRef.current, [otherRole]: evt.mapId };
      setMaps((prev) => ({ ...prev, [otherRole]: evt.mapId }));
    }
    const belleTarget: Point2D = {
      x: clamp(evt.centerX - 7, 16, 82),
      y: clamp(evt.centerY, 50, 82)
    };
    const partnerTarget: Point2D = {
      x: clamp(evt.centerX + 7, 18, 84),
      y: clamp(evt.centerY + 1, 50, 82)
    };

    if (evt.type === "hug" || evt.type === "pet") {
      const reactionText = evt.type === "pet" ? t.pettedReaction : t.hugReaction;
      animateCharacterTo("belle", belleTarget, "walk", "love", reactionText, 4200, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "love", reactionText, 4200, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 14, "💞", evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 600);
    } else if (evt.type === "kiss") {
      animateCharacterTo("belle", belleTarget, "walk", "love", t.kissReaction, 4400, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "love", t.kissReaction, 4400, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 16, "💋", evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 550);
    } else if (evt.type === "feed") {
      animateCharacterTo("belle", belleTarget, "walk", "snack", t.snackReaction, 4800, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "snack", t.snackReaction, 4800, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 14, "🍓", evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 600);
    } else if (evt.type === "flower") {
      animateCharacterTo("belle", belleTarget, "walk", "happy", t.flowerReaction, 4200, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "happy", t.flowerReaction, 4200, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 14, "🌷", evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 600);
    } else if (evt.type === "dance") {
      animateCharacterTo("belle", belleTarget, "walk", "jump", t.danceReaction, 4400, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "jump", t.danceReaction, 4400, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 16, "🎶", evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 500);
    } else if (evt.type === "jump" || evt.type === "highfive") {
      const text = evt.type === "highfive" ? t.highfiveReaction : t.jumpReaction;
      const sym = evt.type === "highfive" ? "🙌" : "✨";
      animateCharacterTo("belle", belleTarget, "walk", "jump", text, 3800, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "jump", text, 3800, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 16, sym, evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 500);
    } else if (evt.type === "photo") {
      animateCharacterTo("belle", belleTarget, "walk", "love", t.photoReaction, 4500, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "love", t.photoReaction, 4500, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        setCameraFlashActive(true);
        window.setTimeout(() => setCameraFlashActive(false), 650);
        triggerHeartBurst(evt.centerX, evt.centerY - 16, "📸", evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 650);
    } else if (evt.type === "nap") {
      animateCharacterTo("belle", belleTarget, "walk", "sleep", t.napReaction, 6500, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "sleep", t.napReaction, 6500, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 12, "💤", evt.affectionGain ? `+${evt.affectionGain} ♥` : undefined);
      }, 750);
    }
  };

  // Detect 2-Player Co-op Spot Synergy when both occupy the same InteractiveSpotId on the same map
  const sharedActiveSpot: InteractiveSpotId | null =
    maps.belle === maps.partner &&
    activeSpots.belle &&
    activeSpots.belle === activeSpots.partner
      ? activeSpots.belle
      : null;

  useEffect(() => {
    if (!sharedActiveSpot) {
      lastSynergySpotRef.current = "";
      return;
    }
    if (lastSynergySpotRef.current === sharedActiveSpot) return;
    lastSynergySpotRef.current = sharedActiveSpot;

    const midX = Math.round((positionsRef.current.belle.x + positionsRef.current.partner.x) / 2);
    const midY = Math.round((positionsRef.current.belle.y + positionsRef.current.partner.y) / 2);

    if (sharedActiveSpot === "garden_bench") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "love", 5200, t.benchCoopReaction);
      setTemporaryMood("partner", "love", 5200, t.benchCoopReaction);
      triggerHeartBurst(50, 38, "💞", "+25 ♥");
    } else if (sharedActiveSpot === "campfire") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "snack", 5200, t.campfireCoopReaction);
      setTemporaryMood("partner", "snack", 5200, t.campfireCoopReaction);
      triggerHeartBurst(50, 64, "🔥", "+25 ♥");
    } else if (sharedActiveSpot === "couple_tree") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "love", 5200, t.treeCoopReaction);
      setTemporaryMood("partner", "love", 5200, t.treeCoopReaction);
      triggerHeartBurst(50, 38, "🌸", "+25 ♥");
      triggerPetalShower();
    } else if (sharedActiveSpot === "flower_picnic") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "snack", 5200, t.picnicCoopReaction);
      setTemporaryMood("partner", "snack", 5200, t.picnicCoopReaction);
      triggerHeartBurst(72, 62, "🧺", "+25 ♥");
    } else if (sharedActiveSpot === "sparkle_pond") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "happy", 5000, t.pondCoopReaction);
      setTemporaryMood("partner", "happy", 5000, t.pondCoopReaction);
      triggerHeartBurst(62, 60, "🪷", "+25 ♥");
    } else if (sharedActiveSpot === "star_observatory") {
      setTemporaryMood("belle", "love", 5200, t.starCoopReaction);
      setTemporaryMood("partner", "love", 5200, t.starCoopReaction);
      triggerHeartBurst(70, 34, "🌠", "+25 ♥");
      triggerMeteorShower();
    } else if (sharedActiveSpot === "forest_swing") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "happy", 5200, t.swingCoopReaction);
      setTemporaryMood("partner", "happy", 5200, t.swingCoopReaction);
      triggerHeartBurst(32, 44, "🎶", "+25 ♥");
    } else if (sharedActiveSpot === "bed") {
      setTemporaryMood("belle", "sleep", 6200, t.bedCoopReaction);
      setTemporaryMood("partner", "sleep", 6200, t.bedCoopReaction);
      triggerHeartBurst(midX, midY - 12, "🌙", "+25 ♥");
    } else if (sharedActiveSpot === "tea_table") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "snack", 5200, t.tableCoopReaction);
      setTemporaryMood("partner", "snack", 5200, t.tableCoopReaction);
      triggerHeartBurst(24, 48, "🫖", "+25 ♥");
    } else if (sharedActiveSpot === "cozy_rug") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "love", 5000, t.rugCoopReaction);
      setTemporaryMood("partner", "love", 5000, t.rugCoopReaction);
      triggerHeartBurst(50, 58, "🧶", "+25 ♥");
    } else if (sharedActiveSpot === "jukebox") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "jump", 5000, t.jukeboxCoopReaction);
      setTemporaryMood("partner", "jump", 5000, t.jukeboxCoopReaction);
      triggerHeartBurst(46, 38, "🎶", "+25 ♥");
    }
  }, [sharedActiveSpot]);

  // Real-time Firestore listeners for both characters + shared world state
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
      setSyncState("local");
      return;
    }

    // Announce our restored position & map so partner immediately sees where we are
    void syncMyStateToCloud({
      x: positionsRef.current[currentRole].x,
      y: positionsRef.current[currentRole].y,
      direction: directionsRef.current[currentRole],
      currentMap: mapsRef.current[currentRole],
      liveMood: moodRef.current[currentRole],
      activeSpotId: activeSpotsRef.current[currentRole]
    });

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncMyStateToCloud({
          x: positionsRef.current[currentRole].x,
          y: positionsRef.current[currentRole].y,
          direction: directionsRef.current[currentRole],
          currentMap: mapsRef.current[currentRole],
          liveMood: moodRef.current[currentRole],
          activeSpotId: activeSpotsRef.current[currentRole]
        });
      }
    }, 25000);

    const handleRemoteCharacterSnapshot = (role: Role, remote: Partial<CharacterProfile> & { syncedAtMs?: number }) => {
      const syncMs = remote.syncedAtMs || remote.lastActiveMs || remote.actionAtMs || remote.speechAtMs || 0;

      // For MY own role, only apply remote position/map if it came from a strictly newer session on another device
      if (role === currentRole) {
        if (syncMs > lastRemoteSyncMs.current[currentRole] + 1500) {
          lastRemoteSyncMs.current[currentRole] = syncMs;
          if (remote.currentMap) {
            const validMap = sanitizeMapId(remote.currentMap);
            mapsRef.current = { ...mapsRef.current, [currentRole]: validMap };
            setMaps((prev) => ({ ...prev, [currentRole]: validMap }));
          }
          if (typeof remote.x === "number" && typeof remote.y === "number") {
            positionsRef.current = { ...positionsRef.current, [currentRole]: { x: remote.x, y: remote.y } };
            setPositions((prev) => ({ ...prev, [currentRole]: { x: remote.x!, y: remote.y! } }));
          }
        }
        setSyncState("synced");
        return;
      }

      // For the OTHER player's character: ignore outdated snapshots so dual-collection listeners never stutter
      if (syncMs > 0 && syncMs < lastRemoteSyncMs.current[role]) {
        return;
      }
      if (syncMs > 0) {
        lastRemoteSyncMs.current[role] = syncMs;
      }

      setProfiles((current) => {
        const next = {
          ...current,
          [role]: {
            ...defaults[role],
            ...current[role],
            ...remote,
            role,
            currentMap: sanitizeMapId(remote.currentMap || current[role].currentMap),
            species: role === "partner" ? "dog" : remote.species === "rabbit" ? "rabbit" : "cat"
          }
        } as Record<Role, CharacterProfile>;
        localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(next));
        if (role === "belle" && (next.belle.species === "cat" || next.belle.species === "rabbit")) {
          onBelleSpeciesChange?.(next.belle.species);
        }
        return next;
      });

      const isFirst = !initialLoadDone.current[role];
      initialLoadDone.current[role] = true;

      const remoteMap = remote.currentMap ? sanitizeMapId(remote.currentMap) : mapsRef.current[role];
      const mapChanged = remoteMap !== mapsRef.current[role];
      if (mapChanged) {
        mapsRef.current = { ...mapsRef.current, [role]: remoteMap };
        setMaps((prev) => ({ ...prev, [role]: remoteMap }));
      }

      if ("activeSpotId" in remote) {
        const nextSpot = remote.activeSpotId ?? null;
        activeSpotsRef.current = { ...activeSpotsRef.current, [role]: nextSpot };
        setActiveSpots((prev) => (prev[role] === nextSpot ? prev : { ...prev, [role]: nextSpot }));
      }

      const spotRestMood = remote.activeSpotId ? SPOT_RESTING_MOOD[remote.activeSpotId] : undefined;
      const endMood: PetMood =
        remote.liveMood && remote.liveMood !== "run" && remote.liveMood !== "walk"
          ? remote.liveMood
          : spotRestMood || "idle";
      const moveMood: PetMood = remote.liveMood === "run" ? "run" : "walk";

      if (typeof remote.x === "number" && typeof remote.y === "number") {
        const curPos = positionsRef.current[role];
        const dist = Math.hypot(remote.x - curPos.x, remote.y - curPos.y);

        if (isFirst || mapChanged) {
          positionsRef.current = { ...positionsRef.current, [role]: { x: remote.x, y: remote.y } };
          setPositions((prev) => ({ ...prev, [role]: { x: remote.x!, y: remote.y! } }));
          if (remote.direction) {
            directionsRef.current = { ...directionsRef.current, [role]: remote.direction };
            setDirections((d) => ({ ...d, [role]: remote.direction! }));
          }
          setMood((prev) => ({ ...prev, [role]: endMood }));
          if (remote.actionAtMs) lastRemoteActionAt.current[role] = remote.actionAtMs;
          if (remote.speechAtMs && Date.now() - remote.speechAtMs >= 10000) {
            lastRemoteSpeechAt.current[role] = remote.speechAtMs;
          }
        } else if (dist > 0.5) {
          if (remote.actionAtMs) {
            lastRemoteActionAt.current[role] = remote.actionAtMs;
          }
          animateCharacterTo(
            role,
            { x: remote.x, y: remote.y },
            moveMood,
            endMood,
            undefined,
            4000,
            remote.direction
          );
        } else {
          if (remote.direction) {
            directionsRef.current = { ...directionsRef.current, [role]: remote.direction };
            setDirections((d) => ({ ...d, [role]: remote.direction! }));
          }
          if (remote.actionAtMs && remote.actionAtMs > lastRemoteActionAt.current[role]) {
            lastRemoteActionAt.current[role] = remote.actionAtMs;
            setTemporaryMood(role, endMood !== "idle" ? endMood : "happy", 3400);
            triggerHeartBurst(remote.x, remote.y - 12);
          }
        }
      }

      if (
        remote.speechText &&
        remote.speechAtMs &&
        remote.speechAtMs > lastRemoteSpeechAt.current[role] &&
        Date.now() - remote.speechAtMs < 15000
      ) {
        lastRemoteSpeechAt.current[role] = remote.speechAtMs;
        const speechMood: PetMood = endMood !== "idle" ? endMood : "happy";
        setTemporaryMood(role, speechMood, 4500, remote.speechText);
        triggerHeartBurst(
          remote.x ?? positionsRef.current[role].x,
          (remote.y ?? positionsRef.current[role].y) - 12
        );
      }
      setSyncState("synced");
    };

    const handleRemoteWorldSnapshot = (data: {
      giftNote?: GardenGiftNote | null;
      decorations?: PlacedDecoration[];
      coopEvent?: CoopEventPayload;
      worldProps?: WorldEnvironmentProps;
    }) => {
      if (data.giftNote && data.giftNote.message) {
        setGardenGift(data.giftNote);
        localStorage.setItem(GARDEN_GIFT_STORAGE_KEY, JSON.stringify(data.giftNote));
      } else if (data.giftNote === null) {
        setGardenGift(null);
        localStorage.removeItem(GARDEN_GIFT_STORAGE_KEY);
      }

      if (Array.isArray(data.decorations)) {
        setDecorations(data.decorations);
        localStorage.setItem(GARDEN_DECORS_STORAGE_KEY, JSON.stringify(data.decorations));
      }

      if (data.worldProps) {
        persistWorldPropsLocal({
          ...loadLocalWorldProps(),
          ...data.worldProps
        });
        if (
          data.worldProps.petalShowerAtMs &&
          data.worldProps.petalShowerAtMs > lastProcessedPetalMs.current &&
          Date.now() - data.worldProps.petalShowerAtMs < 12000
        ) {
          lastProcessedPetalMs.current = data.worldProps.petalShowerAtMs;
          triggerPetalShower();
        }
        if (
          data.worldProps.meteorShowerAtMs &&
          data.worldProps.meteorShowerAtMs > lastProcessedMeteorMs.current &&
          Date.now() - data.worldProps.meteorShowerAtMs < 12000
        ) {
          lastProcessedMeteorMs.current = data.worldProps.meteorShowerAtMs;
          triggerMeteorShower();
        }
      }

      if (
        data.coopEvent &&
        data.coopEvent.id !== lastProcessedCoopId.current &&
        Date.now() - data.coopEvent.createdAtMs < 15000
      ) {
        lastProcessedCoopId.current = data.coopEvent.id;
        executeCoopEventLocally(data.coopEvent);
      }
    };

    const unsubscribers: Array<() => void> = [];

    (["belle", "partner"] as Role[]).forEach((role) => {
      const bridgeDocId = role === "belle" ? "__garden_belle" : "__garden_partner";
      unsubscribers.push(
        onSnapshot(
          doc(db, "topics", bridgeDocId),
          (snapshot) => {
            if (snapshot.exists()) {
              handleRemoteCharacterSnapshot(role, snapshot.data() as Partial<CharacterProfile>);
            } else {
              setSyncState("synced");
            }
          },
          () => {}
        )
      );
      unsubscribers.push(
        onSnapshot(
          doc(db, "couple_characters", role),
          (snapshot) => {
            if (snapshot.exists()) {
              handleRemoteCharacterSnapshot(role, snapshot.data() as Partial<CharacterProfile>);
            }
          },
          () => {}
        )
      );
    });

    unsubscribers.push(
      onSnapshot(
        doc(db, "topics", "__garden_world"),
        (snapshot) => {
          if (snapshot.exists()) {
            handleRemoteWorldSnapshot(snapshot.data());
          }
        },
        () => {}
      )
    );

    unsubscribers.push(
      onSnapshot(
        doc(db, "character_world", "main"),
        (snapshot) => {
          if (snapshot.exists()) {
            handleRemoteWorldSnapshot(snapshot.data());
          }
        },
        () => {}
      )
    );

    return () => {
      window.clearInterval(heartbeatTimer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentRole]);

  const showOwnershipToast = () => {
    setOwnershipNotice(t.onlyMyCharacterNotice);
    window.setTimeout(() => setOwnershipNotice(""), 2600);
  };

  const mapLabel = (m: WorldMapId) => {
    if (m === "flower_forest") return t.mapFlowerForest;
    if (m === "starlight_pond") return t.mapStarlightPond;
    if (m === "belle_house") return t.mapBelleHouse;
    if (m === "partner_house") return t.mapPartnerHouse;
    return t.mapGarden;
  };

  // Switch my character's map (5 Fixed Maps with smooth transition banner)
  const changeMyMap = (targetMap: WorldMapId, spawnPoint?: Point2D) => {
    if (portalTimerRef.current) {
      window.clearTimeout(portalTimerRef.current);
      portalTimerRef.current = null;
    }
    setContextMenu(null);
    const prevMap = mapsRef.current[currentRole];
    let defaultSpawn: Point2D = { x: 50, y: 68 };

    if (targetMap === "garden") {
      if (prevMap === "belle_house") defaultSpawn = { x: 22, y: 56 };
      else if (prevMap === "partner_house") defaultSpawn = { x: 78, y: 56 };
      else if (prevMap === "flower_forest") defaultSpawn = { x: 18, y: 66 };
      else if (prevMap === "starlight_pond") defaultSpawn = { x: 82, y: 66 };
    } else if (targetMap === "flower_forest") {
      defaultSpawn = prevMap === "garden" ? { x: 80, y: 66 } : { x: 50, y: 68 };
    } else if (targetMap === "starlight_pond") {
      defaultSpawn = prevMap === "garden" ? { x: 20, y: 66 } : { x: 46, y: 68 };
    } else {
      defaultSpawn = { x: 50, y: 76 };
    }

    const nextPos = spawnPoint || defaultSpawn;
    const nextDir: 1 | -1 =
      targetMap === "flower_forest" ? -1 : targetMap === "starlight_pond" ? 1 : directionsRef.current[currentRole];

    mapsRef.current = { ...mapsRef.current, [currentRole]: targetMap };
    positionsRef.current = { ...positionsRef.current, [currentRole]: nextPos };
    directionsRef.current = { ...directionsRef.current, [currentRole]: nextDir };
    activeSpotsRef.current = { ...activeSpotsRef.current, [currentRole]: null };
    setMaps((prev) => ({ ...prev, [currentRole]: targetMap }));
    setPositions((prev) => ({ ...prev, [currentRole]: nextPos }));
    setDirections((prev) => ({ ...prev, [currentRole]: nextDir }));
    setActiveSpots((prev) => ({ ...prev, [currentRole]: null }));
    setTemporaryMood(currentRole, "happy", 1500);

    setMapTransitionBanner(mapLabel(targetMap));
    window.setTimeout(() => setMapTransitionBanner(""), 1800);

    void syncMyStateToCloud({
      currentMap: targetMap,
      x: nextPos.x,
      y: nextPos.y,
      direction: nextDir,
      activeSpotId: null,
      liveMood: "happy",
      actionAtMs: Date.now()
    });
  };

  // Walk to portal/door/signpost first, then transition to the next fixed map
  const walkAndTransitionToMap = (
    e: React.MouseEvent | undefined,
    walkTarget: Point2D,
    targetMap: WorldMapId,
    spawnInTarget: Point2D
  ) => {
    e?.stopPropagation();
    setContextMenu(null);
    const durationSec = moveMyCharacterTo(walkTarget, "walk", "happy", undefined, 1800, null);
    if (portalTimerRef.current) window.clearTimeout(portalTimerRef.current);
    portalTimerRef.current = window.setTimeout(() => {
      changeMyMap(targetMap, spawnInTarget);
    }, Math.min(820, durationSec * 750));
  };

  // Unified Interactive Spot Handler across all 5 Fixed Maps (+ Affection EXP!)
  const handleInteractiveSpotClick = async (e: React.MouseEvent, spotId: InteractiveSpotId) => {
    e.stopPropagation();
    setContextMenu(null);
    const isBelle = currentRole === "belle";

    if (spotId === "garden_bench") {
      const seat: Point2D = isBelle ? { x: 46, y: 49 } : { x: 54, y: 49 };
      moveMyCharacterTo(seat, "walk", "happy", t.benchReaction, 5500, "garden_bench", isBelle ? 1 : -1);
      await addAffectionExp(10, t.spotBenchLabel, { x: 50, y: 40 }, "🍃");
      return;
    }

    if (spotId === "campfire") {
      const seat: Point2D = isBelle ? { x: 42, y: 75 } : { x: 58, y: 75 };
      const nextLit = activeSpots[currentRole] === "campfire" ? !worldProps.campfireLit : true;
      const cur = worldPropsRef.current;
      const nextProps: WorldEnvironmentProps = {
        ...cur,
        campfireLit: nextLit,
        affectionExp: (cur.affectionExp || 120) + 12,
        interactionCount: (cur.interactionCount || 8) + 1,
        lastInteractionText: `${t.spotCampfireLabel} (+12 ♥)`,
        lastInteractionAtMs: Date.now()
      };
      persistWorldPropsLocal(nextProps);
      moveMyCharacterTo(
        seat,
        "walk",
        nextLit ? "snack" : "happy",
        nextLit ? t.campfireOnReaction : t.campfireOffReaction,
        5500,
        "campfire",
        isBelle ? 1 : -1
      );
      triggerHeartBurst(50, 66, nextLit ? "🔥" : "🧺", "+12 ♥");
      await syncWorldStateToCloud({ worldProps: nextProps });
      return;
    }

    if (spotId === "couple_tree") {
      const slot: Point2D = isBelle ? { x: 43, y: 54 } : { x: 57, y: 54 };
      const nowMs = Date.now();
      const cur = worldPropsRef.current;
      const nextExp = (cur.coupleTreeExp || 0) + 1;
      const nextProps: WorldEnvironmentProps = {
        ...cur,
        coupleTreeExp: nextExp,
        lastWateredBy: currentRole,
        petalShowerAtMs: nowMs,
        affectionExp: (cur.affectionExp || 120) + 18,
        interactionCount: (cur.interactionCount || 8) + 1,
        lastInteractionText: `${t.spotTreeLabel} 💧 (+18 ♥)`,
        lastInteractionAtMs: nowMs
      };
      lastProcessedPetalMs.current = nowMs;
      persistWorldPropsLocal(nextProps);
      triggerPetalShower();
      moveMyCharacterTo(slot, "walk", "love", t.treeWaterReaction, 5200, "couple_tree", isBelle ? 1 : -1);
      triggerHeartBurst(50, 40, "🌸", "+18 ♥");
      await syncWorldStateToCloud({ worldProps: nextProps });
      return;
    }

    if (spotId === "flower_picnic") {
      const slot: Point2D = isBelle ? { x: 66, y: 74 } : { x: 78, y: 74 };
      moveMyCharacterTo(slot, "walk", "snack", t.picnicReaction, 5200, "flower_picnic", isBelle ? 1 : -1);
      await addAffectionExp(14, t.spotPicnicLabel, { x: 72, y: 65 }, "🧺");
      return;
    }

    if (spotId === "wish_mailbox") {
      const slot: Point2D = isBelle ? { x: 22, y: 62 } : { x: 30, y: 62 };
      moveMyCharacterTo(slot, "walk", "happy", t.mailboxReaction, 4200, "wish_mailbox", 1);
      triggerHeartBurst(24, 50, "💌");
      if (gardenGift) {
        setGiftOpenView(true);
      } else {
        setGiftModalOpen(true);
      }
      return;
    }

    if (spotId === "sparkle_pond") {
      const slot: Point2D = isBelle ? { x: 52, y: 72 } : { x: 72, y: 72 };
      setPondSplashActive(true);
      window.setTimeout(() => setPondSplashActive(false), 3200);
      moveMyCharacterTo(slot, "walk", "jump", t.pondReaction, 4500, "sparkle_pond", isBelle ? 1 : -1);
      await addAffectionExp(12, t.spotPondLabel, { x: 62, y: 62 }, "🐠");
      return;
    }

    if (spotId === "star_observatory") {
      const slot: Point2D = isBelle ? { x: 65, y: 49 } : { x: 75, y: 49 };
      const nowMs = Date.now();
      const cur = worldPropsRef.current;
      const nextProps: WorldEnvironmentProps = {
        ...cur,
        meteorShowerAtMs: nowMs,
        affectionExp: (cur.affectionExp || 120) + 16,
        interactionCount: (cur.interactionCount || 8) + 1,
        lastInteractionText: `${t.spotStarLabel} 🌠 (+16 ♥)`,
        lastInteractionAtMs: nowMs
      };
      lastProcessedMeteorMs.current = nowMs;
      persistWorldPropsLocal(nextProps);
      triggerMeteorShower();
      moveMyCharacterTo(slot, "walk", "love", t.starReaction, 5200, "star_observatory", 1);
      triggerHeartBurst(70, 36, "🌠", "+16 ♥");
      await syncWorldStateToCloud({ worldProps: nextProps });
      return;
    }

    if (spotId === "forest_swing") {
      const slot: Point2D = isBelle ? { x: 28, y: 56 } : { x: 36, y: 56 };
      moveMyCharacterTo(slot, "walk", "happy", t.swingReaction, 5000, "forest_swing", isBelle ? 1 : -1);
      await addAffectionExp(14, t.spotSwingLabel, { x: 32, y: 46 }, "🎶");
      return;
    }

    if (spotId === "bed") {
      const pillowSlot: Point2D = isBelle ? { x: 69, y: 56 } : { x: 79, y: 56 };
      moveMyCharacterTo(pillowSlot, "walk", "sleep", t.bedReaction, 6500, "bed", isBelle ? 1 : -1);
      await addAffectionExp(12, t.spotBedLabel, { x: 74, y: 46 }, "💤");
      return;
    }

    if (spotId === "tea_table") {
      const chairSlot: Point2D = isBelle ? { x: 19, y: 62 } : { x: 30, y: 62 };
      moveMyCharacterTo(chairSlot, "walk", "snack", t.tableReaction, 5200, "tea_table", isBelle ? 1 : -1);
      await addAffectionExp(12, t.spotTableLabel, { x: 24, y: 50 }, "🍓");
      return;
    }

    if (spotId === "cozy_rug") {
      const rugSlot: Point2D = isBelle ? { x: 45, y: 69 } : { x: 55, y: 69 };
      moveMyCharacterTo(rugSlot, "walk", "love", t.rugReaction, 5000, "cozy_rug", isBelle ? 1 : -1);
      await addAffectionExp(12, t.spotRugLabel, { x: 50, y: 60 }, "🧶");
      return;
    }

    if (spotId === "jukebox") {
      const slot: Point2D = isBelle ? { x: 41, y: 52 } : { x: 51, y: 52 };
      const cur = worldPropsRef.current;
      const nextPlay = !cur.jukeboxPlaying;
      const nextProps: WorldEnvironmentProps = {
        ...cur,
        jukeboxPlaying: nextPlay,
        affectionExp: (cur.affectionExp || 120) + 12,
        interactionCount: (cur.interactionCount || 8) + 1,
        lastInteractionText: `${t.spotJukeboxLabel} 🎵 (+12 ♥)`,
        lastInteractionAtMs: Date.now()
      };
      persistWorldPropsLocal(nextProps);
      moveMyCharacterTo(slot, "walk", "happy", t.jukeboxReaction, 5000, "jukebox", isBelle ? 1 : -1);
      triggerHeartBurst(46, 40, "🎵", "+12 ♥");
      await syncWorldStateToCloud({ worldProps: nextProps });
    }
  };

  const saveDecorationsToCloud = async (nextDecors: PlacedDecoration[]) => {
    setDecorations(nextDecors);
    localStorage.setItem(GARDEN_DECORS_STORAGE_KEY, JSON.stringify(nextDecors));
    await syncWorldStateToCloud({ decorations: nextDecors });
  };

  // Open Context Menu (Right-click on PC / Long-press on Mobile)
  const openStageContextMenu = (
    targetType: "me" | "partner" | "ground",
    clientX: number,
    clientY: number
  ) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const stageX = clamp(Math.round(((clientX - rect.left) / rect.width) * 100), 12, 88);
    const stageY = clamp(Math.round(((clientY - rect.top) / rect.height) * 100), 46, 85);
    setContextMenu({
      targetType,
      clientX,
      clientY,
      stageX,
      stageY
    });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (
    targetType: "me" | "partner" | "ground",
    clientX: number,
    clientY: number
  ) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    pointerDownPosRef.current = { x: clientX, y: clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openStageContextMenu(targetType, clientX, clientY);
    }, 430);
  };

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) return; // right click handled by onContextMenu
    if ((event.target as HTMLElement).closest(".stage-hud-ignore")) return;
    if ((event.target as HTMLElement).closest("button")) return;
    startLongPress("ground", event.clientX, event.clientY);
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!longPressTimerRef.current) return;
    const dist = Math.hypot(
      event.clientX - pointerDownPosRef.current.x,
      event.clientY - pointerDownPosRef.current.y
    );
    if (dist > 10) {
      clearLongPressTimer();
    }
  };

  const handleStagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (event.button === 2) return;
    if ((event.target as HTMLElement).closest(".stage-hud-ignore")) return;
    if ((event.target as HTMLElement).closest("button")) return;

    if (contextMenu) {
      setContextMenu(null);
      return;
    }

    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;

    // Walking to the bottom exit mat inside a house exits back to the garden
    if (!decorating && (currentMap === "belle_house" || currentMap === "partner_house")) {
      if (rawY >= 81 && rawX >= 36 && rawX <= 64) {
        walkAndTransitionToMap(
          undefined,
          { x: 50, y: 81 },
          "garden",
          currentMap === "belle_house" ? { x: 20, y: 55 } : { x: 80, y: 55 }
        );
        return;
      }
    }

    const { x: targetX, y: targetY } = resolveWalkableTarget(rawX, rawY, currentMap);

    if (decorating) {
      const newDecor: PlacedDecoration = {
        id: `decor-${Date.now()}-${Math.round(Math.random() * 999)}`,
        type: selectedDecorType,
        mapId: currentMap,
        x: targetX,
        y: targetY,
        placedBy: currentRole
      };
      const next = [...decorations.slice(-19), newDecor];
      void saveDecorationsToCloud(next);
      triggerHeartBurst(targetX, targetY - 6, "✨");
      return;
    }

    setTapTarget({ x: targetX, y: targetY, key: Date.now() });
    moveMyCharacterTo({ x: targetX, y: targetY }, "walk", "idle", undefined, 3200, null);
  };

  const handleDecorationClick = (e: React.MouseEvent, item: PlacedDecoration) => {
    e.stopPropagation();
    if (decorating) {
      const next = decorations.filter((d) => d.id !== item.id);
      void saveDecorationsToCloud(next);
      return;
    }
    moveMyCharacterTo(
      { x: clamp(item.x + (currentRole === "belle" ? -5 : 5), 14, 86), y: clamp(item.y + 2, 48, 84) },
      "walk",
      "happy",
      "✿",
      2400,
      null
    );
  };

  const handlePetCharacter = (event: React.MouseEvent, role: Role) => {
    event.stopPropagation();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const pos = positions[role];
    if (role === currentRole) {
      const nowMs = Date.now();
      setTemporaryMood(currentRole, "love", 2600, t.pettedReaction);
      void addAffectionExp(5, t.coopPet, { x: pos.x, y: pos.y - 12 }, "♡");
      void syncMyStateToCloud({
        liveMood: "love",
        speechText: t.pettedReaction,
        speechAtMs: nowMs,
        actionAtMs: nowMs
      });
    } else {
      void triggerCoopInteraction("pet");
    }
  };

  // Real-time Co-op Action + Affection Level Up!
  const triggerCoopInteraction = async (type: CoopActionType) => {
    setContextMenu(null);
    const myPos = positions[currentRole];
    const otherPos = positions[otherRole];
    const sameMap = maps[currentRole] === maps[otherRole];

    const centerX = sameMap ? Math.round((myPos.x + otherPos.x) / 2) : myPos.x;
    const centerY = sameMap ? Math.round((myPos.y + otherPos.y) / 2) : myPos.y;

    const gainMap: Record<CoopActionType, number> = {
      pet: 10,
      hug: 20,
      kiss: 20,
      feed: 15,
      flower: 15,
      dance: 20,
      jump: 15,
      highfive: 15,
      photo: 25,
      nap: 20
    };
    const labelMap: Record<CoopActionType, string> = {
      pet: t.coopPet,
      hug: t.coopHug,
      kiss: t.coopKiss,
      feed: t.coopFeed,
      flower: t.coopFlower,
      dance: t.coopDance,
      jump: t.coopJump,
      highfive: t.coopHighfive,
      photo: t.coopPhoto,
      nap: t.coopNap
    };

    const gain = gainMap[type] || 15;
    const evt: CoopEventPayload = {
      id: `${Date.now()}-${currentRole}`,
      type,
      fromRole: currentRole,
      mapId: currentMap,
      centerX: clamp(centerX, 24, 76),
      centerY: clamp(centerY, 52, 80),
      affectionGain: gain,
      createdAtMs: Date.now()
    };

    lastProcessedCoopId.current = evt.id;
    executeCoopEventLocally(evt);

    const myNewX = currentRole === "belle" ? clamp(evt.centerX - 7, 16, 82) : clamp(evt.centerX + 7, 18, 84);
    const myNewY = currentRole === "belle" ? evt.centerY : clamp(evt.centerY + 1, 50, 82);

    const nextMood: PetMood =
      type === "feed"
        ? "snack"
        : type === "nap"
          ? "sleep"
          : type === "jump" || type === "dance" || type === "highfive"
            ? "jump"
            : "love";

    void syncMyStateToCloud({
      x: myNewX,
      y: myNewY,
      direction: currentRole === "belle" ? 1 : -1,
      activeSpotId: null,
      liveMood: nextMood,
      actionAtMs: Date.now()
    });

    const cur = worldPropsRef.current;
    const nextProps: WorldEnvironmentProps = {
      ...cur,
      affectionExp: (cur.affectionExp || 120) + gain,
      interactionCount: (cur.interactionCount || 8) + 1,
      lastInteractionText: `${labelMap[type]} (+${gain} ♥)`,
      lastInteractionAtMs: Date.now()
    };
    persistWorldPropsLocal(nextProps);

    await syncWorldStateToCloud({ coopEvent: evt, worldProps: nextProps });
  };

  const handleApproachPartner = () => {
    setContextMenu(null);
    if (maps[otherRole] !== currentMap) {
      changeMyMap(maps[otherRole], {
        x: clamp(positions[otherRole].x + (currentRole === "belle" ? -9 : 9), 18, 82),
        y: clamp(positions[otherRole].y, 52, 82)
      });
      return;
    }
    const otherPos = positions[otherRole];
    const target: Point2D = {
      x: clamp(otherPos.x + (currentRole === "belle" ? -8 : 8), 14, 86),
      y: clamp(otherPos.y, 48, 84)
    };
    moveMyCharacterTo(target, "walk", "happy", "♡", 2600, activeSpots[otherRole]);
    triggerHeartBurst(otherPos.x, otherPos.y - 12);
  };

  const handleSendSpeechBubble = (textToUse?: string) => {
    const clean = (textToUse ?? speechDraft).trim();
    if (!clean) return;
    setSpeechDraft("");
    setContextMenu(null);
    const pos = positions[currentRole];
    const nowMs = Date.now();
    setTemporaryMood(currentRole, "happy", 4500, clean);
    void addAffectionExp(5, clean, { x: pos.x, y: pos.y - 14 }, "💬");
    void syncMyStateToCloud({
      liveMood: "happy",
      speechText: clean,
      speechAtMs: nowMs,
      actionAtMs: nowMs
    });
  };

  const openMyEditor = () => {
    setContextMenu(null);
    setDraft(profiles[currentRole]);
    setPhotoError("");
    setEditing(true);
  };

  const quickSwitchBelleSpecies = async (species: BelleSpecies) => {
    if (currentRole !== "belle") {
      showOwnershipToast();
      return;
    }
    const updatedBelle: CharacterProfile = {
      ...profiles.belle,
      role: "belle",
      species
    };
    const next = { ...profiles, belle: updatedBelle };
    persistLocal(next);
    triggerHeartBurst(positions.belle.x, positions.belle.y - 10, "✨");
    setTemporaryMood("belle", "jump", 1800);
    if (editing) {
      setDraft((prev) => ({ ...prev, species }));
    }
    await syncMyStateToCloud({ species, liveMood: "jump", actionAtMs: Date.now() });
  };

  const handlePlaceGift = async () => {
    const text = giftTextDraft.trim() || profiles[currentRole].message || "♡";
    const pos = positions[currentRole];
    const newGift: GardenGiftNote = {
      id: `${Date.now()}`,
      icon: giftIconDraft,
      message: text,
      fromRole: currentRole,
      fromName: profiles[currentRole].name,
      mapId: currentMap,
      x: clamp(pos.x + (currentRole === "belle" ? 5 : -5), 18, 82),
      y: clamp(pos.y + 3, 52, 82),
      createdAtMs: Date.now()
    };
    setGardenGift(newGift);
    localStorage.setItem(GARDEN_GIFT_STORAGE_KEY, JSON.stringify(newGift));
    setGiftModalOpen(false);
    setGiftTextDraft("");

    const cur = worldPropsRef.current;
    const nextProps: WorldEnvironmentProps = {
      ...cur,
      affectionExp: (cur.affectionExp || 120) + 20,
      interactionCount: (cur.interactionCount || 8) + 1,
      lastInteractionText: `${t.leaveGift} (+20 ♥)`,
      lastInteractionAtMs: Date.now()
    };
    persistWorldPropsLocal(nextProps);
    triggerHeartBurst(newGift.x, newGift.y - 6, "🎁", "+20 ♥");

    await syncWorldStateToCloud({ giftNote: newGift, worldProps: nextProps });
  };

  const handleRemoveGift = async () => {
    setGardenGift(null);
    setGiftOpenView(false);
    localStorage.removeItem(GARDEN_GIFT_STORAGE_KEY);
    await syncWorldStateToCloud({ giftNote: null });
  };

  const handleDraftPhotoSelect = async (file: File) => {
    setPhotoUploading(true);
    setPhotoError("");
    try {
      const dataUrl = await compressAvatarDataUrl(file, 256);
      setDraft((prev) => ({ ...prev, photoUrl: dataUrl }));
    } catch {
      setPhotoError(t.photoError);
    } finally {
      setPhotoUploading(false);
    }
  };

  const saveProfile = async () => {
    const clean: CharacterProfile = {
      ...profiles[currentRole],
      ...draft,
      role: currentRole,
      name: draft.name.trim() || defaults[currentRole].name,
      message: draft.message.trim(),
      species: currentRole === "partner" ? "dog" : draft.species === "rabbit" ? "rabbit" : "cat",
      photoUrl: draft.photoUrl || ""
    };
    const next = { ...profiles, [currentRole]: clean };
    persistLocal(next);
    setSyncState(isFirebaseConfigured && auth?.currentUser ? "waiting" : "local");

    if (onUserPhotoChange && clean.photoUrl !== (userPhotoUrl || "")) {
      await onUserPhotoChange(clean.photoUrl || "");
    }

    await syncMyStateToCloud({
      name: clean.name,
      birthday: clean.birthday,
      message: clean.message,
      species: clean.species,
      photoUrl: clean.photoUrl || ""
    });

    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      setEditing(false);
    }, 600);
  };

  const statusText = syncState === "synced" ? t.synced : syncState === "waiting" ? t.syncWait : t.local;

  const isOtherOnline = useMemo(() => {
    const last = profiles[otherRole].lastActiveMs;
    if (!last) return false;
    return Date.now() - last < 5 * 60 * 1000;
  }, [profiles, otherRole]);

  const currentMapDecors = useMemo(
    () => decorations.filter((d) => d.mapId === currentMap),
    [decorations, currentMap]
  );

  const stageBgImage =
    currentMap === "belle_house"
      ? characterAsset("belle-room-bg.webp")
      : currentMap === "partner_house"
        ? characterAsset("partner-room-bg.webp")
        : characterAsset("garden-meadow-bg.webp");

  const treeStage = getCoupleTreeStage(worldProps.coupleTreeExp || 0);
  const levelInfo = useMemo(
    () => getCoupleLevelInfo(worldProps.affectionExp || 120, lang),
    [worldProps.affectionExp, lang]
  );

  const getDepthStyle = (role: Role): React.CSSProperties => {
    const pos = positions[role];
    const spot = activeSpots[role];
    const depthRatio = (pos.y - 44) / 44;
    const depthScale = Number((0.86 + depthRatio * 0.2).toFixed(3));
    const baseZ = Math.round(pos.y);
    const zIndex = spot === "garden_bench" ? 56 : spot === "bed" ? 66 : baseZ;
    return {
      left: `${pos.x}%`,
      top: `${pos.y}%`,
      zIndex,
      "--pet-depth-scale": depthScale,
      "--pet-move-duration": `${moveDurations[role]}s`
    } as React.CSSProperties;
  };

  const renderMinimapPin = (targetMapId: WorldMapId) => {
    const belleHere = maps.belle === targetMapId;
    const partnerHere = maps.partner === targetMapId;
    if (!belleHere && !partnerHere) return null;
    return (
      <span className="hud-minimap-node-avatars">
        {belleHere && (
          <i className={`mini-dot ${currentRole === "belle" ? "is-me" : ""}`}>
            {profiles.belle.species === "rabbit" ? "🐰" : "🐱"}
          </i>
        )}
        {partnerHere && (
          <i className={`mini-dot ${currentRole === "partner" ? "is-me" : ""}`}>🐶</i>
        )}
      </span>
    );
  };

  return (
    <section className="character-world" aria-labelledby="character-world-title">
      {/* Compact & Clean Header Row */}
      <div className="character-world-topbar">
        <div className="topbar-left-group">
          <button type="button" className="character-back" onClick={onBack}>
            <RotateCcw size={15} /> {t.back}
          </button>
          <div className="compact-world-title">
            <h2 id="character-world-title">{t.title}</h2>
            <span className={`character-sync ${syncState}`}>
              <i /> {statusText}
            </span>
          </div>
        </div>

        <div className="character-topbar-right">
          {/* Partner Live Status & Instant Follow Pill */}
          <button
            type="button"
            className={`partner-location-pill ${isOtherOnline ? "online" : ""}`}
            onClick={handleApproachPartner}
          >
            <span className="online-dot" />
            <strong>{profiles[otherRole].name}</strong>
            <span>· {mapLabel(maps[otherRole])}</span>
            <em className="follow-link">
              <Navigation size={11} /> {maps[otherRole] !== currentMap ? t.followPartner : t.approachPartnerBtn}
            </em>
          </button>

          <button type="button" className="character-profile-quick-btn" onClick={openMyEditor}>
            <Pencil size={13} /> {t.editProfileBtn}
          </button>
        </div>
      </div>

      {ownershipNotice && (
        <div className="ownership-toast" role="status">
          <Heart size={14} fill="currentColor" /> {ownershipNotice}
        </div>
      )}

      {/* =====================================================================
          FIXED 100% VIEWPORT STAGE (No auto-scroll panning, bright & crisp!)
          ===================================================================== */}
      <div
        ref={stageRef}
        className={`character-stage map-${currentMap} theme-${timeOfDay} ${decorating ? "is-decorating" : ""}`}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          openStageContextMenu("ground", e.clientX, e.clientY);
        }}
      >
        <div className="stage-lighting-overlay" aria-hidden="true" />
        {cameraFlashActive && <div className="stage-camera-flash" aria-hidden="true" />}

        {/* Map Transition Banner */}
        {mapTransitionBanner && (
          <div className="map-transition-banner" role="status">
            <MapPin size={14} /> {mapTransitionBanner}
          </div>
        )}

        {/* ===============================================================
            TOP-LEFT MINIMAL HUD MINI-MAP (Compact 3-Space Pill + Optional Radar)
            =============================================================== */}
        <aside
          className={`stage-hud-minimap stage-hud-ignore ${minimapExpanded ? "expanded" : "collapsed"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hud-minimap-bar">
            <button
              type="button"
              className="hud-radar-toggle-btn"
              onClick={() => setMinimapExpanded((prev) => !prev)}
              title="미니맵 레이더 펼치기/접기"
            >
              <Compass size={13} />
            </button>
            <button
              type="button"
              className={`hud-map-node ${currentMap === "belle_house" ? "active" : ""}`}
              onClick={() => changeMyMap("belle_house")}
            >
              <span>{t.shortBelleHouse}</span>
              {renderMinimapPin("belle_house")}
            </button>
            <button
              type="button"
              className={`hud-map-node ${currentMap === "garden" ? "active" : ""}`}
              onClick={() => changeMyMap("garden")}
            >
              <span>{t.shortGarden}</span>
              {renderMinimapPin("garden")}
            </button>
            <button
              type="button"
              className={`hud-map-node ${currentMap === "partner_house" ? "active" : ""}`}
              onClick={() => changeMyMap("partner_house")}
            >
              <span>{t.shortPartnerHouse}</span>
              {renderMinimapPin("partner_house")}
            </button>
          </div>

          {minimapExpanded && (
            <div className="hud-minimap-body">
              <div className="hud-live-radar" title="현재 공간 내 위치">
                <span
                  className="radar-dot me-dot"
                  style={{
                    left: `${positions[currentRole].x}%`,
                    top: `${((positions[currentRole].y - 42) / 48) * 100}%`
                  }}
                >
                  {currentRole === "belle"
                    ? profiles.belle.species === "rabbit"
                      ? "🐰"
                      : "🐱"
                    : "🐶"}
                </span>
                {maps[otherRole] === currentMap && (
                  <span
                    className="radar-dot partner-dot"
                    style={{
                      left: `${positions[otherRole].x}%`,
                      top: `${((positions[otherRole].y - 42) / 48) * 100}%`
                    }}
                  >
                    {otherRole === "belle"
                      ? profiles.belle.species === "rabbit"
                        ? "🐰"
                        : "🐱"
                      : "🐶"}
                  </span>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ===============================================================
            TOP-RIGHT MINIMAL HUD: COUPLE LEVEL & AFFECTION CAPSULE
            =============================================================== */}
        <div
          className="stage-hud-affection stage-hud-ignore"
          onClick={(e) => {
            e.stopPropagation();
            setAffectionModalOpen(true);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAffectionModalOpen(true)}
        >
          <div className="affection-hud-top">
            <span className="affection-level-pill">
              {levelInfo.badge} Lv.{levelInfo.level}
            </span>
            <strong className="affection-title-text">{levelInfo.title}</strong>
            <span className="affection-heart-count">
              <Heart size={11} fill="#e25b64" color="#e25b64" /> {levelInfo.exp}
            </span>
          </div>
          <div className="affection-progress-track">
            <div className="affection-progress-fill" style={{ width: `${levelInfo.pct}%` }} />
          </div>
        </div>

        {/* Fixed 100% Canvas */}
        <div
          className={`world-fixed-canvas map-bg-${currentMap}`}
          style={{ backgroundImage: `url("${stageBgImage}")` }}
        >
          {/* =========================================================
               MAP 1: CENTRAL GARDEN ("garden") — Pure Illustrated Assets Only
              ========================================================= */}
          {currentMap === "garden" && (
            <>
              {/* Belle's Fairy-Tale Cottage */}
              <button
                type="button"
                className="cottage-portal belle-cottage"
                style={{ left: "20%", top: "41%", zIndex: 43 }}
                onClick={(e) =>
                  walkAndTransitionToMap(e, { x: 20, y: 52 }, "belle_house", { x: 50, y: 76 })
                }
                aria-label={t.enterBelleHouse}
              >
                <img src={characterAsset("belle-cottage.webp")} alt="" />
                <span className="cottage-door-badge">
                  <Home size={11} /> {t.mapBelleHouse}
                  {maps.belle === "belle_house" && <i className="inside-tag">🐱</i>}
                  {maps.partner === "belle_house" && <i className="inside-tag">🐶</i>}
                </span>
              </button>

              {/* Partner's Cozy Cottage */}
              <button
                type="button"
                className="cottage-portal partner-cottage"
                style={{ left: "80%", top: "41%", zIndex: 43 }}
                onClick={(e) =>
                  walkAndTransitionToMap(e, { x: 80, y: 52 }, "partner_house", { x: 50, y: 76 })
                }
                aria-label={t.enterPartnerHouse}
              >
                <img src={characterAsset("partner-cottage.webp")} alt="" />
                <span className="cottage-door-badge">
                  <Home size={11} /> {t.mapPartnerHouse}
                  {maps.belle === "partner_house" && <i className="inside-tag">🐱</i>}
                  {maps.partner === "partner_house" && <i className="inside-tag">🐶</i>}
                </span>
              </button>

              {/* Central Wooden Bench & Street Lamp (Pure illustration, no sticker badge) */}
              <button
                type="button"
                className={`garden-center-bench-sprite interactive-bench ${sharedActiveSpot === "garden_bench" ? "synergy-active" : ""}`}
                style={{ left: "50%", top: "49%", zIndex: 50 }}
                onClick={(e) => void handleInteractiveSpotClick(e, "garden_bench")}
                aria-label={t.spotBenchLabel}
              >
                {sharedActiveSpot === "garden_bench" && (
                  <span className="spot-synergy-arch bench-heart-arch">💞</span>
                )}
                <img src={characterAsset("garden-bench-prop.webp")} alt="" />
                {(timeOfDay !== "day" ||
                  activeSpots.belle === "garden_bench" ||
                  activeSpots.partner === "garden_bench") && <span className="bench-lantern-glow" />}
              </button>
            </>
          )}

          {/* =========================================================
              MAP 2 & 3: BELLE'S HOUSE & PARTNER'S HOUSE INTERIORS
              ========================================================= */}
          {(currentMap === "belle_house" || currentMap === "partner_house") && (
            <>
              <div className="wide-room-sunbeam" aria-hidden="true" />

              {/* Subtle Clickable Zone over the Illustrated Tea Table (No floating emoji sticker) */}
              <button
                type="button"
                className={`room-clean-zone table-spot ${sharedActiveSpot === "tea_table" ? "synergy-active" : ""}`}
                style={{ left: "24%", top: "58%" }}
                onClick={(e) => void handleInteractiveSpotClick(e, "tea_table")}
                aria-label={t.spotTableLabel}
              />

              {/* Subtle Clickable Zone over the Illustrated Bed (No floating emoji sticker) */}
              <button
                type="button"
                className={`room-clean-zone bed-spot ${sharedActiveSpot === "bed" ? "synergy-active" : ""}`}
                style={{ left: "75%", top: "52%" }}
                onClick={(e) => void handleInteractiveSpotClick(e, "bed")}
                aria-label={t.spotBedLabel}
              />

              {/* Exit Mat to Central Garden */}
              <button
                type="button"
                className={`room-exit-mat ${currentMap === "belle_house" ? "belle-mat" : "partner-mat"}`}
                style={{ left: "50%", zIndex: 92 }}
                onClick={(e) =>
                  walkAndTransitionToMap(
                    e,
                    { x: 50, y: 81 },
                    "garden",
                    currentMap === "belle_house" ? { x: 20, y: 55 } : { x: 80, y: 55 }
                  )
                }
              >
                <DoorOpen size={14} />
                <span>{t.exitToGarden}</span>
              </button>
            </>
          )}

          {/* Placed Illustrated Decorations on Current Map */}
          {currentMapDecors.map((item) => {
            const catalogEntry = DECOR_CATALOG.find((c) => c.type === item.type);
            if (!catalogEntry?.sprite) return null;
            return (
              <button
                key={item.id}
                type="button"
                className={`placed-decor-item type-${item.type} ${decorating ? "removable" : ""}`}
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  zIndex: Math.round(item.y) - 1
                }}
                onClick={(e) => handleDecorationClick(e, item)}
                title={catalogEntry.label[lang]}
              >
                <img src={characterAsset(catalogEntry.sprite)} alt={catalogEntry.label[lang]} />
                {decorating && <span className="decor-remove-badge">×</span>}
              </button>
            );
          })}

          {/* Fireflies at night/sunset in outdoor maps */}
          {currentMap === "garden" && timeOfDay !== "day" && (
            <div className="garden-fireflies" aria-hidden="true">
              <i className="ff-1" />
              <i className="ff-2" />
              <i className="ff-3" />
              <i className="ff-4" />
              <i className="ff-5" />
            </div>
          )}

          {/* Tap-to-move ripple indicator */}
          {tapTarget && (
            <div
              key={tapTarget.key}
              className="garden-tap-ripple"
              style={{ left: `${tapTarget.x}%`, top: `${tapTarget.y}%` }}
              aria-hidden="true"
            >
              <span>✿</span>
            </div>
          )}

          {/* Gift Note placed on Current Map */}
          {gardenGift && (gardenGift.mapId || "garden") === currentMap && (
            <button
              type="button"
              className="garden-gift-marker"
              style={{
                left: `${gardenGift.x}%`,
                top: `${gardenGift.y}%`,
                zIndex: Math.round(gardenGift.y)
              }}
              onClick={(e) => {
                e.stopPropagation();
                moveMyCharacterTo({ x: clamp(gardenGift.x - 4, 14, 86), y: gardenGift.y }, "run", "happy");
                setGiftOpenView(true);
              }}
            >
              <span className="gift-sparkle">✨</span>
              <span className="gift-emoji">{GIFT_ICONS[gardenGift.icon]}</span>
              <span className="gift-shadow" />
            </button>
          )}

          {/* Floating Heart & Affection Bursts */}
          {burstHearts.map((burst) => (
            <div
              key={burst.id}
              className="garden-heart-burst"
              style={{ left: `${burst.x}%`, top: `${burst.y}%`, zIndex: 130 }}
              aria-hidden="true"
            >
              <span>{burst.symbol || "♡"}</span>
              {burst.label ? <b className="burst-exp-tag">{burst.label}</b> : <span>✨</span>}
              <span>♥</span>
            </div>
          ))}

          {/* Belle Character */}
          {maps.belle === currentMap && (
            <button
              type="button"
              className={`roaming-pet belle ${mood.belle} ${currentRole === "belle" ? "is-mine" : "is-partner"} ${activeSpots.belle ? `on-spot-${activeSpots.belle}` : ""}`}
              style={getDepthStyle("belle")}
              onClick={(e) => handlePetCharacter(e, "belle")}
              onPointerDown={(e) => {
                if (e.button === 2) return;
                e.stopPropagation();
                startLongPress(currentRole === "belle" ? "me" : "partner", e.clientX, e.clientY);
              }}
              onPointerUp={clearLongPressTimer}
              onPointerCancel={clearLongPressTimer}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openStageContextMenu(currentRole === "belle" ? "me" : "partner", e.clientX, e.clientY);
              }}
              aria-label={profiles.belle.name}
            >
              {(speechBubble.belle ||
                mood.belle === "love" ||
                mood.belle === "sleep" ||
                mood.belle === "happy" ||
                mood.belle === "snack") && (
                <span className="pet-thought">
                  {speechBubble.belle ||
                    (mood.belle === "love"
                      ? "♡"
                      : mood.belle === "sleep"
                        ? "Zzz"
                        : mood.belle === "snack"
                          ? "🍓♪"
                          : "♪")}
                </span>
              )}
              <div className="pet-body-motion">
                <img src={belleSprite} alt="" style={{ transform: `scaleX(${directions.belle})` }} />
              </div>
              <span className="pet-ground-shadow" aria-hidden="true" />
              <span className="pet-name">
                {profiles.belle.photoUrl && <img src={profiles.belle.photoUrl} alt="" className="pet-mini-avatar" />}
                {profiles.belle.name}
                {currentRole === "belle" && <b className="my-pet-pill">{t.myCharacterBadge}</b>}
              </span>
              {isBirthdayToday(profiles.belle.birthday) && <span className="birthday-pin">🎂</span>}
            </button>
          )}

          {/* Partner Puppy Character */}
          {maps.partner === currentMap && (
            <button
              type="button"
              className={`roaming-pet partner ${mood.partner} ${currentRole === "partner" ? "is-mine" : "is-partner"} ${activeSpots.partner ? `on-spot-${activeSpots.partner}` : ""}`}
              style={getDepthStyle("partner")}
              onClick={(e) => handlePetCharacter(e, "partner")}
              onPointerDown={(e) => {
                if (e.button === 2) return;
                e.stopPropagation();
                startLongPress(currentRole === "partner" ? "me" : "partner", e.clientX, e.clientY);
              }}
              onPointerUp={clearLongPressTimer}
              onPointerCancel={clearLongPressTimer}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openStageContextMenu(currentRole === "partner" ? "me" : "partner", e.clientX, e.clientY);
              }}
              aria-label={profiles.partner.name}
            >
              {(speechBubble.partner ||
                mood.partner === "love" ||
                mood.partner === "sleep" ||
                mood.partner === "happy" ||
                mood.partner === "snack") && (
                <span className="pet-thought">
                  {speechBubble.partner ||
                    (mood.partner === "love"
                      ? "♡"
                      : mood.partner === "sleep"
                        ? "Zzz"
                        : mood.partner === "snack"
                          ? "🍓♪"
                          : "♪")}
                </span>
              )}
              <div className="pet-body-motion">
                <img src={partnerSprite} alt="" style={{ transform: `scaleX(${directions.partner})` }} />
              </div>
              <span className="pet-ground-shadow" aria-hidden="true" />
              <span className="pet-name">
                {profiles.partner.photoUrl && <img src={profiles.partner.photoUrl} alt="" className="pet-mini-avatar" />}
                {profiles.partner.name}
                {currentRole === "partner" && <b className="my-pet-pill">{t.myCharacterBadge}</b>}
              </span>
              {isBirthdayToday(profiles.partner.birthday) && <span className="birthday-pin">🎂</span>}
            </button>
          )}
        </div>

        {/* Show hint banner ONLY when decorating mode is active */}
        {decorating && <div className="garden-stage-hint">{t.tapHintDecor}</div>}

        {/* ===============================================================
            FLOATING CONTEXT MENU (Right-Click on PC / Long-Press on Mobile)
            =============================================================== */}
        {contextMenu && (
          <div
            className="stage-context-menu-backdrop stage-hud-ignore"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
            }}
          >
            <div
              className="stage-context-menu-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="context-menu-header">
                <strong>
                  {contextMenu.targetType === "me"
                    ? `🐾 ${t.menuTitleMe}`
                    : contextMenu.targetType === "partner"
                      ? `💞 ${t.menuTitlePartner}`
                      : `🌿 ${t.menuTitleGround}`}
                </strong>
                <button type="button" className="context-close-btn" onClick={() => setContextMenu(null)}>
                  <X size={15} />
                </button>
              </div>

              {/* Inline Speech Bubble Input & Quick Chips */}
              <form
                className="context-speech-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendSpeechBubble();
                }}
              >
                <MessageCircleHeart size={15} />
                <input
                  type="text"
                  maxLength={28}
                  placeholder={t.speechPlaceholder}
                  value={speechDraft}
                  onChange={(e) => setSpeechDraft(e.target.value)}
                />
                <button type="submit">
                  <Send size={13} /> {t.speechSend}
                </button>
              </form>

              <div className="context-quick-chips">
                {t.quickChips.map((chip) => (
                  <button key={chip} type="button" onClick={() => handleSendSpeechBubble(chip)}>
                    {chip}
                  </button>
                ))}
              </div>

              {/* Couple Interactions Grid (+Affection EXP) */}
              <div className="context-section-label">💞 둘만의 실시간 교감 (+애정도 ♥)</div>
              <div className="context-action-grid">
                <button type="button" onClick={() => void triggerCoopInteraction("pet")}>
                  <span>👋</span> {t.coopPet} <em>+10♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("hug")}>
                  <span>🤗</span> {t.coopHug} <em>+20♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("kiss")}>
                  <span>💋</span> {t.coopKiss} <em>+20♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("feed")}>
                  <span>🍓</span> {t.coopFeed} <em>+15♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("dance")}>
                  <span>🎶</span> {t.coopDance} <em>+20♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("flower")}>
                  <span>🌷</span> {t.coopFlower} <em>+15♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("jump")}>
                  <span>✨</span> {t.coopJump} <em>+15♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("highfive")}>
                  <span>🙌</span> {t.coopHighfive} <em>+15♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("photo")}>
                  <span>📸</span> {t.coopPhoto} <em>+25♥</em>
                </button>
                <button type="button" onClick={() => void triggerCoopInteraction("nap")}>
                  <span>💤</span> {t.coopNap} <em>+20♥</em>
                </button>
              </div>

              {/* Character & World Tools */}
              <div className="context-section-label">🛠️ 캐릭터 · 공간 옵션</div>
              <div className="context-utility-row">
                {contextMenu.targetType === "ground" && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = resolveWalkableTarget(contextMenu.stageX, contextMenu.stageY, currentMap);
                      setContextMenu(null);
                      setTapTarget({ x: target.x, y: target.y, key: Date.now() });
                      moveMyCharacterTo(target, "walk", "idle");
                    }}
                  >
                    🚶 {t.walkHereBtn}
                  </button>
                )}

                {currentRole === "belle" && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextSp = profiles.belle.species === "rabbit" ? "cat" : "rabbit";
                      void quickSwitchBelleSpecies(nextSp);
                      setContextMenu(null);
                    }}
                  >
                    {profiles.belle.species === "rabbit" ? "🐱 아기 고양이로 변신" : "🐰 아기 토끼로 변신"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    setGiftModalOpen(true);
                  }}
                >
                  🎁 {t.leaveGift}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    setDecorating((prev) => !prev);
                  }}
                >
                  🌷 {decorating ? t.decorateDone : t.decorateBtn}
                </button>

                <button type="button" onClick={openMyEditor}>
                  🪪 {t.editProfileBtn}
                </button>
              </div>

              {/* Bright / Sunset / Night Lighting Toggle inside Menu */}
              <div className="context-time-row">
                <button
                  type="button"
                  className={timeMode === "day" ? "active" : ""}
                  onClick={() => updateTimeTheme("day")}
                >
                  <Sun size={13} /> {t.timeDay}
                </button>
                <button
                  type="button"
                  className={timeMode === "sunset" ? "active" : ""}
                  onClick={() => updateTimeTheme("sunset")}
                >
                  <Sunset size={13} /> {t.timeSunset}
                </button>
                <button
                  type="button"
                  className={timeMode === "night" ? "active" : ""}
                  onClick={() => updateTimeTheme("night")}
                >
                  <Moon size={13} /> {t.timeNight}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Decoration Palette Drawer (Only shown when Decorating mode is active) */}
      {decorating && (
        <div className="garden-decor-palette" role="region" aria-label={t.decorateBtn}>
          <div className="decor-palette-header">
            <strong>
              <Flower2 size={15} /> {t.decorateBtn}
            </strong>
            <div className="decor-palette-actions">
              <button
                type="button"
                className="decor-reset-btn"
                onClick={() => void saveDecorationsToCloud(DEFAULT_DECORS)}
              >
                {t.decorateReset}
              </button>
              <button type="button" className="decor-done-btn" onClick={() => setDecorating(false)}>
                <Check size={14} /> {t.decorateDone}
              </button>
            </div>
          </div>
          <div className="decor-item-strip">
            {DECOR_CATALOG.map((item) => (
              <button
                key={item.type}
                type="button"
                className={`decor-choice-btn ${selectedDecorType === item.type ? "active" : ""}`}
                onClick={() => setSelectedDecorType(item.type)}
              >
                {item.sprite ? (
                  <img src={characterAsset(item.sprite)} alt="" />
                ) : (
                  <span className="decor-choice-emoji">{item.emoji}</span>
                )}
                <span>{item.label[lang]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Couple Level & Affection Details Modal */}
      {affectionModalOpen && (
        <div className="character-modal-backdrop" onClick={() => setAffectionModalOpen(false)}>
          <div className="character-modal gift-modal" onClick={(e) => e.stopPropagation()}>
            <div className="character-modal-head">
              <h3>
                {levelInfo.badge} {t.affectionTitle}
              </h3>
              <button type="button" onClick={() => setAffectionModalOpen(false)} aria-label={t.cancel}>
                <X size={18} />
              </button>
            </div>
            <div className="affection-modal-summary">
              <div className="affection-big-badge">
                <span>{levelInfo.badge}</span>
                <div>
                  <strong>
                    Lv.{levelInfo.level} · {levelInfo.title}
                  </strong>
                  <small>
                    누적 애정도 {levelInfo.exp} ♥ (다음 레벨까지 {Math.max(0, levelInfo.curNext - levelInfo.exp)} ♥) · 총 교감{" "}
                    {worldProps.interactionCount || 8}회
                  </small>
                </div>
              </div>
              <div className="affection-progress-track large">
                <div className="affection-progress-fill" style={{ width: `${levelInfo.pct}%` }} />
              </div>
              <p className="gift-modal-desc">{t.affectionDesc}</p>
            </div>
            <div className="context-action-grid">
              <button
                type="button"
                onClick={() => {
                  setAffectionModalOpen(false);
                  void triggerCoopInteraction("hug");
                }}
              >
                <span>🤗</span> {t.coopHug} <em>+20♥</em>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAffectionModalOpen(false);
                  void triggerCoopInteraction("kiss");
                }}
              >
                <span>💋</span> {t.coopKiss} <em>+20♥</em>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAffectionModalOpen(false);
                  void triggerCoopInteraction("photo");
                }}
              >
                <span>📸</span> {t.coopPhoto} <em>+25♥</em>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAffectionModalOpen(false);
                  void triggerCoopInteraction("dance");
                }}
              >
                <span>🎶</span> {t.coopDance} <em>+20♥</em>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Leave a Gift / Note */}
      {giftModalOpen && (
        <div className="character-modal-backdrop" onClick={() => setGiftModalOpen(false)}>
          <div
            className="character-modal gift-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gift-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="character-modal-head">
              <h3 id="gift-modal-title">{t.giftModalTitle}</h3>
              <button type="button" onClick={() => setGiftModalOpen(false)} aria-label={t.cancel}>
                <X size={18} />
              </button>
            </div>
            <p className="gift-modal-desc">{t.giftModalDesc}</p>
            <div className="gift-icon-picker" role="radiogroup" aria-label={t.giftIconLabel}>
              {(["gift", "letter", "strawberry", "flower"] as const).map((iconKey) => (
                <button
                  key={iconKey}
                  type="button"
                  className={giftIconDraft === iconKey ? "selected" : ""}
                  onClick={() => setGiftIconDraft(iconKey)}
                >
                  <span>{GIFT_ICONS[iconKey]}</span>
                </button>
              ))}
            </div>
            <label className="gift-input-label">
              <span>{t.giftMessageLabel}</span>
              <input
                type="text"
                maxLength={60}
                value={giftTextDraft}
                onChange={(e) => setGiftTextDraft(e.target.value)}
                placeholder={t.giftPlaceholder}
              />
            </label>
            <div className="character-modal-actions">
              <button type="button" onClick={() => setGiftModalOpen(false)}>
                {t.cancel}
              </button>
              <button type="button" className="primary" onClick={() => void handlePlaceGift()}>
                <Gift size={15} /> {t.giftPlaceBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Discovered Gift */}
      {giftOpenView && gardenGift && (
        <div className="character-modal-backdrop" onClick={() => setGiftOpenView(false)}>
          <div
            className="character-modal gift-view-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gift-view-icon">{GIFT_ICONS[gardenGift.icon]}</div>
            <span className="gift-view-from">
              {gardenGift.fromName} {t.giftFrom}
            </span>
            <p className="gift-view-message">“{gardenGift.message}”</p>
            <div className="character-modal-actions">
              <button type="button" onClick={() => void handleRemoveGift()}>
                <Trash2Icon /> {t.giftRemove}
              </button>
              <button type="button" className="primary" onClick={() => setGiftOpenView(false)}>
                <Heart size={15} /> {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit ONLY My Character & Profile */}
      {editing && (
        <div className="character-modal-backdrop" onClick={() => setEditing(false)}>
          <div
            className="character-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="character-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="character-modal-head">
              <div>
                <span className="editor-kicker">OUR GARDEN PROFILE</span>
                <h3 id="character-editor-title">{t.edit}</h3>
              </div>
              <button type="button" onClick={() => setEditing(false)} aria-label={t.cancel}>
                <X size={18} />
              </button>
            </div>

            <div className="character-editor-grid single-owner-editor">
              <section className="character-editor-card">
                <div className="editor-card-title">
                  <img
                    src={
                      currentRole === "partner"
                        ? characterAsset("partner-puppy.webp")
                        : draft.species === "rabbit"
                          ? characterAsset("belle-rabbit.webp")
                          : characterAsset("belle-cat.webp")
                    }
                    alt=""
                  />
                  <div>
                    <strong>{currentRole === "belle" ? "Belle" : "Partner"}</strong>
                    <span>{ currentRole === "partner" ? t.dog : draft.species === "rabbit" ? t.rabbit : t.cat }</span>
                  </div>
                </div>

                {/* User Profile Photo Upload */}
                <div className="character-photo-upload-box">
                  <span className="photo-box-label">{t.photoLabel}</span>
                  <div className="photo-box-controls">
                    <div className="photo-box-preview">
                      {draft.photoUrl ? (
                        <img src={draft.photoUrl} alt="Profile preview" />
                      ) : (
                        <Camera size={20} />
                      )}
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*,.heic,.heif"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleDraftPhotoSelect(file);
                      }}
                    />
                    <button
                      type="button"
                      className="photo-upload-btn"
                      disabled={photoUploading}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {photoUploading ? (
                        <>
                          <LoaderCircle size={14} className="spin-icon" /> {t.photoUploading}
                        </>
                      ) : (
                        <>
                          <Camera size={14} /> {draft.photoUrl ? t.photoChange : t.photoUpload}
                        </>
                      )}
                    </button>
                    {draft.photoUrl && (
                      <button
                        type="button"
                        className="photo-remove-btn"
                        onClick={() => setDraft((prev) => ({ ...prev, photoUrl: "" }))}
                      >
                        {t.photoRemove}
                      </button>
                    )}
                  </div>
                  {photoError && <p className="photo-upload-error">{photoError}</p>}
                </div>

                {currentRole === "belle" && (
                  <div className="species-picker" role="radiogroup" aria-label={t.choose}>
                    {(["cat", "rabbit"] as BelleSpecies[]).map((species) => (
                      <button
                        key={species}
                        type="button"
                        className={draft.species === species ? "selected" : ""}
                        onClick={() => setDraft((current) => ({ ...current, species }))}
                      >
                        <img src={characterAsset(`belle-${species}.webp`)} alt="" />
                        <span>{species === "cat" ? t.cat : t.rabbit}</span>
                      </button>
                    ))}
                  </div>
                )}

                <label>
                  <span>{t.name}</span>
                  <input
                    value={draft.name}
                    maxLength={20}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>

                <label>
                  <span>{t.birthday}</span>
                  <input
                    type="date"
                    value={draft.birthday}
                    onChange={(event) => setDraft((current) => ({ ...current, birthday: event.target.value }))}
                  />
                </label>

                <label>
                  <span>{t.message}</span>
                  <input
                    value={draft.message}
                    maxLength={42}
                    onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                  />
                </label>
              </section>
            </div>

            <div className="character-modal-actions">
              <button type="button" onClick={() => setEditing(false)}>
                {t.cancel}
              </button>
              <button type="button" className="primary" onClick={() => void saveProfile()}>
                {saved ? <Check size={15} /> : <Heart size={15} />}
                {saved ? t.saved : t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Trash2Icon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
    </svg>
  );
}
