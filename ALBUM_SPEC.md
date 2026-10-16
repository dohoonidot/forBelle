# ForBelle 비공개 추억 앨범 설계서

> 문서 상태: 구현 진행 v1.0  
> 작성일: 2026-10-16  
> 목표: Firebase Spark 요금제를 유지하면서 Supabase 무료 Storage를 사진 저장소로 사용하는, 둘만의 모바일 우선 비공개 앨범을 완성한다.

---

## 1. 제품 목표

- iPhone Safari에서 여러 사진을 한 번에 선택하고 업로드할 수 있다.
- 원본은 기기에 남기고, 웹 감상용 이미지만 자동 압축하여 무료 용량을 아낀다.
- Firebase 로그인 사용자는 그대로 사용하며 추가 로그인은 하지 않는다.
- 사진 파일은 Supabase 비공개 버킷에, 메타데이터는 기존 Firestore에 저장한다.
- 사진 주소를 알아도 인증되지 않은 사용자는 열 수 없다.
- 월별 타임라인, 앨범 태그, 즐겨찾기, 전체화면 스와이프를 제공한다.

## 2. 시각·콘텐츠·인터랙션 방향

- **Visual thesis**: 따뜻한 아이보리 종이 위에 필름 사진을 펼쳐 놓은 듯한 차분하고 친밀한 분위기.
- **Content plan**: 월별 대표 기억 → 타임라인/앨범 필터 → 사진 그리드 → 상세 감상 및 메모.
- **Interaction thesis**: 업로드 사진이 순차적으로 나타나고, 필터 전환은 부드럽게 재배치되며, 전체화면에서는 좌우 스와이프로 넘긴다.

## 3. 무료 인프라 구조

```text
iPhone / Web
  ├─ Firebase Authentication: 기존 두 계정 로그인
  ├─ Cloud Firestore: album_photos 메타데이터와 실시간 동기화
  └─ Supabase Storage: 실제 WebP 파일(비공개 bucket)
       ├─ album/{uid}/{photoId}/display.webp
       └─ album/{uid}/{photoId}/thumb.webp
```

- Supabase Free: Storage 1GB, 월 egress 5GB 기준.
- 표시용 최대 2048px WebP(품질 82%)와 썸네일 최대 640px WebP(품질 76%)를 생성한다.
- 장당 목표 총량은 약 350~800KB이며, 실제 안전 보관 목표는 약 1,200~1,600장이다.
- 원본 보관 서비스가 아니므로 인쇄용 원본은 iCloud/휴대폰에 유지한다.

## 4. 보안 모델

- Supabase bucket 이름: `couple-album`, 반드시 **Private**.
- 앱은 공개 가능한 Project URL과 Publishable/Anon Key만 사용한다. `service_role` 키는 절대 프론트에 넣지 않는다.
- Supabase Third-Party Auth에 Firebase project `forbelle-d9825`를 연결한다.
- Firebase 기본 토큰에는 `role: authenticated`가 없으므로 Storage 정책은 `anon` 역할에 열되 다음 JWT 조건을 모두 확인한다.
  - `iss = https://securetoken.google.com/forbelle-d9825`
  - `aud = forbelle-d9825`
  - `email`이 허용된 두 계정 중 하나
- 두 계정은 서로의 사진을 읽을 수 있고, 본인이 올린 파일만 삭제할 수 있다.

## 5. Firestore 데이터 모델

```ts
interface AlbumPhoto {
  id: string;
  displayPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  bytes: number;
  caption: string;
  location: string;
  takenDate: string; // YYYY-MM-DD
  albumTag: string;
  likedBy: string[]; // Firebase UID
  createdBy: string; // Firebase UID
  createdByName: string;
  createdAt: Timestamp;
}
```

컬렉션은 `album_photos`를 사용한다. 오래된 앱 데이터는 변경하지 않는다.

## 6. 구현 체크리스트

### Phase 0 — 설계와 연결 기반

- [x] 별도 설계 문서 작성
- [x] Supabase 클라이언트 모듈 분리
- [x] 환경변수 예시와 설정 상태 감지
- [x] 비공개 Storage 정책 SQL 제공
- [x] Firestore `album_photos` 보안 규칙 조각 제공

### Phase 1 — 업로드 파이프라인

- [x] iPhone 사진 다중 선택
- [x] JPG/JPEG/PNG/WebP/HEIC/HEIF 등 이미지 형식·개수·크기 검증
- [x] Safari가 직접 읽지 못하는 HEIC/HEIF의 브라우저 내 JPEG 변환 대체 경로
- [x] EXIF 방향을 브라우저 디코더 기준으로 보정
- [x] display/thumbnail WebP 압축
- [x] iPhone 메모리 절약을 위한 display/thumbnail 순차 처리와 캔버스 해제
- [x] 파일별 진행 상태와 실패 표시
- [x] Storage 업로드 후 Firestore 메타데이터 저장
- [x] 중간 실패 시 이미 업로드한 파일 정리

### Phase 2 — 앨범 감상

- [x] Firestore 실시간 구독
- [x] 최신순 타임라인
- [x] 월별 구분
- [x] 앨범 태그 필터
- [x] 비공개 signed URL 발급 및 표시
- [x] 빈 화면과 설정 미완료 안내

### Phase 3 — 상호작용

- [x] 전체화면 라이트박스
- [x] 좌우 버튼 및 모바일 스와이프
- [x] 하트 즐겨찾기
- [x] 본인 사진 삭제와 Storage 파일 정리
- [x] 날짜·장소·설명 표시

### Phase 4 — 품질 검증

- [x] 실제 Supabase 프로젝트 연결
- [ ] 실제 두 Firebase 계정 업로드/조회/삭제 확인
- [ ] iPhone Safari 실기기 확인
- [ ] 320×568 확인
- [x] 390×844 확인 (설정 대기 화면, 가로 넘침 없음)
- [ ] 430×932 확인
- [ ] 느린 네트워크/부분 실패 확인
- [x] TypeScript 검사
- [x] 프로덕션 빌드

## 7. Supabase 최초 1회 설정

1. Supabase에서 Free 프로젝트를 만든다.
2. Authentication → Third-Party Auth → Firebase에 `forbelle-d9825`를 등록한다.
3. Storage에서 `couple-album` private bucket을 만든다. 허용 형식은 `image/webp`, 파일 제한은 5MB를 권장한다.
4. SQL Editor에서 저장소 정책 파일 `supabase/album-storage-policies.sql`을 실행한다.
5. Firebase Console의 Firestore Rules에 `firebase/firestore-album-rules.snippet` 내용을 기존 규칙과 합쳐 게시한다.
6. Project Settings → API의 Project URL과 Publishable Key를 `.env.local`에 넣는다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

7. GitHub Pages 배포 환경에도 동일한 두 값을 build-time 환경변수로 제공한다.

## 8. 완료 정의

- 둘 중 한 명이 iPhone에서 사진을 올리면 다른 계정 화면에 실시간으로 나타난다.
- 로그아웃 상태 또는 허용되지 않은 Firebase 계정은 사진을 읽거나 쓸 수 없다.
- 사진 업로드 전후에도 기존 로그인, 채팅, 음악, 일기, 캐릭터 기능이 정상 동작한다.
- 외부 키가 아직 없을 때 앱이 깨지지 않고 설정 안내 화면을 보여준다.

