"""Accuracy test: the headline number. "Finds the true root cause in N of 100 planted goals."

    python -m eval.accuracy --matches 100 --seed 1000     # writes eval/report.md

1. Generate N matches, each with one planted mistake that leads to a goal (engine.mistakes).
2. Run the Debugger on each planted goal.
3. Report top-1 and top-3 accuracy, broken down by bug type.
4. Report how often an innocent player is blamed (rank 1 is not the planted player).

TODO(day 8): implement once engine.mistakes.inject_mistake works.
"""

from __future__ import annotations


def main() -> None:
    raise NotImplementedError("needs engine.mistakes.inject_mistake (day 5)")


if __name__ == "__main__":
    main()
