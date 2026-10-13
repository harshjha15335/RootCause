# Validation status

The implementation is validated for local development. No Azure/Fabric account or
subscription was supplied, so live service validation and deployment remain blocked.

| Check | Outcome |
| --- | --- |
| Python suite | 38 tests passed: orchestration/rebuttal, stage failures, global deadline, player isolation, claim/evidence validation, durable notifications/leases, Function deduplication, Cosmos document/query shape, JWT signature/claims, media fallback, Fabric reuse, Event Hubs routing and checkpoint order |
| Actual Framework/OpenAI request protocol | Passed with HTTP mocked at the network boundary; not a live model call |
| Ruff lint/format and Pyright | Passed |
| Frontend ESLint / JavaScript syntax | Passed |
| Frozen dependency installation | Passed repeatedly with package hashes verified |
| API Docker image | Built with the offline dependency stage; non-root runtime imports/startup and real internal HTTP/WebSocket smoke passed |
| Frontend Docker image | Built; static console, JavaScript, and injected API configuration validated by internal HTTP requests |
| Bicep 0.48.1 compilation | Passed; no subscription-side validation or deployment performed |
| Azure Developer CLI manifest | `azd show` parsed all three services; packaging helper staged shared Function code |
| Azure CLI / azd | Installed and version-checked; no login/account available |
| Current source secret scan | Gitleaks passed with values redacted; dependency/build caches excluded |
| Full Git history scan | Scanned locally after the initial commit; CI also scans full history |
| Fixture evaluation | One labeled fixture, structured accepted-claim grounding 1.0; engine accuracy is null, not an accuracy claim |
| Foundry / Cosmos / Event Hubs / Function live calls | Unrun: subscription, endpoints, identities, deployments and quota unavailable |
| Translator / Speech / Content Safety live calls | Unrun; transport/failure behavior tested with mocks |
| Foundry groundedness upload / 100 planted-goal evaluation | Unrun: live project and Role 2 dataset unavailable |
| Fabric workspace/lakehouse/access | Helper tested with mocks; live capacity and tenant access unavailable |
| GitHub deployment workflow / settings / project board | Files prepared; hosted execution and remote administration are not validated by local checks |
| Role 1 UI / Role 2 engine integration | Missing their actual components and confirmed contracts |
| VS Code Copilot usage / demo recording | Not performed and not claimed |

Initial Docker checks found source ownership and template-directory permissions that
prevented non-root startup; Dockerfiles were corrected and affected checks rerun.
Standard API Docker dependency download could not resolve package/proxy hosts in this
machine. The offline stage installs the same HTTPS-fetched, hash-verified wheels; no TLS,
signature or checksum checks were disabled. Container ports are isolated from this
workspace, so functional checks were executed inside the containers against their real
HTTP/WebSocket servers. The native workspace API was also smoke-tested separately.

The deadline fallback retains a verdict, but the roughly 20-second live target has not
been measured on Foundry. Each workflow has a 20-second graph budget plus bounded
safety/persistence work; failure-path completion can exceed 20 seconds. Per-goal tracing
and the live validation script make that performance check explicit after provisioning.
Cost analysis requires actual model pricing and usage; no monetary result is invented.

One API replica, a finite demo quota and durable in-process recovery suit a hackathon
integration. They are not claims of production scale, distributed fanout, unlimited
retention, or transactional exactly-once delivery. Event Hubs is at least once, and
immutable event/goal IDs and client sequence deduplication are part of the contract.
