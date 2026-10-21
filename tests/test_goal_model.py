import numpy as np

from engine.config import load_weights
from engine.goal_model import goal_probability, shot_features

W = load_weights()["goal_model"]
NOBODY = np.array([[0.0, 0.0]])  # one opponent far away


def xg(x, y, opponents=NOBODY):
    return goal_probability(shot_features(np.array([x, y]), 1.0, opponents), W)


def test_closer_is_better():
    assert xg(100, 34) > xg(90, 34) > xg(80, 34)


def test_central_beats_wide():
    assert xg(94, 34) > xg(94, 14)


def test_blockers_and_pressure_lower_it():
    clear = xg(90, 34)
    blocked = xg(90, 34, np.array([[96.0, 34.0], [98.0, 33.0]]))
    pressed = xg(90, 34, np.array([[90.5, 34.0]]))
    assert blocked < clear and pressed < clear


def test_probability_range():
    for x in range(60, 105, 5):
        for y in range(5, 68, 7):
            assert 0.0 < xg(x, y) < 1.0
