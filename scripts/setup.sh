#!/usr/bin/env bash
set -euo pipefail
cd /workspace/RootCause
export UV_CACHE_DIR=/workspace/rootcause-dev/uv-cache
if [ ! -x .venv/bin/python ]; then
    uv venv .venv --python python3.12
fi
uv pip sync --python .venv/bin/python --require-hashes requirements.txt
.venv/bin/python -m pytest -q
.venv/bin/ruff check .
.venv/bin/pyright
export npm_config_cache=/workspace/rootcause-dev/npm-cache
npm ci --prefix frontend --ignore-scripts
npm run lint --prefix frontend
python scripts/package_function.py
