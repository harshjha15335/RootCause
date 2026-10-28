# Production report

## Output
`final/RootCause-2-Minute-Demo.mp4` — ffprobe: **120.000 s**, 3600 frames, 1920×1080, 30 fps, H.264 High (yuv420p, BT.709, faststart), AAC-LC 256 kb/s 48 kHz stereo, 70 MB (~4.7 Mb/s). Integrated loudness −13.9 LUFS, true peak −1.5 dBFS (YouTube target).

No 4K master: the captures are native 1080p, and upscaling them would not be a real 4K master.

## Tools actually used
| Tool | Use |
|---|---|
| Playwright 1.5x + Chromium headless shell (SwiftShader WebGL) | All product capture. The page clock is paused and advanced one frame at a time (`page.clock`), because the 3D Autopsy renders at ~3–5 s per frame without a GPU; this gives smooth 15 fps 3D clips and 30 fps page scrolls. |
| Remotion 4.0.242 | Edit, typography, virtual camera moves, callouts, split screen, counters, end card |
| FFmpeg | Audio mix (adelay, sidechain ducking, loudnorm), final encode, QA (blackdetect, freezedetect, ebur128, contact sheets) |
| Kokoro-82M via kokoro-onnx (Apache-2.0) | Narration, voice `af_heart`, run locally |
| NumPy (own script) | Score and SFX synthesised from oscillators and noise — no samples |

Not used: OBS (no display in the cloud container; Playwright covered capture), DaVinci Resolve (not available on Linux headless), paid TTS or music services, Anthropic Skills for video (none needed).

## Source of truth
Captured from the GitHub Pages **root build** (`gh-pages` a16e950, built from main 09c6285 with the real-names fix). The 3D Autopsy clips were captured from `preview/ui-fixes` before the root rebuild landed; a spot check of the same Autopsy frame on the root build matched (PSNR 35.7 dB, differences only from sub-frame timing), and the trace/replay data files for the 4–4 match are byte-identical, so they were kept.

## Checks
- **Real names:** `scripts/qa-names.js` visits every route used (home, matches, match, autopsy, explore simple + expert with every tab, lab, story) on the root build and greps for real club, stadium, league and player names. Only hit: the home page footer naming the hackathon ("Microsoft × Premier League Inside the Game"), which is not in any captured frame. Player names in the app are renamed (Akendo, Diales, Silven…).
- **Facts on screen** are only the app's printed values for goal g2: 84% / 16% blame, 142 → 14 goals in 200 replays (71% → 7%), Diales-level 59%, 5.3 m behind the line, mistake 7 s before the goal, 8 goals / 4 traced. 3D movement is captioned as illustrative, matching the app's own wording. No claim of live AI anywhere.
- **Frames:** contact sheets every 2 s reviewed for all seven scenes. First pass found the "84%" counter overlapping the app's own 84% label, held shots freezing for up to 4.5 s, and long dips to black between shots; all fixed in pass two. Freeze detection (>1.5 s) now finds none; the only black is the intended 1.2 s open.
- **Audio:** music sits ~9 dB under narration with sidechain ducking; narration ends at 115.9 s, leaving the logo and final chord clear.

## Known limits
- The Fan/Analyst/Studio switch no longer exists in this build (it became Simple ↔ Expert), so scene 6 shows Simple vs Expert plus English/हिन्दी/Español instead of a Studio mode.
- The Explore panel's "How this was explained" shows the agents as *waiting* and the plain-words text is labelled "Template from the Debugger's numbers, no AI wording" — the video shows that honestly and says nothing about live agents.
- Two Autopsy shots begin during the app's own camera move between chapters, so the first few frames are a moving wide view.

## Revision 2 (Harsh's review)
- Removed every shot of the Explore screen (the blue top-down pitch), which reads as an older version of the app. Replacements come only from the current root build: Autopsy close-up of the recorded 5.3 m position, *How the engine decides*, the Autopsy verdict card, a split screen of Autopsy frames, and the match page cards for Simple/Expert and English/हिन्दी/Español.
- Narration regenerated with Kokoro `af_heart`, the most natural voice of that model.
- End card no longer mentions Microsoft or the Premier League.
- Re-checked: 120.000 s, 3600 frames, −13.9 LUFS, no freezes over 1.5 s.
