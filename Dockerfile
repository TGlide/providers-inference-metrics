# Use the official Bun image
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# Install dependencies into temp directory
# This will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock* /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock* /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Copy node_modules from temp directory
# Then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# [optional] tests & build
ENV NODE_ENV=production
RUN bun run check

# Copy production dependencies and source code
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/index.ts .
COPY --from=prerelease /usr/src/app/src src
COPY --from=prerelease /usr/src/app/provider_mapping.json .
COPY --from=prerelease /usr/src/app/package.json .
COPY --from=prerelease /usr/src/app/tsconfig.json .

# Create directory for CSV buffer and set permissions
# Note: The bun user already exists in the base image
RUN mkdir -p /usr/src/app/data && chown -R bun:bun /usr/src/app

# Switch to non-root user
USER bun

# Expose port if needed (this app doesn't use HTTP but good practice)
EXPOSE 3000/tcp

# Set default environment variables
ENV NODE_ENV=production
ENV LOCAL_CSV_PATH=/usr/src/app/data/metrics_buffer.csv

# Run the app
ENTRYPOINT ["bun", "run", "index.ts"]