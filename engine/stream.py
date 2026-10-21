"""Real-time replay of a match file.

    python -m engine.stream matches/m-0007.events.jsonl --speed 10          # JSON lines to stdout
    python -m engine.stream matches/m-0007.events.jsonl --ws --port 8765    # local WebSocket for Role 1

Each match second's events are sent together, then we wait 1/speed seconds.
TODO(day 5): Event Hubs producer (azure-eventhub; connection string from Key Vault via Role 3).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections.abc import Iterator
from itertools import groupby
from pathlib import Path


def load_events(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def by_second(events: list[dict]) -> Iterator[list[dict]]:
    for _, group in groupby(events, key=lambda e: e["clock_s"]):
        yield list(group)


def stream_stdout(events: list[dict], speed: float) -> None:
    for batch in by_second(events):
        for e in batch:
            sys.stdout.write(json.dumps(e) + "\n")
        sys.stdout.flush()
        time.sleep(1.0 / speed)


async def serve_ws(events: list[dict], speed: float, port: int) -> None:
    import websockets  # pyright: ignore[reportMissingImports]  # optional: pip install websockets

    async def handler(ws):
        for batch in by_second(events):
            for e in batch:
                await ws.send(json.dumps(e))
            await asyncio.sleep(1.0 / speed)

    async with websockets.serve(handler, "localhost", port):
        print(f"streaming on ws://localhost:{port} (each client gets the match from kick-off)")
        await asyncio.Future()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("events", type=Path)
    ap.add_argument("--speed", type=float, default=1.0, help="match seconds per real second")
    ap.add_argument("--ws", action="store_true")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    events = load_events(args.events)
    if args.ws:
        asyncio.run(serve_ws(events, args.speed, args.port))
    else:
        stream_stdout(events, args.speed)


if __name__ == "__main__":
    main()
