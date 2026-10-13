#!/usr/bin/env bash
set -euo pipefail
: "${API_URL:?Missing deployment output}"
: "${AZURE_RESOURCE_GROUP:?Missing deployment output}"
: "${AZURE_CONTAINER_APP_FRONTEND_NAME:?Missing frontend output}"
az containerapp update --name "$AZURE_CONTAINER_APP_FRONTEND_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --set-env-vars "API_URL=$API_URL" --output none
python - "$API_URL" <<'PY'
import sys,time,urllib.request
for attempt in range(12):
    try:
        with urllib.request.urlopen(sys.argv[1]+'/ready', timeout=10) as response:
            if response.status == 200:
                print('API storage readiness passed. Run authenticated smoke tests to validate models and services.')
                break
    except Exception:
        time.sleep(5)
else:
    raise SystemExit('API did not become ready')
PY
