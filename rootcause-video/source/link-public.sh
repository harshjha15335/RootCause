#!/usr/bin/env sh
# Remotion serves files from public/; point it at the shared capture, font and audio folders.
cd "$(dirname "$0")" && mkdir -p public && ln -sfn ../../captures public/captures && ln -sfn ../../assets/fonts public/fonts && ln -sfn ../../audio public/audio
