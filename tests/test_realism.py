"""Realism targets from config/weights.yaml, averaged over a few seeds."""

import numpy as np

from engine.config import load_weights
from engine.simulate import Match, summary

SEEDS = range(100, 105)


def test_realism_targets():
    targets = load_weights()["realism"]
    stats = [summary(Match(s).run().events) for s in SEEDS]
    for key, (lo, hi) in targets.items():
        mean = float(np.mean([s[key] for s in stats]))
        assert lo <= mean <= hi, f"{key}: mean {mean:.3f} outside [{lo}, {hi}]"
