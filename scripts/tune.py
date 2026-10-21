"""Calibration helper: mean realism stats over seeds for a set of weight overrides.

python scripts/tune.py '{"decisions.act_prob": 0.14}' 0-10
"""

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from engine import pitch
from engine.config import load_weights
from engine.simulate import Match, summary

KEYS = ["events", "pass_accuracy", "shots", "total_xg", "goals"]


def run(over: dict, seeds) -> None:
    w = copy.deepcopy(load_weights())
    for k, v in over.items():
        section, name = k.split(".")
        w[section][name] = v
    rows, dists = [], []
    for s in seeds:
        m = Match(s, weights=w).run()
        rows.append(summary(m.events))
        for e in m.events:
            if e.type == "shot" and e.team is not None:
                gx = 105 if pitch.attack_dir(e.team, e.period) > 0 else 0
                dists.append(np.hypot(gx - e.ball[0], 34 - e.ball[1]))
    means = {k: round(float(np.mean([r[k] for r in rows])), 3) for k in KEYS}
    print(over, means, "median shot distance", round(float(np.median(dists)), 1) if dists else None)


if __name__ == "__main__":
    lo, hi = map(int, (sys.argv[2] if len(sys.argv) > 2 else "0-4").split("-"))
    run(json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}, range(lo, hi))
