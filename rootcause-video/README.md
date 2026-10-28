# RootCause — 2-minute demo video

`final/RootCause-2-Minute-Demo.mp4` — 120.0 s, 1920×1080, 30 fps, H.264 + AAC stereo.

Everything in the picture is the real RootCause web app (the `preview/ui-fixes` build on GitHub Pages), driven by Playwright. Everything you hear was made for this video: narration from a local open-weights TTS model and a score synthesised in Python. No stock footage, no third-party music, no paid APIs.

## Layout

| Path | What it is |
|---|---|
| `final/` | Rendered MP4 |
| `source/` | Remotion project (`src/Demo.tsx` is the whole cut, `src/timeline.ts` holds timings and clip lengths) |
| `scripts/` | Playwright capture scripts, narration and audio scripts |
| `captures/` | Frame sequences and stills captured from the app (see note below) |
| `audio/` | `vo/` narration lines, `music/score.wav`, `mix.wav` (final ducked mix) |
| `assets/` | Fonts (from the app's own build: Anybody, Hanken Grotesk, JetBrains Mono — all SIL OFL) and the logo mark |
| `storyboard.md`, `voiceover.md`, `production-report.md` | Plan, script, QA results |

## Reproduce

Requirements: Node 20+, Python 3.10+, FFmpeg, Playwright's Chromium.

```bash
# 1. serve the deployed site locally (same files as harshjha15335.github.io/RootCause)
git worktree add /tmp/site/RootCause origin/gh-pages
(cd /tmp/site && python3 -m http.server 8080) &

# 2. capture (frame-stepped: the page clock is paused and advanced one frame at a time,
#    so the three.js scenes are smooth even on a machine without a GPU)
cd rootcause-video/scripts
npm i playwright            # or use a global install
node capture-autopsy.js ../captures/autopsy           # ~35 min on 4 CPU cores
for p in home match explore modes lang lab; do node capture-pages.js ../captures/pages $p; done

# 3. audio
pip install kokoro-onnx soundfile numpy
# model files: github.com/thewh1teagle/kokoro-onnx/releases (kokoro-v1.0.onnx, voices-v1.0.bin)
python narrate.py narration.json ../audio/vo kokoro-v1.0.onnx voices-v1.0.bin
python make_audio.py ../audio/music/score.wav
./mix_audio.sh

# 4. render
cd ../source && npm i && ./link-public.sh
npx remotion studio            # edit / preview
npx remotion render src/index.ts RootCauseDemo ../final/RootCause-2-Minute-Demo.mp4 --codec=h264 --crf=18 --audio-bitrate=320k
```

Set `RC_BASE` to capture from another preview (for example `.../preview/realism/`). Set `REMOTION_CHROME` to a Chromium binary if Remotion cannot download its own.

To edit: change copy and timing in `source/src/Demo.tsx`; move narration cues in `scripts/narration.json` and rerun steps 3–4.

## Note on captures in git

The frame sequences are large (~150 MB), so the repository keeps only the scripts that regenerate them; the complete `captures/` folder is in the project files copy of `rootcause-video/`.
