"""Fail unless the deployed pipeline and every selected AI service actually work."""

import asyncio
import os

import httpx
from azure.identity.aio import DefaultAzureCredential
from websockets.asyncio.client import connect


async def main():
    api_url = os.environ["API_URL"].rstrip("/")
    client_id = os.environ["API_CLIENT_ID"]
    async with DefaultAzureCredential() as credential:
        token = await credential.get_token(f"api://{client_id}/.default")
        headers = {"Authorization": f"Bearer {token.token}"}
        async with httpx.AsyncClient(base_url=api_url, headers=headers, timeout=30) as client:
            ready = await client.get("/ready")
            ready.raise_for_status()
            response = await client.post("/matches", json={"seed": 42})
            response.raise_for_status()
            mid = response.json()["id"]
            url = api_url.replace("https://", "wss://") + "/live/" + mid
            async with connect(url, additional_headers=headers) as websocket:
                async with asyncio.timeout(90):
                    while True:
                        import json

                        message = json.loads(await websocket.recv())
                        if message["type"] == "explanation.ready":
                            explanation = message["payload"]
                            break
            if (
                explanation["source"] != "model"
                or explanation["warnings"]
                or explanation["status"] != "ready"
            ):
                raise RuntimeError("A model or safety stage fell back; inspect goal telemetry")
            goal = explanation["goal_id"]
            for lang in ["hi", "es"]:
                response = await client.get(f"/goals/{goal}/explanation", params={"lang": lang})
                response.raise_for_status()
                if response.json()["lang"] != lang or response.json()["translation_warning"]:
                    raise RuntimeError("Translation did not run successfully")
            audio = await client.get(f"/goals/{goal}/audio")
            audio.raise_for_status()
            if not audio.content or audio.headers["content-type"] != "audio/mpeg":
                raise RuntimeError("Speech returned no audio")
            async with asyncio.timeout(15):
                while True:
                    result = await client.get(f"/matches/{mid}")
                    result.raise_for_status()
                    if result.json()["status"] == "finished":
                        break
                    await asyncio.sleep(0.5)
            report = await client.get(f"/matches/{mid}/report")
            report.raise_for_status()
            if report.json()["report_warning"]:
                raise RuntimeError("Full-time recap fell back")
    print(
        "Live Foundry, Event Hubs/Function/Cosmos pipeline, safety, translation, speech and report checks passed"
    )


if __name__ == "__main__":
    asyncio.run(main())
