# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@9.1.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.1.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @openlark/shared build
RUN pnpm --filter @openlark/api build

# Stage 3: Production image
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 openlark && \
    adduser --system --uid 1001 openlark

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/packages/shared/dist ./node_modules/@openlark/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@openlark/shared/package.json

USER openlark
EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
