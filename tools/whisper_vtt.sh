#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <audio_file> [language]"
  echo "Example: $0 song.mp3 ko"
  exit 1
fi

LANG=${2:-ko}
whisper "$1" --language "$LANG" --task transcribe --output_format vtt
