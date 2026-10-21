"""Functional smoke test against a running local API; creates one synthetic match."""

import asyncio
import json
import os
import sys

import httpx
from websockets.asyncio.client import connect


async def main(base_url: str):
    token = os.getenv("ROOTCAUSE_ACCESS_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with httpx.AsyncClient(base_url=base_url, timeout=15, headers=headers) as client:
        async with asyncio.timeout(15):
            while True:
                try:
                    health = await client.get("/health")
                    health.raise_for_status()
                    break
                except httpx.HTTPError:
                    await asyncio.sleep(0.2)
        assert health.json()["mode"] in {"local-demo", "azure"}
        response = await client.post("/matches", json={"seed": 42})
        response.raise_for_status()
        match_id = response.json()["id"]
        ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
        messages = []
        async with connect(f"{ws_url}/live/{match_id}", additional_headers=headers) as websocket:
            async with asyncio.timeout(60):
                while True:
                    message = json.loads(await websocket.recv())
                    messages.append(message)
                    if message["type"] == "explanation.ready":
                        break
        assert {m["type"] for m in messages} == {
            "match.event",
            "goal.detected",
            "trace.ready",
            "agent.step",
            "explanation.ready",
        }
        assert [m["sequence"] for m in messages] == list(range(1, len(messages) + 1))
        goal_id = messages[-1]["payload"]["goal_id"]
        explanation = await client.get(f"/goals/{goal_id}/explanation")
        explanation.raise_for_status()
        assert explanation.json()["source"] in {"evidence-only", "model"}
        assert explanation.json()["paragraphs"] and explanation.json()["highlights"]
        assert all(row["evidence_ids"] for row in explanation.json()["sentences"])
        assert all("[" in line for line in explanation.json()["text"].splitlines())
        assert len(explanation.json()["blame_order"]) == 2
        assert explanation.json()["blame_order"][0]["blame_percent"] == 60
        trace = await client.get(f"/goals/{goal_id}/trace")
        trace.raise_for_status()
        assert trace.json()["source"] == "synthetic-fixture"
        async with asyncio.timeout(15):
            while True:
                match = await client.get(f"/matches/{match_id}")
                match.raise_for_status()
                if match.json()["status"] == "finished":
                    break
                await asyncio.sleep(0.2)
        report = await client.get(f"/matches/{match_id}/report")
        report.raise_for_status()
        assert report.json()["goals"][0]["goal_id"] == goal_id
        print("HTTP/WebSocket smoke passed: goal → trace → explanation → highlights → report")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"))
