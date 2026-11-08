# API image.
#
# This file lives at the repository root because Coolify's Dockerfile build pack
# resolves "Dockerfile" relative to the root by default; pointing it at a
# subdirectory needs a correctly filled base directory, which is easy to mis-set.
# The real definition is apps/api/Dockerfile — keep the two in step, or set the
# build pack to use that path directly.

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

# The Prisma client generator refuses to run when `@prisma/client` is hoisted
# away from the `prisma` package, so both live at the workspace root. See
# docs/COOLIFY.md for the check that causes this.
RUN npm run build --workspace @mr/shared \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspace @mr/api

# Prisma stays a runtime dependency on purpose: the pre-deploy step runs
# `prisma migrate deploy` inside this image, after dev dependencies are pruned.
RUN npm prune --omit=dev


# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# A container must listen on all interfaces or the port mapping cannot reach it;
# the application default (127.0.0.1) is right for a laptop and wrong for a pod.
ENV API_HOST=0.0.0.0
ENV API_PORT=4000

# A headless Chromium binary is a hard runtime dependency of the face matcher,
# not an optional extra: without it /face/* fails while everything else works.
# The headless-shell package avoids installing Chromium's full browser UI and
# keeps the runtime image materially smaller for constrained deployment hosts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium-headless-shell \
      ca-certificates \
      fonts-dejavu-core \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# The matcher launches Chromium through Playwright, which needs to find this
# binary rather than downloading its own.
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-headless-shell
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma

# Uploads are a volume; the image must not assume they are writable state.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
WORKDIR /app/apps/api
EXPOSE 4000

# Readiness, not liveness: this endpoint checks the database. The probe is Node
# because the image has no curl or wget for Coolify's default health check to use.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
