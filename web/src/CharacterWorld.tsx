import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Cake,
  Camera,
  Check,
  DoorOpen,
  Flower2,
  Gift,
  Heart,
  Home,
  LoaderCircle,
  MessageCircleHeart,
  Moon,
  Navigation,
  Pencil,
  Rabbit,
  RotateCcw,
  Send,
  Sparkles,
  Sun,
  Sunset,
  Trash2,
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
type TimeThemeMode = "auto" | "day" | "sunset" | "night";
type TimeOfDay = "day" | "sunset" | "night";
export type WorldMapId = "garden" | "belle_house" | "partner_house";
type CoopActionType = "hug" | "feed" | "flower" | "jump" | "nap" | "pet";

export type InteractiveSpotId =
  | "wish_mailbox"
  | "couple_tree"
  | "garden_bench"
  | "campfire"
  | "sparkle_pond"
  | "star_observatory"
  | "tea_table"
  | "cozy_rug"
  | "bed";

export type WorldEnvironmentProps = {
  campfireLit?: boolean;
  coupleTreeExp?: number;
  lastWateredBy?: Role;
  petalShowerAtMs?: number;
  meteorShowerAtMs?: number;
};

export type CharacterProfile = {
  role: Role;
  name: string;
  birthday: string;
  message: string;
  species: BelleSpecies | "dog";
  photoUrl?: string;
  // Real-time multiplayer fields synced in couple_characters/{role} & topics/__garden_{role}
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
  createdAtMs: number;
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
  { id: "default-bed-left", type: "flower_pink", mapId: "garden", x: 14, y: 74, placedBy: "belle" },
  { id: "default-bed-right", type: "flower_lavender", mapId: "garden", x: 88, y: 66, placedBy: "partner" },
  { id: "default-bed-top", type: "flower_sun", mapId: "garden", x: 38, y: 58, placedBy: "belle" }
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
  },
  {
    type: "picnic_basket",
    emoji: "🧺",
    label: { ko: "피크닉 바구니", en: "Picnic Basket", zh: "野餐篮" }
  },
  {
    type: "tea_table",
    emoji: "🫖",
    label: { ko: "티타임 다과상", en: "Tea Set", zh: "下午茶桌" }
  },
  {
    type: "plush_cushion",
    emoji: "🧸",
    label: { ko: "폭신 인형 쿠션", en: "Plush Cushion", zh: "抱枕玩偶" }
  },
  {
    type: "fairy_lantern",
    emoji: "🏮",
    label: { ko: "요정 무드 랜턴", en: "Fairy Lantern", zh: "精灵小灯笼" }
  },
  {
    type: "potted_plant",
    emoji: "🪴",
    label: { ko: "초록 화분", en: "Potted Plant", zh: "绿植盆栽" }
  }
];

const defaults: Record<Role, CharacterProfile> = {
  belle: {
    role: "belle",
    name: "Belle",
    birthday: "",
    message: "오늘도 같이 놀자 ♡",
    species: "cat",
    photoUrl: "",
    x: 42,
    y: 66,
    direction: 1,
    currentMap: "garden",
    activeSpotId: null
  },
  partner: {
    role: "partner",
    name: "우리 강아지",
    birthday: "",
    message: "Belle 곁을 지키는 중",
    species: "dog",
    photoUrl: "",
    x: 58,
    y: 68,
    direction: -1,
    currentMap: "garden",
    activeSpotId: null
  }
};

const GIFT_ICONS: Record<GardenGiftNote["icon"], string> = {
  gift: "🎁",
  letter: "💌",
  strawberry: "🍓",
  flower: "🌷"
};

const copy = {
  ko: {
    eyebrow: "OUR 2.5D PANORAMA GARDEN & WIDE HOUSES",
    title: "둘만의 정원",
    subtitle: "넓어진 파노라마 정원과 아늑한 집을 오가며 벤치·모닥불·사랑나무·연못에서 실시간으로 교감해요.",
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
    local: "이 기기에 안전하게 저장 중",
    synced: "실시간 동기화 연결됨",
    syncWait: "Firebase 연결 시 실시간 동기화",
    birthdayToday: "오늘은 생일!",
    leaveGift: "선물·쪽지 놓기",
    emptyBirthday: "생일을 등록해 주세요",
    tapHintGarden: "바닥을 탭해 걷거나 좌우로 밀어 정원을 둘러보세요 · 벤치·모닥불·사랑나무·연못 터치!",
    tapHintHouse: "넓어진 방 안을 산책하거나 다과상·폭신 러그·침대를 탭해 쉬어보세요",
    tapHintDecor: "꾸미기 모드: 원하는 바닥 위치를 탭하면 소품이 배치돼요 (소품 탭 시 삭제)",
    timeAuto: "자동 시간",
    timeDay: "낮",
    timeSunset: "노을",
    timeNight: "밤",
    mapGarden: "둘만의 정원",
    mapBelleHouse: "Belle의 집",
    mapPartnerHouse: "강아지 집",
    enterBelleHouse: "Belle의 집 들어가기",
    enterPartnerHouse: "강아지 집 들어가기",
    exitToGarden: "정원으로 나가기",
    controllingLabel: "내가 조종 중",
    onlyMyCharacterNotice: "내 캐릭터만 직접 조종·수정할 수 있어요 ♡",
    partnerOnline: "실시간 접속 중",
    partnerOffline: "쉬는 중",
    followPartner: "따라가기 →",
    sameMapNear: "둘이 가까이 만났어요! 실시간으로 교감해 보세요",
    sameMapFar: "같은 공간에 있어요! 가까이 다가가 교감해 보세요",
    differentMapInfo: "님은 지금 다른 공간에 있어요",
    approachPartnerBtn: "옆으로 달려가기",
    coopHug: "포옹·코맞대기",
    coopFeed: "딸기 먹여주기",
    coopFlower: "꽃 선물하기",
    coopJump: "같이 폴짝 점프",
    coopNap: "나란히 낮잠",
    decorateBtn: "정원·집 꾸미기",
    decorateDone: "꾸미기 완료",
    decorateReset: "기본 배치로",
    speechPlaceholder: "내 캐릭터 머리 위에 띄울 말풍선 입력...",
    speechSend: "말하기",
    quickChips: ["♡", "보고싶어!", "벤치에 앉자 🪑", "모닥불 켜자 🔥", "우리 집 놀러와 🏡"],
    pettedReaction: "쓰담쓰담 좋아요 ♡",
    hugReaction: "꼭 안아줬어요 ♡",
    snackReaction: "아~ 딸기 맛있어! 🍓",
    flowerReaction: "향기로운 꽃 선물 🌷",
    jumpReaction: "신난다 폴짝! ✨",
    napReaction: "새근새근... Zzz",
    bedReaction: "폭신폭신 침대 최고야 Zzz",
    tableReaction: "달콤한 티타임 🍓♪",
    rugReaction: "우리 집 폭신 러그가 제일 아늑해 🧶♡",
    benchReaction: "벤치에 앉으니 살랑살랑 바람이 좋아 🍃",
    benchCoopReaction: "둘이 나란히 벤치에 앉으니까 너무 행복해 💞",
    campfireOnReaction: "모닥불을 피웠어요! 포근하고 따뜻해 🔥🍓",
    campfireOffReaction: "모닥불 위에서 도란도란 이야기해요 🧺",
    campfireCoopReaction: "둘이 모닥불 앞에 앉아 달콤한 불멍 타임 🔥💛",
    treeWaterReaction: "사랑나무야 쑥쑥 자라라! 💧🌸",
    treeCoopReaction: "둘이 함께 가꾼 사랑나무에서 꽃비가 내려요 🌸💞",
    pondReaction: "첨벙첨벙! 연못 물장구 시원해 🐠🫧",
    pondCoopReaction: "연못 위로 반딧불이와 수련이 피어올라요 ✨🪷",
    mailboxReaction: "우체통에 설레는 마음을 담아요 📮💌",
    starReaction: "별자리 망원경 너머로 별똥별이 떨어져요 🌠",
    starCoopReaction: "둘이 함께 본 밤하늘에 별똥별 쇼가 펼쳐져요 🌠💞",
    bedCoopReaction: "나란히 누워서 꿀잠 자요 Zzz 💞🌙",
    tableCoopReaction: "마주 앉아 달콤한 커플 티파티 🫖🍓💞",
    rugCoopReaction: "거실 러그에 나란히 앉아 꽁냥꽁냥 🧶💞",
    zoneGardenLeft: "🌸 벨의 꽃숲",
    zoneGardenCenter: "🌳 중앙 광장",
    zoneGardenRight: "⛲ 반딧불 연못",
    zoneHouseLeft: "🫖 다과 코너",
    zoneHouseCenter: "🧶 거실 라운지",
    zoneHouseRight: "🛏️ 침실 스위트",
    cameraFollowMine: "🎯 내 캐릭터 시점",
    cameraLookPartner: "🔭 상대방 보기",
    cameraFreePan: "🖐️ 자유 시점 (내 위치로)",
    spotMailboxLabel: "소원 우체통",
    spotTreeLabel: "사랑나무",
    spotBenchLabel: "가로등 벤치",
    spotCampfireLabel: "별빛 모닥불",
    spotPondLabel: "반딧불 연못",
    spotStarLabel: "별자리 언덕",
    spotTableLabel: "다과 테이블",
    spotRugLabel: "폭신 거실 러그",
    spotBedLabel: "침실 침대",
    giftModalTitle: "이 자리에 작은 선물·쪽지 놓기",
    giftModalDesc: "지금 내 캐릭터가 서 있는 자리에 작은 선물을 놓아두면 상대가 발견할 수 있어요.",
    giftIconLabel: "아이콘 선택",
    giftMessageLabel: "쪽지 내용",
    giftPlaceholder: "예: 오늘도 생각나서 정원에 선물 두고 가요 ♡",
    giftPlaceBtn: "여기에 놓아두기",
    giftFrom: "님이 남긴 선물",
    giftRemove: "선물 거두기",
    editProfileBtn: "내 프로필 수정",
    myCharacterBadge: "MY"
  },
  en: {
    eyebrow: "OUR 2.5D PANORAMA GARDEN & WIDE HOUSES",
    title: "Our Garden",
    subtitle: "Stroll across the wide panoramic garden and spacious cozy houses, interacting at the bench, campfire, love tree, and pond.",
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
    local: "Saved safely on this device",
    synced: "Live sync connected",
    syncWait: "Connects live via Firebase",
    birthdayToday: "Birthday today!",
    leaveGift: "Leave gift note",
    emptyBirthday: "Add a birthday",
    tapHintGarden: "Tap to walk or drag left/right to pan · Tap the bench, campfire, love tree, or pond!",
    tapHintHouse: "Stroll around the wide room or tap the tea table, cozy rug, or bed to relax",
    tapHintDecor: "Decorate mode: Tap the ground to place the selected item (tap an item to remove)",
    timeAuto: "Auto",
    timeDay: "Day",
    timeSunset: "Sunset",
    timeNight: "Night",
    mapGarden: "Our Garden",
    mapBelleHouse: "Belle's House",
    mapPartnerHouse: "Puppy's House",
    enterBelleHouse: "Enter Belle's House",
    enterPartnerHouse: "Enter Puppy's House",
    exitToGarden: "Back to Garden",
    controllingLabel: "Controlling",
    onlyMyCharacterNotice: "You can only control and edit your own character ♡",
    partnerOnline: "Online now",
    partnerOffline: "Resting",
    followPartner: "Follow →",
    sameMapNear: "You met up close! Try a live interaction together",
    sameMapFar: "You're in the same space! Run closer to interact",
    differentMapInfo: "is currently in another space",
    approachPartnerBtn: "Run next to partner",
    coopHug: "Hug & Nuzzle",
    coopFeed: "Feed Strawberry",
    coopFlower: "Give Flower",
    coopJump: "Jump Together",
    coopNap: "Cozy Nap",
    decorateBtn: "Decorate",
    decorateDone: "Done Decorating",
    decorateReset: "Reset Default",
    speechPlaceholder: "Pop a live speech bubble over your character...",
    speechSend: "Say",
    quickChips: ["♡", "Miss you!", "Sit on the bench 🪑", "By the campfire 🔥", "Visit my house 🏡"],
    pettedReaction: "Love being petted ♡",
    hugReaction: "Warmest hug ♡",
    snackReaction: "Yum yum strawberry! 🍓",
    flowerReaction: "A sweet flower for you 🌷",
    jumpReaction: "Yay hop hop! ✨",
    napReaction: "Sweet dreams... Zzz",
    bedReaction: "Cozy bed nap Zzz",
    tableReaction: "Sweet tea time 🍓♪",
    rugReaction: "So soft and cozy on the rug 🧶♡",
    benchReaction: "Breezy and peaceful on the bench 🍃",
    benchCoopReaction: "Sitting side by side on our bench 💞",
    campfireOnReaction: "Lit the warm campfire! 🔥🍓",
    campfireOffReaction: "Cozy chat by the firepit 🧺",
    campfireCoopReaction: "Warm campfire night together 🔥💛",
    treeWaterReaction: "Grow tall, our love tree! 💧🌸",
    treeCoopReaction: "Pink blossom shower from our love tree 🌸💞",
    pondReaction: "Splash splash by the lotus pond! 🐠🫧",
    pondCoopReaction: "Fireflies glowing over the pond ✨🪷",
    mailboxReaction: "Checking our wish mailbox 📮💌",
    starReaction: "A shooting star across the night sky! 🌠",
    starCoopReaction: "Watching a meteor shower together 🌠💞",
    bedCoopReaction: "Sweet dreams side by side Zzz 💞🌙",
    tableCoopReaction: "Sweet tea party for two 🫖🍓💞",
    rugCoopReaction: "Cuddling on the living room rug 🧶💞",
    zoneGardenLeft: "🌸 Belle's Grove",
    zoneGardenCenter: "🌳 Center Plaza",
    zoneGardenRight: "⛲ Firefly Pond",
    zoneHouseLeft: "🫖 Tea Corner",
    zoneHouseCenter: "🧶 Cozy Lounge",
    zoneHouseRight: "🛏️ Bed Suite",
    cameraFollowMine: "🎯 Follow Me",
    cameraLookPartner: "🔭 View Partner",
    cameraFreePan: "🖐️ Free Camera (Reset)",
    spotMailboxLabel: "Wish Mailbox",
    spotTreeLabel: "Love Tree",
    spotBenchLabel: "Garden Bench",
    spotCampfireLabel: "Campfire",
    spotPondLabel: "Firefly Pond",
    spotStarLabel: "Stargaze Hill",
    spotTableLabel: "Tea Table",
    spotRugLabel: "Cozy Rug",
    spotBedLabel: "Canopy Bed",
    giftModalTitle: "Leave a gift note right here",
    giftModalDesc: "Place a tiny gift right where your character is standing.",
    giftIconLabel: "Choose icon",
    giftMessageLabel: "Sweet note",
    giftPlaceholder: "e.g. Left a little surprise here for you today ♡",
    giftPlaceBtn: "Place here",
    giftFrom: "left a gift",
    giftRemove: "Pick up",
    editProfileBtn: "Edit my profile",
    myCharacterBadge: "MY"
  },
  zh: {
    eyebrow: "OUR 2.5D PANORAMA GARDEN & WIDE HOUSES",
    title: "我们俩的花园",
    subtitle: "在宽敞的全景花园与温馨小屋间漫步，在长椅、篝火、爱情树与池塘边实时互动。",
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
    local: "已安全保存在此设备",
    synced: "实时同步已连接",
    syncWait: "连接 Firebase 后实时同步",
    birthdayToday: "今天生日！",
    leaveGift: "留下小礼物",
    emptyBirthday: "请填写生日",
    tapHintGarden: "点击草地移动或左右拖动浏览花园 · 点击长椅、篝火、爱情树或池塘互动！",
    tapHintHouse: "在宽敞的房间里散步，或点击茶桌、地毯、床铺休息",
    tapHintDecor: "装扮模式：点击地面放置装饰物（点击已有装饰物可移除）",
    timeAuto: "自动",
    timeDay: "白天",
    timeSunset: "黄昏",
    timeNight: "夜晚",
    mapGarden: "我们俩的花园",
    mapBelleHouse: "Belle 的小屋",
    mapPartnerHouse: "小狗的小屋",
    enterBelleHouse: "进入 Belle 的小屋",
    enterPartnerHouse: "进入小狗的小屋",
    exitToGarden: "回到花园",
    controllingLabel: "正在操控",
    onlyMyCharacterNotice: "只能操控与修改自己的角色哦 ♡",
    partnerOnline: "实时在线",
    partnerOffline: "休息中",
    followPartner: "跟随前往 →",
    sameMapNear: "你们靠得很近啦！快试试实时互动吧",
    sameMapFar: "你们在同一个空间！跑过去靠近对方吧",
    differentMapInfo: "目前在另一个空间",
    approachPartnerBtn: "跑到对方身边",
    coopHug: "拥抱贴贴",
    coopFeed: "喂草莓零食",
    coopFlower: "送小花",
    coopJump: "一起跳跳",
    coopNap: "并肩午睡",
    decorateBtn: "装扮花园与小屋",
    decorateDone: "完成装扮",
    decorateReset: "恢复默认",
    speechPlaceholder: "输入文字在角色头顶弹出气泡...",
    speechSend: "发送",
    quickChips: ["♡", "好想你！", "来坐长椅 🪑", "点燃篝火 🔥", "来我家玩吧 🏡"],
    pettedReaction: "最喜欢摸摸头啦 ♡",
    hugReaction: "紧紧抱住你 ♡",
    snackReaction: "草莓真好吃！🍓",
    flowerReaction: "送你一朵香香的花 🌷",
    jumpReaction: "开心跳一跳！✨",
    napReaction: "呼呼午睡中... Zzz",
    bedReaction: "软绵绵的床最舒服啦 Zzz",
    tableReaction: "甜甜的下午茶 🍓♪",
    rugReaction: "客厅的软地毯最温馨啦 🧶♡",
    benchReaction: "坐在长椅上吹风真舒服 🍃",
    benchCoopReaction: "肩并肩坐在长椅上好幸福 💞",
    campfireOnReaction: "点燃篝火啦！暖洋洋的 🔥🍓",
    campfireOffReaction: "围在篝火旁聊聊天 🧺",
    campfireCoopReaction: "两个人一起围炉烤火真甜蜜 🔥💛",
    treeWaterReaction: "给我们的爱情树浇浇水 💧🌸",
    treeCoopReaction: "爱情树洒下了浪漫的花瓣雨 🌸💞",
    pondReaction: "在池塘边踩水玩真凉快 🐠🫧",
    pondCoopReaction: "池塘上升起了萤火虫与睡莲微光 ✨🪷",
    mailboxReaction: "看看心愿邮筒里的信 📮💌",
    starReaction: "看！望远镜那边有流星划过 🌠",
    starCoopReaction: "两个人一起看漫天流星雨 🌠💞",
    bedCoopReaction: "并肩躺在床上做个好梦 Zzz 💞🌙",
    tableCoopReaction: "面对面享受甜蜜下午茶 🫖🍓💞",
    rugCoopReaction: "在地毯上贴贴休息 🧶💞",
    zoneGardenLeft: "🌸 花语森林",
    zoneGardenCenter: "🌳 中央广场",
    zoneGardenRight: "⛲ 萤火池塘",
    zoneHouseLeft: "🫖 茶歇角落",
    zoneHouseCenter: "🧶 客厅地毯",
    zoneHouseRight: "🛏️ 卧室床铺",
    cameraFollowMine: "🎯 跟随自己",
    cameraLookPartner: "🔭 查看对方",
    cameraFreePan: "🖐️ 自由视角 (回中)",
    spotMailboxLabel: "心愿邮筒",
    spotTreeLabel: "爱情树",
    spotBenchLabel: "街灯长椅",
    spotCampfireLabel: "星光篝火",
    spotPondLabel: "萤火池塘",
    spotStarLabel: "观星山丘",
    spotTableLabel: "下午茶桌",
    spotRugLabel: "软绵地毯",
    spotBedLabel: "温馨床铺",
    giftModalTitle: "在这里留下小礼物与纸条",
    giftModalDesc: "在你角色站立的位置放一份小礼物，对方就能发现。",
    giftIconLabel: "选择图标",
    giftMessageLabel: "纸条内容",
    giftPlaceholder: "例如：今天也很想你，在花园留了小礼物给你 ♡",
    giftPlaceBtn: "放在这里",
    giftFrom: "留下的小礼物",
    giftRemove: "收起礼物",
    editProfileBtn: "修改我的资料",
    myCharacterBadge: "我"
  }
};

export function loadLocalProfiles(): Record<Role, CharacterProfile> {
  try {
    const stored = JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY) || "{}") as Partial<Record<Role, CharacterProfile>>;
    return {
      belle: {
        ...defaults.belle,
        ...stored.belle,
        role: "belle",
        species: stored.belle?.species === "rabbit" ? "rabbit" : "cat"
      },
      partner: {
        ...defaults.partner,
        ...stored.partner,
        role: "partner",
        species: "dog"
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
    if (!raw) return { campfireLit: true, coupleTreeExp: 2 };
    const parsed = JSON.parse(raw) as WorldEnvironmentProps;
    return {
      campfireLit: parsed.campfireLit ?? true,
      coupleTreeExp: typeof parsed.coupleTreeExp === "number" ? parsed.coupleTreeExp : 2,
      lastWateredBy: parsed.lastWateredBy,
      petalShowerAtMs: parsed.petalShowerAtMs,
      meteorShowerAtMs: parsed.meteorShowerAtMs
    };
  } catch {
    return { campfireLit: true, coupleTreeExp: 2 };
  }
}

function getRealTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "sunset";
  return "night";
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

// Smart obstacle & boundary clamping so characters don't walk on cottage roofs or deep pond water
function resolveWalkableTarget(rawX: number, rawY: number, mapId: WorldMapId): Point2D {
  const minX = mapId === "garden" ? 8 : 12;
  const maxX = mapId === "garden" ? 92 : 88;
  const minY = mapId === "garden" ? 44 : 48;
  const maxY = mapId === "garden" ? 88 : 85;

  let x = clamp(Math.round(rawX), minX, maxX);
  let y = clamp(Math.round(rawY), minY, maxY);

  if (mapId === "garden") {
    // Belle's Cottage roof/wall area (top-left)
    if (x < 23 && y < 51) {
      y = 52;
    }
    // Partner's Cottage roof/wall area (top-right)
    if (x > 77 && y < 51) {
      y = 52;
    }
    // Firefly Pond deep water center (push to stepping-stone shore)
    if (x >= 70 && x <= 80 && y >= 69 && y <= 76) {
      x = x < 75 ? 68 : 81;
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

  // 2.5D World & Map states
  const [timeMode, setTimeMode] = useState<TimeThemeMode>("auto");
  const timeOfDay: TimeOfDay = timeMode === "auto" ? getRealTimeOfDay() : timeMode;

  const [maps, setMaps] = useState<Record<Role, WorldMapId>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: initial.belle.currentMap || "garden",
      partner: initial.partner.currentMap || "garden"
    };
  });
  const currentMap = maps[currentRole];

  const [mood, setMood] = useState<Record<Role, PetMood>>({ belle: "idle", partner: "idle" });
  const [positions, setPositions] = useState<Record<Role, Point2D>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: { x: initial.belle.x ?? 42, y: initial.belle.y ?? 66 },
      partner: { x: initial.partner.x ?? 58, y: initial.partner.y ?? 68 }
    };
  });
  const [directions, setDirections] = useState<Record<Role, 1 | -1>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: initial.belle.direction ?? 1,
      partner: initial.partner.direction ?? -1
    };
  });
  const [activeSpots, setActiveSpots] = useState<Record<Role, InteractiveSpotId | null>>(() => {
    const initial = loadLocalProfiles();
    return {
      belle: initial.belle.activeSpotId ?? null,
      partner: initial.partner.activeSpotId ?? null
    };
  });
  const [moveDurations, setMoveDurations] = useState<Record<Role, number>>({ belle: 2.0, partner: 2.0 });
  const [speechBubble, setSpeechBubble] = useState<Partial<Record<Role, string>>>({});
  const [speechDraft, setSpeechDraft] = useState("");
  const [tapTarget, setTapTarget] = useState<{ x: number; y: number; key: number } | null>(null);
  const [burstHearts, setBurstHearts] = useState<Array<{ id: number; x: number; y: number; symbol?: string }>>([]);

  // Phase 1: Wide Panorama Camera & Viewport States
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth <= 680 : false
  );
  const [cameraMode, setCameraMode] = useState<"follow" | "partner" | "free">("follow");
  const [manualPanX, setManualPanX] = useState<number>(-20);
  const [isDraggingStage, setIsDraggingStage] = useState<boolean>(false);

  // Phase 2: Shared Interactive Environment Props (Campfire, Couple Love Tree, Sky Showers)
  const [worldProps, setWorldProps] = useState<WorldEnvironmentProps>(loadLocalWorldProps);
  const [petalShowerActive, setPetalShowerActive] = useState<boolean>(false);
  const [meteorShowerActive, setMeteorShowerActive] = useState<boolean>(false);
  const [pondSplashActive, setPondSplashActive] = useState<boolean>(false);

  // Garden & Room Decorations
  const [decorations, setDecorations] = useState<PlacedDecoration[]>(loadLocalDecors);
  const [decorating, setDecorating] = useState(false);
  const [selectedDecorType, setSelectedDecorType] = useState<DecorationType>("flower_pink");

  // Gift Note in World
  const [gardenGift, setGardenGift] = useState<GardenGiftNote | null>(loadLocalGift);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftOpenView, setGiftOpenView] = useState(false);
  const [giftIconDraft, setGiftIconDraft] = useState<GardenGiftNote["icon"]>("gift");
  const [giftTextDraft, setGiftTextDraft] = useState("");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerDown: boolean;
    moved: boolean;
    startClientX: number;
    startClientY: number;
    startPanPct: number;
  }>({
    pointerDown: false,
    moved: false,
    startClientX: 0,
    startClientY: 0,
    startPanPct: 0
  });
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
  const lastRemoteSyncMs = useRef<Record<Role, number>>({ belle: 0, partner: 0 });
  const initialLoadDone = useRef<Record<Role, boolean>>({ belle: false, partner: false });
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const directionsRef = useRef(directions);
  directionsRef.current = directions;
  const mapsRef = useRef(maps);
  mapsRef.current = maps;
  const activeSpotsRef = useRef(activeSpots);
  activeSpotsRef.current = activeSpots;

  // Panorama Canvas Scale: Wide Garden (220% mobile / 165% desktop) & Wide Houses (175% mobile / 135% desktop)
  const worldScaleX =
    currentMap === "garden"
      ? isMobileViewport
        ? 2.2
        : 1.65
      : isMobileViewport
        ? 1.75
        : 1.35;

  const minCameraPanPct = ((1 - worldScaleX) / worldScaleX) * 100;
  const computeCameraPanForX = (worldX: number) =>
    clamp(50 / worldScaleX - worldX, minCameraPanPct, 0);

  const activeCameraPanX = useMemo(() => {
    if (cameraMode === "free") {
      return clamp(manualPanX, minCameraPanPct, 0);
    }
    if (cameraMode === "partner" && maps[otherRole] === currentMap) {
      return computeCameraPanForX(positions[otherRole].x);
    }
    return computeCameraPanForX(positions[currentRole].x);
  }, [cameraMode, manualPanX, minCameraPanPct, worldScaleX, maps, otherRole, currentMap, positions, currentRole]);

  useEffect(() => {
    document.querySelector<HTMLElement>(".main-content")?.scrollTo({ top: 0, behavior: "auto" });
    ALL_PRELOAD_ASSETS.forEach((file) => {
      const img = new Image();
      img.src = characterAsset(file);
    });
    const onResize = () => setIsMobileViewport(window.innerWidth <= 680);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
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

  const persistWorldPropsLocal = (nextProps: WorldEnvironmentProps) => {
    setWorldProps(nextProps);
    localStorage.setItem(GARDEN_WORLD_PROPS_STORAGE_KEY, JSON.stringify(nextProps));
  };

  // Push my real-time state to both topics/__garden_{role} (guaranteed permission) and couple_characters/{role}
  const syncMyStateToCloud = async (patch: Partial<CharacterProfile>) => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
    const nowMs = Date.now();
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

  // Push shared world state (coopEvent, decorations, giftNote, worldProps) to both topics/__garden_world and character_world/main
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

  const triggerHeartBurst = (x: number, y: number, symbol?: string) => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setBurstHearts((prev) => [...prev.slice(-6), { id, x, y, symbol }]);
    window.setTimeout(() => {
      setBurstHearts((prev) => prev.filter((item) => item.id !== id));
    }, 1500);
  };

  const setTemporaryMood = (role: Role, nextMood: PetMood, durationMs: number, bubbleText?: string) => {
    if (moodResetTimers.current[role]) {
      window.clearTimeout(moodResetTimers.current[role]);
    }
    setMood((prev) => ({ ...prev, [role]: nextMood }));
    if (bubbleText) {
      setSpeechBubble((prev) => ({ ...prev, [role]: bubbleText }));
    }
    moodResetTimers.current[role] = window.setTimeout(() => {
      setMood((prev) => ({ ...prev, [role]: "idle" }));
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
    const durationSec = clamp(dist * 0.058, 1.1, 2.8);

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

  // Move ONLY the current user's character and sync to Firestore
  const moveMyCharacterTo = (
    target: Point2D,
    moveMood: PetMood = "walk",
    endMood: PetMood = "idle",
    bubbleAfter?: string,
    endDurationMs = 3200,
    spotId: InteractiveSpotId | null = null,
    forcedDirection?: 1 | -1
  ) => {
    setCameraMode("follow");
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
    void syncMyStateToCloud({
      x: target.x,
      y: target.y,
      direction: nextDir,
      currentMap: mapsRef.current[currentRole],
      liveMood: endMood !== "idle" ? endMood : moveMood,
      activeSpotId: spotId,
      actionAtMs: nowMs,
      ...(bubbleAfter ? { speechText: bubbleAfter, speechAtMs: nowMs } : {})
    });
    return durationSec;
  };

  // Execute a shared Co-op event on both screens simultaneously
  const executeCoopEventLocally = (evt: CoopEventPayload) => {
    if (evt.mapId && mapsRef.current[otherRole] !== evt.mapId) {
      mapsRef.current = { ...mapsRef.current, [otherRole]: evt.mapId };
      setMaps((prev) => ({ ...prev, [otherRole]: evt.mapId }));
    }
    const belleTarget: Point2D = {
      x: clamp(evt.centerX - 6, 14, 84),
      y: clamp(evt.centerY, 48, 84)
    };
    const partnerTarget: Point2D = {
      x: clamp(evt.centerX + 6, 16, 86),
      y: clamp(evt.centerY + 1, 48, 84)
    };

    if (evt.type === "hug" || evt.type === "pet") {
      const reactionText = evt.type === "pet" ? t.pettedReaction : t.hugReaction;
      animateCharacterTo("belle", belleTarget, "walk", "love", reactionText, 4200, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "love", reactionText, 4200, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 14, "💞");
      }, 650);
    } else if (evt.type === "feed") {
      animateCharacterTo("belle", belleTarget, "walk", "snack", t.snackReaction, 4800, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "snack", t.snackReaction, 4800, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 14, "🍓");
      }, 650);
    } else if (evt.type === "flower") {
      animateCharacterTo("belle", belleTarget, "walk", "happy", t.flowerReaction, 4200, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "happy", t.flowerReaction, 4200, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 14, "🌷");
      }, 650);
    } else if (evt.type === "jump") {
      animateCharacterTo("belle", belleTarget, "walk", "jump", t.jumpReaction, 3600, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "jump", t.jumpReaction, 3600, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 16, "✨");
      }, 500);
    } else if (evt.type === "nap") {
      animateCharacterTo("belle", belleTarget, "walk", "sleep", t.napReaction, 6000, 1);
      animateCharacterTo("partner", partnerTarget, "walk", "sleep", t.napReaction, 6000, -1);
      window.setTimeout(() => {
        setDirections({ belle: 1, partner: -1 });
        triggerHeartBurst(evt.centerX, evt.centerY - 12, "💤");
      }, 800);
    }
  };

  // Phase 2: Detect 2-Player Co-op Spot Synergy when both occupy the same InteractiveSpotId on the same map
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
      triggerHeartBurst(50, 38, "💞");
    } else if (sharedActiveSpot === "campfire") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "snack", 5200, t.campfireCoopReaction);
      setTemporaryMood("partner", "snack", 5200, t.campfireCoopReaction);
      triggerHeartBurst(50, 64, "🔥");
    } else if (sharedActiveSpot === "couple_tree") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "love", 5200, t.treeCoopReaction);
      setTemporaryMood("partner", "love", 5200, t.treeCoopReaction);
      triggerHeartBurst(33, 36, "🌸");
      triggerPetalShower();
    } else if (sharedActiveSpot === "sparkle_pond") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "happy", 5000, t.pondCoopReaction);
      setTemporaryMood("partner", "happy", 5000, t.pondCoopReaction);
      triggerHeartBurst(74, 64, "🪷");
    } else if (sharedActiveSpot === "star_observatory") {
      setTemporaryMood("belle", "love", 5200, t.starCoopReaction);
      setTemporaryMood("partner", "love", 5200, t.starCoopReaction);
      triggerHeartBurst(66, 36, "🌠");
      triggerMeteorShower();
    } else if (sharedActiveSpot === "bed") {
      setTemporaryMood("belle", "sleep", 6200, t.bedCoopReaction);
      setTemporaryMood("partner", "sleep", 6200, t.bedCoopReaction);
      triggerHeartBurst(midX, midY - 12, "🌙");
    } else if (sharedActiveSpot === "tea_table") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "snack", 5200, t.tableCoopReaction);
      setTemporaryMood("partner", "snack", 5200, t.tableCoopReaction);
      triggerHeartBurst(25, 48, "🫖");
    } else if (sharedActiveSpot === "cozy_rug") {
      setDirections({ belle: 1, partner: -1 });
      setTemporaryMood("belle", "love", 5000, t.rugCoopReaction);
      setTemporaryMood("partner", "love", 5000, t.rugCoopReaction);
      triggerHeartBurst(48, 58, "🧶");
    }
  }, [sharedActiveSpot]);

  // Real-time Firestore listeners for both characters + shared world state
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
      setSyncState("local");
      return;
    }

    // Announce our initial presence & position
    void syncMyStateToCloud({
      x: positionsRef.current[currentRole].x,
      y: positionsRef.current[currentRole].y,
      direction: directionsRef.current[currentRole],
      currentMap: mapsRef.current[currentRole],
      activeSpotId: activeSpotsRef.current[currentRole]
    });

    // Heartbeat every 30s while in garden so partner sees live online indicator
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncMyStateToCloud({
          x: positionsRef.current[currentRole].x,
          y: positionsRef.current[currentRole].y,
          direction: directionsRef.current[currentRole],
          currentMap: mapsRef.current[currentRole],
          activeSpotId: activeSpotsRef.current[currentRole]
        });
      }
    }, 30000);

    const handleRemoteCharacterSnapshot = (role: Role, remote: Partial<CharacterProfile>) => {
      const syncMs = remote.lastActiveMs || remote.actionAtMs || remote.speechAtMs || 0;
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
            species: role === "partner" ? "dog" : remote.species === "rabbit" ? "rabbit" : "cat"
          }
        } as Record<Role, CharacterProfile>;
        localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(next));
        if (role === "belle" && (next.belle.species === "cat" || next.belle.species === "rabbit")) {
          onBelleSpeciesChange?.(next.belle.species);
        }
        return next;
      });

      // If this is the OTHER player's character, smoothly animate their real-time movement/map/spot/speech!
      if (role !== currentRole) {
        const isFirst = !initialLoadDone.current[role];
        initialLoadDone.current[role] = true;

        if (remote.currentMap) {
          mapsRef.current = { ...mapsRef.current, [role]: remote.currentMap };
          setMaps((prev) => (prev[role] === remote.currentMap ? prev : { ...prev, [role]: remote.currentMap! }));
        }

        if ("activeSpotId" in remote) {
          const nextSpot = remote.activeSpotId ?? null;
          activeSpotsRef.current = { ...activeSpotsRef.current, [role]: nextSpot };
          setActiveSpots((prev) => (prev[role] === nextSpot ? prev : { ...prev, [role]: nextSpot }));
        }

        const endMood: PetMood =
          remote.liveMood && remote.liveMood !== "run" && remote.liveMood !== "walk"
            ? remote.liveMood
            : "idle";
        const moveMood: PetMood = remote.liveMood === "run" ? "run" : "walk";

        if (typeof remote.x === "number" && typeof remote.y === "number") {
          const curPos = positionsRef.current[role];
          const dist = Math.hypot(remote.x - curPos.x, remote.y - curPos.y);

          if (isFirst) {
            positionsRef.current = { ...positionsRef.current, [role]: { x: remote.x, y: remote.y } };
            setPositions((prev) => ({ ...prev, [role]: { x: remote.x!, y: remote.y! } }));
            if (remote.direction) {
              directionsRef.current = { ...directionsRef.current, [role]: remote.direction };
              setDirections((d) => ({ ...d, [role]: remote.direction! }));
            }
            if (remote.actionAtMs) {
              lastRemoteActionAt.current[role] = remote.actionAtMs;
            }
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
              3800,
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
          setTemporaryMood(role, speechMood, 4200, remote.speechText);
          triggerHeartBurst(
            remote.x ?? positionsRef.current[role].x,
            (remote.y ?? positionsRef.current[role].y) - 12
          );
        }
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

  // Switch my character's map (Garden <-> Belle's House <-> Partner's House)
  const changeMyMap = (targetMap: WorldMapId, spawnPoint?: Point2D) => {
    if (portalTimerRef.current) {
      window.clearTimeout(portalTimerRef.current);
      portalTimerRef.current = null;
    }
    const prevMap = mapsRef.current[currentRole];
    const defaultSpawn: Point2D =
      targetMap === "garden"
        ? prevMap === "belle_house"
          ? { x: 18, y: 54 }
          : prevMap === "partner_house"
            ? { x: 82, y: 54 }
            : { x: 50, y: 68 }
        : { x: 48, y: 76 };

    const nextPos = spawnPoint || defaultSpawn;
    mapsRef.current = { ...mapsRef.current, [currentRole]: targetMap };
    positionsRef.current = { ...positionsRef.current, [currentRole]: nextPos };
    activeSpotsRef.current = { ...activeSpotsRef.current, [currentRole]: null };
    setMaps((prev) => ({ ...prev, [currentRole]: targetMap }));
    setPositions((prev) => ({ ...prev, [currentRole]: nextPos }));
    setActiveSpots((prev) => ({ ...prev, [currentRole]: null }));
    setCameraMode("follow");
    setTemporaryMood(currentRole, "happy", 1600);
    void syncMyStateToCloud({
      currentMap: targetMap,
      x: nextPos.x,
      y: nextPos.y,
      activeSpotId: null,
      liveMood: "happy",
      actionAtMs: Date.now()
    });
  };

  const handlePortalToHouse = (e: React.MouseEvent, targetHouse: "belle_house" | "partner_house") => {
    e.stopPropagation();
    const doorPos: Point2D = targetHouse === "belle_house" ? { x: 17, y: 50 } : { x: 83, y: 50 };
    const durationSec = moveMyCharacterTo(doorPos, "walk", "happy", undefined, 2200, null);
    if (portalTimerRef.current) window.clearTimeout(portalTimerRef.current);
    portalTimerRef.current = window.setTimeout(() => {
      changeMyMap(targetHouse, { x: 48, y: 76 });
    }, Math.min(950, durationSec * 850));
  };

  const handleExitRoomToGarden = (e: React.MouseEvent) => {
    e.stopPropagation();
    const matPos: Point2D = { x: 50, y: 81 };
    const durationSec = moveMyCharacterTo(matPos, "walk", "happy", undefined, 2000, null);
    if (portalTimerRef.current) window.clearTimeout(portalTimerRef.current);
    portalTimerRef.current = window.setTimeout(() => {
      const outsideDoor: Point2D = currentMap === "belle_house" ? { x: 18, y: 55 } : { x: 82, y: 55 };
      changeMyMap("garden", outsideDoor);
    }, Math.min(900, durationSec * 820));
  };

  // Phase 2: Unified Interactive Spot Handler for Garden (6 spots) & Wide Houses (3 spots)
  const handleInteractiveSpotClick = async (e: React.MouseEvent, spotId: InteractiveSpotId) => {
    e.stopPropagation();
    const isBelle = currentRole === "belle";

    if (spotId === "garden_bench") {
      const seat: Point2D = isBelle ? { x: 47, y: 49 } : { x: 53, y: 49 };
      const faceDir: 1 | -1 = isBelle ? 1 : -1;
      moveMyCharacterTo(seat, "walk", "happy", t.benchReaction, 5500, "garden_bench", faceDir);
      triggerHeartBurst(50, 42, "🍃");
      return;
    }

    if (spotId === "campfire") {
      const seat: Point2D = isBelle ? { x: 43, y: 75 } : { x: 57, y: 75 };
      const faceDir: 1 | -1 = isBelle ? 1 : -1;
      const nextLit = activeSpots[currentRole] === "campfire" ? !worldProps.campfireLit : true;
      const nextProps: WorldEnvironmentProps = { ...worldProps, campfireLit: nextLit };
      persistWorldPropsLocal(nextProps);
      moveMyCharacterTo(
        seat,
        "walk",
        nextLit ? "snack" : "happy",
        nextLit ? t.campfireOnReaction : t.campfireOffReaction,
        5500,
        "campfire",
        faceDir
      );
      triggerHeartBurst(50, 68, nextLit ? "🔥" : "🧺");
      await syncWorldStateToCloud({ worldProps: nextProps });
      return;
    }

    if (spotId === "couple_tree") {
      const slot: Point2D = isBelle ? { x: 29, y: 50 } : { x: 37, y: 50 };
      const faceDir: 1 | -1 = isBelle ? 1 : -1;
      const nowMs = Date.now();
      const nextExp = (worldProps.coupleTreeExp || 0) + 1;
      const nextProps: WorldEnvironmentProps = {
        ...worldProps,
        coupleTreeExp: nextExp,
        lastWateredBy: currentRole,
        petalShowerAtMs: nowMs
      };
      lastProcessedPetalMs.current = nowMs;
      persistWorldPropsLocal(nextProps);
      triggerPetalShower();
      moveMyCharacterTo(slot, "walk", "love", t.treeWaterReaction, 5200, "couple_tree", faceDir);
      triggerHeartBurst(33, 39, "🌸");
      await syncWorldStateToCloud({ worldProps: nextProps });
      return;
    }

    if (spotId === "sparkle_pond") {
      const slot: Point2D = isBelle ? { x: 68, y: 73 } : { x: 80, y: 73 };
      const faceDir: 1 | -1 = isBelle ? 1 : -1;
      setPondSplashActive(true);
      window.setTimeout(() => setPondSplashActive(false), 3200);
      moveMyCharacterTo(slot, "walk", "jump", t.pondReaction, 4500, "sparkle_pond", faceDir);
      triggerHeartBurst(74, 66, "🐠");
      return;
    }

    if (spotId === "wish_mailbox") {
      const slot: Point2D = isBelle ? { x: 23, y: 56 } : { x: 28, y: 56 };
      moveMyCharacterTo(slot, "walk", "happy", t.mailboxReaction, 4200, "wish_mailbox", 1);
      triggerHeartBurst(25, 46, "💌");
      if (gardenGift) {
        setGiftOpenView(true);
      } else {
        setGiftModalOpen(true);
      }
      return;
    }

    if (spotId === "star_observatory") {
      const slot: Point2D = isBelle ? { x: 63, y: 46 } : { x: 70, y: 46 };
      const nowMs = Date.now();
      const nextProps: WorldEnvironmentProps = {
        ...worldProps,
        meteorShowerAtMs: nowMs
      };
      lastProcessedMeteorMs.current = nowMs;
      persistWorldPropsLocal(nextProps);
      triggerMeteorShower();
      moveMyCharacterTo(slot, "walk", "love", t.starReaction, 5200, "star_observatory", 1);
      triggerHeartBurst(66, 36, "🌠");
      await syncWorldStateToCloud({ worldProps: nextProps });
      return;
    }

    // Wide House Interior Spots (2-player separated slots!)
    if (spotId === "bed") {
      const pillowSlot: Point2D = isBelle ? { x: 67, y: 56 } : { x: 76, y: 56 };
      const faceDir: 1 | -1 = isBelle ? 1 : -1;
      moveMyCharacterTo(pillowSlot, "walk", "sleep", t.bedReaction, 6200, "bed", faceDir);
      triggerHeartBurst(pillowSlot.x, pillowSlot.y - 10, "💤");
      return;
    }

    if (spotId === "tea_table") {
      const chairSlot: Point2D = isBelle ? { x: 20, y: 61 } : { x: 30, y: 61 };
      const faceDir: 1 | -1 = isBelle ? 1 : -1;
      moveMyCharacterTo(chairSlot, "walk", "snack", t.tableReaction, 5200, "tea_table", faceDir);
      triggerHeartBurst(25, 51, "🍓");
      return;
    }

    if (spotId === "cozy_rug") {
      const rugSlot: Point2D = isBelle ? { x: 44, y: 68 } : { x: 53, y: 68 };
      const faceDir: 1 | -1 = isBelle ? 1 : -1;
      moveMyCharacterTo(rugSlot, "walk", "love", t.rugReaction, 5000, "cozy_rug", faceDir);
      triggerHeartBurst(48, 60, "🧶");
    }
  };

  const saveDecorationsToCloud = async (nextDecors: PlacedDecoration[]) => {
    setDecorations(nextDecors);
    localStorage.setItem(GARDEN_DECORS_STORAGE_KEY, JSON.stringify(nextDecors));
    await syncWorldStateToCloud({ decorations: nextDecors });
  };

  // Phase 1: Stage Pointer Down / Move / Up for seamless Drag-to-Pan + Tap-to-Move
  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) {
      dragStateRef.current.pointerDown = false;
      return;
    }
    dragStateRef.current = {
      pointerDown: true,
      moved: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanPct: activeCameraPanX
    };
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.pointerDown) return;
    const dx = event.clientX - dragStateRef.current.startClientX;
    const dy = event.clientY - dragStateRef.current.startClientY;

    if (!dragStateRef.current.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 0.8) {
      dragStateRef.current.moved = true;
      setIsDraggingStage(true);
      setCameraMode("free");
    }

    if (dragStateRef.current.moved && canvasRef.current) {
      const canvasWidthPx = canvasRef.current.getBoundingClientRect().width || 800;
      const deltaPct = (dx / canvasWidthPx) * 100;
      setManualPanX(clamp(dragStateRef.current.startPanPct + deltaPct, minCameraPanPct, 0));
    }
  };

  const handleStagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.pointerDown) return;
    const wasMoved = dragStateRef.current.moved;
    dragStateRef.current.pointerDown = false;
    dragStateRef.current.moved = false;
    setIsDraggingStage(false);

    if (wasMoved) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;

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
      const next = [...decorations.slice(-17), newDecor];
      void saveDecorationsToCloud(next);
      triggerHeartBurst(targetX, targetY - 6, "✨");
      return;
    }

    setTapTarget({ x: targetX, y: targetY, key: Date.now() });
    // Strict single-character control: ONLY move currentRole!
    moveMyCharacterTo({ x: targetX, y: targetY }, "walk", "idle", undefined, 3200, null);
  };

  const handleMinimapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = clamp(Math.round(((event.clientX - rect.left) / rect.width) * 100), 10, 90);
    setCameraMode("free");
    setManualPanX(computeCameraPanForX(clickX));
  };

  const handleDecorationClick = (e: React.MouseEvent, item: PlacedDecoration) => {
    e.stopPropagation();
    if (decorating) {
      const next = decorations.filter((d) => d.id !== item.id);
      void saveDecorationsToCloud(next);
      return;
    }
    moveMyCharacterTo(
      { x: clamp(item.x + (currentRole === "belle" ? -5 : 5), 12, 88), y: clamp(item.y + 2, 48, 85) },
      "walk",
      "happy",
      "✿",
      2400,
      null
    );
  };

  const handlePetCharacter = (event: React.MouseEvent, role: Role) => {
    event.stopPropagation();
    const pos = positions[role];
    triggerHeartBurst(pos.x, pos.y - 12);
    if (role === currentRole) {
      const nowMs = Date.now();
      setTemporaryMood(currentRole, "love", 2600, t.pettedReaction);
      void syncMyStateToCloud({
        liveMood: "love",
        speechText: t.pettedReaction,
        speechAtMs: nowMs,
        actionAtMs: nowMs
      });
    } else {
      // Walk up to partner and pet them affectionately on both screens in real time!
      void triggerCoopInteraction("pet");
    }
  };

  // Real-time Co-op Action when both characters meet
  const triggerCoopInteraction = async (type: CoopActionType) => {
    const myPos = positions[currentRole];
    const otherPos = positions[otherRole];
    const sameMap = maps[currentRole] === maps[otherRole];

    const centerX = sameMap ? Math.round((myPos.x + otherPos.x) / 2) : myPos.x;
    const centerY = sameMap ? Math.round((myPos.y + otherPos.y) / 2) : myPos.y;

    const evt: CoopEventPayload = {
      id: `${Date.now()}-${currentRole}`,
      type,
      fromRole: currentRole,
      mapId: currentMap,
      centerX: clamp(centerX, 22, 78),
      centerY: clamp(centerY, 52, 80),
      createdAtMs: Date.now()
    };

    lastProcessedCoopId.current = evt.id;
    setCameraMode("follow");
    executeCoopEventLocally(evt);

    const myNewX = currentRole === "belle" ? clamp(evt.centerX - 6, 14, 82) : clamp(evt.centerX + 6, 18, 86);
    const myNewY = currentRole === "belle" ? evt.centerY : clamp(evt.centerY + 1, 48, 84);

    void syncMyStateToCloud({
      x: myNewX,
      y: myNewY,
      direction: currentRole === "belle" ? 1 : -1,
      activeSpotId: null,
      liveMood: type === "feed" ? "snack" : type === "nap" ? "sleep" : type === "jump" ? "jump" : "love",
      actionAtMs: Date.now()
    });

    await syncWorldStateToCloud({ coopEvent: evt });
  };

  const handleApproachPartner = () => {
    const otherPos = positions[otherRole];
    const target: Point2D = {
      x: clamp(otherPos.x + (currentRole === "belle" ? -8 : 8), 12, 88),
      y: clamp(otherPos.y, 48, 84)
    };
    moveMyCharacterTo(target, "walk", "happy", "♡", 2600, activeSpots[otherRole]);
    triggerHeartBurst(otherPos.x, otherPos.y - 12);
  };

  const handleSendSpeechBubble = (textToUse?: string) => {
    const clean = (textToUse ?? speechDraft).trim();
    if (!clean) return;
    setSpeechDraft("");
    const pos = positions[currentRole];
    const nowMs = Date.now();
    triggerHeartBurst(pos.x, pos.y - 14);
    setTemporaryMood(currentRole, "happy", 4500, clean);
    void syncMyStateToCloud({
      liveMood: "happy",
      speechText: clean,
      speechAtMs: nowMs,
      actionAtMs: nowMs
    });
  };

  const openMyEditor = () => {
    setDraft(profiles[currentRole]);
    setPhotoError("");
    setEditing(true);
  };

  const handleProfileCardClick = (role: Role) => {
    if (role !== currentRole) {
      showOwnershipToast();
      return;
    }
    openMyEditor();
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
    triggerHeartBurst(positions.belle.x, positions.belle.y - 10);
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
      x: clamp(pos.x + (currentRole === "belle" ? 5 : -5), 16, 84),
      y: clamp(pos.y + 3, 50, 84),
      createdAtMs: Date.now()
    };
    setGardenGift(newGift);
    localStorage.setItem(GARDEN_GIFT_STORAGE_KEY, JSON.stringify(newGift));
    setGiftModalOpen(false);
    setGiftTextDraft("");
    triggerHeartBurst(newGift.x, newGift.y - 6);

    await syncWorldStateToCloud({ giftNote: newGift });
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
  const profileList = useMemo(() => [profiles.belle, profiles.partner], [profiles]);

  const isSameMap = maps.belle === maps.partner;
  const distanceBetweenPets = useMemo(
    () => Math.hypot(positions.belle.x - positions.partner.x, positions.belle.y - positions.partner.y),
    [positions.belle.x, positions.belle.y, positions.partner.x, positions.partner.y]
  );
  const isCloseTogether = isSameMap && distanceBetweenPets <= 22;

  const isOtherOnline = useMemo(() => {
    const last = profiles[otherRole].lastActiveMs;
    if (!last) return false;
    return Date.now() - last < 5 * 60 * 1000;
  }, [profiles, otherRole]);

  const mapLabel = (m: WorldMapId) =>
    m === "garden" ? t.mapGarden : m === "belle_house" ? t.mapBelleHouse : t.mapPartnerHouse;

  const currentMapDecors = useMemo(
    () => decorations.filter((d) => d.mapId === currentMap),
    [decorations, currentMap]
  );

  const stageBgImage =
    currentMap === "garden"
      ? characterAsset("garden-meadow-bg.webp")
      : currentMap === "belle_house"
        ? characterAsset("belle-room-bg.webp")
        : characterAsset("partner-room-bg.webp");

  const treeStage = getCoupleTreeStage(worldProps.coupleTreeExp || 0);

  // Dynamic Y-Depth Sorting: boost zIndex when sitting on elevated furniture (bench/bed)
  const getDepthStyle = (role: Role): React.CSSProperties => {
    const pos = positions[role];
    const spot = activeSpots[role];
    const depthRatio = (pos.y - 44) / 44;
    const depthScale = Number((0.84 + depthRatio * 0.22).toFixed(3));
    const baseZ = Math.round(pos.y);
    const zIndex = spot === "garden_bench" ? 54 : spot === "bed" ? 64 : baseZ;
    return {
      left: `${pos.x}%`,
      top: `${pos.y}%`,
      zIndex,
      "--pet-depth-scale": depthScale,
      "--pet-move-duration": `${moveDurations[role]}s`
    } as React.CSSProperties;
  };

  return (
    <section className="character-world" aria-labelledby="character-world-title">
      <div className="character-world-topbar">
        <button type="button" className="character-back" onClick={onBack}>
          <RotateCcw size={16} /> {t.back}
        </button>

        <div className="character-topbar-right">
          <div className="garden-time-switcher" role="group" aria-label="Time of day">
            <button
              type="button"
              className={timeMode === "auto" ? "active" : ""}
              onClick={() => setTimeMode("auto")}
            >
              <Sparkles size={12} /> {t.timeAuto}
            </button>
            <button
              type="button"
              className={timeMode === "day" ? "active" : ""}
              onClick={() => setTimeMode("day")}
              aria-label={t.timeDay}
            >
              <Sun size={13} />
            </button>
            <button
              type="button"
              className={timeMode === "sunset" ? "active" : ""}
              onClick={() => setTimeMode("sunset")}
              aria-label={t.timeSunset}
            >
              <Sunset size={13} />
            </button>
            <button
              type="button"
              className={timeMode === "night" ? "active" : ""}
              onClick={() => setTimeMode("night")}
              aria-label={t.timeNight}
            >
              <Moon size={13} />
            </button>
          </div>
          <span className={`character-sync ${syncState}`}><i /> {statusText}</span>
        </div>
      </div>

      <div className="character-world-header-row">
        <header className="character-world-heading">
          <span>{t.eyebrow}</span>
          <h2 id="character-world-title">{t.title}</h2>
          <p>{t.subtitle}</p>
        </header>

        <div className="character-header-controls">
          <div className="my-control-chip">
            <img
              src={
                currentRole === "partner"
                  ? characterAsset("partner-puppy.webp")
                  : profiles.belle.species === "rabbit"
                    ? characterAsset("belle-rabbit.webp")
                    : characterAsset("belle-cat.webp")
              }
              alt=""
            />
            <div>
              <small>{t.controllingLabel}</small>
              <strong>{profiles[currentRole].name}</strong>
            </div>
          </div>

          {currentRole === "belle" && (
            <div className="belle-quick-switcher" role="group" aria-label={t.choose}>
              <span className="belle-quick-label">{t.choose}</span>
              <div className="belle-quick-buttons">
                {(["cat", "rabbit"] as BelleSpecies[]).map((species) => {
                  const active = profiles.belle.species === species;
                  return (
                    <button
                      key={species}
                      type="button"
                      className={`belle-quick-btn ${active ? "active" : ""}`}
                      onClick={() => void quickSwitchBelleSpecies(species)}
                      aria-pressed={active}
                    >
                      <img src={characterAsset(`belle-${species}.webp`)} alt="" />
                      <span>{species === "cat" ? t.cat : t.rabbit}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {ownershipNotice && (
        <div className="ownership-toast" role="status">
          <Heart size={14} fill="currentColor" /> {ownershipNotice}
        </div>
      )}

      {/* 3-Map Navigation Bar + Partner Live Location Tracker */}
      <div className="world-map-nav-bar">
        <div className="world-map-tabs" role="tablist" aria-label="World Maps">
          <button
            type="button"
            role="tab"
            aria-selected={currentMap === "garden"}
            className={`map-tab-btn ${currentMap === "garden" ? "active" : ""}`}
            onClick={() => changeMyMap("garden")}
          >
            <Trees size={15} />
            <span>{t.mapGarden}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentMap === "belle_house"}
            className={`map-tab-btn ${currentMap === "belle_house" ? "active" : ""}`}
            onClick={() => changeMyMap("belle_house")}
          >
            <Home size={15} />
            <span>{t.mapBelleHouse}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentMap === "partner_house"}
            className={`map-tab-btn ${currentMap === "partner_house" ? "active" : ""}`}
            onClick={() => changeMyMap("partner_house")}
          >
            <Home size={15} />
            <span>{t.mapPartnerHouse}</span>
          </button>
        </div>

        {/* Partner Live Location & Follow Button */}
        <button
          type="button"
          className={`partner-location-pill ${isOtherOnline ? "online" : ""}`}
          onClick={() => {
            if (maps[otherRole] !== currentMap) {
              changeMyMap(maps[otherRole], {
                x: clamp(positions[otherRole].x + (currentRole === "belle" ? -9 : 9), 16, 84),
                y: clamp(positions[otherRole].y, 50, 82)
              });
            } else {
              handleApproachPartner();
            }
          }}
        >
          <span className="online-dot" />
          <strong>{profiles[otherRole].name}</strong>
          <span>· {mapLabel(maps[otherRole])}</span>
          <em className="follow-link">
            <Navigation size={11} /> {maps[otherRole] !== currentMap ? t.followPartner : t.approachPartnerBtn}
          </em>
        </button>
      </div>

      {/* Phase 1: Top Panorama Mini-Map Radar & Camera Mode Bar */}
      <div className="world-minimap-bar">
        <div
          className="minimap-radar-track"
          onClick={handleMinimapClick}
          role="slider"
          aria-label="World Radar"
          aria-valuenow={Math.round(positions[currentRole].x)}
        >
          <div className="minimap-zones">
            <span>{currentMap === "garden" ? t.zoneGardenLeft : t.zoneHouseLeft}</span>
            <span>{currentMap === "garden" ? t.zoneGardenCenter : t.zoneHouseCenter}</span>
            <span>{currentMap === "garden" ? t.zoneGardenRight : t.zoneHouseRight}</span>
          </div>

          {/* Viewport lens indicator */}
          <div
            className="minimap-viewport-lens"
            style={{
              width: `${Math.round(100 / worldScaleX)}%`,
              left: `${clamp(-activeCameraPanX, 0, 100 - 100 / worldScaleX)}%`
            }}
          />

          {/* Belle live radar pin */}
          {maps.belle === currentMap && (
            <span
              className="minimap-pin belle-pin"
              style={{ left: `${positions.belle.x}%` }}
              title={profiles.belle.name}
            >
              {profiles.belle.species === "rabbit" ? "🐰" : "🐱"}
            </span>
          )}

          {/* Partner live radar pin */}
          {maps.partner === currentMap && (
            <span
              className="minimap-pin partner-pin"
              style={{ left: `${positions.partner.x}%` }}
              title={profiles.partner.name}
            >
              🐶
            </span>
          )}
        </div>

        <button
          type="button"
          className={`camera-mode-pill mode-${cameraMode}`}
          onClick={() => {
            if (cameraMode === "follow" && maps[otherRole] === currentMap) {
              setCameraMode("partner");
            } else {
              setCameraMode("follow");
            }
          }}
        >
          {cameraMode === "free"
            ? t.cameraFreePan
            : cameraMode === "partner"
              ? t.cameraLookPartner
              : t.cameraFollowMine}
        </button>
      </div>

      {/* 2.5D Panorama Storybook Stage (Wide Garden 220% / Wide Cozy Houses 175%) */}
      <div
        ref={stageRef}
        className={`character-stage map-${currentMap} theme-${timeOfDay} ${decorating ? "is-decorating" : ""} ${isDraggingStage ? "is-dragging" : ""}`}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
      >
        <div className="stage-lighting-overlay" aria-hidden="true" />

        {/* Sky Weather Overlays: Pink Petal Shower (Couple Tree) & Meteor Shower (Star Observatory) */}
        {petalShowerActive && (
          <div className="sky-petal-shower" aria-hidden="true">
            {Array.from({ length: 14 }).map((_, idx) => (
              <i key={idx} className={`petal p-${idx + 1}`}>🌸</i>
            ))}
          </div>
        )}
        {meteorShowerActive && (
          <div className="sky-meteor-shower" aria-hidden="true">
            <i className="meteor m-1">🌠</i>
            <i className="meteor m-2">🌠</i>
            <i className="meteor m-3">✨</i>
            <i className="meteor m-4">🌠</i>
          </div>
        )}

        {/* Wide Scrollable World Camera Canvas */}
        <div
          ref={canvasRef}
          className={`world-camera-canvas ${isDraggingStage ? "dragging" : ""}`}
          style={{
            width: `${worldScaleX * 100}%`,
            backgroundImage: `url("${stageBgImage}")`,
            transform: `translate3d(${activeCameraPanX}%, 0, 0)`
          }}
        >
          {/* GARDEN MAP ELEMENTS: 2 Cottages + 6 Interactive Environment Spots */}
          {currentMap === "garden" && (
            <>
              {/* Belle's Fairy-Tale Cottage (Left Zone Portal) */}
              <button
                type="button"
                className="cottage-portal belle-cottage"
                style={{ zIndex: 43 }}
                onClick={(e) => handlePortalToHouse(e, "belle_house")}
                aria-label={t.enterBelleHouse}
              >
                <img src={characterAsset("belle-cottage.webp")} alt="" />
                <span className="cottage-door-badge">
                  <Home size={12} /> {t.mapBelleHouse}
                  {maps.belle === "belle_house" && <i className="inside-tag">Belle 🏠</i>}
                  {maps.partner === "belle_house" && <i className="inside-tag">🐶 🏠</i>}
                </span>
              </button>

              {/* Partner's Cozy Cottage (Right Zone Portal) */}
              <button
                type="button"
                className="cottage-portal partner-cottage"
                style={{ zIndex: 43 }}
                onClick={(e) => handlePortalToHouse(e, "partner_house")}
                aria-label={t.enterPartnerHouse}
              >
                <img src={characterAsset("partner-cottage.webp")} alt="" />
                <span className="cottage-door-badge">
                  <Home size={12} /> {t.mapPartnerHouse}
                  {maps.belle === "partner_house" && <i className="inside-tag">Belle 🏠</i>}
                  {maps.partner === "partner_house" && <i className="inside-tag">🐶 🏠</i>}
                </span>
              </button>

              {/* Spot 1: Wish Mailbox (Left Zone x:25, y:53) */}
              <button
                type="button"
                className={`world-spot-btn spot-mailbox ${gardenGift ? "has-new-gift" : ""}`}
                style={{ left: "25%", top: "53%", zIndex: 52 }}
                onClick={(e) => void handleInteractiveSpotClick(e, "wish_mailbox")}
              >
                {gardenGift && <span className="spot-floating-alert">💌 NEW!</span>}
                <span className="spot-visual-icon">📮</span>
                <span className="spot-label-pill">{t.spotMailboxLabel}</span>
              </button>

              {/* Spot 2: Growing Couple Love Tree (Left-Center Meadow x:33, y:46) */}
              <button
                type="button"
                className={`world-spot-btn spot-couple-tree stage-${treeStage.level} ${sharedActiveSpot === "couple_tree" ? "synergy-active" : ""}`}
                style={{ left: "33%", top: "46%", zIndex: 46 }}
                onClick={(e) => void handleInteractiveSpotClick(e, "couple_tree")}
              >
                {sharedActiveSpot === "couple_tree" && (
                  <span className="spot-synergy-arch">🌸💞🌸</span>
                )}
                <div className="couple-tree-visual">
                  <img
                    src={characterAsset("garden-flowerbed-prop.webp")}
                    alt=""
                    className="tree-base-flowerbed"
                  />
                  <span className="tree-crown-emoji">{treeStage.emoji}</span>
                </div>
                <span className="spot-label-pill">
                  {t.spotTreeLabel} <em>{treeStage.badge} · 💧{worldProps.coupleTreeExp || 0}</em>
                </span>
              </button>

              {/* Spot 3: Central Watercolor Wooden Bench & Glowing Street Lamp (x:50, y:50) */}
              <button
                type="button"
                className={`garden-center-bench-sprite interactive-bench ${sharedActiveSpot === "garden_bench" ? "synergy-active" : ""}`}
                style={{ zIndex: 50 }}
                onClick={(e) => void handleInteractiveSpotClick(e, "garden_bench")}
              >
                {sharedActiveSpot === "garden_bench" && (
                  <span className="spot-synergy-arch bench-heart-arch">💞 ♪ ♡</span>
                )}
                <img src={characterAsset("garden-bench-prop.webp")} alt="" />
                {(timeOfDay !== "day" || activeSpots.belle === "garden_bench" || activeSpots.partner === "garden_bench") && (
                  <span className="bench-lantern-glow" />
                )}
                <span className="spot-label-pill bench-pill">🪑 {t.spotBenchLabel}</span>
              </button>

              {/* Spot 4: Starlight Campfire & Picnic Plaza (Center-Bottom x:50, y:74) */}
              <button
                type="button"
                className={`world-spot-btn spot-campfire ${worldProps.campfireLit ? "is-lit" : "is-unlit"} ${sharedActiveSpot === "campfire" ? "synergy-active" : ""}`}
                style={{ left: "50%", top: "74%", zIndex: 72 }}
                onClick={(e) => void handleInteractiveSpotClick(e, "campfire")}
              >
                {sharedActiveSpot === "campfire" && (
                  <span className="spot-synergy-arch">🔥💛🍓</span>
                )}
                <div className="campfire-visual">
                  {worldProps.campfireLit && <span className="campfire-warm-aura" />}
                  <span className="campfire-logs">🪵</span>
                  <span className="campfire-flame">{worldProps.campfireLit ? "🔥" : "🧺"}</span>
                  <span className="campfire-side-prop">🍓</span>
                </div>
                <span className="spot-label-pill">
                  {worldProps.campfireLit ? "🔥" : "🧺"} {t.spotCampfireLabel}
                </span>
              </button>

              {/* Spot 5: Stargazing Hill Observatory (Right-Upper Hill x:66, y:44) */}
              <button
                type="button"
                className={`world-spot-btn spot-observatory ${sharedActiveSpot === "star_observatory" ? "synergy-active" : ""}`}
                style={{ left: "66%", top: "44%", zIndex: 44 }}
                onClick={(e) => void handleInteractiveSpotClick(e, "star_observatory")}
              >
                {sharedActiveSpot === "star_observatory" && (
                  <span className="spot-synergy-arch">🌠💞🌙</span>
                )}
                <span className="spot-visual-icon">🔭</span>
                <span className="spot-label-pill">{t.spotStarLabel}</span>
              </button>

              {/* Spot 6: Firefly Lotus Pond & Stepping Stones (Right Meadow x:74, y:72) */}
              <button
                type="button"
                className={`world-spot-btn spot-sparkle-pond ${pondSplashActive ? "is-splashing" : ""} ${sharedActiveSpot === "sparkle_pond" ? "synergy-active" : ""}`}
                style={{ left: "74%", top: "72%", zIndex: 68 }}
                onClick={(e) => void handleInteractiveSpotClick(e, "sparkle_pond")}
              >
                {(pondSplashActive || sharedActiveSpot === "sparkle_pond") && (
                  <span className="pond-leaping-fish">🐠 🫧 ✨</span>
                )}
                <div className="pond-water-basin">
                  <span className="pond-ripple r-1" />
                  <span className="pond-ripple r-2" />
                  <span className="pond-lotus">🪷</span>
                  <span className="pond-duck">🫧</span>
                </div>
                <span className="spot-label-pill">⛲ {t.spotPondLabel}</span>
              </button>
            </>
          )}

          {/* WIDE INTERIOR HOUSE ELEMENTS: 3 Separated 2-Player Furniture Spots + Exit Doorway */}
          {currentMap !== "garden" && (
            <>
              {/* Wide Room Architectural Ambiance: Left Window Sunbeam & Center Woven Lounge Rug */}
              <div className="wide-room-sunbeam" aria-hidden="true" />
              <div className={`wide-room-center-rug ${currentMap}`} aria-hidden="true" />

              {/* Interior Spot 1: Left Tea Party Table (2-player face-to-face slots) */}
              <button
                type="button"
                className={`room-hotspot table-spot ${sharedActiveSpot === "tea_table" ? "synergy-active" : ""}`}
                style={{ left: "25%", top: "55%" }}
                onClick={(e) => void handleInteractiveSpotClick(e, "tea_table")}
              >
                {sharedActiveSpot === "tea_table" && (
                  <span className="spot-synergy-arch">🫖🍓💞</span>
                )}
                <span>🍓</span>
                <small className="room-spot-caption">{t.spotTableLabel}</small>
              </button>

              {/* Interior Spot 2: Center Cozy Living Room Rug (2-player lounge slots) */}
              <button
                type="button"
                className={`room-hotspot rug-spot ${sharedActiveSpot === "cozy_rug" ? "synergy-active" : ""}`}
                style={{ left: "48%", top: "67%" }}
                onClick={(e) => void handleInteractiveSpotClick(e, "cozy_rug")}
              >
                {sharedActiveSpot === "cozy_rug" && (
                  <span className="spot-synergy-arch">🧶🐾💞</span>
                )}
                <span>🧶</span>
                <small className="room-spot-caption">{t.spotRugLabel}</small>
              </button>

              {/* Interior Spot 3: Right Bedroom Suite Bed (2-player side-by-side pillow slots) */}
              <button
                type="button"
                className={`room-hotspot bed-spot ${sharedActiveSpot === "bed" ? "synergy-active" : ""}`}
                style={{ left: "72%", top: "48%" }}
                onClick={(e) => void handleInteractiveSpotClick(e, "bed")}
              >
                {sharedActiveSpot === "bed" && (
                  <span className="spot-synergy-arch">💤💞🌙</span>
                )}
                <span>💤</span>
                <small className="room-spot-caption">{t.spotBedLabel}</small>
              </button>

              <button
                type="button"
                className={`room-exit-mat ${currentMap === "belle_house" ? "belle-mat" : "partner-mat"}`}
                style={{ left: "50%", zIndex: 92 }}
                onClick={handleExitRoomToGarden}
              >
                <DoorOpen size={15} />
                <span>{t.exitToGarden}</span>
              </button>
            </>
          )}

          {/* Placed Decorations on Current Map */}
          {currentMapDecors.map((item) => {
            const catalogEntry = DECOR_CATALOG.find((c) => c.type === item.type);
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
                title={catalogEntry?.label[lang]}
              >
                {catalogEntry?.sprite ? (
                  <img src={characterAsset(catalogEntry.sprite)} alt={catalogEntry.label[lang]} />
                ) : (
                  <span className="decor-emoji-sprite">{catalogEntry?.emoji}</span>
                )}
                {decorating && <span className="decor-remove-badge">×</span>}
              </button>
            );
          })}

          {/* Fireflies at night/sunset in the garden */}
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
                moveMyCharacterTo({ x: clamp(gardenGift.x - 4, 12, 86), y: gardenGift.y }, "run", "happy");
                setGiftOpenView(true);
              }}
            >
              <span className="gift-sparkle">✨</span>
              <span className="gift-emoji">{GIFT_ICONS[gardenGift.icon]}</span>
              <span className="gift-shadow" />
            </button>
          )}

          {/* Floating Heart & Sparkle Bursts */}
          {burstHearts.map((burst) => (
            <div
              key={burst.id}
              className="garden-heart-burst"
              style={{ left: `${burst.x}%`, top: `${burst.y}%`, zIndex: 130 }}
              aria-hidden="true"
            >
              <span>{burst.symbol || "♡"}</span>
              <span>✨</span>
              <span>♥</span>
            </div>
          ))}

          {/* Belle Character (rendered if she is in currentMap) */}
          {maps.belle === currentMap && (
            <button
              type="button"
              className={`roaming-pet belle ${mood.belle} ${currentRole === "belle" ? "is-mine" : "is-partner"} ${activeSpots.belle ? `on-spot-${activeSpots.belle}` : ""}`}
              style={getDepthStyle("belle")}
              onClick={(e) => handlePetCharacter(e, "belle")}
              aria-label={`${profiles.belle.name}`}
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

          {/* Partner Puppy Character (rendered if he is in currentMap) */}
          {maps.partner === currentMap && (
            <button
              type="button"
              className={`roaming-pet partner ${mood.partner} ${currentRole === "partner" ? "is-mine" : "is-partner"} ${activeSpots.partner ? `on-spot-${activeSpots.partner}` : ""}`}
              style={getDepthStyle("partner")}
              onClick={(e) => handlePetCharacter(e, "partner")}
              aria-label={`${profiles.partner.name}`}
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

        <div className="garden-stage-hint">
          {decorating
            ? t.tapHintDecor
            : currentMap === "garden"
              ? t.tapHintGarden
              : t.tapHintHouse}
        </div>
      </div>

      {/* Decoration Palette Drawer (when Decorating) */}
      {decorating && (
        <div className="garden-decor-palette" role="region" aria-label={t.decorateBtn}>
          <div className="decor-palette-header">
            <strong><Flower2 size={15} /> {t.decorateBtn}</strong>
            <div className="decor-palette-actions">
              <button
                type="button"
                className="decor-reset-btn"
                onClick={() => void saveDecorationsToCloud(DEFAULT_DECORS)}
              >
                {t.decorateReset}
              </button>
              <button
                type="button"
                className="decor-done-btn"
                onClick={() => setDecorating(false)}
              >
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

      {/* Real-Time Co-op Interaction Bar (when both characters are in the same space or want to meet) */}
      <div className={`realtime-coop-bar ${isCloseTogether ? "is-close" : ""}`}>
        <div className="coop-status-head">
          <span className="coop-heart-badge">{isCloseTogether ? "💞" : isSameMap ? "🐾" : "🏡"}</span>
          <p>
            {isCloseTogether
              ? t.sameMapNear
              : isSameMap
                ? t.sameMapFar
                : `${profiles[otherRole].name} ${t.differentMapInfo} (${mapLabel(maps[otherRole])})`}
          </p>
          {!isCloseTogether && (
            <button
              type="button"
              className="coop-approach-btn"
              onClick={() => {
                if (!isSameMap) {
                  changeMyMap(maps[otherRole], {
                    x: clamp(positions[otherRole].x + (currentRole === "belle" ? -11 : 11), 22, 78),
                    y: clamp(positions[otherRole].y, 52, 80)
                  });
                } else {
                  handleApproachPartner();
                }
              }}
            >
              <Navigation size={13} />
              <span>{!isSameMap ? t.followPartner : t.approachPartnerBtn}</span>
            </button>
          )}
        </div>

        <div className="coop-action-buttons">
          <button type="button" onClick={() => void triggerCoopInteraction("hug")}>
            <span>🤗</span> {t.coopHug}
          </button>
          <button type="button" onClick={() => void triggerCoopInteraction("feed")}>
            <span>🍓</span> {t.coopFeed}
          </button>
          <button type="button" onClick={() => void triggerCoopInteraction("flower")}>
            <span>🌷</span> {t.coopFlower}
          </button>
          <button type="button" onClick={() => void triggerCoopInteraction("jump")}>
            <span>✨</span> {t.coopJump}
          </button>
          <button type="button" onClick={() => void triggerCoopInteraction("nap")}>
            <span>💤</span> {t.coopNap}
          </button>
        </div>
      </div>

      {/* Live Overhead Speech Bubble Bar + World Tools */}
      <div className="live-speech-and-tools">
        <form
          className="live-speech-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendSpeechBubble();
          }}
        >
          <MessageCircleHeart size={17} className="speech-icon" />
          <input
            type="text"
            maxLength={28}
            placeholder={t.speechPlaceholder}
            value={speechDraft}
            onChange={(e) => setSpeechDraft(e.target.value)}
          />
          <button type="submit" className="speech-send-btn">
            <Send size={14} /> {t.speechSend}
          </button>
        </form>

        <div className="quick-speech-chips">
          {t.quickChips.map((chip) => (
            <button key={chip} type="button" onClick={() => handleSendSpeechBubble(chip)}>
              {chip}
            </button>
          ))}
        </div>

        <div className="character-controls">
          <button
            type="button"
            className={decorating ? "active-tool" : ""}
            onClick={() => setDecorating((prev) => !prev)}
          >
            <Flower2 size={15} /> {decorating ? t.decorateDone : t.decorateBtn}
          </button>
          <button type="button" onClick={() => setGiftModalOpen(true)}>
            <Gift size={15} /> {t.leaveGift}
          </button>
          <button type="button" className="primary" onClick={openMyEditor}>
            <Pencil size={15} /> {t.edit}
          </button>
        </div>
      </div>

      {/* Character Profile Cards (Strict Owner Edit Lock) */}
      <div className="character-profiles">
        {profileList.map((profile) => {
          const isMine = profile.role === currentRole;
          return (
            <article
              key={profile.role}
              className={`character-profile-row ${isMine ? "is-mine-card" : "is-readonly-card"}`}
              onClick={() => handleProfileCardClick(profile.role)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleProfileCardClick(profile.role)}
            >
              <div className="character-profile-avatar-wrap">
                <img
                  className="character-profile-sprite"
                  src={
                    profile.role === "partner"
                      ? characterAsset("partner-puppy.webp")
                      : profile.species === "rabbit"
                        ? characterAsset("belle-rabbit.webp")
                        : characterAsset("belle-cat.webp")
                  }
                  alt=""
                />
                {profile.photoUrl && (
                  <img
                    className="character-profile-user-photo"
                    src={profile.photoUrl}
                    alt={profile.name}
                  />
                )}
              </div>
              <div>
                <div className="profile-name-line">
                  <h3>{profile.name}</h3>
                  <span>{profile.species === "cat" ? t.cat : profile.species === "rabbit" ? t.rabbit : t.dog}</span>
                  {isMine && (
                    <small className="profile-edit-pill">
                      <Pencil size={10} /> {t.editProfileBtn}
                    </small>
                  )}
                </div>
                <p>{profile.message || "♡"}</p>
                <small><Cake size={13} /> {profile.birthday || t.emptyBirthday}</small>
              </div>
            </article>
          );
        })}
      </div>

      {/* Place Gift Note Modal */}
      {giftModalOpen && (
        <div className="character-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setGiftModalOpen(false)}>
          <div className="character-editor" role="dialog" aria-modal="true" aria-label={t.giftModalTitle}>
            <div className="editor-handle" />
            <button type="button" className="editor-close" onClick={() => setGiftModalOpen(false)} aria-label={t.cancel}><X size={20} /></button>
            <span className="editor-kicker">GARDEN GIFT NOTE</span>
            <h3>{t.giftModalTitle}</h3>
            <p className="gift-modal-desc">{t.giftModalDesc}</p>

            <div className="gift-icon-picker">
              <span>{t.giftIconLabel}</span>
              <div className="gift-icon-row">
                {(Object.keys(GIFT_ICONS) as Array<GardenGiftNote["icon"]>).map((iconKey) => (
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
            </div>

            <label>
              {t.giftMessageLabel}
              <input
                maxLength={60}
                placeholder={t.giftPlaceholder}
                value={giftTextDraft}
                onChange={(e) => setGiftTextDraft(e.target.value)}
              />
            </label>

            <button type="button" className="editor-save" onClick={() => void handlePlaceGift()}>
              <Gift size={18} /> {t.giftPlaceBtn}
            </button>
          </div>
        </div>
      )}

      {/* Open Gift Note Viewer Modal */}
      {giftOpenView && gardenGift && (
        <div className="character-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setGiftOpenView(false)}>
          <div className="character-editor gift-note-card" role="dialog" aria-modal="true">
            <div className="editor-handle" />
            <button type="button" className="editor-close" onClick={() => setGiftOpenView(false)} aria-label={t.cancel}><X size={20} /></button>
            <div className="gift-note-hero">{GIFT_ICONS[gardenGift.icon]}</div>
            <span className="editor-kicker">{gardenGift.fromName} {t.giftFrom}</span>
            <p className="gift-note-body">“{gardenGift.message}”</p>
            <div className="gift-note-actions">
              <button type="button" className="editor-photo-remove" onClick={() => void handleRemoveGift()}>
                <Trash2 size={14} /> {t.giftRemove}
              </button>
              <button type="button" className="editor-save" style={{ marginTop: 0 }} onClick={() => setGiftOpenView(false)}>
                <Heart size={16} fill="currentColor" /> {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Character & Profile Editor Modal (Strictly for currentRole) */}
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

            <div className="editor-photo-section">
              <span className="editor-photo-label">{t.photoLabel}</span>
              <div className="editor-photo-row">
                <div className="editor-photo-preview">
                  {draft.photoUrl ? (
                    <img src={draft.photoUrl} alt="profile" />
                  ) : (
                    <img
                      src={currentRole === "partner" ? characterAsset("partner-puppy.webp") : draft.species === "rabbit" ? characterAsset("belle-rabbit.webp") : characterAsset("belle-cat.webp")}
                      alt=""
                      className="placeholder-sprite"
                    />
                  )}
                </div>
                <div className="editor-photo-actions">
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
                    className="editor-photo-btn"
                    disabled={photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoUploading ? <LoaderCircle size={15} className="topic-spin" /> : <Camera size={15} />}
                    <span>{photoUploading ? t.photoUploading : draft.photoUrl ? t.photoChange : t.photoUpload}</span>
                  </button>
                  {draft.photoUrl && (
                    <button
                      type="button"
                      className="editor-photo-remove"
                      onClick={() => setDraft({ ...draft, photoUrl: "" })}
                    >
                      <Trash2 size={14} />
                      <span>{t.photoRemove}</span>
                    </button>
                  )}
                </div>
              </div>
              {photoError && <p className="editor-photo-error">{photoError}</p>}
            </div>

            <label>{t.name}<input maxLength={16} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>{t.birthday}<input type="date" value={draft.birthday} onChange={(e) => setDraft({ ...draft, birthday: e.target.value })} /></label>
            <label>{t.message}<input maxLength={40} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></label>
            <button type="button" className="editor-save" onClick={saveProfile} disabled={photoUploading}>
              {saved ? <Check size={18} /> : currentRole === "belle" ? <Rabbit size={18} /> : <Heart size={18} />}
              {saved ? t.saved : t.save}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
