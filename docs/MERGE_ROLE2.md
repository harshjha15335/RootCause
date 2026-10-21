# Role 2 engine and Role 3 explanation pipeline: merge guide

> Historical guide: the conflicts and review below describe the original `aa60252`
> snapshot. The subsequent `5cfca1c` update and integration results are recorded in
> [MERGE_RESULT.md](MERGE_RESULT.md). Preserve this guide as the original analysis;
> use the result document for current status.

Prepared on 21 October 2026. This document describes the inspected revisions below;
recheck the diff if either branch advances. It is a merge proposal, not a record of a
completed merge or deployment.

## 1. Exact starting point

| Item | Inspected state |
| --- | --- |
| Shared base and remote `main` | `546d44ecf881f7016a83dfe13da29112a1f641d7` |
| Role 2 branch | `origin/role2/engine-debugger` |
| Role 2 tip | `aa602524c69155e4bc7991da9cb3cbef81c2d489` |
| Role 2 commit | `Add Role 2 engine and Debugger with backend plugin`, author metadata `Arhamj1` |
| Local branch | `feat/explanation-pipeline` |
| Local branch HEAD | Still the shared base above |
| Local Role 3 implementation | Uncommitted tracked changes, deletions, and new files |

The local Role 3 changes are not a published branch commit. Comparing only committed
branch tips would miss them. The overlap analysis compared the current working files
against the shared base and Role 2 tip, including local untracked source files.

Role 2 changes 53 paths relative to the shared base. Exactly four of those paths also
have local Role 3 edits. The other 49 paths do not overlap our local changed paths.
These counts exclude this newly created merge guide.

A temporary-file three-way merge found two text conflicts and two clean merges.
No actual merge, source replacement, commit, push, or deployment was performed.

## 2. Who owns what, and what actually overlaps

| Component | Role 2 contribution | Role 3 contribution | Merge decision |
| --- | --- | --- | --- |
| Simulation | `engine/`, seeded movement, decisions, shots, planted mistakes | `api/demo.py`, a small fixed evidence fixture | Keep both; the fixture remains useful for fast backend tests |
| Attribution | `debugger/`, counterfactual replay and blame | Evidence validation and presentation in `api/contracts.py`, `agents/grounding.py` | Role 2 computes numbers; Role 3 validates and explains them |
| Data models | `engine/models.py`, detailed internal simulation schema | `api/contracts.py`, public backend/UI schema | Keep both with an explicit adapter in `debugger/plugin.py` |
| Agent workflow | No new agent implementation | Explainer + Highlights, then Recap, then three Personas | Keep the Role 3 explanation pipeline |
| Evaluation | `eval/accuracy.py`, intended engine accuracy measurement | `eval/agents_eval.py`, explanation sentence/citation evaluation | Keep both; their metrics answer different questions |
| Streaming | `engine/stream.py`, local stdout/WebSocket replay | `api/ingestion.py`, Event Hubs integration and backend WebSocket | Keep both; production ingestion still needs explicit wiring |
| Fabric | `data_export/fabric.py`, export placeholder | `scripts/fabric_setup.py`, workspace/lakehouse/access preparation | Complementary: exporting data and provisioning resources are different jobs |
| Samples | `samples/engine/`, engine/internal and adapter examples | `samples/evidence.json`, `samples/explanation.json` | Keep both and label their formats |
| Tests | Seven added engine/debugger test modules | Updated backend, agent, and integration tests | Keep both; run together after contract fixes |

Identical inherited backend files appearing on both branches are shared history, not
new duplicate implementations by the Role 2 contributor.

## 3. Text conflict A: `.github/copilot-instructions.md`

### Why it conflicts

Our local version rewrites the original instructions for the revised PDF: explanation
agents, sentence citations, scoped evidence tools, pending fallbacks, and actual prose
evaluation. Role 2 appends engine rules to the old instructions. Git treats the changed
end of the original file and the appended paragraph as an overlapping merge region.

The inspected conflict is:

```text
    <<<<<<< OUR LOCAL ROLE 3 VERSION
Read docs/SPEC.md before changing contracts. Implement the explanation pipeline:
Orchestrator → parallel Explainer/Highlights → Recap → parallel Persona modes.
Use synthetic matches and invented players only. Numerical attribution belongs to Role 2.
Give every displayed sentence its evidence IDs. Evidence tools must never access raw
match state or another goal. Preserve a cited template, status=pending, and the complete
trace/blame if any model fails. Evaluate actual displayed prose and citation bindings,
not a filtered set of accepted claims. Never commit credentials or invent live service,
evaluation, deployment or Copilot-usage results. Run pytest, Ruff and Pyright from the
repository root. Local operation must require no cloud credentials.
    =======
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
    >>>>>>> ROLE 2 VERSION
```

### Exact recommended final content

Keep our revised agent rules and append their engine rules. Remove obsolete instructions
about player testimony tools. The whole resulting file should be:

```markdown
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
```

This preserves the intended engine coding rule; it does not certify that every existing
engine constant has already been moved into YAML or that every detector exists.

## 4. Text conflict B: `.gitignore`

### Exact conflict

```text
    <<<<<<< OUR LOCAL ROLE 3 VERSION

*.evaluation.sentences.jsonl
    =======
matches/
exports/*.parquet
    >>>>>>> ROLE 2 VERSION
```

### Exact recommended final content

Keep every rule. Blank lines are optional:

```gitignore
.venv/
__pycache__/
.pytest_cache/
.ruff_cache/
.env
*.pyc
.build/
.azure/
infra/*.json.tmp
*.evaluation.json
frontend/node_modules/
*.evaluation.sentences.jsonl
matches/
exports/*.parquet
```

These rules cover generated datasets and evaluation files. Do not use a blanket
`samples/` ignore rule: the committed integration samples must remain available.

## 5. Shared files that merge cleanly

### `pyproject.toml`

Our change is the project version, from `0.1.0` to `0.3.0`. Their change expands the
Pyright include list. Preserve both:

```toml
[project]
name = "rootcause"
version = "0.3.0"
requires-python = ">=3.12"
description = "Root Cause local evidence-first backend"

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
asyncio_mode = "auto"

[tool.ruff]
line-length = 100

[tool.pyright]
venvPath = "."
venv = ".venv"
typeCheckingMode = "basic"
include = ["api", "agents", "functions", "tests", "scripts", "eval", "engine", "debugger", "data_export"]
```

### `README.md`

Git combines these edits without a text conflict, but the resulting claims need editing:

1. Preserve our explanation workflow, endpoints, sentence grounding evaluation, and
   failure behavior.
2. Keep their Engine & Debugger section and setup examples.
3. Replace the local sentence saying Role 2's engine/debugger are not included with:

   > The lightweight backend demo uses fixed evidence. The separate Role 2 engine and
   > Debugger are included in `engine/` and `debugger/`. Their adapter is
   > `debugger.plugin`; integration with the explanation contract must pass the combined tests.

4. Once the adapter and deployment package fixes below pass, document
   `DEBUGGER_MODULE=debugger.plugin` as the real-goal ingestion configuration.
5. Explicitly state that setting this variable alone does not replace the existing
   `/matches` fixture generator with a real engine stream.
6. Keep the disclosure that only the late-step-up detector currently exists and that
   the 100-goal accuracy evaluator is unfinished.
7. Separate measured results: local fixture sentence grounding is not engine root-cause
   accuracy, and neither proves live Foundry or Azure deployment success.

## 6. Integration conflicts Git will not report

A clean Git merge does not establish runtime compatibility. Resolve these separately.

### 6.1 Old `views` field versus the new Evidence contract — required

**Files:** `debugger/plugin.py`, `api/contracts.py`, `tests/test_plugin.py`,
`samples/engine/evidence_team_contract.json`, and related engine documentation.

Role 2's adapter returns `views`. Our Evidence model uses `extra="forbid"` and has no
`views` field. Validating their committed adapter sample against our current model fails:

```text
1 validation error for Evidence
views
  Extra inputs are not permitted
```

Recommended adapter changes:

- Replace `links, views = [], {}` with `links = []`.
- Remove `views.setdefault(...)` inside the link loop.
- Remove the returned `"views": [...]` field.
- Preserve `goal_id`, `match_id`, `source="debugger"`, `goal`, `links`, and
  `root_cause_evidence_id`.
- Do not reintroduce old player views or the old courtroom agents to accommodate the adapter.
- Regenerate the team-contract sample and update its documentation.

For Highlights, optionally add `events` converted through `team_event` from the relevant
possession/window only. The events must have unique IDs, belong to the same match, and
not occur after the goal. Keep this excerpt bounded to the API's 1,000-event limit.
Omitting `events` is valid and uses the chain-link highlight fallback, but provides no
per-event selection context to the Highlights tool.

The existing Role 2 integration test must run with our updated `api/contracts.py`, not
only with the original backend on their branch. Add assertions that serialized evidence
contains no `views`, and that evidence excerpts, if supplied, obey the window constraints.

### 6.2 Counterfactual precision versus integer replay counts — required design decision

**Files:** `debugger/counterfactual.py`, `debugger/evidence.py`, `debugger/plugin.py`,
`api/contracts.py`, `agents/grounding.py`, samples, and evaluation code.

The current engine averages per-replay goal probabilities. The adapter then converts
that estimate into an integer by rounding `rate * 200`. Our public contract and prose
present these integers as goals out of 200 trials.

A reproduced boundary example:

```text
baseline probability:       0.5000
fixed probability:          0.4998
positive drop:              0.0002
adapter baseline_goals:     100
adapter fixed_goals:        100
adapter blame_percent:      100.0  (when this is the only positive link)
```

This loses the measured reduction and can make displayed counts disagree with blame.
It also loses precision used to validate the root ordering. Integer rounding does not
reverse unequal rates, but it can collapse distinct drops into ties. Stable ordering can
preserve the supplied ranking in that case; it cannot recover the lost measurement.

Choose one shared numerical contract before calling the integration complete:

- **Preserve the current integer contract:** Role 2 supplies actual binary replay
  outcomes/counts out of 200, deriving rates, drops, ranking, and blame consistently
  from those same counts. Baseline/fixed replays should retain the intended common
  random numbers. This changes the estimator and needs engine validation.
- **Preserve the probability estimator:** version the public contract to carry measured
  baseline/fixed rates at adequate precision and the run count. Rank and calculate blame
  from consistent values. Update the grounding sentences to describe estimated rates,
  rather than rounded observed goal counts. Update validators, tests, samples, schema,
  UI consumers, and evaluation together.

Do not merely drop validation, assign invented counts, or change blame percentages to
hide this discrepancy. The choice belongs in the team contract and should be agreed
between the engine and backend owners.

### 6.3 Deployment package omits the new code — required

**Files:** `Dockerfile`, `scripts/package_function.py`.

The API image currently copies only `api` and `agents`. Add the engine, debugger, and
config to the runtime stage before switching to the application user:

```dockerfile
COPY --chown=10001:10001 engine engine
COPY --chown=10001:10001 debugger debugger
COPY --chown=10001:10001 config config
```

The Function staging helper currently copies only `api` and `agents`. Change its loop to:

```python
for name in ("api", "agents", "engine", "debugger", "config"):
```

Preserve our local staging cleanup and symlink check. They remove obsolete generated
modules from earlier builds, including the deleted courtroom files. This cleanup applies
only to the owned, generated `.build/function` directory.

`engine/config.py` resolves weights relative to the engine package's parent. Copying
`config/weights.yaml` beside `engine/` is therefore required, even if Python imports succeed.

Role 2 adds direct `numpy` and `pyyaml` entries to `requirements.in`. Both packages already
appear in the inspected hashed `requirements.txt`; they were previously transitive
packages. No missing-package failure was observed. Verify the lock with the project's
normal lock/update workflow if dependencies change; do not drop hashes or replace it
with an unpinned installation.

After packaging, test plugin import and loading weights inside both deployment layouts.
A successful Python syntax check is insufficient.

### 6.4 Engine events versus the public event format — existing adapter boundary

`engine/models.py` includes `seq`, `clock_s`, uppercase team names, possession IDs,
periods, and event types such as `tick`, `carry`, `shot`, `kickoff`, and `full_time`.
The API contract currently accepts `id`, `second`, lowercase team names, and only
`pass`, `duel`, `cross`, and `goal`.

`debugger.plugin.team_event()` intentionally converts a subset. Consequently:

- Do not publish raw `engine.stream` JSON directly to the backend's raw MatchEvent input.
- Publish converted `team_events()` records through the agreed ingestion path.
- Do not expect the current adapter to deliver every second's positions: it drops ticks
  and other unsupported event types.
- If Role 1 requires every tick and automatic full-time boundaries, extend the shared
  API contract and consumers explicitly. Until then, external streams must use the
  existing finish endpoint to declare full time.

This is a schema/design gap, not an additional textual merge conflict.

### 6.5 Two demo sources and restricted match IDs — preserve the distinction

`api/demo.py` uses hand-written evidence and arbitrary generated match IDs. The plugin
reconstructs complete engine matches only for IDs like `m-0007` and `p-1012`, with goal
IDs/events derived from that reconstruction.

Keep the fixture route usable without the engine. When testing real ingestion, use
actual converted engine events and their IDs. Do not rename a fixture match to an engine
ID and reuse fixture positions or goal events. Switching the default demo to real engine
output is a separate implementation change, including stream timing and match metadata.

## 7. Incomplete Role 2 work that merging does not solve

These are known implementation gaps, not duplicate code to delete:

| Gap | Evidence | Consequence / next action |
| --- | --- | --- |
| Four missing detectors | `debugger/chain.py` registers only `LATE_STEP_UP` | Implement and test `DUEL_LOST`, `PRESS_MISSED`, `MARKING_LOST`, `CROSS_NOT_BLOCKED`; fixes alone cannot discover causes |
| Accuracy evaluator is a placeholder | `eval/accuracy.py` raises `NotImplementedError` | Implement planted-goal top-1/top-3 metrics, report denominators and plant failures |
| Fabric exporter is a placeholder | `data_export/fabric.py` contains a TODO | Implement data export separately from existing Fabric provisioning |
| Local replay lacks Event Hubs producer | `engine/stream.py` contains a TODO | Add/wire the producer if live engine streaming through Azure is required |
| No Azure account/model configuration supplied | Earlier setup state | Live cloud tests and deployment remain unverified |

A source integration PR can document unfinished features, but it must not present these
as completed PDF deliverables or publish invented accuracy/performance results.

## 8. Safe merge procedure for the current workspace

These commands are instructions for a future merge. They have not been executed as part
of writing this guide. Run each stage and inspect its result before proceeding.

### Step 1: confirm and review the local work

```bash
cd /workspace/RootCause
git branch --show-current
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

Expected starting branch: `feat/explanation-pipeline`. Review the diff and new files so
unrelated work or credentials are not staged accidentally. Do not run `git reset --hard`,
`git clean`, or replace whole source directories with the Role 2 snapshot.

### Step 2: commit the local Role 3 implementation first

Commit tracked edits/deletions and the known new Role 3 source/sample files. The new
merge guide may be included in this checkpoint. These explicit paths match the reviewed
workspace; adjust the list if inspection reveals additional intended files.

```bash
git add -u
git add agents/explainer.py agents/fallbacks.py agents/grounding.py agents/highlights.py
git add agents/prompts/explainer.txt agents/prompts/highlights.txt
git add samples/explanation.json docs/MERGE_ROLE2.md
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "Implement the evidence-cited explanation pipeline"
git status --short
```

Proceed only when intended changes are committed and the worktree is clean. This creates
a recoverable checkpoint without overwriting either contributor's implementation.

### Step 3: fetch and compare the actual remote revision

The workspace remote fetch configuration previously fetched only HEAD by default. Fetch
the named branch explicitly:

```bash
git fetch origin +refs/heads/role2/engine-debugger:refs/remotes/origin/role2/engine-debugger
git rev-parse origin/role2/engine-debugger
git log --oneline HEAD..origin/role2/engine-debugger
git diff --stat 546d44ecf881f7016a83dfe13da29112a1f641d7 origin/role2/engine-debugger
```

If the tip is no longer `aa602524c69155e4bc7991da9cb3cbef81c2d489`, inspect the new diff;
the conflict count and fixes in this guide may have changed.

### Step 4: create a dedicated integration branch and start the merge

```bash
git switch -c integration/role2-explanations
git merge --no-ff --no-commit origin/role2/engine-debugger
git status --short
git diff --name-only --diff-filter=U
```

With the inspected revisions, expect unresolved text conflicts in:

```text
.github/copilot-instructions.md
.gitignore
```

Use the final contents in sections 3 and 4. Do not choose `--ours` or `--theirs` for every
file; doing so discards valid rules. Then stage only the resolved files:

```bash
git add .github/copilot-instructions.md .gitignore
git diff --name-only --diff-filter=U
```

That last command must produce no paths. Resolve any unexpected conflicts before continuing.

### Step 5: make the integration fixes before completing the merge

Apply sections 5 and 6: reconcile README claims; fix the adapter's `views`; settle the
numerical contract; add deployment files; update samples and tests. Preserve the new
explanation endpoints, `explanation.ready`, `explanations` storage container, and the
intentional removal of Player/Judge agents.

The incoming commit does not edit those Role 3 implementation files. Their continued
presence in its historical base is not a reason to restore them during conflict resolution.

Stage the actual files changed by these fixes and review the complete staged result:

```bash
git status --short
git diff --check
git diff --cached --check
git diff --cached --stat
```

If the numerical contract remains unresolved, keep the integration branch unpublished
as a completed solution. Record that blocker rather than silently choosing inconsistent data.

### Step 6: validate the combined tree

Run the normal checks from the repository root using the locked environment:

```bash
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pyright
.venv/bin/python -m pytest -q
.venv/bin/python eval/agents_eval.py samples/evaluation.jsonl --output /tmp/merged-fixture.evaluation.json
npm run lint --prefix frontend
.venv/bin/python scripts/package_function.py
```

Also build both Docker images, compile Bicep, and run the real HTTP/WebSocket smoke script
against a fresh process/container using the merged source. Use the offline Docker build
stage documented in README when this environment cannot resolve package hosts.

Required combined integration checks:

1. A real `p-1012` goal passes `trace_goal(..., "debugger.plugin")` using the new contract.
2. Every converted event passes `api.contracts.MatchEvent` validation.
3. Engine blame/root/rate values agree after any public-contract conversion.
4. A real engine trace can produce the explanation, highlights, all modes, and cited text.
5. Failing agents still preserve the trace and blame, with the appropriate fallback status.
6. Both API image and staged Function can import the plugin and load its weights file.
7. Generated Function staging contains no deleted `players.py` or `judge.py` files.
8. A fresh seeded engine run is deterministic; no reliance on earlier module caches.
9. The public sample files validate against the merged public models.
10. No legacy `verdict.ready` or `/verdict` dependency is reintroduced into active clients.

These checks establish local integration. Live Foundry, Event Hubs, Cosmos, Functions,
Translator, Speech, Content Safety, and Fabric still require separate cloud validation.

### Step 7: complete the merge and open a PR

After resolving conflicts, staging all integration fixes, and passing checks:

```bash
git diff --name-only --diff-filter=U
git diff --cached --check
git status --short
git commit -m "Merge Role 2 engine with the explanation pipeline"
git log --graph --oneline -8
git push -u origin integration/role2-explanations
```

Open a pull request from `integration/role2-explanations` to `main`. This branch contains
both our Role 3 checkpoint and Role 2's commit. Request the engine owner's review of
numerical conversion, root ordering, and schema mapping. State known incomplete features
and actual test outcomes. Do not directly push the merge to `main` or force-push either
contributor's branch.

### Aborting before the merge commit

If the merge must be abandoned:

```bash
git merge --abort
```

The earlier Role 3 checkpoint remains committed. Save any new conflict-resolution work
that you want to keep outside the checkout before aborting, because aborting discards
that in-progress merge resolution. After a completed merge commit, use a deliberate
revert/PR workflow rather than rewriting shared history.

## 9. Evidence from the review, and its limits

| Check performed | Actual result |
| --- | --- |
| Three-way merge of the four shared files in temporary copies | Two conflicts: instructions and ignore rules; README and Pyproject clean |
| New Role 2 test modules on its own branch snapshot | 28 passed in 33.53 seconds |
| Role 2 Ruff lint / format / Pyright | Passed using the existing installed Python environment |
| Full Role 2 branch suite | 65 passed, one existing backend WebSocket cancellation failure |
| Isolated rerun of that failed WebSocket test | Passed; intermittent behavior suspected, cause not established |
| Role 2 adapter sample against local Role 3 Evidence model | Failed on extra `views` field |
| Role 2 Function staging | Missing `debugger/plugin.py`, `engine/simulate.py`, `config/weights.yaml` |
| Probability/count boundary example | Positive drop became identical integer baseline/fixed counts |
| Accuracy CLI | Raised `NotImplementedError` |
| Combined merged-tree tests | Not performed; no merge has been applied |
| Live Azure validation | Not performed |

The new tests passing against the old backend do not establish compatibility with our
uncommitted revised backend. The two text conflicts are small; the contract, numerical,
and packaging integration work determines whether the merged system actually functions.
