import json
from pathlib import Path

from engine.models import EvidencePackage, GroundTruth, MatchEvent, MatchMeta

SAMPLES = Path(__file__).resolve().parent.parent / "samples" / "engine"


def test_match_events_sample_validates():
    events = [
        MatchEvent.model_validate(e)
        for e in json.loads((SAMPLES / "match_events.json").read_text("utf-8"))
    ]
    assert any(e.type == "goal" for e in events)
    assert all(len(e.players) == 22 for e in events)


def test_match_meta_sample_validates():
    meta = MatchMeta.model_validate_json((SAMPLES / "match_meta.json").read_text("utf-8"))
    assert len(meta.home.players) == len(meta.away.players) == 11


def test_evidence_samples_validate_and_blame_sums_to_one():
    for name in ("evidence.json", "evidence_3_links_example.json"):
        ev = EvidencePackage.model_validate_json((SAMPLES / name).read_text("utf-8"))
        assert abs(sum(link.blame for link in ev.links) - 1.0) < 1e-3
        assert [link.rank for link in ev.links] == sorted(link.rank for link in ev.links)


def test_ground_truth_sample_matches_the_evidence_sample():
    gt = GroundTruth.model_validate(
        json.loads((SAMPLES / "ground_truth.json").read_text("utf-8"))[0]
    )
    ev = EvidencePackage.model_validate_json((SAMPLES / "evidence.json").read_text("utf-8"))
    assert ev.goal_id == gt.goal_id
    assert (ev.links[0].player_id, ev.links[0].bug) == (gt.root_cause_player_id, gt.bug)
