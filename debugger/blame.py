"""Counterfactual blame.

    drop(link)  = max(0, baseline goal rate - goal rate with only that link fixed)
    blame(link) = drop(link) / sum of drops over all links

The link with the biggest share is the root cause.
"""

from __future__ import annotations


def drops(baseline: float, fixed_rates: list[float]) -> list[float]:
    return [max(0.0, baseline - f) for f in fixed_rates]


def blame_shares(baseline: float, fixed_rates: list[float]) -> list[float]:
    ds = drops(baseline, fixed_rates)
    total = sum(ds)
    if total <= 0:
        return [0.0] * len(ds)
    return [d / total for d in ds]
