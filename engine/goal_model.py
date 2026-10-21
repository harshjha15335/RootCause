"""Transparent goal probability model (weights in config/weights.yaml -> goal_model).

goal probability = 1 / (1 + exp(-(w0 + w1*angle - w2*distance - w3*blockers - w4*pressure)))

Wider angle raises the chance; more distance, more defenders between ball and goal,
and more pressure on the shooter lower it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from engine import pitch


@dataclass(frozen=True)
class ShotFeatures:
    distance_m: float
    angle_rad: float
    blockers: int
    pressure: float  # (3 - nearest opponent distance) / 3, clipped to [0, 1]
    nearest_opponent_m: float


def shot_features(ball: np.ndarray, attack_dir: float, opponents: np.ndarray) -> ShotFeatures:
    gx = pitch.PITCH_X if attack_dir > 0 else 0.0
    gy = pitch.PITCH_Y / 2
    dx = max(abs(gx - ball[0]), 0.1)
    dist = math.hypot(dx, ball[1] - gy)
    a1 = math.atan2(gy + pitch.GOAL_HALF_W - ball[1], dx)
    a2 = math.atan2(gy - pitch.GOAL_HALF_W - ball[1], dx)
    angle = abs(a1 - a2)

    post1 = np.array([gx, gy + pitch.GOAL_HALF_W])
    post2 = np.array([gx, gy - pitch.GOAL_HALF_W])
    blockers = int(_in_triangle(opponents, ball, post1, post2).sum())

    nearest = float(np.min(np.hypot(*(opponents - ball).T)))
    pressure = min(max((3.0 - nearest) / 3.0, 0.0), 1.0)
    return ShotFeatures(dist, angle, blockers, pressure, nearest)


def goal_probability(f: ShotFeatures, w: dict) -> float:
    z = (
        w["w0"]
        + w["w1"] * f.angle_rad
        - w["w2"] * f.distance_m
        - w["w3"] * f.blockers
        - w["w4"] * f.pressure
    )
    return 1.0 / (1.0 + math.exp(-z))


def _in_triangle(p: np.ndarray, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    def cross(o, q, r):
        return (q[0] - o[0]) * (r[..., 1] - o[1]) - (q[1] - o[1]) * (r[..., 0] - o[0])

    d1, d2, d3 = cross(a, b, p), cross(b, c, p), cross(c, a, p)
    has_neg = (d1 < 0) | (d2 < 0) | (d3 < 0)
    has_pos = (d1 > 0) | (d2 > 0) | (d3 > 0)
    return ~(has_neg & has_pos)
