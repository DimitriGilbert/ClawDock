# Multi-stage build for ClawDock server
# Based on Node.js 20-alpine for minimal image size

# ============================================================================
# Stage 1: Dependencies
# ============================================================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/config/package.json ./packages/config/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# ============================================================================
# Stage 2: Builder
# ============================================================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages ./packages

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/

# Copy source code
COPY apps/server ./apps/server
COPY packages ./packages

# Build the server
RUN pnpm --filter server build

# ============================================================================
# Stage 3: Runner (Production)
# ============================================================================
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 clawdock

WORKDIR /app

# Copy package.json for start script reference
COPY --from=builder --chown=clawdock:nodejs /app/apps/server/package.json ./

# Copy built application
COPY --from=builder --chown=clawdock:nodejs /app/apps/server/dist ./dist

# Copy node_modules (only production dependencies)
COPY --from=builder --chown=clawdock:nodejs /app/apps/server/node_modules ./node_modules
COPY --from=builder --chown=clawdock:nodejs /app/node_modules ./node_modules

# Switch to non-root user
USER clawdock

# Expose the server port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check using the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))" || exit 1

# Start the server using dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.mjs"]
