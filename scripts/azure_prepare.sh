#!/usr/bin/env bash
set -euo pipefail
# Run only under an authenticated azd up. No secret values are generated or saved.
command -v az >/dev/null
: "${AZURE_ENV_NAME:?Set an azd environment name}"
: "${AZURE_LOCATION:?Choose a region with quota for both model deployments}"
: "${BUDGET_EMAIL:?Set a budget notification email using azd env set BUDGET_EMAIL}"
az account show --query id --output none
if [ -z "${API_CLIENT_ID:-}" ]; then
    task_app_name="rootcause-${AZURE_ENV_NAME}-api"
    task_app_id=$(az ad app list --display-name "$task_app_name" --query '[0].appId' -o tsv)
    if [ -z "$task_app_id" ]; then
        task_app_id=$(az ad app create --display-name "$task_app_name" --sign-in-audience AzureADMyOrg --query appId -o tsv)
        # Expose a v2 delegated API scope. No password or client secret is needed.
        task_scope_id=$(python -c 'import uuid; print(uuid.uuid4())')
        task_patch=$(mktemp)
        python - "$task_scope_id" "$task_patch" <<'PY'
import json,sys
json.dump({'api':{'requestedAccessTokenVersion':2,'oauth2PermissionScopes':[{'id':sys.argv[1],'value':'access_as_user','type':'User','isEnabled':True,'adminConsentDisplayName':'Use Root Cause','adminConsentDescription':'Access Root Cause match replay and verdict API','userConsentDisplayName':'Use Root Cause','userConsentDescription':'Access Root Cause match replay and verdict API'}],'preAuthorizedApplications':[{'appId':'04b07795-8ddb-461a-bbee-02f9e1bf7b46','delegatedPermissionIds':[sys.argv[1]]}]}},open(sys.argv[2],'w'))
PY
        task_object_id=$(az ad app show --id "$task_app_id" --query id -o tsv)
        az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$task_object_id" --body "@$task_patch" --output none
        rm "$task_patch"
        az ad app update --id "$task_app_id" --identifier-uris "api://$task_app_id" --output none
    fi
    azd env set API_CLIENT_ID "$task_app_id"
fi
python scripts/package_function.py
