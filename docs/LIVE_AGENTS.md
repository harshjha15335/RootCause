# Run the agents on a live Foundry model

This runs the real Agent Framework workflow (Orchestrator → Explainer ∥ Highlights → Recap →
Fan/Analyst/Studio Persona) against model deployments in a Microsoft Foundry project, for one
goal, from your own machine. You need no Cosmos DB, Event Hubs or `azd up`. Expect it to take
about an hour, mostly signup and model deployment, and to cost a few cents.

## 1. Get an Azure subscription (10 minutes)

1. Go to <https://azure.microsoft.com/free/students> and choose **Start free**.
2. Sign in with your university email and complete the student verification. No credit card is
   needed. You get USD 100 of credit and an **Azure for Students** subscription.

## 2. Create a Foundry project and two model deployments (20 minutes)

1. Open <https://ai.azure.com>, sign in with the same account and choose **Create project**.
   - Subscription: **Azure for Students**.
   - Resource group: create `rg-rootcause`.
   - Region: **East US 2** or **Sweden Central**. Both offer the models below.
2. In the project, open **Models + endpoints** and choose **Deploy model**, then **Deploy base model**.
   - Model `gpt-4.1-mini`, deployment name **`main`**, deployment type **Global Standard**,
     about 10K tokens per minute.
   - Repeat with `gpt-4.1-nano` and deployment name **`light`**. If your subscription refuses
     a second deployment, skip it and set `FOUNDRY_LIGHT_MODEL=main` below.
   These names match `infra/main.bicep`, so the repo's defaults work.
3. On the project **Overview** page, copy the **project endpoint**. It looks like
   `https://<resource>.services.ai.azure.com/api/projects/<project>`.

## 3. Give your account access (5 minutes)

The backend authenticates with Entra ID (`DefaultAzureCredential`), not API keys.

1. In <https://portal.azure.com>, open the Foundry resource (the AI Services account in
   `rg-rootcause`), then **Access control (IAM)** → **Add role assignment**.
2. Choose **Azure AI User**, assign it to your own account and save. It can take up to 5
   minutes to apply.
3. Install the Azure CLI and sign in:

   ```powershell
   winget install -e --id Microsoft.AzureCLI    # Windows; on macOS: brew install azure-cli
   az login                                      # choose the Azure for Students subscription
   ```

## 4. Run one goal through the live agents (5 minutes)

Run these from the repository root, using the virtual environment from the main README.

PowerShell:

```powershell
$env:FOUNDRY_PROJECT_ENDPOINT = "https://<resource>.services.ai.azure.com/api/projects/<project>"
$env:FOUNDRY_MAIN_MODEL = "main"
$env:FOUNDRY_LIGHT_MODEL = "light"
.venv\Scripts\python scripts\live_agents.py --evidence web\public\showcase\p-1017\traces\p-1017-g2.json --timeout 30
```

bash:

```sh
export FOUNDRY_PROJECT_ENDPOINT="https://<resource>.services.ai.azure.com/api/projects/<project>"
export FOUNDRY_MAIN_MODEL=main FOUNDRY_LIGHT_MODEL=light
.venv/bin/python scripts/live_agents.py --evidence web/public/showcase/p-1017/traces/p-1017-g2.json --timeout 30
```

The script prints each agent step as it finishes, and writes the full explanation to
`live_explanation.json`.

## 5. Check that it really used the model

A live run looks like this:

```
  0.01s  orchestrator: started
  3.80s  highlights: completed
  5.20s  explainer: completed
  7.90s  recap: completed
 10.40s  persona (fan): completed
 10.70s  persona (analyst): completed
 11.10s  persona (studio): completed

source: model   status: ready
```

- **`completed` and `source: model` / `status: ready`** mean the model answered and passed the
  server-side citation validator.
- **`evidence-only` or `pending`** mean that agent fell back to the cited template. The
  `WARNING` line above names the error type:
  - `ClientAuthenticationError`, `AuthenticationError` or `PermissionDeniedError`: run `az login` again, or wait for the
    role from step 3 to apply.
  - `NotFoundError`: the deployment names don't match `main` and `light`.
  - `TimeoutError`: rerun with `--timeout 45`.
  - A validation error: the model wrote a sentence the grounding check rejected, and the
    template was kept. This is the guardrail working. Rerun, or show it in the demo as the
    failure recovery.
- In the Foundry portal, the deployment's **Metrics** tab shows the requests and tokens.

To compare against the fallback, run the same command with `--local`.

## Optional: Foundry groundedness evaluation (15 minutes)

This scores every displayed sentence with `azure-ai-evaluation` and logs the run in the Foundry
project.

```powershell
# the Azure OpenAI endpoint from the "main" deployment's details page, without the path
$env:EVALUATION_MODEL_ENDPOINT = "https://<resource>.openai.azure.com/"
.venv\Scripts\python eval\agents_eval.py samples\evaluation.jsonl --foundry --output eval\foundry.evaluation.json
```

The result appears under **Evaluation** in the Foundry project.

## What is not worth doing before the deadline

Content Safety, Translator and Speech are only called in full `ROOTCAUSE_MODE=azure`. That mode
also requires Cosmos DB, Event Hubs and the Entra-protected API, which means a full `azd up`
deployment (see [DEPLOYMENT.md](DEPLOYMENT.md)). That's several hours with quota risk, so leave
it out tonight. In the submission, describe those services as implemented but not deployed.
