from __future__ import annotations

import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

_configured = False


def configure_telemetry() -> None:
    """Configure manual graph spans without requiring a vendor-specific exporter."""

    global _configured
    if _configured:
        return
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": "carepulse-api",
                "deployment.environment": os.getenv(
                    "CAREPULSE_ENVIRONMENT",
                    "development",
                ),
            }
        )
    )
    if os.getenv("CAREPULSE_OTEL_CONSOLE", "false").lower() == "true":
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
    _configured = True


def tracer():
    return trace.get_tracer("carepulse.harness")
