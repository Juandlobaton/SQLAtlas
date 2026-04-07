FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files for dependency resolution
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api-gateway/package.json ./apps/api-gateway/

# Install dependencies
RUN pnpm install --no-frozen-lockfile --filter @sqlatlas/shared-types --filter api-gateway...

# Copy shared-types source
COPY packages/shared-types/ ./packages/shared-types/

# Copy api-gateway source
COPY apps/api-gateway/tsconfig.json apps/api-gateway/tsconfig.build.json apps/api-gateway/nest-cli.json ./apps/api-gateway/
COPY apps/api-gateway/src/ ./apps/api-gateway/src/

# Build
WORKDIR /app/apps/api-gateway
RUN pnpm run build

EXPOSE 3000

ENV NODE_OPTIONS="--max-old-space-size=384"

RUN addgroup -S app && adduser -S app -G app
USER app

CMD ["node", "--max-old-space-size=384", "dist/main.js"]
