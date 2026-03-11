FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.1.0

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package files for all workspaces (needed for dependencies)
COPY packages/shared/package.json ./packages/shared/
COPY apps/collab/package.json ./apps/collab/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/collab ./apps/collab

# Build shared package first
RUN pnpm --filter @openlark/shared build

# Build collab app
RUN pnpm --filter @openlark/collab build

WORKDIR /app/apps/collab

EXPOSE 1234

CMD ["node", "dist/index.js"]
