# Deployment and external prerequisites

No Azure account, subscription, quota, resources, or live Foundry deployment was supplied
for this task. Infrastructure compiled locally, but no provisioning/deployment command
has run against an Azure subscription. A successful Bicep compile is not a service readiness test.

## First Azure deployment

1. Create an Azure account/subscription, using Azure for Students if eligible. Choose a
   region that supports the services and has quota for both models. Verify model catalogue
   name/version/SKU and quota before provision. The defaults are gpt-4.1-mini and
   gpt-4.1-nano, version 2025-04-14, GlobalStandard capacity 10; availability is unverified.
2. The deployer needs resource creation and RBAC-assignment rights in the subscription,
   and permission to register an Entra application. The preprovision hook registers a
   delegated API scope and preauthorizes Azure CLI; it does not create application passwords.
   If tenant policy blocks registration, an administrator must supply a suitable API_CLIENT_ID.
3. Install `az`, `azd`, Docker and Python 3.12. In this cloud workspace:

   ```sh
   bash scripts/cloud-tools.sh
   source scripts/activate-tools.sh
   az login --use-device-code
   azd auth login --use-device-code
   azd env new rootcause-dev
   azd env set AZURE_LOCATION YOUR_REGION
   azd env set BUDGET_EMAIL YOUR_NOTIFICATION_EMAIL
   azd up
   ```

   `azd up` creates billable resources. The resource-group monthly budget defaults to 25
   in the subscription's billing currency and sends an 80% actual-cost alert; alerts do not
   stop spending. Edit `monthlyBudget`, model name/version/capacity, or their deployment
   parameter overrides before provisioning if the defaults are unsuitable. Event Hubs,
   ACR, logs, model usage and the always-on API can incur charges.
4. The prepackage hook stages the Function with shared code and the locked dependencies.
   The postdeploy hook configures the frontend's API URL and checks storage readiness.
   The role assignments may take time to propagate. /health reports configured mode;
   /ready verifies Cosmos connectivity. Neither proves model or media service access.
5. Export only the named, non-secret outputs needed by `scripts/cloud_check.py`: API_URL,
   API_CLIENT_ID, AZURE_TENANT_ID and FOUNDRY_PROJECT_ENDPOINT. Authenticate through Azure
   CLI/managed identity. Run `.venv/bin/python scripts/cloud_check.py`; it fails if agents,
   the durable pipeline, safety, translation, speech, or match recap falls back.
   Then run the actual planted-goal evaluation; inspect Application Insights latency/tokens.

All Azure resources use identities for data access. `AZURE_CLIENT_ID` selects the
user-assigned identity in the app/Function. Local developers use `DefaultAzureCredential`
with their own authenticated CLI. Do not enter credentials in chat or commit .env.
Key Vault is available for future secrets; do not insert connection-string keys into code.
The API accepts v2 tokens with audience API_CLIENT_ID, the same tenant, and delegated
`access_as_user` scope. Browser WebSockets pass the token in the second subprotocol,
with `rootcause` first; native clients can use an Authorization header. Do not put tokens
in URL query strings. The console's token remains in page memory.

## Role 2 and Role 1 integration

The real debugger module must be installed in the Function package and named by
DEBUGGER_MODULE. Its `trace(event_dict)` function can be sync or async and must return
the agreed Evidence package with source=debugger and matching event/match IDs. Update
`scripts/package_function.py` to stage the actual engine package once supplied; don't
substitute fixtures while claiming debugger validation. Raw Event Hub messages are
MatchEvent JSON; demo-only envelopes carry explicitly labeled prerecorded evidence.

Role 2's publisher must have Event Hubs Data Sender permission and authenticate to the
configured namespace. The API has a separate `api` consumer group and the Function uses
`detector`. The Function writes traces before completion markers. The API polls pending
traces only after receiving their goal event, leases each goal, runs the workflow, stores
verdicts, and broadcasts progress. Use POST /ingest/evidence for recorded replay when
external ingestion is unavailable. Mark an external match finished with
POST /matches/{id}/finish before its full-time report.

Role 1 consumes the documented contracts/WebSocket stream and should replace the small
integration console with the real match/debugger/courtroom experience. A live timing
measurement and end-to-end integration day remain necessary.

## Microsoft Fabric

Fabric requires a tenant with Fabric enabled and an existing capacity or user-created
trial capacity. Azure student credits do not automatically grant a Fabric trial or capacity.
No paid Fabric capacity is created by Bicep. With access, run:

```sh
.venv/bin/python scripts/fabric_setup.py --capacity-id YOUR_CAPACITY_ID --role2-object-id ROLE2_USER_OBJECT_ID
```

The helper creates/reuses a Root Cause workspace and RootCause lakehouse, then grants
Role 2 Contributor access. The capacity should belong to this project; an existing
workspace's capacity is not silently reassigned. Fabric permissions and API operations
have only been tested with mocked responses here. Role 2 owns the dataset export.

## GitHub and CI/CD

The initial implementation bootstraps the previously empty repository. Use feature
branches and reviewed pull requests for subsequent changes. Enable Issues, create a
team project board, and protect main with review and CI requirements. These remote
administration actions are not performed by local workflow files.

Create a deployment service principal with a GitHub OIDC federation bound to this repo's
`production` environment; grant only the needed deployment/RBAC permissions. Configure
repository variables AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
AZURE_LOCATION, API_CLIENT_ID and BUDGET_EMAIL. Protect the production environment as
appropriate. The deploy workflow follows successful CI on main, checks out that exact
commit, and invokes azd. No long-lived Azure password is required. Secret scanning uses
Gitleaks on both full Git history and the working tree.

## Runtime network destinations

Once resources exist, allow their exact Foundry `.services.ai.azure.com`, Cosmos
`.documents.azure.com`, Event Hubs `.servicebus.windows.net`, AI Services
`.cognitiveservices.azure.com`, Speech `.speech.microsoft.com`, Key Vault `.vault.azure.net`,
container registry and monitoring hosts, plus login.microsoftonline.com,
management.azure.com, graph.microsoft.com and api.fabric.microsoft.com when used.
Event Hubs uses TLS WebSockets on 443. Resource hostnames cannot be supplied yet because
no subscription/resources exist. Do not replace an unknown environment allowlist.

## Shutdown

Scale idle Container Apps down when no live ingestion is needed. The API is provisioned
with one replica to consume events; scaling to zero pauses that consumer. Review
subscription costs and delete unused resources through `azd down` when the project is
finished. Deletion needs an explicit decision and is not part of the setup scripts.
