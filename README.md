# TW Lyrics Sync

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

## GitHub Pages 배포
```bash
cd web
npm install
npm run build
```
`web/dist`를 GitHub Pages로 배포하세요. (base는 `./`로 설정됨)

## 사용 방법
1) YouTube 링크 입력 후 "영상 불러오기"
2) 대만어 가사 붙여넣기 (줄 단위)
3) VTT 또는 SRT 자막 붙여넣기/업로드
4) "파싱 & 자동 매핑" 클릭
5) 재생하면서 오프셋/현재 줄 nudge로 싱크 보정
6) 필요 시 특정 줄 텍스트 수정
7) VTT 또는 LRC로 내보내기

## 로컬 워크플로우 (무료)
`tools/README.md` 참고.
