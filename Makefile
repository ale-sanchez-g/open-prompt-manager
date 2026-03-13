.PHONY: up down build logs clean help helm-install helm-upgrade helm-uninstall

VERSION ?= 1.0.0
REGISTRY ?= your-registry
BACKEND_IMAGE = $(REGISTRY)/prompt-manager-backend
FRONTEND_IMAGE = $(REGISTRY)/prompt-manager-frontend

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
