# ─── Stage 1: Install dependencies ───
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/
RUN npm install --production=false

# ─── Stage 2: Build ───
FROM node:20-alpine AS base
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd apps/api && npx tsc

# ─── Stage 3: Production image ───
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl
COPY --from=base /app/apps/api/dist ./dist
COPY --from=base /app/apps/api/package.json ./
COPY --from=deps /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
