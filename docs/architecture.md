# Architecture

## Request flow

```mermaid
sequenceDiagram
  participant U as User
  participant G as gateway (Node/TS)
  participant C as catalog (Go)
  participant O as orders (Python)
  U->>G: GET /api/items
  G->>C: GET /items  (forwards traceparent)
  C-->>G: items JSON
  G-->>U: items JSON
  U->>G: POST /api/checkout
  G->>O: POST /orders (forwards traceparent)
  O-->>G: order JSON (201)
  G-->>U: order JSON
```

## Observability hooks (consumed by Repo 3)

- **Metrics** — every service exposes `/metrics` with RED-method series
  (`http_requests_total`, `http_request_duration_seconds`). The chart sets
  `prometheus.io/scrape` annotations and can emit `ServiceMonitor`s
  (`serviceMonitor.enabled=true`).
- **Traces** — OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; the gateway forwards
  W3C `traceparent` so spans join one trace across services.
- **Chaos knobs** — `FAILURE_RATE` and `LATENCY_MS` env vars let Repo 4 ship a "bad" version
  that trips burn-rate alerts and triggers automated rollback.

## Delivery pipeline

```mermaid
flowchart LR
  A[lint + test] --> B[docker build]
  B --> C{Trivy<br/>HIGH/CRITICAL?}
  C -- found --> X[fail build]
  C -- clean --> D[SBOM · syft]
  D --> E[cosign sign]
  E --> F[push to registry]
  F --> G[bump image tag → ArgoCD syncs]
```

Implemented identically in GitHub Actions, GitLab CI, and Jenkins — see
[ci-comparison.md](ci-comparison.md).

## Image strategy

Multi-stage builds; runtime is distroless + non-root + read-only root filesystem with all
Linux capabilities dropped. The Go service compiles to a static binary on
`distroless/static` (~27 MB); Python and Node ship on their distroless interpreters.
