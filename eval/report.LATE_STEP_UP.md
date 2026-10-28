# Root-cause accuracy on planted goals

`python -m eval.accuracy --matches 50 --seed 2000 --bug LATE_STEP_UP`

The Debugger named the planted player **and** bug first in **35 of 50** planted goals (70%). 0 seeds could not plant a goal-causing mistake and are excluded.

| Metric | Value |
| --- | --- |
| Top-1 (player and bug) | 70% |
| Top-1 (player only) | 70% |
| Top-3 (player and bug) | 82% |
| Innocent player blamed first | 20% |
| Abstained (no link with blame) | 10% |
| Trace time, median / max | 2.53 s / 6.848 s |

| Planted bug | n | Top-1 | Top-1 player | Innocent blamed | Abstained |
| --- | --- | --- | --- | --- | --- |
| CROSS_NOT_BLOCKED | 0 | n/a | n/a | n/a | n/a |
| DUEL_LOST | 0 | n/a | n/a | n/a | n/a |
| LATE_STEP_UP | 50 | 70% | 70% | 20% | 10% |
| MARKING_LOST | 0 | n/a | n/a | n/a | n/a |
| PRESS_MISSED | 0 | n/a | n/a | n/a | n/a |

Bug types without a Debugger detector cannot score a top-1 hit; at best the right player is named under another bug. The engine plants all five types so the gap stays visible.
