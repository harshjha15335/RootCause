"""Do planted mistakes matter to the counterfactual? For planted goals, compare the baseline goal
rate with (a) the true mistake fixed and (b) the same fix applied to an innocent team-mate.

    python scripts/plant_check.py 10          # 10 planted matches
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from debugger import chain, counterfactual, fixes
from engine import pitch
from engine.mistakes import ELIGIBLE, PlantFailed, random_plant

n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
rows = []
for seed in range(1000, 1000 + n):
    t = time.perf_counter()
    try:
        m, gt = random_plant(seed)
    except PlantFailed as e:
        print("plant failed", seed, e)
        continue
    t_plant = time.perf_counter() - t
    gi = next(i for i, e in enumerate(m.events) if e.type == "goal" and e.seq == gt.goal_seq)
    team = 1 - pitch.team_of(pitch.player_index(gt.root_cause_player_id))
    start = chain.chain_window(m.history, team, gt.goal_clock_s, 25)
    start = max(start, gt.root_cause_clock_s - 1)  # as if the detector found the true link
    plan = counterfactual.build_plan(m, gi, start)
    p = pitch.player_index(gt.root_cause_player_id)
    innocent = next(
        i for i in pitch.TEAM_IDX[pitch.team_of(p)] if i % 11 in ELIGIBLE[gt.bug] and i != p
    )
    base = counterfactual.goal_rate(plan, m.ctx, 200, seed=1)
    true_fix = counterfactual.goal_rate(
        plan,
        m.ctx,
        200,
        seed=1,
        intervention=fixes.make_intervention(
            chain.Candidate(gt.root_cause_clock_s, p, gt.bug), m.ctx
        ),
    )
    inno_fix = counterfactual.goal_rate(
        plan,
        m.ctx,
        200,
        seed=1,
        intervention=fixes.make_intervention(
            chain.Candidate(gt.root_cause_clock_s, int(innocent), gt.bug), m.ctx
        ),
    )
    rows.append((gt.bug, base, true_fix, inno_fix))
    print(
        f"{gt.bug:18s} {gt.root_cause_player_id:4s} plant {t_plant:4.1f}s  chain {gt.goal_clock_s - start:2d}s  "
        f"baseline {base:.2f}  true fix {true_fix:.2f}  innocent fix {inno_fix:.2f}"
    )
if rows:
    b = np.array([r[1:] for r in rows])
    print(
        f"mean baseline {b[:, 0].mean():.2f}  true-fix drop {np.mean(b[:, 0] - b[:, 1]):.2f}  innocent-fix drop {np.mean(b[:, 0] - b[:, 2]):.2f}"
        f"  true>innocent in {np.mean((b[:, 0] - b[:, 1]) > (b[:, 0] - b[:, 2])):.0%}"
    )
