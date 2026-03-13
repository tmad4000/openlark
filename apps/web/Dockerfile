# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@9.1.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.1.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
ENV STANDALONE=true
RUN pnpm --filter @openlark/shared build
RUN pnpm --filter @openlark/web build

# Stage 3: Production image
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 openlark && \
    adduser --system --uid 1001 openlark

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static

USER openlark
EXPOSE 3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["node", "server.js"]
