import random
from typing import Literal

from api.contracts import Evidence, Link, MatchEvent, PlayerPosition, Position


def fixture(match_id: str, seed: int) -> tuple[list[MatchEvent], Evidence]:
    rng = random.Random(seed)
    players = [
        PlayerPosition(
            player_id=f"{team}-{i}",
            team=team,
            position=Position(x=round(rng.uniform(0, 105), 2), y=round(rng.uniform(0, 68), 2)),
        )
        for team in ("home", "away")
        for i in range(1, 12)
    ]
    sequence: list[tuple[int, Literal["pass", "duel", "cross", "goal"], int]] = [
        (0, "pass", 50),
        (1, "duel", 60),
        (2, "cross", 85),
        (3, "goal", 105),
    ]
    events = [
        MatchEvent(
            id=f"{match_id}-event-{i}",
            match_id=match_id,
            second=second,
            type=kind,
            team="home",
            player_id="home-9",
            ball=Position(x=x, y=34),
            players=players,
        )
        for i, (second, kind, x) in enumerate(sequence)
    ]
    links = [
        Link(
            evidence_id=f"{match_id}-link-{i}",
            player_id=pid,
            second=second,
            bug_type=bug,
            description=description,
            blame_percent=blame,
            baseline_goals=160,
            fixed_goals=fixed,
        )
        for i, (pid, second, bug, description, blame, fixed) in enumerate(
            [
                ("away-6", 1, "duel_lost", "Lost the midfield duel.", 60, 40),
                ("away-3", 2, "late_step", "Stepped up late and allowed the cross.", 40, 80),
            ]
        )
    ]
    evidence = Evidence(
        goal_id=f"{match_id}-goal-1",
        match_id=match_id,
        source="synthetic-fixture",
        goal=events[-1],
        links=links,
        events=events,
    )
    return events, evidence
