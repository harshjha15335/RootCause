"""Builds the EvidencePackage (contract 2) from the chain and counterfactual results."""

from __future__ import annotations

from typing import cast

from debugger.blame import blame_shares, drops
from debugger.chain import Candidate
from engine import pitch
from engine.config import weights_version
from engine.models import BugCode, ChainLink, EvidencePackage


def build(
    match_id: str,
    goal_id: str,
    scorer: int,
    team: int,
    clock_s: int,
    possession_id: int,
    chain_start_s: int,
    baseline: float,
    runs: int,
    links: list[Candidate],
    fixed_rates: list[float],
) -> EvidencePackage:
    shares = blame_shares(baseline, fixed_rates)
    ds = drops(baseline, fixed_rates)
    order = sorted(range(len(links)), key=lambda i: (-shares[i], links[i].clock_s))
    return EvidencePackage(
        match_id=match_id,
        goal_id=goal_id,
        scorer=pitch.player_id(scorer),
        team=pitch.TEAM_CODES[team],
        clock_s=clock_s,
        possession_id=possession_id,
        chain_start_s=chain_start_s,
        baseline_goal_rate=round(baseline, 4),
        runs_per_link=runs,
        root_cause_rank=1,
        weights_version=weights_version(),
        links=[
            ChainLink(
                rank=rank,
                clock_s=links[i].clock_s,
                player_id=pitch.player_id(links[i].player),
                team=pitch.TEAM_CODES[pitch.team_of(links[i].player)],
                bug=cast(BugCode, links[i].bug),
                fixed_goal_rate=round(fixed_rates[i], 4),
                drop=round(ds[i], 4),
                blame=round(shares[i], 4),
                facts=links[i].facts,
            )
            for rank, i in enumerate(order, start=1)
        ],
    )
