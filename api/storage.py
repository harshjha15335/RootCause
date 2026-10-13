import copy
import time
from typing import Protocol


class Store(Protocol):
    async def put(self, collection: str, key: str, match_id: str, payload: dict) -> None: ...
    async def get(self, collection: str, key: str) -> dict | None: ...
    async def list(self, collection: str, match_id: str | None = None) -> list[dict]: ...
    async def acquire(self, key: str, match_id: str, seconds: int = 120) -> bool: ...
    async def close(self) -> None: ...


class MemoryStore:
    def __init__(self):
        self.data = {}
        self.leases = {}

    async def put(self, collection, key, match_id, payload):
        self.data[(collection, key)] = {"match_id": match_id, "payload": copy.deepcopy(payload)}

    async def get(self, collection, key):
        item = self.data.get((collection, key))
        return copy.deepcopy(item["payload"]) if item else None

    async def list(self, collection, match_id=None):
        return [
            copy.deepcopy(item["payload"])
            for (col, _), item in self.data.items()
            if col == collection and (match_id is None or item["match_id"] == match_id)
        ]

    async def acquire(self, key, match_id, seconds=120):
        now = time.time()
        if self.leases.get(key, 0) > now:
            return False
        self.leases[key] = now + seconds
        return True

    async def close(self):
        pass


class CosmosStore:
    """Four shared containers; every document is partitioned by match_id."""

    def __init__(self, endpoint, database, credential, client=None):
        from azure.cosmos.aio import CosmosClient

        self.client = client or CosmosClient(endpoint, credential=credential)
        self.database = self.client.get_database_client(database)

    async def put(self, collection, key, match_id, payload):
        await self.database.get_container_client(collection).upsert_item(
            {"id": key, "match_id": match_id, "payload": payload}
        )

    async def get(self, collection, key):
        iterator = self.database.get_container_client(collection).query_items(
            query="SELECT * FROM c WHERE c.id = @id", parameters=[{"name": "@id", "value": key}]
        )
        async for item in iterator:
            return item["payload"]
        return None

    async def list(self, collection, match_id=None):
        query = "SELECT * FROM c WHERE IS_DEFINED(c.payload)"
        parameters = []
        if match_id is not None:
            query += " AND c.match_id = @match"
            parameters = [{"name": "@match", "value": match_id}]
        return [
            item["payload"]
            async for item in self.database.get_container_client(collection).query_items(
                query=query, parameters=parameters
            )
        ]

    async def acquire(self, key, match_id, seconds=120):
        from azure.core import MatchConditions
        from azure.cosmos.exceptions import CosmosHttpResponseError, CosmosResourceExistsError

        container = self.database.get_container_client("agent_steps")
        body = {
            "id": f"lease-{key}",
            "match_id": match_id,
            "expires": time.time() + seconds,
            "ttl": seconds,
        }
        try:
            await container.create_item(body)
            return True
        except CosmosResourceExistsError:
            old = await container.read_item(body["id"], partition_key=match_id)
            if old["expires"] > time.time():
                return False
            try:
                await container.replace_item(
                    old["id"],
                    body,
                    etag=old["_etag"],
                    match_condition=MatchConditions.IfNotModified,
                )
                return True
            except CosmosHttpResponseError as error:
                if error.status_code in {409, 412}:
                    return False
                raise

    async def close(self):
        await self.client.close()
