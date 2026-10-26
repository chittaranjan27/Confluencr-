# ==========================================
# Stage 1: Build & Compile TypeScript
# ==========================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native build tools for compiling native dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm ci

# Copy TypeScript configs and source code
COPY tsconfig.json vitest.config.ts ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/app/data/ledger.sqlite

# Install runtime dependencies required by sqlite3 / better-sqlite3 if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy static frontend assets (Dashboard & Playground)
COPY --from=builder /app/src/public ./src/public

# Create data directory for persistent SQLite storage
RUN mkdir -p /app/data && chown -R node:node /app

# Run as non-root user for security
USER node

# Expose API and UI port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/server.js"]
