# Root Cause web

The judge-facing UI: a live match debugger. When a goal goes in, the pitch freezes, the play rewinds,
and the causal chain is drawn back to the root cause, with blame proven by 200 counterfactual replays.

```bash
npm ci
npm run dev              # http://localhost:5173, plays the recorded showcase match
npm test                 # unit tests (Vitest)
npm run e2e              # the demo flow in a real browser (Playwright)
npm run build            # static files in dist/
```

## Data sources

The UI only uses the shapes in `docs/SPEC.md` (team contract) and `docs/ENGINE.md` (engine
contract, for 1 Hz positions and club metadata). Types are mirrored in `src/api/types.ts`.

- **Showcase (default).** `public/showcase/p-1008/` is a real engine match with one planted mistake,
  recorded by `tools/export_showcase.py` (`npm run export:showcase`). The script only calls the
  engine, `debugger.plugin.trace` and the backend's own `Runtime` and HTTP handlers in-process; it
  does not change backend code. The UI replays the recorded `/live/{match_id}` messages through the
  same handler the live socket uses, and reads REST responses from the recorded files.
- **Live API.** Add `?api=http://127.0.0.1:8000` (and optionally `&match=<id>`, `&seed=42`,
  `&token=<bearer>`). The backend needs `FRONTEND_ORIGIN` set to this page's origin for CORS.

Without Azure (local demo and the recording) the explanation is the evidence-only template, Hindi
and Spanish agent text falls back to English with a visible note, and voice is off with a reason.
The accuracy badge reads "Not yet measured" until `eval/accuracy.py` produces a number.

## Where things are

| Path | What |
| --- | --- |
| `src/screens/` | LiveMatch, StackTrace, Counterfactual, RootCause, StudioScript, BugReport, MatchScreen |
| `src/three/` | the 3D stage (React Three Fiber), lazy-loaded behind the 2D pitch |
| `src/components/` | Pitch (SVG), ReplayBar, Header, mode/language/voice controls, shared bits |
| `src/store/` | `matchStore` (stream), `traceStore` (selected goal, playhead, focus), `uiStore`, `broadcast` (feed + goal moment) |
| `src/i18n/` | interface strings in en, hi, es |
| `tools/export_showcase.py` | records a match for the showcase |

Keyboard: Space play/pause, ←/→ one second (Shift: five), [ ] previous/next link, G goal,
R root cause, F mistake fixed, 1/2/3 modes, ? shortcuts, Esc clears the highlight.
`prefers-reduced-motion` swaps the 3D stage for the flat pitch and removes the scroll pinning.
