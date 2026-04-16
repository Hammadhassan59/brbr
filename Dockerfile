# TODO(security): Pin to an immutable digest. Look up the current node:22-alpine
# digest with `docker pull node:22-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine`
# and replace the tag below with `node:22-alpine@sha256:<digest>`. Updating the
# digest should be a deliberate, reviewable bump rather than an implicit pull.
FROM node:22-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public build-time args: safe to bake into the image (they're shipped to the
# browser anyway via NEXT_PUBLIC_ prefix).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_DEMO_MODE

# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is a server-only secret used by Next to
# encrypt Server Action payloads. It must NOT land in build ARGs (visible in
# `docker history`) or in the final image. It must only be present in process
# env during `next build`. Use BuildKit secrets:
#
#   DOCKER_BUILDKIT=1 docker build \
#     --secret id=nextsa_key,src=/path/to/nextsa_key.txt ...
#
# docker-compose passes the secret via the top-level `secrets:` block.
RUN --mount=type=secret,id=nextsa_key \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/nextsa_key)" \
    npm run build

# --- Runtime ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# wget is used by HEALTHCHECK below. node:22-alpine ships with busybox wget.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
