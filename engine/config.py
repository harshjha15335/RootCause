"""Loads config/weights.yaml, the single home for every tunable number."""

from __future__ import annotations

import hashlib
from functools import cache
from pathlib import Path

import yaml

WEIGHTS_PATH = Path(__file__).resolve().parent.parent / "config" / "weights.yaml"


@cache
def load_weights(path: str | None = None) -> dict:
    with open(path or WEIGHTS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


@cache
def weights_version(path: str | None = None) -> str:
    return hashlib.sha256(Path(path or WEIGHTS_PATH).read_bytes()).hexdigest()[:12]
