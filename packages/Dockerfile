# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY app ./app
COPY public ./public
COPY react-router.config.ts vite.config.ts tsconfig.json ./
RUN npm run build

# Install runtime dependencies on musl rather than copying Debian binaries.
FROM node:24-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8123 \
    STATE_DIR=/var/lib/sharebox \
    MAX_UPLOAD_BYTES=10737418240
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/package.json ./package.json
COPY --from=build /app/build ./build
COPY packages/server.mjs ./packages/server.mjs
COPY scripts/hash-password.mjs ./scripts/hash-password.mjs
COPY app/server/password.server.ts ./app/server/password.server.ts
RUN mkdir -p /var/lib/sharebox && chown node:node /var/lib/sharebox
USER node
EXPOSE 8123
CMD ["node", "node_modules/@react-router/serve/dist/cli.js", "packages/server.mjs"]
