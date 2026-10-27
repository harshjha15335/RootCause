# Validation status

The implementation is validated for local development. No Azure/Fabric account or
subscription was supplied, so live service validation and deployment remain blocked.

| Check | Outcome |
| --- | --- |
| Python suite | 80 tests passed: engine determinism, planted mistakes, counterfactual counts, real Debugger ingestion, real trace-to-explanation with model failures, parallel Explainer/Highlights, Recap barrier, three Persona modes, scoped tools, sentence/citation validation, durable notifications/leases, Function deduplication, Cosmos, JWT, media fallback, Fabric reuse, Event Hubs routing and checkpoint order |
| Actual Framework/OpenAI request protocol | Passed with HTTP mocked at the network boundary; not a live model call |
| Ruff lint/format and Pyright | Passed |
| Frontend ESLint / JavaScript syntax | Passed |
| Frozen dependency installation | Passed repeatedly with package hashes verified |
| API Docker image | Built with the offline dependency stage; non-root runtime imports/startup and real internal HTTP/WebSocket smoke passed |
| Frontend Docker image | Built; static console, JavaScript, and injected API configuration validated by internal HTTP requests |
| Bicep 0.48.1 compilation | Passed; no subscription-side validation or deployment performed |
| Azure Developer CLI manifest | `azd show` parsed all three services; packaging helper staged shared Function code |
| Function deployment layout | Includes engine, debugger and weights; isolated staged plugin import and config load passed; deleted Player/Judge modules absent |
| Azure CLI / azd | Installed and version-checked; no login/account available |
| Current source secret scan | Gitleaks passed with values redacted; dependency/build caches excluded |
| Full Git history scan | Scanned locally after the initial commit; CI also scans full history |
| Fixture evaluation | One labeled fixture, actual sentence grounding 1.0, pending evidence-only output; engine accuracy is measured separately below |
| Foundry / Cosmos / Event Hubs / Function live calls | Unrun: subscription, endpoints, identities, deployments and quota unavailable |
| Translator / Speech / Content Safety live calls | Unrun; transport/failure behavior tested with mocks |
| 100 planted-goal evaluation | Ran locally (seed 1000): 30 of 99 planted goals top-1 overall, 81% on LATE_STEP_UP, 0% on the four bug types without a detector. LATE_STEP_UP-only run: 35 of 50 top-1. See eval/report.md |
| Foundry groundedness upload | Unrun: live project unavailable |
| Fabric workspace/lakehouse/access | Helper tested with mocks; live capacity and tenant access unavailable |
| GitHub deployment workflow / settings / project board | Files prepared; hosted execution and remote administration are not validated by local checks |
| Role 2 engine integration | Real `p-1012` goal passes revised backend evidence validation and cited explanation/highlight/Persona fallback tests; integer replay counts retained |
| Role 1 UI integration | Finished Role 1 UI unavailable; lightweight integration console remains the local client |
| VS Code Copilot usage / demo recording | Not performed and not claimed |

Initial Docker checks found source ownership and template-directory permissions that
prevented non-root startup; Dockerfiles were corrected and affected checks rerun.
Standard API Docker dependency download could not resolve package/proxy hosts in this
machine. The offline stage installs the same HTTPS-fetched, hash-verified wheels; no TLS,
signature or checksum checks were disabled. Container ports are isolated from this
workspace, so functional checks were executed inside the containers against their real
HTTP/WebSocket servers. The native workspace API was also smoke-tested separately.

The deadline fallback retains a pending, cited explanation and structured trace, but the roughly 20-second live target has not
been measured on Foundry. Each workflow has a 20-second graph budget plus bounded
safety/persistence work; failure-path completion can exceed 20 seconds. Per-goal tracing
and the live validation script make that performance check explicit after provisioning.
Cost analysis requires actual model pricing and usage; no monetary result is invented.

One API replica, a finite demo quota and durable in-process recovery suit a hackathon
integration. They are not claims of production scale, distributed fanout, unlimited
retention, or transactional exactly-once delivery. Event Hubs is at least once, and
immutable event/goal IDs and client sequence deduplication are part of the contract.
