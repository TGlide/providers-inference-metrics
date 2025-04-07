# Use an official Bun image as a parent image
# Choose a specific version tag for reproducibility, e.g., oven/bun:1.0.0
# Using 'latest' might break builds if Bun introduces breaking changes
FROM oven/bun:latest AS base

# Set the working directory in the container
WORKDIR /app

# --- Dependencies ---
# Copy package.json, bun.lockb and tsconfig first to leverage Docker cache
# If these files don't change, Docker won't reinstall dependencies on subsequent builds
COPY package.json bun.lockb tsconfig.json ./

# Install dependencies using the lockfile for reproducibility
# Use --frozen-lockfile to ensure bun.lockb is used and not modified
RUN bun install --frozen-lockfile

# --- Application Code ---
# Copy the rest of the application code
# This includes index.ts, src/, provider_mapping.json, etc.
# .dockerignore should be used to exclude unnecessary files (like .git, node_modules, .env)
COPY . .

# --- Runtime ---
# Define the command to run the application
# Environment variables (HF_TOKEN, HF_HUB_TOKEN, etc.) must be provided
# when running the container (e.g., via docker run -e, docker-compose, or HF Spaces secrets)
CMD ["bun", "run", "index.ts"]

# Optional: Expose a port if the application were a web server (not needed for this script)
# EXPOSE 3000
