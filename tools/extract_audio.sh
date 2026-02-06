#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <youtube_url> <output_basename>"
  echo "Example: $0 https://youtu.be/xxxx song"
  exit 1
fi

yt-dlp -x --audio-format mp3 -o "$2.%(ext)s" "$1"
