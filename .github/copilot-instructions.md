# Root Cause coding instructions

Read docs/SPEC.md before changing contracts. Implement the explanation pipeline:
Orchestrator → parallel Explainer/Highlights → Recap → parallel Persona modes.
Use synthetic matches and invented players only. Numerical attribution belongs to Role 2.
Give every displayed sentence its evidence IDs. Evidence tools must never access raw
match state or another goal. Preserve a cited template, status=pending, and the complete
trace/blame if any model fails. Evaluate actual displayed prose and citation bindings,
not a filtered set of accepted claims. Never commit credentials or invent live service,
evaluation, deployment or Copilot-usage results. Run pytest, Ruff and Pyright from the
repository root. Local operation must require no cloud credentials.

Engine and Debugger (`engine/`, `debugger/`, Role 2): no AI or LLM calls; plain Python + NumPy.
Deterministic when seeded: all randomness goes through a passed-in `numpy.random.Generator`.
Every tunable number lives in `config/weights.yaml`. Each bug type needs a matching engine
Override hook, trigger (`engine/mistakes.py`), detector (`debugger/chain.py`) and fix
(`debugger/fixes.py`). Engine formats are in `docs/ENGINE.md`; `debugger/plugin.py` converts them
to the team contracts in `docs/SPEC.md`.
