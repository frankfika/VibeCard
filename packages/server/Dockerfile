# Self-hosted VibeCard server image (task 5.7).
# Build context MUST be the repository root (see deploy/docker-compose.yml):
#   docker build -f packages/server/Dockerfile -t vibecard-server .
#
# The server has zero runtime npm dependencies of its own; `tsx` (already in
# the repo lockfile) is used only to run the TypeScript sources directly.

FROM node:24-bookworm-slim

WORKDIR /app

# Install from the lockfile first for layer caching.
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

# Only the sources the server composes are needed at runtime.
COPY packages/shared packages/shared
COPY packages/platforms/local-store packages/platforms/local-store
COPY packages/server packages/server

# Secure-by-default for a container: bind all interfaces (the container is the
# isolation boundary), store data on a volume. Override via env / .env file.
ENV HOST=0.0.0.0 \
    PORT=8787 \
    NODE_ENV=production \
    VIBECARD_DB_PATH=/data/vibecard.db

RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME /data
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "packages/server/src/main.ts"]
