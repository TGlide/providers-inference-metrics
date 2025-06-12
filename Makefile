# Makefile for Inference Providers Metrics Tracker Docker operations

.PHONY: help build run stop logs shell clean setup test

# Default target
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Setup environment file from template
	@if [ ! -f .env.docker ]; then \
		cp .env.docker.example .env.docker; \
		echo "✅ Created .env.docker from template"; \
		echo "📝 Please edit .env.docker with your actual values"; \
	else \
		echo "⚠️  .env.docker already exists"; \
	fi

build: ## Build the Docker image
	@echo "🏗️  Building Docker image..."
	docker build -t inference-metrics:latest .
	@echo "✅ Build completed"

run: ## Start the application using docker-compose
	docker-compose up -d
	@echo "✅ Container started"
	@echo "📊 View logs with: make logs"

stop: ## Stop the application
	docker-compose down
	@echo "🛑 Container stopped"

restart: ## Restart the application
	docker-compose restart
	@echo "🔄 Container restarted"

logs: ## View application logs
	docker-compose logs -f

shell: ## Get shell access to running container
	docker-compose exec inference-metrics /bin/bash

status: ## Show container status
	docker-compose ps

clean: ## Clean up Docker resources
	@echo "🧹 Cleaning up Docker resources..."
	docker-compose down -v
	docker image rm inference-metrics:latest 2>/dev/null || true
	docker system prune -f
	@echo "✅ Cleanup completed"

test: ## Test the Docker build (build only, don't run)
	@echo "🧪 Testing Docker build..."
	docker build -t inference-metrics:test .
	@echo "✅ Build test passed"
	docker image rm inference-metrics:test

# Development targets
dev-run: ## Run with development settings (more verbose logging)
	@echo "🔧 Starting in development mode..."
	docker-compose -f docker-compose.yml run --rm \
		-e LOG_LEVEL=debug \
		-e SCHEDULE_INTERVAL_SECONDS=600 \
		inference-metrics

check-env: ## Check if .env.docker is properly configured
	@if [ ! -f .env.docker ]; then \
		echo "❌ .env.docker not found. Run 'make setup' first."; \
		exit 1; \
	fi
	@echo "✅ .env.docker exists"
	@grep -q "HF_TOKEN=hf_" .env.docker || (echo "⚠️  HF_TOKEN not set properly" && exit 1)
	@grep -q "HF_HUB_TOKEN=hf_" .env.docker || (echo "⚠️  HF_HUB_TOKEN not set properly" && exit 1)
	@echo "✅ Environment appears to be configured"

# Combined targets
start: check-env build run ## Complete setup: check env, build, and run

deploy: check-env build ## Prepare for deployment (build and validate)
	@echo "🚀 Ready for deployment"