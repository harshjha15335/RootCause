"""Export one engine match's full tracking for the Tactics Lab (web/src/screens/Lab.tsx).

Offline and engine-only, like export_analysis.py: it rebuilds the match with debugger.plugin and
writes two static files next to the showcase:

  showcase/<id>/tracking.bin   Int16, little-endian, 49 values per match second (0..5399):
                               ball x, ball y, then x, y for H1..H11, A1..A11 (decimetres, raw
                               engine coordinates: HOME attacks x = 105 in period 1),
                               then possession team (0 home, 1 away), carrier index (0..21), period.
  showcase/<id>/events.json    every on-ball action: [second, type, team, player, receiver,
                               x, y, end_x, end_y, outcome, xg, pressure_m]

    PYTHONPATH=<dir> .venv/bin/python web/tools/export_tracking.py --match p-1008
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import numpy as np

from debugger import plugin
from engine import pitch

STRIDE = 49
ACTIONS = ("pass", "carry", "duel", "shot", "offside")


def r1(v) -> float | None:
    return None if v is None else round(float(v), 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="p-1008")
    args = ap.parse_args()
    match = plugin.load_match(args.match)
    hist = match.history
    out = np.zeros((pitch.FULL_S, STRIDE), dtype="<i2")
    for s in range(pitch.FULL_S):
        st = hist[min(s + 1, len(hist) - 1)]
        out[s, 0:2] = np.round(np.asarray(st.ball) * 10)
        out[s, 2:46] = np.round(np.asarray(st.pos).reshape(-1) * 10)
        out[s, 46] = int(st.possession)
        out[s, 47] = int(st.carrier)
        out[s, 48] = int(st.period)
    folder = ROOT / "web/public/showcase" / args.match
    (folder / "tracking.bin").write_bytes(out.tobytes())
    events = []
    for e in match.events:
        if e.type not in ACTIONS or e.player is None:
            continue
        end = e.end if e.end is not None else e.ball
        events.append(
            [
                int(e.clock_s),
                e.type,
                int(e.team),
                int(e.player),
                None if e.receiver is None else int(e.receiver),
                r1(e.ball[0]),
                r1(e.ball[1]),
                r1(end[0]),
                r1(end[1]),
                e.outcome,
                None if e.xg is None else round(float(e.xg), 3),
                r1(e.pressure_m),
            ]
        )
    (folder / "events.json").write_text(json.dumps(events, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {folder}/tracking.bin and events.json ({len(events)} actions)")


if __name__ == "__main__":
    main()
