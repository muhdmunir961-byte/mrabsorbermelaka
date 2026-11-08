# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Workspace manifests first, so a dependency change is the only thing that
# invalidates the install layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --include=dev --workspace @mr/shared --workspace @mr/api --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Shared is compiled first: the API imports its dist, not its sources.
# A DATABASE_URL is supplied for the generation step only; `generate` reads the
# schema, not the database, but the Prisma config validates the variable exists.
RUN npm run build --workspace @mr/shared \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspace @mr/api

# `prisma` stays a runtime dependency on purpose: the pre-deploy step runs
# `prisma migrate deploy` inside this image, after dev dependencies are pruned.

# Drop dev dependencies and start from a clean production tree.
RUN npm prune --omit=dev


# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Coolify reaches the process through the container network, so localhost is not
# a valid bind address for the deployed API.
ENV API_HOST=0.0.0.0
ENV API_PORT=4000

# Chromium is intentionally not installed in this constrained runtime image.
# Face matching remains lazy and unavailable until a browser is provisioned;
# the API and Telegram webhook do not depend on it at startup.

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma

# Uploads are a volume; the image must not assume they are writable state.
ENV UPLOAD_DIR=/data/uploads
# Prisma needs the schema path when its config file is not the working directory.
ENV PRISMA_SCHEMA_PATH=/app/apps/api/prisma/schema.prisma

RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
WORKDIR /app/apps/api
EXPOSE 4000

# Readiness, not liveness: this endpoint checks the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
