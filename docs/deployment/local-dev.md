# Local Development Setup

This guide covers setting up SQLAtlas for local development.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | >= 20.0.0 | API Gateway, Web Client |
| **pnpm** | >= 9.0.0 | Package manager |
| **Python** | >= 3.11 | Parsing Engine |
| **uv** | latest | Python package manager |
| **Docker** | latest | PostgreSQL, Redis |

## 1. Initial setup

The fastest way to get started:

```bash
git clone https://github.com/YOUR_USER/sqlatlas.git
cd sqlatlas
./scripts/setup.sh     # Generates secrets, starts infrastructure
```

Then install application dependencies:

```bash
pnpm install
cd apps/parsing-engine && uv sync && cd ../..
```

## 2. Manual setup (alternative)

If you prefer to configure manually:

```bash
# Start infrastructure
docker compose -f docker/docker-compose.yml up -d postgres redis

# Create api-gateway .env
cp apps/api-gateway/.env.example apps/api-gateway/.env
# Edit .env: set DB_PASSWORD, JWT_SECRET, CREDENTIAL_ENCRYPTION_KEY

# Install dependencies
pnpm install
cd apps/parsing-engine && uv sync && cd ../..
```

Generate secrets:

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Encryption Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Start services

You need **3 terminals** (or use a process manager like `tmux`):

```bash
# Terminal 1: Parsing Engine (Python)
cd apps/parsing-engine
uv run uvicorn src.main:app --port 8100 --reload

# Terminal 2: API Gateway (NestJS)
cd apps/api-gateway
pnpm dev

# Terminal 3: Web Client (React)
cd apps/web-client
pnpm dev
```

## 4. Access the application

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | http://localhost:5173 | Main UI |
| API Gateway | http://localhost:3000 | Backend API |
| Swagger | http://localhost:3000/docs | API documentation (dev only) |
| Parser | http://localhost:8100/docs | Parser API documentation |
| PostgreSQL | localhost:5433 | `sqlatlas` database |
| Redis | localhost:6380 | Cache layer |

On first visit, you'll see the setup wizard at `/setup` to create your admin account.

## Project structure

```
sqlatlas/
├── apps/
│   ├── api-gateway/        # NestJS (port 3000)
│   ├── parsing-engine/     # FastAPI (port 8100)
│   └── web-client/         # React+Vite (port 5173)
├── packages/
│   └── shared-types/       # Shared TypeScript types
├── scripts/                # Setup scripts
├── docker/                 # Infrastructure configs
└── tools/db-scripts/       # SQL extraction scripts
```

## Key scripts

```bash
# Root level (via Turbo)
pnpm dev           # Start all services
pnpm build         # Build all
pnpm typecheck     # Type check all
pnpm test          # Run all tests
pnpm format        # Format with Prettier

# API Gateway
cd apps/api-gateway
pnpm dev           # Watch mode
pnpm test          # Jest tests
pnpm typecheck     # tsc --noEmit

# Parsing Engine
cd apps/parsing-engine
uv run pytest tests/ -v       # Run tests
uv run ruff check src/        # Lint
uv run mypy src/              # Type check

# Web Client
cd apps/web-client
pnpm dev           # Vite dev server
pnpm build         # Production build
pnpm typecheck     # tsc --noEmit
```

## Environment variables

All required env vars are documented in `apps/api-gateway/.env.example`. The setup script generates secure values automatically.

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | localhost | PostgreSQL host |
| `DB_PORT` | 5433 | PostgreSQL port (mapped from Docker) |
| `JWT_SECRET` | - | **Required.** Signing key for JWT tokens |
| `CREDENTIAL_ENCRYPTION_KEY` | - | **Required.** 32-byte hex for AES-256-GCM |
| `REGISTRATION_MODE` | closed | `closed`, `invite-only`, or `open` |
| `MULTI_TENANT` | false | Enable multi-tenant mode |
| `ADMIN_EMAIL` | - | Auto-create admin on first boot |
| `ADMIN_PASSWORD` | - | Admin password (with `ADMIN_EMAIL`) |

## Database

TypeORM auto-creates tables in development mode (`synchronize: true` when `NODE_ENV=development`).

To reset the database:

```bash
docker compose -f docker/docker-compose.yml down -v   # Destroys volumes
docker compose -f docker/docker-compose.yml up -d postgres redis
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` on port 5433 | Start PostgreSQL: `docker compose -f docker/docker-compose.yml up -d postgres` |
| `ECONNREFUSED` on port 6380 | Start Redis: `docker compose -f docker/docker-compose.yml up -d redis` |
| `JWT_SECRET` error | Set it in `apps/api-gateway/.env` |
| Python module not found | Run `cd apps/parsing-engine && uv sync` |
| Node modules missing | Run `pnpm install` from project root |
| Port already in use | Change ports in `.env` or stop conflicting processes |
