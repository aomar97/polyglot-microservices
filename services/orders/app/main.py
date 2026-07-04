"""orders — FastAPI order-processing service.

Mirrors the catalog's conventions: /healthz /readyz /metrics, RED-method
Prometheus metrics, optional OTLP tracing, and the FAILURE_RATE / LATENCY_MS
chaos knobs used by the observability and progressive-delivery projects.
"""
from __future__ import annotations

import asyncio
import os
import random
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, Field

FAILURE_RATE = float(os.getenv("FAILURE_RATE", "0"))
LATENCY_MS = int(os.getenv("LATENCY_MS", "0"))

REQUESTS = Counter(
    "http_requests_total", "Total HTTP requests.", ["method", "route", "status"]
)
DURATION = Histogram(
    "http_request_duration_seconds", "HTTP request latency in seconds.", ["method", "route"]
)


def _init_tracing() -> None:
    """Configure OTLP tracing if an endpoint is set and the libs are present."""
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider(resource=Resource.create({"service.name": "orders"}))
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces"))
        )
        trace.set_tracer_provider(provider)
    except Exception as exc:  # noqa: BLE001 - tracing must never block startup
        print(f"tracing disabled: {exc}")


class OrderItem(BaseModel):
    sku: str
    qty: int = Field(gt=0)


class OrderIn(BaseModel):
    customer: str
    items: list[OrderItem]


app = FastAPI(title="orders", version="1.0.0")
_orders: dict[str, dict] = {}
_init_tracing()


def _route_label(path: str) -> str:
    return "/orders/:id" if path.startswith("/orders/") else path


@app.middleware("http")
async def observe(request: Request, call_next):
    path = request.url.path
    route = _route_label(path)
    infra = path in ("/healthz", "/readyz", "/metrics")

    if not infra:
        if LATENCY_MS > 0:
            await asyncio.sleep(LATENCY_MS / 1000)
        if FAILURE_RATE > 0 and random.random() < FAILURE_RATE:
            REQUESTS.labels(request.method, route, "500").inc()
            return JSONResponse({"detail": "injected failure"}, status_code=500)

    start = time.perf_counter()
    response = await call_next(request)
    DURATION.labels(request.method, route).observe(time.perf_counter() - start)
    REQUESTS.labels(request.method, route, str(response.status_code)).inc()
    return response


@app.get("/healthz")
@app.get("/readyz")
def health() -> Response:
    return Response("ok")


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/orders", status_code=201)
def create_order(order: OrderIn) -> dict:
    oid = str(uuid.uuid4())
    record = {
        "id": oid,
        "customer": order.customer,
        "items": [i.model_dump() for i in order.items],
        "units": sum(i.qty for i in order.items),
        "status": "created",
    }
    _orders[oid] = record
    return record


@app.get("/orders")
def list_orders() -> list[dict]:
    return list(_orders.values())


@app.get("/orders/{oid}")
def get_order(oid: str) -> dict:
    if oid not in _orders:
        raise HTTPException(status_code=404, detail="order not found")
    return _orders[oid]
