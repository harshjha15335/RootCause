# Root-cause accuracy on planted goals

`python -m eval.accuracy --matches 100 --seed 1000`

The Debugger named the planted player **and** bug first in **30 of 99** planted goals (30%). 1 seeds could not plant a goal-causing mistake and are excluded.

| Metric | Value |
| --- | --- |
| Top-1 (player and bug) | 30% |
| Top-1 (player only) | 35% |
| Top-3 (player and bug) | 31% |
| Innocent player blamed first | 41% |
| Abstained (no link with blame) | 23% |
| Trace time, median / max | 2.28 s / 6.503 s |

| Planted bug | n | Top-1 | Top-1 player | Innocent blamed | Abstained |
| --- | --- | --- | --- | --- | --- |
| CROSS_NOT_BLOCKED | 4 | 0% | 0% | 50% | 50% |
| DUEL_LOST | 3 | 0% | 0% | 67% | 33% |
| LATE_STEP_UP | 37 | 81% | 81% | 14% | 5% |
| MARKING_LOST | 39 | 0% | 8% | 69% | 23% |
| PRESS_MISSED | 16 | 0% | 12% | 31% | 56% |

Bug types without a Debugger detector cannot score a top-1 hit; at best the right player is named under another bug. The engine plants all five types so the gap stays visible.
