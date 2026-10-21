"""Pattern spotting: recurring bugs across one match ("left side broke down 3 times")."""

from __future__ import annotations

from collections import Counter

from engine.models import EvidencePackage

MIN_REPEATS = 3


def recurring(packages: list[EvidencePackage], min_repeats: int = MIN_REPEATS) -> list[dict]:
    """Count bug types by (team, bug) and (player, bug); return the ones that repeat.

    TODO(day 11): also group by side of the pitch (needs a "side" fact on each link).
    """
    by_team: Counter = Counter()
    by_player: Counter = Counter()
    for p in packages:
        for link in p.links:
            by_team[(link.team, link.bug)] += 1
            by_player[(link.player_id, link.bug)] += 1
    out = [{"team": t, "bug": b, "count": n} for (t, b), n in by_team.items() if n >= min_repeats]
    out += [
        {"player_id": pid, "bug": b, "count": n}
        for (pid, b), n in by_player.items()
        if n >= min_repeats
    ]
    return sorted(out, key=lambda r: -r["count"])
