import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from agents.orchestrator import run
from agents.tools import PlayerTools, check_claim
from api.contracts import Claim, Evidence
from api.contracts import Testimony as PlayerTestimony
from api.demo import fixture
from api.main import create_app


def test_player_tools_do_not_expose_other_players_and_return_copies():
    _, evidence = fixture("match", 42)
    tools = PlayerTools(evidence, "away-6")
    assert {x.player_id for x in tools.my_link()} == {"away-6"}
    assert tools.my_view(2) == []
    tools.my_link()[0].description = "tampered"
    assert tools.my_link()[0].description == "Lost the midfield duel."


def test_claim_checker_rejects_invented_numbers_and_wrong_ownership():
    _, evidence = fixture("match", 42)
    claim = Claim(
        evidence_id=evidence.links[0].evidence_id,
        player_id="away-6",
        description="Lost the midfield duel.",
        blame_percent=60,
    )
    assert check_claim(claim, evidence)
    assert not check_claim(claim.model_copy(update={"blame_percent": 99}), evidence)
    assert not check_claim(claim.model_copy(update={"player_id": "away-3"}), evidence)
    assert not check_claim(claim.model_copy(update={"description": "Invented fact"}), evidence)


def test_invalid_evidence_is_rejected():
    _, evidence = fixture("match", 42)
    data = evidence.model_dump()
    data["links"][0]["blame_percent"] = 90
    with pytest.raises(ValidationError):
        Evidence.model_validate(data)
    data = evidence.model_dump()
    data["goal"]["players"][1]["player_id"] = data["goal"]["players"][0]["player_id"]
    with pytest.raises(ValidationError):
        Evidence.model_validate(data)


@pytest.mark.parametrize("failure", ["timeout", "provider", "identity"])
async def test_player_failure_retries_once_then_uses_evidence(failure):
    _, evidence = fixture("match", 42)
    calls = {}

    async def player(pid, tools):
        calls[pid] = calls.get(pid, 0) + 1
        if failure == "timeout":
            await asyncio.sleep(1)
        if failure == "identity":
            return PlayerTestimony(player_id="wrong", source="model", claims=[])
        raise RuntimeError("provider unavailable")

    async def emit(kind, payload):
        pass

    verdict = await run(evidence, emit, player=player, timeout=0.001)
    assert calls == {"away-6": 2, "away-3": 2}
    assert verdict.source == "evidence-only"
    assert len(verdict.accepted_claims) == 2
    assert verdict.blame_order[0].blame_percent == 60


async def test_judge_rejects_unsupported_claim():
    _, evidence = fixture("match", 42)

    async def player(pid, tools):
        link = tools.my_link()[0]
        return PlayerTestimony(
            player_id=pid,
            source="model",
            claims=[
                Claim(
                    player_id=pid,
                    evidence_id=link.evidence_id,
                    description=link.description,
                    blame_percent=99,
                )
            ],
        )

    async def emit(kind, payload):
        pass

    verdict = await run(evidence, emit, player=player)
    assert not verdict.accepted_claims
    assert len(verdict.rejected_claims) == 2
    assert [x.blame_percent for x in verdict.blame_order] == [60, 40]


def test_seed_is_repeatable():
    first, _ = fixture("match", 42)
    again, _ = fixture("match", 42)
    other, _ = fixture("match", 43)
    assert first == again
    assert first[0].players != other[0].players


def test_full_rest_and_websocket_flow():
    with TestClient(create_app(tick_seconds=0.001)) as client:
        assert client.get("/health").json()["agents"] == "evidence-only"
        response = client.post("/matches", json={"seed": 42})
        assert response.status_code == 201
        mid = response.json()["id"]
        messages = []
        with client.websocket_connect(f"/live/{mid}") as ws:
            while True:
                message = ws.receive_json()
                messages.append(message)
                if message["type"] == "verdict.ready":
                    break
        assert {x["type"] for x in messages} == {
            "match.event",
            "goal.detected",
            "trace.ready",
            "agent.step",
            "verdict.ready",
        }
        assert [x["sequence"] for x in messages] == list(range(1, len(messages) + 1))
        gid = messages[-1]["payload"]["goal_id"]
        assert client.get(f"/matches/{mid}").json()["score"] == {"home": 1, "away": 0}
        assert client.get(f"/goals/{gid}/trace").json()["source"] == "synthetic-fixture"
        for mode in ["fan", "analyst", "studio"]:
            result = client.get(f"/goals/{gid}/verdict", params={"mode": mode})
            assert result.status_code == 200
            assert result.json()["source"] == "evidence-only"
        assert client.get(f"/matches/{mid}/report").json()["goals"][0]["goal_id"] == gid
        assert client.get(f"/goals/{gid}/verdict?lang=hi").status_code == 503
        assert client.get(f"/goals/{gid}/verdict?mode=unknown").status_code == 422
        assert client.post("/matches", json={"seed": -1}).status_code == 422
        assert client.get("/goals/missing/trace").status_code == 404
        # Late subscribers receive retained history, including the final verdict.
        with client.websocket_connect(f"/live/{mid}") as ws:
            replayed = [ws.receive_json() for _ in messages]
        assert replayed == messages
