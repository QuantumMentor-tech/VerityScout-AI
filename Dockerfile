# ==============================================================================
# VerityScout AI — Multi-Stage Production Dockerfile
# ==============================================================================
# Governed by: ADR-002 (Modular Monolith) and ADR-012 (Deployment Topology).
# Supports dual-mode container execution:
#   1. Web Application:   Default CMD ["npm", "run", "start"]
#   2. Background Worker: CMD ["npm", "run", "worker"]
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Base Alpine Node Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production

# ------------------------------------------------------------------------------
# Stage 2: Locked Dependency Installation
# ------------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# Clean install including devDependencies needed for build and typecheck
RUN npm ci --include=dev

# ------------------------------------------------------------------------------
# Stage 3: Build & Verification
# ------------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# In staging/production builds, generate production Next.js bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Prune development dependencies to keep final image footprint minimal
RUN npm prune --omit=dev

# ------------------------------------------------------------------------------
# Stage 4: Production Runner (Non-Root, Least-Privilege)
# ------------------------------------------------------------------------------
FROM base AS runner

# Create non-root unprivileged service user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 verityscout

# Copy build artifacts and pruned production dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src

# Set ownership to non-root user
RUN chown -R verityscout:nodejs /app

USER verityscout

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

# Healthcheck targeting the non-blocking liveness endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health/live || exit 1

# Default entrypoint runs the web server; override CMD with ["npm", "run", "worker"] for background worker
CMD ["npm", "run", "start"]

