"""Writes the sample files in samples/engine/ from a real planted match (seed 1012):

  match_events.json   contract 1: the 19 seconds from the planted mistake to the goal
  match_meta.json     contract 1: clubs, squads, kits
  evidence.json       contract 2: the Debugger's real output for that goal
  ground_truth.json   the planted mistake (internal; used by the accuracy test)
  evidence_team_contract.json   the same evidence converted by debugger.plugin to the team
                      contract (api/contracts.py: Evidence), as the backend receives it

samples/engine/evidence_3_links_example.json is hand-written (illustrative numbers) to show a longer chain.
Samples are part of the frozen contracts: regenerate only when docs/ENGINE.md changes.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from debugger import plugin, trace
from engine.mistakes import random_plant, write_ground_truth

SEED = 1012


def main() -> None:
    m, gt = random_plant(SEED, match_id=f"p-{SEED:04d}")
    ev = trace(m, gt.goal_seq)
    events = [e for e in m.match_events() if gt.root_cause_clock_s <= e.clock_s <= gt.goal_clock_s]
    out = ROOT / "samples" / "engine"
    out.mkdir(exist_ok=True)
    (out / "match_events.json").write_text(
        json.dumps([e.model_dump() for e in events], indent=1), encoding="utf-8"
    )
    (out / "match_meta.json").write_text(m.meta().model_dump_json(indent=2), encoding="utf-8")
    (out / "evidence.json").write_text(ev.model_dump_json(indent=2), encoding="utf-8")
    write_ground_truth(out / "ground_truth.json", [gt])
    goal_event = next(
        x for e in m.events if e.seq == gt.goal_seq and (x := plugin.team_event(e, m)) is not None
    )
    team_ev = plugin.to_team_evidence(ev, goal_event)
    (out / "evidence_team_contract.json").write_text(
        json.dumps(team_ev, indent=2), encoding="utf-8"
    )
    print(
        f"{len(events)} events; {gt.bug} by {gt.root_cause_player_id}; root cause found: "
        f"{ev.links[0].player_id if ev.links else None} {ev.links[0].bug if ev.links else ''}"
    )


if __name__ == "__main__":
    main()
