# Docker Setup for Inference Providers Metrics Tracker

This document explains how to run the Inference Providers Metrics Tracker using Docker.

## Quick Start

1. **Copy the Docker environment template:**
   ```bash
   cp .env.docker.example .env.docker
   ```

2. **Edit `.env.docker` with your actual values:**
   ```bash
   # Required: Add your actual HF tokens
   HF_TOKEN=hf_your_actual_inference_token
   HF_HUB_TOKEN=hf_your_actual_hub_token
   HF_DATASET_REPO_ID=YourUsername/your-dataset-name
   ```

3. **Build and run:**
   ```bash
   ./docker-build.sh
   ```
   Choose option 1 for docker-compose (recommended).

## Docker Files Overview

- **`Dockerfile`**: Multi-stage build optimized for Bun runtime
- **`docker-compose.yml`**: Complete service configuration with volumes, networks, and health checks
- **`.dockerignore`**: Excludes unnecessary files from Docker build context
- **`.env.docker.example`**: Template for Docker-specific environment variables
- **`docker-build.sh`**: Interactive build and run script

## Running Options

### Option 1: Docker Compose (Recommended)

```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Restart
docker-compose restart
```

### Option 2: Docker Run Directly

```bash
# Build image
docker build -t inference-metrics:latest .

# Run container
docker run -d \
  --name inference-metrics-tracker \
  --env-file .env.docker \
  -v inference_data:/app/data \
  --restart unless-stopped \
  inference-metrics:latest

# View logs
docker logs -f inference-metrics-tracker

# Stop
docker stop inference-metrics-tracker
```

## Configuration

### Environment Variables

The Docker setup uses `.env.docker` for configuration. Key differences from the regular `.env`:

- `LOCAL_CSV_PATH=/app/data/metrics_buffer.csv` (uses Docker volume)
- All other settings are the same as described in the main README

### Persistent Data

The container uses a Docker volume (`inference_data`) to persist the CSV buffer file between container restarts. This ensures no data loss if the container is restarted.

### Resource Limits

The docker-compose configuration includes sensible resource limits:
- Memory: 512MB limit, 256MB reservation
- CPU: 0.5 cores limit, 0.25 cores reservation

Adjust these in `docker-compose.yml` based on your requirements.

## Health Monitoring

The container includes a health check that verifies the Bun process is running:
```yaml
healthcheck:
  test: ["CMD", "pgrep", "-f", "bun"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Logging

Logs are automatically managed by Docker with rotation:
- Max file size: 10MB
- Max files: 3
- Driver: json-file

View logs with:
```bash
docker-compose logs -f
# or
docker logs -f inference-metrics-tracker
```

## Troubleshooting

### Container Won't Start

1. Check your `.env.docker` file has valid tokens
2. Verify the HF dataset repository exists and you have write access
3. Check logs: `docker-compose logs`

### Permission Issues

The container runs as a non-root user (bun:bun, UID/GID 1001). If you have permission issues with volumes:

```bash
# Fix volume permissions
docker run --rm -v inference_data:/data alpine chown -R 1001:1001 /data
```

### Resource Issues

If the container is killed due to memory limits:
1. Increase memory limits in `docker-compose.yml`
2. Monitor usage with: `docker stats`

## Security Considerations

- **Secrets**: Never commit `.env.docker` to version control
- **User**: Container runs as non-root user for security
- **Network**: Uses isolated Docker network
- **Volumes**: Data volume is isolated from host filesystem

## Production Deployment

For production deployment:

1. **Use Docker Secrets** instead of environment files:
   ```yaml
   secrets:
     hf_token:
       file: ./secrets/hf_token.txt
   ```

2. **Set up log aggregation** (ELK stack, Splunk, etc.)

3. **Monitor with health checks** and restart policies

4. **Use specific image tags** instead of `latest`

5. **Set resource limits** appropriate for your infrastructure

## Build Optimization

The Dockerfile uses multi-stage builds to:
- Cache dependencies for faster rebuilds
- Exclude development dependencies from final image
- Minimize final image size
- Run TypeScript checks during build

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: Build and Push Docker Image
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -t myregistry/inference-metrics:${{ github.sha }} .
      - name: Push to registry
        run: docker push myregistry/inference-metrics:${{ github.sha }}
```