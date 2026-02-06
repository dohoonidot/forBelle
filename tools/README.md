# 로컬 워크플로우 (무료)

## 1) yt-dlp로 오디오 추출
### Windows (WSL 포함)
```bash
# 설치 (WSL)
sudo apt update
sudo apt install -y yt-dlp ffmpeg

# 오디오 추출
yt-dlp -x --audio-format mp3 -o "song.%(ext)s" "<youtube_url>"
```

### Windows (exe)
1. https://github.com/yt-dlp/yt-dlp/releases 에서 최신 `yt-dlp.exe` 다운로드
2. `ffmpeg` 설치 (https://ffmpeg.org/download.html)
3. 같은 폴더에서 실행:
```powershell
yt-dlp.exe -x --audio-format mp3 -o "song.%(ext)s" "<youtube_url>"
```

## 2) Whisper로 VTT 생성
### Python whisper (OpenAI)
```bash
pip install -U openai-whisper
whisper song.mp3 --language Korean --task transcribe --output_format vtt
```

### whisper.cpp (옵션)
```bash
# https://github.com/ggerganov/whisper.cpp 참고
./main -m models/ggml-base.bin -f song.mp3 -l ko -otxt -ovtt
```

## 3) 웹앱에 붙여넣기
- 생성된 `.vtt` 파일 내용을 웹앱 "타임코드 자막" 칸에 붙여넣기
- 대만어 가사는 줄 단위로 붙여넣기
- 파싱 & 자동 매핑 후 재생하면서 싱크 보정
