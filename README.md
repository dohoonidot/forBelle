# TW Lyrics Sync

## 🌐 접속 주소 (Home)
**[https://dohoonidot.github.io/forBelle/](https://dohoonidot.github.io/forBelle/)**

YouTube 링크 + 대만어 가사만으로 빠르게 싱크 맞추는 정적 웹앱 + 로컬 도구 가이드.

## 핵심 아이디어
- YouTube 영상은 IFrame Player API로만 재생 (웹에서 오디오 추출 X)
- 로컬에서 한 번만 Whisper로 타임코드(VTT/SRT) 생성
- 웹앱에 YouTube 링크 + 대만어 가사 + VTT/SRT 넣고 싱크 조정

## 폴더 구조
- `web/` : Vite + React + TypeScript 정적 웹앱
- `tools/` : 로컬 작업(yt-dlp, whisper) 안내 및 스크립트

## 실행 (로컬 개발)
```bash
cd web
npm install
npm run dev
```
브라우저에서 출력된 URL 접속.

## GitHub Pages 배포 (main /docs)
GitHub Pages Source를 `main /docs`로 설정하고, 빌드 결과를 `docs/`에 출력합니다.
```bash
cd web
npm run build
```
그 다음 `docs/`를 커밋/푸시하면 `https://dohoonidot.github.io/forBelle/` 에 반영됩니다.

## 신청곡 Firebase 설정 (비밀번호 로그인)
신청곡은 Firestore에 저장됩니다. 비밀번호로 로그인하면 브라우저에 유지되며, 로그인된 상태에서만 요청 저장/조회가 가능합니다.

1) Firebase 콘솔에서 새 프로젝트 생성  
2) Firestore Database 만들기 (Production/테스트 모드 아무거나 시작 가능)  
3) Project Settings → General → Your apps → Web app 추가  
4) Firebase Authentication 활성화 (Email/Password)
   - 사용자 생성: `admin@forbelle.local` + 원하는 비밀번호
5) 아래 `.env` 파일을 생성하고 값을 채우기 (`web/.env`)
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```
6) Firestore Rules (Production 모드 유지)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /song_requests/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```
7) `npm run build` 후 `docs/` 커밋/푸시

`.env` 템플릿은 `web/.env.example` 참고.

## 사용 방법
1) YouTube 링크 입력 후 "영상 불러오기"
2) 대만어 가사 붙여넣기 (줄 단위)
3) VTT 또는 SRT 자막 붙여넣기/업로드
4) "파싱 & 자동 매핑" 클릭
5) 재생하면서 오프셋/현재 줄 nudge로 싱크 보정
6) 필요 시 특정 줄 텍스트 수정
7) VTT 또는 LRC로 내보내기

### Whisper 없이 하는 방법
- "수동 타이밍" 섹션에서 재생 중 탭을 눌러 줄별 시작/끝 시간을 기록
- 완료 후 "수동 결과 적용"을 눌러 바로 재생/내보내기

## 공유해서 다른 사람이 바로 보게 하기
### 1) 링크로 자동 로딩 (추천)
1. 완성된 VTT 파일과 가사 TXT를 공개 URL에 올립니다. (예: GitHub Pages, gist raw)
2. 아래 형식으로 링크를 공유하면 접속 즉시 자동 로딩됩니다.
```
https://<your-pages>/index.html?v=<VIDEO_ID>&vtt=<VTT_URL>&lyrics=<LYRICS_URL>
```
- `v` : YouTube videoId
- `vtt` : VTT/SRT 파일의 공개 URL (CORS 허용 필요)
- `lyrics` : 가사 텍스트 파일 URL (선택)

### 2) 프로젝트 파일로 공유
- "프로젝트 내보내기(JSON)" → `.json` 공유
- 상대는 파일 업로드만 하면 그대로 재생 가능

## 로컬 워크플로우 (무료)
`tools/README.md` 참고.
