# Root Cause coding instructions

Read docs/SPEC.md before editing integration contracts. Use synthetic data and invented
players only. Do not invent attribution numbers or present fixtures as measured results.
Bind player tools to one player ID. Check every structured claim against its evidence.
Always preserve an explicitly labeled evidence-only fallback. Never commit credentials.
Use environment settings or managed identity for future cloud configuration. Do not
claim integrations, evaluations, deployment, or Copilot usage without actual evidence.
Run pytest and Ruff from the repository root. Keep local demo operation credential-free.

Engine and Debugger (`engine/`, `debugger/`, Role 2): no AI or LLM calls; plain Python + NumPy.
Deterministic when seeded: all randomness goes through a passed-in `numpy.random.Generator`.
Every tunable number lives in `config/weights.yaml`. Each bug type needs a matching engine
Override hook, trigger (`engine/mistakes.py`), detector (`debugger/chain.py`) and fix
(`debugger/fixes.py`). Engine formats are in `docs/ENGINE.md`; `debugger/plugin.py` converts them
to the team contracts in `docs/SPEC.md`.
