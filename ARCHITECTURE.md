# TW Lyrics Sync: 시스템 작동 원리 및 아키텍처

이 문서는 **TW Lyrics Sync** 웹 애플리케이션이 어떻게 YouTube 영상을 가져오고, 로컬 자막 파일과 동기화하여 가사를 보여주는지 **기술적인 작동 방식**을 설명합니다.

---

## 1. 핵심 컨셉 (Core Concept)

이 프로젝트는 **"순수 프론트엔드 (Client-Side Only)"** 애플리케이션입니다.
별도의 복잡한 백엔드 서버(Java, Python 등) 없이, **브라우저(Chrome, Safari 등)에서 모든 기능이 작동**합니다.

### 🌐 데이터 흐름 요약
1.  **영상 (Video)**: YouTube 서버에서 직접 스트리밍합니다. (우리 서버에 저장하지 않음)
2.  **가사 (Lyrics & VTT)**: 사용자가 직접 입력하거나, GitHub Pages에 정적 파일(`.vtt`, `.txt`)로 미리 올려둔 것을 가져옵니다.
3.  **동기화 (Sync)**: 브라우저가 영상을 재생하면서 약 0.15초마다 "지금 몇 초지?"라고 확인하고, 그 시간에 맞는 가사를 화면에 표시합니다.

---

## 2. 주요 기술 스택 (Tech Stack)

*   **React (v18)**: 화면을 그리는 UI 라이브러리. (컴포넌트 기반)
*   **Vite**: 매우 빠른 개발 서버 및 빌드 도구.
*   **TypeScript**: 자바스크립트에 타입을 추가하여 오류를 방지.
*   **YouTube IFrame Player API**: YouTube 영상을 제어하고 현재 재생 시간을 가져오는 공식 API.
*   **Framer Motion**: 부드러운 화면 전환 및 UI 애니메이션.
*   **Lucide React**: 깔끔하고 현대적인 아이콘 팩.

---

## 3. 상세 동작 과정 (Detailed Workflow)

### A. 영상 로딩 (Video Loading)
1.  사용자가 YouTube URL을 입력하거나 노래 목록에서 선택합니다.
2.  앱은 URL에서 **Video ID** (예: `hmP2yQoFrLM`)를 추출합니다.
3.  `window.YT.Player`를 생성하여 해당 ID의 영상을 로드합니다.
    *   중요: 자동 재생 정책(Autoplay Policy) 때문에 `cueVideoById`를 사용하여 로딩만 하고, 실제 재생은 사용자가 버튼을 눌러야 시작됩니다.

### B. 가사 및 싱크 데이터 로딩 (Lyrics & Sync Data)
1.  **데이터 소스**:
    *   **사용자 입력**: Editor 모드에서 직접 붙여넣거나 업로드.
    *   **미리 정의된 노래 (`songs.ts`)**: 개발자가 코드에 `vttUrl`, `coverUrl` 등을 미리 적어둠.
2.  **파싱 (Parsing)**:
    *   불러온 VTT/SRT (시간 정보) 텍스트와 대만어 가사 텍스트를 분석합니다.
    *   앱 내부에서 `Cue[]` 배열로 변환합니다.
        ```typescript
        type Cue = {
          startMs: 12500, // 시작 시간 (밀리초)
          endMs: 15300,   // 끝 시간 (밀리초)
          text: "한국어/영어 자막 내용",
          twText: "대만어 가사 내용"
        };
        ```

### C. 실시간 동기화 (Real-time Sync Loop)
1.  영상이 재생되면, 앱은 **150ms(0.15초)** 마다 `setInterval`을 통해 `player.getCurrentTime()`을 호출합니다.
2.  현재 시간(`currentMs`)과 오프셋(`globalOffsetMs`)을 더해 **"현재 표시해야 할 시간"**을 계산합니다.
3.  `cues` 배열 전체를 검색하여, 현재 시간에 해당하는 가사 줄(`activeIndex`)을 찾습니다.
4.  찾은 줄이 있다면 화면 중앙에 **강조(Highlight)**하고, 이전/다음 가사를 위아래에 보여줍니다.

---

## 4. 모드별 기능 (App Modes)

| 모드 | 설명 | 주요 역할 |
| :--- | :--- | :--- |
| **Home** | 환영 화면 | 앱 소개 및 안내 메시지 표시. |
| **Editor** | 편집/싱크 도구 | YouTube URL 입력, 가사 붙여넣기, 수동 싱크 조절, 파일 내보내기. |
| **Viewer** | 감상 전용 | 복잡한 도구 없이 영상과 가사만 깔끔하게 표시. |
| **Request** | 신청곡 (localStorage) | 사용자가 신청한 URL을 **브라우저 저장소(localStorage)**에 저장. (서버 X) |

---

## 5. 배포 방식 (GitHub Pages)

이 앱은 **정적 사이트(Static Site)**이므로 별도의 WAS(Web Application Server)가 필요 없습니다.
소스 코드를 빌드(`npm run build`)하면 `html`, `css`, `js` 파일이 생성되는데, 이것을 GitHub의 `docs/` 폴더나 `gh-pages` 브랜치에 올리기만 하면 전 세계 어디서든 접속할 수 있습니다.

### 현재 설정 (GitHub Pages Source: `main /docs`)
1.  `vite.config.ts`: 빌드 결과물을 `dist`가 아닌 `../docs` 폴더로 출력하도록 설정됨.
2.  `npm run build`: 소스 코드를 컴파일하여 프로젝트 루트의 `docs/` 폴더에 파일 생성.
3.  `git push`: `docs/` 폴더가 포함된 변경 사항을 GitHub에 업로드.
4.  **GitHub Settings**: Pages 설정에서 Source를 `/docs`로 지정하면 배포 완료.

---

이 문서는 **TW Lyrics Sync**의 작동 원리를 이해하고 유지보수하는 데 도움을 주기 위해 작성되었습니다.
