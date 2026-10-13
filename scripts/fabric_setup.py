"""Prepare a Fabric workspace/lakehouse on an existing capacity (including a user trial)."""

import argparse
import asyncio
import json
from uuid import UUID

import httpx

BASE = "https://api.fabric.microsoft.com/v1"


async def prepare(client, capacity_id: str, role2_object_id: str | None = None):
    UUID(capacity_id)
    if role2_object_id:
        UUID(role2_object_id)

    async def request(method, path, **kwargs):
        response = await client.request(method, BASE + path, **kwargs)
        response.raise_for_status()
        return response

    async def listing(path):
        values = []
        response = await request("GET", path)
        data = response.json()
        values.extend(data.get("value", []))
        while data.get("continuationToken"):
            response = await request(
                "GET", path, params={"continuationToken": data["continuationToken"]}
            )
            data = response.json()
            values.extend(data.get("value", []))
        return values

    async def create(path, body):
        response = await request("POST", path, json=body)
        if response.status_code != 202:
            return response.json()
        location = response.headers["Location"]
        if not location.startswith(BASE + "/operations/"):
            raise ValueError("Unexpected Fabric operation location")
        for _ in range(60):
            await asyncio.sleep(min(int(response.headers.get("Retry-After", "2")), 10))
            response = await client.get(location)
            response.raise_for_status()
            operation = response.json()
            if operation["status"] == "Succeeded":
                result = await client.get(location + "/result")
                result.raise_for_status()
                return result.json()
            if operation["status"] == "Failed":
                raise RuntimeError("Fabric provisioning operation failed")
        raise TimeoutError("Fabric provisioning operation timed out")

    workspaces = [x for x in await listing("/workspaces") if x["displayName"] == "Root Cause"]
    if len(workspaces) > 1:
        raise ValueError("Multiple Root Cause workspaces; resolve ambiguity first")
    workspace = (
        workspaces[0]
        if workspaces
        else await create("/workspaces", {"displayName": "Root Cause", "capacityId": capacity_id})
    )
    workspace_id = workspace["id"]
    items = await listing(f"/workspaces/{workspace_id}/items")
    lakes = [x for x in items if x["displayName"] == "RootCause" and x["type"] == "Lakehouse"]
    if len(lakes) > 1:
        raise ValueError("Multiple RootCause lakehouses; resolve ambiguity first")
    lake = (
        lakes[0]
        if lakes
        else await create(
            f"/workspaces/{workspace_id}/items", {"displayName": "RootCause", "type": "Lakehouse"}
        )
    )
    if role2_object_id:
        roles = await listing(f"/workspaces/{workspace_id}/roleAssignments")
        if not any(x["principal"]["id"] == role2_object_id for x in roles):
            await request(
                "POST",
                f"/workspaces/{workspace_id}/roleAssignments",
                json={"principal": {"id": role2_object_id, "type": "User"}, "role": "Contributor"},
            )
    return {"workspace_id": workspace_id, "lakehouse_id": lake["id"], "capacity_id": capacity_id}


async def main():
    from azure.identity.aio import DefaultAzureCredential

    parser = argparse.ArgumentParser()
    parser.add_argument("--capacity-id", required=True)
    parser.add_argument("--role2-object-id")
    args = parser.parse_args()
    async with DefaultAzureCredential() as credential:
        token = await credential.get_token("https://api.fabric.microsoft.com/.default")
        async with httpx.AsyncClient(
            headers={"Authorization": f"Bearer {token.token}"}, timeout=30
        ) as client:
            result = await prepare(client, args.capacity_id, args.role2_object_id)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
