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
# Presentation pass: the engine moves players in 1 s steps, which reads as jerky and lets players
# stack on one spot. Measured against real anonymised tracking (Metrica sample game 2, 1 Hz):
# median change of velocity 0.5 m/s per s (engine 1.7), 10th percentile nearest-player gap 1.6 m
# (engine 0.6). The tracks are smoothed and spaced out to match; nothing else changes.
SMOOTH_S = 1.3
MIN_GAP_M = 1.6


def gaussian(track: np.ndarray, sigma: float) -> np.ndarray:
    """Smooth a (T, 2) track in time, holding the ends."""
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    padded = np.pad(track, ((r, r), (0, 0)), mode="edge")
    return np.stack([np.convolve(padded[:, j], k, mode="valid") for j in range(2)], 1)


def spread(frame: np.ndarray, gap: float) -> np.ndarray:
    """Push apart players closer than `gap` metres (a few relaxation rounds)."""
    p = frame.copy()
    for _ in range(4):
        d = p[:, None, :] - p[None, :, :]
        dist = np.linalg.norm(d, axis=2) + np.eye(len(p)) * 1e3
        push = np.clip(gap - dist, 0, None) / 2
        unit = d / np.maximum(dist, 1e-3)[..., None]
        # two players on the exact same spot get split sideways
        same = dist < 1e-3
        unit[same] = [0.0, 1.0]
        p += (unit * push[..., None]).sum(1)
    p[:, 0] = np.clip(p[:, 0], 0.5, pitch.PITCH_X - 0.5)
    p[:, 1] = np.clip(p[:, 1], 0.5, pitch.PITCH_Y - 0.5)
    return p


def humanise(pos: np.ndarray, periods: np.ndarray) -> np.ndarray:
    """(T, 22, 2) engine positions -> smooth, spaced tracks, smoothed within each half only."""
    out = pos.copy()
    for per in (1, 2):
        idx = np.where(periods == per)[0]
        if len(idx) < 3:
            continue
        seg = out[idx]
        for i in range(22):
            seg[:, i] = gaussian(seg[:, i], SMOOTH_S)
        for t in range(len(seg)):
            seg[t] = spread(seg[t], MIN_GAP_M)
        for i in range(22):
            seg[:, i] = gaussian(seg[:, i], 0.6)
        out[idx] = seg
    return out


def r1(v) -> float | None:
    return None if v is None else round(float(v), 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="p-1008")
    args = ap.parse_args()
    match = plugin.load_match(args.match)
    hist = match.history
    out = np.zeros((pitch.FULL_S, STRIDE), dtype="<i2")
    raw_pos = np.zeros((pitch.FULL_S, 22, 2))
    balls = np.zeros((pitch.FULL_S, 2))
    periods = np.zeros(pitch.FULL_S, dtype=int)
    carriers = np.zeros(pitch.FULL_S, dtype=int)
    for s in range(pitch.FULL_S):
        st = hist[min(s + 1, len(hist) - 1)]
        raw_pos[s] = np.asarray(st.pos)
        balls[s] = np.asarray(st.ball)
        periods[s] = int(st.period)
        carriers[s] = int(st.carrier)
        out[s, 46] = int(st.possession)
        out[s, 47] = int(st.carrier)
        out[s, 48] = int(st.period)
    smooth = humanise(raw_pos, periods)
    for s in range(pitch.FULL_S):
        c = carriers[s]
        # the ball stays at the feet of the player who has it, wherever smoothing moved them
        if 0 <= c < 22 and np.linalg.norm(raw_pos[s, c] - balls[s]) < 2.5:
            balls[s] = smooth[s, c] + (balls[s] - raw_pos[s, c])
    out[:, 0:2] = np.round(balls * 10)
    out[:, 2:46] = np.round(smooth.reshape(pitch.FULL_S, -1) * 10)
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
