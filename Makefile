SHELL := /usr/bin/env bash

SERVICES     := catalog orders gateway
REGISTRY     ?=
TAG          ?= dev
KIND_CLUSTER ?= eks-platform
PREFIX       := $(if $(REGISTRY),$(REGISTRY)/,)

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---- test (per language) ----------------------------------------------------
.PHONY: test
test: test-catalog test-orders test-gateway ## Run all unit tests + linters

.PHONY: test-catalog
test-catalog: ## Go: vet + test
	cd services/catalog && go vet ./... && go test ./...

.PHONY: test-orders
test-orders: ## Python: ruff + pytest (in a venv)
	cd services/orders && python3 -m venv .venv \
	  && .venv/bin/pip install -q -r requirements-dev.txt \
	  && .venv/bin/ruff check app tests \
	  && .venv/bin/python -m pytest -q

.PHONY: test-gateway
test-gateway: ## Node/TS: typecheck + test
	cd services/gateway && npm ci && npm run typecheck && npm test

# ---- build / supply chain ---------------------------------------------------
.PHONY: build
build: ## Build all service images ($(PREFIX)shop-<svc>:$(TAG))
	@for s in $(SERVICES); do \
	  echo ">> build $$s"; docker build -t $(PREFIX)shop-$$s:$(TAG) services/$$s; \
	done

.PHONY: scan
scan: ## Trivy gate (fixable HIGH/CRITICAL) on all images
	@for s in $(SERVICES); do \
	  echo ">> scan $$s"; trivy image --pkg-types library --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 $(PREFIX)shop-$$s:$(TAG); \
	done

.PHONY: sbom
sbom: ## Generate SPDX SBOMs (syft) for all images
	@for s in $(SERVICES); do \
	  echo ">> sbom $$s"; syft $(PREFIX)shop-$$s:$(TAG) -o spdx-json > sbom-$$s.spdx.json; \
	done

# ---- helm -------------------------------------------------------------------
.PHONY: helm-lint
helm-lint: ## Lint + render the chart for every env
	helm lint deploy/helm/shop
	@for e in dev staging prod; do \
	  echo ">> render $$e"; helm template shop deploy/helm/shop -f deploy/helm/shop/values-$$e.yaml >/dev/null; \
	done

# ---- local run on kind ------------------------------------------------------
.PHONY: dev
dev: build ## Build, load into kind ($(KIND_CLUSTER)), and helm install
	@for s in $(SERVICES); do kind load docker-image shop-$$s:$(TAG) --name $(KIND_CLUSTER); done
	helm upgrade --install shop deploy/helm/shop -n shop --create-namespace \
	  -f deploy/helm/shop/values-dev.yaml \
	  --set global.image.registry="" --set global.image.tag=$(TAG)
	@echo "Port-forward: kubectl -n shop port-forward svc/gateway 8080:8080"

.PHONY: undev
undev: ## Remove the local helm release
	helm uninstall shop -n shop || true
