import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    mode: str = "local-demo"
    cosmos_endpoint: str = ""
    cosmos_database: str = "rootcause"
    foundry_endpoint: str = ""
    main_model: str = "main"
    light_model: str = "light"
    eventhub_namespace: str = ""
    eventhub_name: str = "match-events"
    debugger_module: str = ""
    safety_endpoint: str = ""
    translator_endpoint: str = ""
    speech_endpoint: str = ""
    speech_region: str = ""
    speech_resource_id: str = ""
    tenant_id: str = ""
    api_client_id: str = ""
    max_matches: int = 100
    max_active_matches: int = 10

    @classmethod
    def from_env(cls):
        return cls(
            mode=os.getenv("ROOTCAUSE_MODE", "local-demo"),
            cosmos_endpoint=os.getenv("COSMOS_ENDPOINT", ""),
            cosmos_database=os.getenv("COSMOS_DATABASE", "rootcause"),
            foundry_endpoint=os.getenv("FOUNDRY_PROJECT_ENDPOINT", ""),
            main_model=os.getenv("FOUNDRY_MAIN_MODEL", "main"),
            light_model=os.getenv("FOUNDRY_LIGHT_MODEL", "light"),
            eventhub_namespace=os.getenv("EVENTHUB_NAMESPACE", ""),
            debugger_module=os.getenv("DEBUGGER_MODULE", ""),
            safety_endpoint=os.getenv("CONTENT_SAFETY_ENDPOINT", ""),
            translator_endpoint=os.getenv("TRANSLATOR_ENDPOINT", ""),
            speech_endpoint=os.getenv("SPEECH_ENDPOINT", ""),
            speech_region=os.getenv("AZURE_LOCATION", ""),
            speech_resource_id=os.getenv("SPEECH_RESOURCE_ID", ""),
            tenant_id=os.getenv("AZURE_TENANT_ID", ""),
            api_client_id=os.getenv("API_CLIENT_ID", ""),
        )

    def validate(self):
        if self.mode not in {"local-demo", "azure"}:
            raise ValueError("ROOTCAUSE_MODE must be local-demo or azure")
        if self.mode == "azure" and not all(
            [
                self.cosmos_endpoint,
                self.foundry_endpoint,
                self.eventhub_namespace,
                self.safety_endpoint,
                self.translator_endpoint,
                self.speech_endpoint,
                self.tenant_id,
                self.api_client_id,
            ]
        ):
            raise ValueError(
                "Azure mode requires Cosmos, Foundry, Event Hubs and AI service endpoints"
            )
