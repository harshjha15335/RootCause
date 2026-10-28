#!/usr/bin/env bash
# Place each narration line at its cue, duck the score under the voice, master to -14 LUFS.
# Usage: scripts/mix_audio.sh  (run from rootcause-video/)
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY' > /tmp/rc_mix_args
import json
L = json.load(open("scripts/narration.json"))
inputs = " ".join(f"-i audio/vo/{l['id']}.wav" for l in L)
parts = []
for i, l in enumerate(L):
    ms = int(l["at"] * 1000)
    parts.append(f"[{i+1}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay={ms}|{ms}[v{i}]")
mix = "".join(f"[v{i}]" for i in range(len(L))) + f"amix=inputs={len(L)}:normalize=0,apad=whole_dur=120,atrim=0:120[vo]"
print(inputs)
print(";".join(parts) + ";" + mix)
PY
INPUTS=$(sed -n 1p /tmp/rc_mix_args); FILTER=$(sed -n 2p /tmp/rc_mix_args)
ffmpeg -loglevel error -y -i audio/music/score.wav $INPUTS -filter_complex \
 "$FILTER;[vo]asplit=2[vo1][vosc];[0:a]volume=0.32[mus];[mus][vosc]sidechaincompress=threshold=0.015:ratio=10:attack=40:release=450:makeup=1[duck];[vo1]volume=1.9,highpass=f=80,acompressor=threshold=0.1:ratio=3:attack=5:release=120[vox];[duck][vox]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,atrim=0:120[out]" \
 -map "[out]" -ac 2 -ar 48000 -c:a pcm_s16le audio/mix.wav
ffprobe -v error -show_entries format=duration -of csv=p=0 audio/mix.wav
