# ─── Stage 1: Install dependencies ───
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN npm install --production=false

# ─── Stage 2: Build ───
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npx next build

# ─── Stage 3: Production image ───
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
