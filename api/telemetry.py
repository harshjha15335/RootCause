import logging
import os


def configure():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    if os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"):
        from azure.monitor.opentelemetry import configure_azure_monitor

        # Content tracing stays disabled: no evidence, prompts, or auth material in telemetry.
        configure_azure_monitor(enable_live_metrics=True)
