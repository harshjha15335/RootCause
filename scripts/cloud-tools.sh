#!/usr/bin/env bash
# Reproducible onboarding tool installation; no login or cloud resource creation.
set -euo pipefail
cd /workspace/RootCause
export UV_CACHE_DIR=/workspace/rootcause-dev/uv-cache
mkdir -p /workspace/rootcause-dev/bin
if [ ! -x /workspace/rootcause-dev/azure-cli-venv/bin/python ]; then
    uv venv /workspace/rootcause-dev/azure-cli-venv --python python3.12
fi
uv pip sync --python /workspace/rootcause-dev/azure-cli-venv/bin/python --require-hashes tools/azure-cli.txt
fetch_verified() {
    local task_url="$1" task_file="$2" task_hash="$3"
    if [ -f "$task_file" ] && [ "$(sha256sum "$task_file" | cut -d' ' -f1)" = "$task_hash" ]; then
        return
    fi
    curl -fsSL "$task_url" -o "$task_file.download"
    printf '%s  %s\n' "$task_hash" "$task_file.download" | sha256sum -c -
    mv "$task_file.download" "$task_file"
}
# Digests verified against official GitHub release asset metadata during setup.
fetch_verified https://github.com/Azure/bicep/releases/download/v0.48.1/bicep-linux-x64 /workspace/rootcause-dev/bin/bicep b09ec25a9d376c1f8e33ede6ed22b587f915ad68488d5db77a6f9541748c7f6e
fetch_verified https://github.com/Azure/azure-dev/releases/download/azure-dev-cli_1.35.1/azd-linux-amd64.tar.gz /workspace/rootcause-dev/azd.tar.gz 1b4844e195b6ca0da8d9d2a615f1fc0c9ea8e10920690652caf90e42edfa5385
tar -xzf /workspace/rootcause-dev/azd.tar.gz -C /workspace/rootcause-dev/bin azd-linux-amd64
ln -sfn azd-linux-amd64 /workspace/rootcause-dev/bin/azd
chmod +x /workspace/rootcause-dev/bin/bicep /workspace/rootcause-dev/bin/azd-linux-amd64
fetch_verified https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz /workspace/rootcause-dev/gitleaks.tar.gz 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
tar -xzf /workspace/rootcause-dev/gitleaks.tar.gz -C /workspace/rootcause-dev/bin gitleaks
source scripts/activate-tools.sh
az version --query '"azure-cli"' -o tsv
azd version
bicep --version
