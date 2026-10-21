# Role 2 / explanation pipeline integration result

Reviewed and integrated on 21 October 2026 on `integration/role2-explanations`.
The merge combines the local Role 3 explanation pipeline checkpoint `03954d6` with
Role 2 tip `5cfca1cb8304b979e3f2a8570364ecfdb8a4d097`. The original analysis is retained
in [MERGE_ROLE2.md](MERGE_ROLE2.md); its original snapshot is historical.

## Review of the updated Role 2 commit

The updated branch resolves the original adapter and numerical incompatibilities:

- `views` is omitted when the installed backend's Evidence schema forbids it. Legacy
  compatibility is retained only for the original contract. The merged backend sample
  and real engine output validate against the revised Evidence model.
- Replay outcomes are binary; baseline and fixed values represent actual goals out of
  200 runs. Rates, drops and blame derive from the same counts. Non-integral estimated
  counts are rejected instead of silently rounded. This retains the existing integer
  API contract without weakening validation.
- The API Docker image includes `engine/`, `debugger/` and `config/weights.yaml`.
- README distinguishes the lightweight fixture from real engine ingestion, and does
  not claim the engine producer, additional detectors or accuracy evaluation are complete.

The adapter itself required no additional source change after review. Its updated
plugin/debugger tests passed against the revised Role 3 backend in an isolated snapshot
before the actual merge.

## Conflict resolutions and integration changes

Exactly two textual conflicts occurred, in `.github/copilot-instructions.md` and
`.gitignore`. The incoming versions already contained the complete combined rules
specified in the original guide. Both were inspected and retained. README and Pyproject
merged cleanly: version `0.3.0` and the engine/debugger type-check paths both survive.

The merge additionally:

1. Includes engine, debugger and config in Function staging while preserving the local
   staging cleanup and symlink protection. Obsolete Player/Judge modules stay deleted.
2. Adds two parametrized real-engine integration cases: evidence-only operation and
   model deployment failure. Both validate every rendered sentence, preserve the
   original evidence/blame/root, and produce highlights and all three Persona modes.
3. Updates measured local results and README integration instructions.
4. Indents historical conflict-marker examples in the original guide so Git's diff
   checks do not mistake the documentation for unresolved conflict files.

The active API remains `/goals/{id}/explanation`, WebSocket output remains
`explanation.ready`, and the Cosmos container remains `explanations`.

## Verified results

| Check | Result |
| --- | --- |
| Entire combined Python suite | 80 passed in 52.11 seconds |
| Ruff lint / formatting | Passed |
| Pyright | Zero errors/warnings |
| Frontend ESLint | Passed |
| Fixture sentence evaluation | Groundedness 1.0; one pending evidence-only fixture; no engine accuracy claim |
| API and frontend Docker builds | Passed; API used the documented offline, hash-verified dependency stage |
| API runtime plugin / weights | Import and configuration load passed inside the built non-root image |
| API HTTP/WebSocket smoke | Goal → trace → explanation → highlights → full-time report passed inside the image |
| Real engine in API container | A `p-1012` goal passed `trace_goal`, explanation validation, highlights and three Persona modes; pending evidence-only output |
| Frontend container HTTP | Static console and injected API config returned successfully |
| Function staging | Plugin/config import passed from isolated staging directory; engine/debugger/weights present, deleted court modules absent |
| Public samples | Fixture evidence, real-engine adapter evidence, and explanation sample validate |
| Bicep | Compilation passed; no live subscription validation |
| Current source secret scan | No leaks found |

Local tests exercise actual engine computation and the Agent Framework pipeline, with
no live model credentials. They establish source integration, not live Azure deployment.

## Remaining limitations

- Only `LATE_STEP_UP` has a detector. The other four bug types have engine hooks/fixes
  but cannot yet be independently detected by the Debugger.
- `eval/accuracy.py`, the Fabric exporter, and the engine's Event Hubs producer remain
  placeholders. No 100-goal root-cause accuracy result has been measured.
- Optional evidence event excerpts are not supplied by the adapter; Highlights can use
  the causal-link fallback. The adapter drops ticks and other unsupported event types,
  so it does not provide a complete per-second animation stream.
- `/matches` still generates the small fixture. Setting `DEBUGGER_MODULE` configures real
  goal ingestion; it does not replace that fixture with the full engine.
- No detected positive effect means the Debugger rejects attribution rather than
  inventing blame. With the limited detector catalogue this can occur for natural goals.
- Azure/Foundry/Fabric accounts and deployments remain unavailable for live validation.

## Publishing

The integration branch is intended for a PR to `main`; `main` and the Role 2 branch are
not overwritten. GitHub REST and GraphQL requests through `gh` were rejected with
`Forbidden` in this environment. A blocked PR operation must not be reported as a
success, and PR #1 must not be closed as superseded until a replacement PR exists.
