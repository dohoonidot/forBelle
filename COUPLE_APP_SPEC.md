# 💑 ForBelle (커플 웹앱) 기능 상세 설계서 (Feature Specification)

본 문서는 **ForBelle** 프로젝트를 100% 무료 인프라(GitHub Pages + Firebase Spark Plan) 위에서 여자친구(Belle)와 함께 사용하는 고품질 감성 커플 웹앱으로 고도화하기 위한 기능별 상세 기술 설계서입니다.

---

## 📌 0. 인프라 및 비용 최적화 원칙 (Free-Tier Architecture)

* **프론트엔드**: GitHub Pages (`https://dohoonidot.github.io/forBelle/`)
* **백엔드/데이터베이스**: Firebase Cloud Firestore (실시간 NoSQL, 1GB 무료)
* **인증**: Firebase Authentication (이메일/비번, 50,000 MAU 무료)
* **미디어 스토리지**: Firebase Cloud Storage (5GB 용량, 일일 1GB 다운로드 대역폭)
* **핵심 기술 (이미지 압축 파이프라인)**:
  - 브라우저 단에서 HTML5 Canvas 기반 WebP 리사이징(최대 1920px, 품질 85%)을 거쳐 **장당 200~400KB**로 축소 후 Storage 업로드.
  - **효과**: 무료 5GB 용량으로 **약 15,000 ~ 25,000장의 고화질 사진 영구 보관 가능** (10년 이상 무료 운영 보장).

---

## 🎨 감성 UI/UX 테마 및 디자인 시스템
* **컬러 팔레트**:
  - Primary: Rose Gold (`#E07A5F`, `#F4A261`, `#E76F51`)
  - Accent / Love: Coral Pink (`#FF6B8B`, `#FF8E53`)
  - Background: Soft Warm Ivory / Night Navy (`#FFFDF9`, `#1A1A24`)
  - Glassmorphism: 반투명 카드 (`backdrop-filter: blur(16px)`, `rgba(255,255,255,0.7)`)
* **타이포그래피**: Pretendard / Outfit (모던하고 세련된 감성 서체)
* **마이크로 애니메이션**: Framer Motion 기반 부드러운 탭 전환, 하트 펄스 효과, 라이트박스 줌 인

---

## 🛠️ 기능별 상세 설계

---

### [기능 1] 메인 화면: 대표 커플 사진 등록 & 디데이/기념일 커스텀

메인 홈 접속 시 첫눈에 둘만의 추억이 보이고, D-Day와 다음 기념일을 한눈에 확인하며 커스텀할 수 있는 공간입니다.

#### 1. 대표 커플 사진 실시간 등록 & 변경
* **UI/UX**:
  - 메인 히어로 카드 상단 사진에 마우스 호버(또는 모바일 터치) 시 **카메라/수정 아이콘(📷)** 표시.
  - 사진 클릭 시:
    - 일반 클릭: **전체화면 고화질 라이트박스 팝업** (광안대교 노을 사진 등 확대 감상).
    - 수정 버튼 클릭: **사진 변경 모달** 오픈 (새 사진 업로드, 장소/날짜 태그 입력, 사진 설명 문구 편집).
  - 이미지 업로드 시 자동 압축(WebP) 후 Firebase Storage (`couple_hero/cover.webp`)에 저장.
* **데이터 모델 (Firestore: `settings/couple`)**:
  ```typescript
  interface CoupleSettings {
    startDate: string; // "2025-09-23" (처음 만난 날/사귄 날)
    coverPhotoUrl: string; // Storage URL
    coverLocation: string; // 예: "부산 광안리 바다"
    coverDate: string; // 예: "2025년 9월 23일"
    coverCaption: string; // 예: "우리의 사랑이 시작된 부산의 바다"
    customMilestones: Array<{
      id: string;
      name: string;
      date: string; // "YYYY-MM-DD"
      icon?: string;
    }>;
  }
  ```

#### 2. 디데이 & 기념일 커스텀 위젯
* **기능 상세**:
  - **자동 D-Day 계산기**: `startDate`를 기준으로 오늘이 사귄 지 며칠째(`D+OOO`)인지 실시간 자동 연산.
  - **설정 모달 (기념일 관리)**:
    - 사귄 날짜(시작일) 변경 (Date Picker 지원).
    - 기본 제공 기념일: 100일, 200일, 300일, 1주년, 400일, 500일, 2주년 등 자동 계산.
    - **나만의 커스텀 기념일 추가**: "Belle 생일", "첫 해외여행", "프러포즈 데이" 등 사용자 맞춤 기념일 직접 등록/삭제.
    - 가장 가까운 다가오는 기념일에 `⭐ D-Day` 하이라이트 배지 부여.

---

### [기능 2] 커플 추억 갤러리 (Photo Timeline & Album)

둘만의 데이트 사진, 여행 기록을 날짜별/앨범별로 모아보는 전용 앨범 탭입니다.

#### 1. 뷰 모드
* **타임라인 뷰 (피드형)**:
  - 인스타그램/폴라로이드 감성의 카드 피드 (최신순 정렬).
  - 날짜 헤더, 촬영 장소, 사진 묶음(슬라이더), 함께 적은 짧은 메모.
* **앨범 뷰 (폴더형)**:
  - '부산 여행', '100일 기념', '카페 투어', '일상 데이트' 등 태그/앨범별 분류.

#### 2. 사진 업로드 & 압축 파이프라인
* **다중 업로드**: 한 번에 여러 장의 사진 선택 가능.
* **클라이언트 즉시 압축**:
  - 10MB 원본 사진을 브라우저에서 200~400KB WebP로 자동 압축 후 Firebase Storage에 전송.
  - 업로드 프로그레스 바(진행률 %) 실시간 표시.
* **데이터 모델 (Firestore: `photos`)**:
  ```typescript
  interface PhotoMemory {
    id: string;
    imageUrls: string[]; // 압축된 WebP 이미지 URL 배열
    caption: string;
    location: string;
    date: string; // "YYYY-MM-DD"
    albumTag: string; // 예: "부산여행", "일상"
    likedBy: string[]; // 좋아요 누른 UID
    createdAt: Timestamp;
    createdBy: string; // 업로더 UID
  }
  ```

#### 3. 뷰어 기능
* 사진 클릭 시 부드러운 Framer-Motion 애니메이션과 함께 **전체화면 라이트박스**.
* 모바일 스와이프 제스처로 이전/다음 사진 넘기기 지원.

---

### [기능 3] 오늘의 주제 & 일기장 (TipTap 기반 본문 사진 삽입)

현재 구현되어 있는 TipTap 폴더/문서 트리 구조에 **사진 본문 삽입 기능**을 결합하여, 둘만의 풍성한 디지털 교환일기를 만듭니다.

#### 1. TipTap 에디터 인라인 이미지 삽입
* **도구 모음(Toolbar) 확장**:
  - `이미지 첨부` 버튼 클릭 → 파일 선택 창 오픈.
  - **드래그 앤 드롭(Drag & Drop)**: 컴퓨터에서 사진을 글 본문 원하는 위치로 드래그하면 즉시 삽입.
  - **클립보드 붙여넣기(Ctrl+V)**: 스크린샷이나 복사한 이미지를 바로 붙여넣기 가능.
* **동작 원리**:
  1. 이미지를 에디터에 놓거나 선택.
  2. 프론트엔드에서 즉시 WebP 리사이징.
  3. Firebase Storage (`diary_images/${docId}/${uniqueId}.webp`)로 백그라운드 업로드.
  4. 업로드된 URL을 TipTap `editor.chain().focus().setImage({ src: url }).run()`으로 본문 삽입.

#### 2. 교환일기 & 오늘의 질문(Topic)
* **오늘의 대화 질문**: 매일 1개씩 둘이 이야기해볼 수 있는 로맨틱 질문 카드 (예: "우리가 처음 손잡았던 순간 기억나?", "이번 주말에 꼭 같이 먹고 싶은 음식은?").
* **댓글/답글 기능**: 상대방이 쓴 일기 아래에 하트나 짧은 코멘트 남기기.

---

### [기능 4] 둘만의 음악 & 싱크 가사 (기존 핵심 엔진 고도화)

기존 TW Lyrics Sync 엔진을 커플 플레이어로 완벽하게 통합합니다.

* **YouTube IFrame API 연동**: 음원 저작권이나 서버 스트리밍 비용 없이 YouTube 공식 영상/음원을 안전하게 재생.
* **싱크 가사 하이라이팅**: 0.15초 단위 정밀 동기화로 노래에 맞춰 대만어/한국어 가사가 감성적으로 스크롤.
* **플레이리스트 공유**:
  - 홈 화면의 '신청곡 보내기'를 통해 상대방이 듣고 싶은 노래를 신청하면, 승인 시 '우리의 노래' 목록에 자동 등록.
  - 둘만의 특별한 추억이 깃든 BGM 목록 관리.

---

### [기능 5] 상대에게 한마디 (Sweet Love Messages)

* 실시간 Firestore `onSnapshot` 기반 둘만의 비공개 쪽지함.
* 카카오톡과 달리 둘만의 정성스러운 포스트잇/러브레터 느낌의 카드 UI.
* 읽음 확인 배지 및 감정 이모지 반응 기능.

---

### [기능 6] 모바일 앱 설치 지원 (PWA: Progressive Web App)

* **배경**: 앱스토어/구글플레이 등록 없이(연 13만원 개발자 계정 비용 0원), 스마트폰 바탕화면에 바로가기 앱 아이콘 생성.
* **스펙**:
  - `manifest.json` 설정 (이름: ForBelle, 아이콘, 테마 색상).
  - 스마트폰 브라우저에서 **"홈 화면에 추가"**를 누르면, 상단 주소창이 사라지고 **실제 비트윈/카카오톡 앱처럼 전체화면으로 실행**.

---

## 📅 단계별 구현 로드맵 (Action Plan)

| 단계 | 주요 작업 내용 | 예상 소요 | 상태 |
| :--- | :--- | :--- | :--- |
| **Phase 0** | **현재 상태 빌드 및 배포 점검**<br>- 로컬에서 수정된 커플 홈 UI 빌드 (`npm run build`) 후 배포 반영<br>- 웹 주소 확인 및 라이브 사이트 검증 | 즉시 | ✅ 진행 예정 |
| **Phase 1** | **메인 홈 커스텀 (대표 사진 & D-Day/기념일 설정)**<br>- Firestore `settings/couple` 연동<br>- 메인 커버 사진 업로드 및 자동 압축 모달<br>- 사귄 날짜 및 커스텀 기념일 추가/수정 모달 구현 | 1일차 | 🚀 다음 단계 |
| **Phase 2** | **TipTap 일기장 사진 본문 삽입**<br>- 클라이언트 WebP 압축 유틸리티 함수 구현<br>- TipTap 툴바 이미지 업로드 버튼 및 드래그앤드롭/붙여넣기 연동<br>- Firebase Storage 자동 업로드 파이프라인 구축 | 1~2일차 | 준비 |
| **Phase 3** | **커플 갤러리 & 추억 앨범 탭 신설**<br>- 타임라인 뷰 / 앨범 뷰 UI 제작<br>- 다중 사진 업로드 및 메타데이터(날짜, 장소, 태그) 저장<br>- 전체화면 터치 스와이프 라이트박스 | 2~3일차 | 준비 |
| **Phase 4** | **PWA 및 디테일 감성 완성**<br>- 모바일 홈화면 추가용 Manifest & 아이콘 세팅<br>- 부드러운 마이크로 인터랙션 및 모바일 반응형 완벽 보정 | 3일차 | 마무리 |
