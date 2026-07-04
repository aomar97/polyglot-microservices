# syntax=docker/dockerfile:1
# Builder must match the distroless runtime's Python (3.11) so compiled wheels
# (e.g. pydantic-core) are ABI-compatible.
FROM python:3.11-slim-bookworm AS build
WORKDIR /app
COPY requirements.txt requirements-otel.txt ./
RUN pip install --no-cache-dir --target=/install -r requirements.txt -r requirements-otel.txt
COPY app ./app

# ---- runtime: distroless python (no shell / pkg manager), nonroot ----
FROM gcr.io/distroless/python3-debian12:nonroot
WORKDIR /app
ENV PYTHONPATH=/install \
    PYTHONUNBUFFERED=1
COPY --from=build /install /install
COPY --from=build /app/app ./app
EXPOSE 8080
USER nonroot
ENTRYPOINT ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
