import sys

import numpy as np

sys.path.insert(0, ".")
from engine import pitch
from engine.mistakes import _play_attack, apply_override, is_trigger
from engine.simulate import Match


def effect(bug, pl, seeds=(11, 12, 13), n_trig=15, rr=20):
    res = {}
    for planted in (True, False):
        att = goals = 0
        for seed in seeds:
            m = Match(seed).run(until_s=600, record_states=True)
            p = pitch.player_index(pl)
            trig = 0
            while m.state.clock_s < 5000 and trig < n_trig:
                if m.state.clock_s + 26 >= 2700 > m.state.clock_s:
                    m.step(True)
                    continue
                if is_trigger(bug, m, p):
                    trig += 1
                    snap = m.snapshot()
                    for a in range(rr):
                        m.restore(snap)
                        m.rng = np.random.default_rng([1, m.state.clock_s, a])
                        if planted:
                            apply_override(m, bug, p, params={"metres_behind_line": 5.0})
                        att += 1
                        goals += _play_attack(m, 1 - pitch.team_of(p), 25) is not None
                    m.restore(snap)
                    for _ in range(8):
                        m.step(True)
                else:
                    m.step(True)
        res[planted] = goals / max(att, 1)
    print(
        f"{bug:18s} {pl}: with mistake {res[True]:.3f}  without {res[False]:.3f}  lift x{res[True] / max(res[False], 1e-9):.1f}"
    )


for bug, pl in [
    ("LATE_STEP_UP", "H3"),
    ("DUEL_LOST", "H8"),
    ("PRESS_MISSED", "H4"),
    ("MARKING_LOST", "H4"),
    ("CROSS_NOT_BLOCKED", "H2"),
]:
    effect(bug, pl)
