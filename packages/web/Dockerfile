FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/package-lock.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=packages/web --workspace=packages/shared --include-workspace-root

COPY packages/web ./packages/web
COPY packages/shared ./packages/shared
RUN npm run build --workspace=packages/web

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production SERVE_WEB=1 PORT=8080 DATA_DIR=/data/cards
RUN npm init -y >/dev/null && npm install --omit=dev express@4.22.2 >/dev/null
# Keep the Web package's ESM mode for server.js without installing its full
# browser dependency graph in the runtime image.
COPY packages/web/package.json ./package.json
COPY --from=build /app/packages/web/dist ./dist
COPY packages/web/server.js ./server.js
RUN mkdir -p /data/cards && chown -R node:node /app /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
