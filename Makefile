.PHONY: up down build logs clean help helm-install helm-upgrade helm-uninstall ci-fail-first-check ci-lint-backend ci-lint-frontend ci-lint-mcp-node ci-lint-terraform ci-precommit-lint

VERSION ?= $(shell [ -f .version ] && cat .version || echo latest)
REGISTRY ?= your-registry
BACKEND_IMAGE = $(REGISTRY)/prompt-manager-backend
FRONTEND_IMAGE = $(REGISTRY)/prompt-manager-frontend
PYTHON ?= python3
PIP ?= $(PYTHON) -m pip

## help: Show this help message
help:
	@echo "Prompt Management Framework"
	@echo ""
	@echo "Usage:"
	@sed -n 's/^##//p' $(MAKEFILE_LIST) | column -t -s ':' | sed -e 's/^/ /'

## up: Start all services with Docker Compose
up:
	docker-compose up -d

## down: Stop all services
down:
	docker-compose down

## build: Build Docker images with version tag
build:
	docker build -t $(BACKEND_IMAGE):$(VERSION) ./backend
	docker build -t $(FRONTEND_IMAGE):$(VERSION) ./frontend

## push: Push images to container registry
push:
	docker push $(BACKEND_IMAGE):$(VERSION)
	docker push $(FRONTEND_IMAGE):$(VERSION)

## logs: Follow Docker Compose logs
logs:
	docker-compose logs -f

## clean: Remove containers, volumes, and images
clean:
	docker-compose down -v --remove-orphans
	docker rmi $(BACKEND_IMAGE):$(VERSION) $(FRONTEND_IMAGE):$(VERSION) 2>/dev/null || true

## helm-install: Install Helm chart
helm-install:
	helm install prompt-manager ./helm/prompt-manager \
		--set backend.image.repository=$(BACKEND_IMAGE) \
		--set backend.image.tag=$(VERSION) \
		--set frontend.image.repository=$(FRONTEND_IMAGE) \
		--set frontend.image.tag=$(VERSION)

## helm-upgrade: Upgrade existing Helm release
helm-upgrade:
	helm upgrade prompt-manager ./helm/prompt-manager \
		--set backend.image.repository=$(BACKEND_IMAGE) \
		--set backend.image.tag=$(VERSION) \
		--set frontend.image.repository=$(FRONTEND_IMAGE) \
		--set frontend.image.tag=$(VERSION)

## helm-uninstall: Uninstall Helm release
helm-uninstall:
	helm uninstall prompt-manager

## dev-backend: Run backend in development mode
dev-backend:
	cd backend && pip install -r requirements.txt && uvicorn main:app --reload --host 0.0.0.0 --port 8000

## dev-frontend: Run frontend in development mode
dev-frontend:
	cd frontend && npm install && npm start

## sync-version: Sync all manifest versions from .version
sync-version:
	./scripts/release/sync_versions.sh $(VERSION)

## bump-version: Bump semantic version (BUMP=patch|minor|major)
bump-version:
	@test -n "$(BUMP)" || (echo "Usage: make bump-version BUMP=patch|minor|major" && exit 1)
	./scripts/release/bump_version.sh $(BUMP)

## ci-lint-backend: Run fast Python syntax/lint validation for backend and MCP Python package
ci-lint-backend:
	$(PIP) install --upgrade pip
	$(PIP) install ruff==0.6.9
	ruff check --select E9,F63,F7,F82 backend mcp-package-python

## ci-fail-first-check: Intentionally fail CI when the SPLM fail-first sentinel exists
ci-fail-first-check:
	@if [ -f splm/ci.fail-first ]; then \
		echo "Intentional fail-first sentinel found: splm/ci.fail-first"; \
		echo "Remove this file when you are ready to verify the passing pipeline."; \
		exit 1; \
	fi

## ci-lint-frontend: Run fast frontend lint validation
ci-lint-frontend:
	cd frontend && npm ci --legacy-peer-deps && npm run lint:ci

## ci-lint-mcp-node: Run MCP Node package lint validation
ci-lint-mcp-node:
	cd mcp-package-node && npm ci && npm run lint:ci

## ci-lint-terraform: Run Terraform formatting validation
ci-lint-terraform:
	cd terraform && terraform fmt -check -recursive

## ci-precommit-lint: Run all pre-commit lint/validation checks used by CI
ci-precommit-lint: ci-lint-backend ci-lint-frontend ci-lint-mcp-node ci-lint-terraform
