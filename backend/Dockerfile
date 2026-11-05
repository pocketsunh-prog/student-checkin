# syntax=docker/dockerfile:1
# Backend API image: Node 26 LTS (latest), Prisma, Human face models.
FROM node:26.13.0-bookworm-slim AS base
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencies (all, for the TypeScript build). Normal npm ci so the
# @tensorflow/tfjs-node native addon is installed for Node 26.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
# Runtime (production deps only: express, prisma CLI, tsx for seed, TFJS/Human)
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund \
    && npx prisma generate \
    && npm cache clean --force

COPY --from=build /app/dist ./dist
# seed.ts imports shared modules from src/, so keep the TypeScript sources for tsx.
COPY src ./src
COPY models ./models
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/storage

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
