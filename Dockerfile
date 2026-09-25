# Custom Tabletop — one container: the server serves the built client, the
# uploads and Socket.IO on a single port. See docs/engineering/deployment.md.

# --- Build: install everything, build the client, bundle the server -------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund

COPY shared shared
COPY server server
COPY client client
RUN npm run build -w client && npm run bundle -w server

# --- Run: production dependencies, the bundle and the built client --------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    CLIENT_DIST=/app/client/dist \
    UPLOADS_DIR=/data/uploads \
    TABLES_DIR=/data/tables
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --no-audit --no-fund --ignore-scripts \
    && npm cache clean --force

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data/uploads /data/tables && chown node:node /data/uploads /data/tables

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health > /dev/null || exit 1
CMD ["node", "server/dist/index.js"]
