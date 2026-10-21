"""Pitch geometry and indexing conventions.

Players are stored in one (22, 2) array: indices 0-10 are HOME (H1..H11),
11-21 are AWAY (A1..A11). Index k within a team is shirt number k + 1.
"""

from __future__ import annotations

import numpy as np

PITCH_X = 105.0
PITCH_Y = 68.0
GOAL_HALF_W = 7.32 / 2
HALF_S = 2700
FULL_S = 5400

HOME, AWAY = 0, 1
TEAM_CODES = ("HOME", "AWAY")

GK = 0
DEFENDERS = (1, 2, 3, 4)  # RB, LB, RCB, LCB in both formations
STRIKER = 8  # shirt 9, takes kick-offs

TEAM_IDX = (np.arange(0, 11), np.arange(11, 22))


def team_of(i: int) -> int:
    return i // 11


def player_id(i: int) -> str:
    return f"{'H' if i < 11 else 'A'}{i % 11 + 1}"


def player_index(pid: str) -> int:
    return (0 if pid[0] == "H" else 11) + int(pid[1:]) - 1


def attack_dir(team: int, period: int) -> float:
    """+1 if the team attacks towards x = 105, else -1."""
    return 1.0 if (team == HOME) == (period == 1) else -1.0


def progress(x: float, d: float) -> float:
    """Depth in a team's frame: 0 = own goal line, 1 = opponent goal line."""
    return x / PITCH_X if d > 0 else 1.0 - x / PITCH_X


def to_pitch(u: np.ndarray, v: np.ndarray, d: float) -> np.ndarray:
    """Team-frame (depth u, width v in [0, 1]) to pitch metres."""
    if d > 0:
        return np.stack([u * PITCH_X, v * PITCH_Y], axis=-1)
    return np.stack([(1.0 - u) * PITCH_X, (1.0 - v) * PITCH_Y], axis=-1)


def clip_to_pitch(pos: np.ndarray) -> None:
    np.clip(pos[..., 0], 0.0, PITCH_X, out=pos[..., 0])
    np.clip(pos[..., 1], 0.0, PITCH_Y, out=pos[..., 1])


def offside_line(pos: np.ndarray, attacking_team: int, period: int, ball_x: float) -> float:
    """Offside line as depth in the attacking team's frame: the second-last opponent,
    but never behind the ball or inside the attackers' own half."""
    d = attack_dir(attacking_team, period)
    xs = pos[TEAM_IDX[1 - attacking_team], 0]
    u = xs / PITCH_X if d > 0 else 1.0 - xs / PITCH_X
    second_last = float(np.partition(u, -2)[-2])
    return max(second_last, progress(ball_x, d), 0.5)
