# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev --workspace @mr/shared --workspace @mr/web --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# VITE_API_BASE_URL is baked into the bundle at build time. It is public.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build --workspace @mr/shared \
 && npm run build --workspace @mr/web


# ---------- runtime ----------
# nginx serves static files and proxies /api, so the session cookie stays on one
# origin and needs no CORS or SameSite=None. Simpler and stricter than splitting.
FROM nginx:1.27-alpine AS runtime

# Coolify injects API_UPSTREAM (e.g. http://api:4000) as a runtime variable; the
# entrypoint substitutes it, so one image serves any environment.
ENV API_UPSTREAM=http://api:4000

COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
