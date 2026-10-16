# ForBelle 다음 에이전트 인수인계

작성일: 2026-10-16  
프로젝트 경로: `/mnt/c/Users/user/Documents/belle`  
실행 앱 경로: `/mnt/c/Users/user/Documents/belle/web`

## 1. 프로젝트 개요

ForBelle은 두 사람만 사용하는 커플용 React/Vite 웹앱이다. Firebase를 기존 인증·실시간 데이터 저장에 사용하고, 사진 앨범 파일은 Supabase Storage를 연결해서 사용한다.

현재 주요 기능은 다음과 같다.

- 로컬 저장소 기반 자동 로그인
- 실시간 1:1 채팅
- 읽음 표시, 답장, 메시지 액션 등 채팅 편의 기능
- 커플 캐릭터 월드: 강아지, 아기 고양이, 아기 토끼
- 둘만의 다이어리(구 "오늘의 주제") 및 노트 작성
- 사진 앨범
- 음악 관련 화면과 기타 커플용 화면
- 모바일, 특히 iPhone 웹 사용을 우선한 반응형 UI

기존 설계 문서는 아래 파일을 참고한다.

- `COUPLE_APP_SPEC.md`
- `CHAT_IMPROVEMENT_SPEC.md`
- `CHARACTER_WORLD_SPEC.md`
- `ALBUM_SPEC.md`
- `ARCHITECTURE.md`

## 2. 사용자의 작업 방식과 요구사항

- 사용자가 직접 `git add`, `git commit`, `git push`를 한다.
- 에이전트는 별도 요청 없이 커밋하거나 푸시하지 않는다.
- 실제 사용자는 두 명뿐이며, 복잡한 다중 사용자 서비스보다 편리한 자동 로그인을 선호한다.
- 모바일 사용 비중이 높고 여자친구가 iPhone을 사용하므로 iPhone Safari 기준 UX를 중요하게 본다.
- UI는 작고 깔끔하면서 귀엽고, 화면마다 디자인과 테마가 자연스럽게 이어져야 한다.
- 기존 완성 기능과 현재 변경 파일을 임의로 삭제하거나 되돌리지 않는다.

## 3. 앨범 현재 상태

### 인프라

- Firebase 인증과 Supabase Third-Party Auth 연동 완료
- Supabase 프로젝트 생성 완료
- Storage 버킷 이름: `couple-album`
- 버킷 파일 크기 제한: 5MB
- 저장 MIME 타입: `image/webp`
- Firebase JWT를 이용하는 Supabase Storage 정책 적용 완료
- 클라이언트용 Supabase URL과 publishable key 연결 완료
- 비밀키나 서비스 역할 키는 저장소에 넣지 말 것

### 업로드 처리

- JPG/JPEG, PNG, WebP, HEIC, HEIF 입력 지원
- iPhone의 HEIC/HEIF는 `heic2any`로 브라우저에서 변환
- 이후 Canvas에서 WebP로 리사이즈 및 압축하여 업로드
- 원본 확장자와 관계없이 실제 저장 파일은 WebP
- 이미지 처리 작업은 메모리 급증을 줄이기 위해 순차 실행
- 브라우저 HEIC 샘플 변환 테스트 통과
- PNG 업로드와 실제 모바일 업로드 흐름을 기준으로 보완함

### 앨범 UI

- 모바일에서 더 콤팩트한 그리드와 간격 적용
- 320px, 390px, 430px 모바일 폭에서 3열 확인
- 1440px 데스크톱에서 4열 확인
- 위 네 해상도에서 가로 오버플로 없음
- 관련 파일:
  - `web/src/Album.tsx`
  - `web/src/album.css`
  - `web/src/albumImage.ts`
  - `web/package.json`
  - `web/package-lock.json`
  - `ALBUM_SPEC.md`

## 4. 둘만의 다이어리 현재 상태

둘만의 다이어리(구 "오늘의 주제", 내부 키 `topics`)는 폴더와 노트를 만들고 내용을 작성하는 간단한 커플 노트 기능이다. 데스크톱과 모바일 양쪽에서 자연스럽게 쓰도록 저장 흐름과 반응형 UI를 정리했다.

### 저장 안정성

- 저장 상태를 `dirty`, `saving`, `saved`, `error`로 구분해 표시
- 편집 중 Firestore 스냅샷이 현재 입력 내용을 덮어쓰지 않도록 방어
- 페이지 숨김, 이탈, 모드 전환 시 보류 중인 저장을 마무리하도록 처리
- 저장 실패 상태에서 다른 노트를 선택하거나 새 노트를 만들 때 데이터가 조용히 유실되지 않도록 방어
- 에러 처리 추가
- 선택한 폴더를 삭제할 때 하위 노트 선택 상태도 정리
- 모바일에서 노트 선택 후 사이드바 자동 닫힘
- 컨텍스트 메뉴가 화면 밖으로 나가지 않도록 위치 보정

### 실제 저장 검증

Firebase에 테스트 노트를 생성하고 아래 흐름을 확인했다.

1. 노트 생성
2. 본문 입력
3. 저장 완료 표시 대기
4. 페이지 새로고침
5. 같은 노트 재선택
6. 작성 내용 복원 확인
7. 테스트 노트 삭제

검증 결과는 `restored: true`였으며 콘솔 오류가 없었다.

### 반응형 및 디자인

- 모바일 전체 화면 편집기
- 모바일 사이드바와 콤팩트한 툴바
- 320px, 390px, 430px, 1440px에서 가로 오버플로 없음
- 따뜻한 아이보리와 로즈 계열 테마 적용
- 제목 하트 아이콘
- 사이드바 브랜드 블록: `FOR BELLE · OUR DIARY`
- 종이 느낌의 붉은 세로 여백선과 페이지 하트
- 날짜 달력 아이콘
- 귀여운 빈 상태 아이콘
- 활성 툴바에 로즈 색상 적용
- 관련 핵심 파일:
  - `web/src/App.tsx`
  - `web/src/styles.css`

## 5. 최근 검증 이미지

Playwright 결과 이미지는 아래에 있다.

- `output/playwright/album-320-polished.png`
- `output/playwright/album-390-polished.png`
- `output/playwright/album-430-polished.png`
- `output/playwright/album-1440-polished.png`
- `output/playwright/topics-320-polished.png`
- `output/playwright/topics-390-polished.png`
- `output/playwright/topics-430-polished.png`
- `output/playwright/topics-1440-polished.png`

테스트 환경에 한글/CJK 폰트가 없어 자동 캡처에서 글자가 네모로 보일 수 있다. 앱 자체의 폰트 오류로 판단하면 안 된다.

## 6. 현재 작업 트리 주의사항

작업 트리는 깨끗하지 않다. 앨범과 둘만의 다이어리 외에도 기존에 진행된 기능 및 설정 변경이 함께 존재한다.

현재 변경 범위에는 대략 아래 파일들이 포함된다.

- 루트 문서 및 설정: `.gitignore`, `README.md`, `ARCHITECTURE.md`, `ALBUM_SPEC.md`
- 앱 코드 및 설정: `web/index.html`, `web/src/*`, `web/package*.json`, `web/tsconfig*`, `web/vite.config.ts`
- Firebase 및 음악 관련 파일: `web/src/firebase.ts`, `web/src/songs.ts`, VTT 파일
- 빌드 결과물: `docs/index.html`, `docs/assets/*`, VTT 파일
- 도구 문서 및 스크립트: `tools/*`
- Playwright 검증 캡처: `output/playwright/*`

중요:

- 이 변경들은 사용자가 기존에 완료된 기능도 함께 올리겠다고 한 상태에서 쌓인 것이다.
- 단순히 이번 기능과 무관해 보인다는 이유로 `git restore`, `checkout`, `reset`, 삭제를 하지 않는다.
- 줄바꿈 차이 때문에 diff가 실제 변경량보다 크게 보이는 파일이 있을 수 있다.
- 정확한 현 상태는 작업 시작 직후 `git status --short`와 필요한 파일의 diff를 다시 확인한다.

## 7. 바로 해야 할 작업

가장 먼저 최신 소스 기준 빌드를 다시 실행한다. 마지막 귀여운 테마 수정 뒤 최종 빌드 검증이 아직 남아 있다.

```bash
cd /mnt/c/Users/user/Documents/belle/web
npm run build
```

빌드가 성공하면 아래를 확인한다.

1. 생성된 `docs` 결과물이 최신 소스와 일치하는지 확인
2. 데스크톱과 iPhone 폭에서 둘만의 다이어리 최종 육안 점검
3. 새 노트 생성, 제목 입력, 본문 입력, 저장 표시, 새로고침 후 복원 재확인
4. 앨범에서 iPhone 사진 선택 및 업로드 흐름 재확인
5. 콘솔 오류와 가로 스크롤 유무 확인

## 8. 이후 남은 개선 후보

필수 오류 수정이 끝난 뒤 사용자와 하나씩 정해서 진행한다.

- 둘만의 다이어리에서 저장 실패 시 재시도 UX 보강
- 노트 검색, 즐겨찾기, 고정 기능
- 사진 상세 보기의 이전/다음 이동 및 스와이프
- 앨범의 월별 또는 날짜별 묶음 보기
- 사진 캡션, 둘만의 태그, 추억 질문 연결
- 업로드 진행률과 재시도 UX
- 실제 iPhone Safari에서 키보드, safe area, 사진 선택 동작 최종 점검
- 전체 화면의 색상·아이콘·빈 상태 디자인 통일

새 기능을 시작하기 전에는 기존 기능 회귀가 없는지 먼저 확인한다.

## 9. 실행 및 점검 명령

```bash
cd /mnt/c/Users/user/Documents/belle/web
npm install
npm run dev
npm run build
```

개발 서버는 보통 Vite 기본 주소인 `http://127.0.0.1:5173` 또는 터미널에 표시되는 주소를 사용한다.

## 10. 다음 에이전트가 지켜야 할 것

- 작업 전 관련 설계 MD와 현재 코드를 함께 읽는다.
- UI 변경이면 데스크톱만 보지 말고 320/390/430px 모바일도 반드시 확인한다.
- Firebase/Supabase 실제 저장 로직을 UI 상태만 보고 성공했다고 단정하지 않는다.
- 환경변수, 비밀번호, 토큰, 서비스 역할 키를 출력하거나 문서에 기록하지 않는다.
- 사용자 요청 없이 커밋하거나 푸시하지 않는다.
- 기존 변경을 보존하고 요청 범위만 수정한다.

