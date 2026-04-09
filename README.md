# SQLAtlas

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg)](https://www.python.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E.svg)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg)](docker/docker-compose.yml)
[![Demo](https://img.shields.io/badge/Live_Demo-sqlatlas.netlify.app-00C7B7.svg)](https://sqlatlas.netlify.app)

> Open-source platform to **map**, **analyze**, and **document** stored procedures across SQL Server, PostgreSQL, and Oracle.

**[Try the Live Demo](https://sqlatlas.netlify.app)** — No login required. Explore dependency graphs, execution flows, and security analysis across SQL Server, PostgreSQL, and Oracle with real pre-analyzed data.

SQLAtlas parses your database objects, builds interactive dependency graphs, detects security vulnerabilities, tracks complexity metrics, and auto-generates documentation — all from a single unified interface.

**Why SQLAtlas?** Large databases accumulate hundreds of stored procedures over years. Understanding what calls what, which tables are affected, and where security risks hide is nearly impossible manually. SQLAtlas automates this: connect your database, run an analysis, and get a complete interactive atlas of your SQL landscape.

## Features

- **Multi-engine support** — T-SQL (SQL Server), PL/pgSQL (PostgreSQL), PL/SQL (Oracle)
- **Dependency graph** — Interactive Cytoscape.js visualization with 5 layout algorithms
- **Security scanner** — Detects SQL injection, hardcoded credentials, xp_cmdshell, SECURITY DEFINER, dynamic SQL
- **Complexity analysis** — Cyclomatic complexity, nesting depth, branch/loop counts with risk levels
- **Flow analysis** — Execution flow tree visualization for any stored procedure
- **Auto-documentation** — Generates parameter docs, side effects, table access summary
- **CRUD matrix** — Maps which procedures read/write which tables
- **Version tracking** — Detects changes between analysis runs
- **Role-based access** — RBAC with Owner, Admin, Analyst, Viewer roles
- **Audit logging** — Full activity trail for compliance

## Architecture

| Component | Stack |
|-----------|-------|
| **Parsing Engine** | Python 3.11+, FastAPI, SQLGlot, Pydantic |
| **API Gateway** | Node.js 20+, NestJS, TypeORM, PostgreSQL 16 |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Cytoscape.js |
| **Infrastructure** | Docker, PostgreSQL 16, Redis 7 |

Clean Architecture with strict dependency inversion in each service:

```
domain/          <- Pure business logic. Zero framework imports.
application/     <- Use cases. Only imports domain interfaces.
infrastructure/  <- Framework implementations (SQLGlot, TypeORM, etc.)
presentation/    <- HTTP controllers, routes, guards.
```

---

## Quick Start

### Option A: Automated setup (recommended)

The setup script checks dependencies, generates secure secrets, creates all `.env` files, and starts the infrastructure.

**Linux / macOS:**

```bash
git clone https://github.com/YOUR_USER/sqlatlas.git
cd sqlatlas
./scripts/setup.sh
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/YOUR_USER/sqlatlas.git
cd sqlatlas
.\scripts\setup.ps1
```

The script will:
1. Verify Docker, Node.js 20+, Python 3.11+ are installed
2. Generate `POSTGRES_PASSWORD`, `JWT_SECRET`, and `CREDENTIAL_ENCRYPTION_KEY`
3. Optionally ask for admin email/password (or use the web wizard later)
4. Create `docker/.env` and `apps/api-gateway/.env`
5. Start PostgreSQL and Redis containers

After the script finishes, start the application services:

```bash
# Terminal 1: Parsing Engine
cd apps/parsing-engine && uv sync && uv run uvicorn src.main:app --port 8100 --reload

# Terminal 2: API Gateway
cd apps/api-gateway && pnpm install && pnpm dev

# Terminal 3: Frontend
cd apps/web-client && pnpm install && pnpm dev
```

Open **http://localhost:5173** — you'll see the setup wizard to create your admin account.

### Option B: Docker Compose (all-in-one)

```bash
git clone https://github.com/YOUR_USER/sqlatlas.git
cd sqlatlas

# Copy and configure environment
cp docker/.env.example docker/.env
# Edit docker/.env — set POSTGRES_PASSWORD, JWT_SECRET, CREDENTIAL_ENCRYPTION_KEY

# Start everything
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d
```

Open **http://localhost:3000** — the setup wizard creates your first admin account.

### Option C: Docker with auto-setup (no wizard)

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` and set:

```env
POSTGRES_PASSWORD=your-secure-db-password
JWT_SECRET=your-secret-minimum-32-characters-long
CREDENTIAL_ENCRYPTION_KEY=run-node-e-console.log-require-crypto-randomBytes-32-toString-hex

# Auto-creates admin on first boot
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=ChangeMe!Str0ng#
ADMIN_DISPLAY_NAME=Admin
ORG_NAME=Your Company
```

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d
```

The API will create the admin account automatically on first startup.

---

## First-time Configuration

On first launch (empty database), SQLAtlas offers two setup paths:

| Method | When to use |
|--------|-------------|
| **Web wizard** (`/setup`) | Interactive. Opens automatically on first visit. |
| **ENV vars** (`ADMIN_EMAIL` + `ADMIN_PASSWORD`) | Automated. For Docker/CI deployments. |

After setup, the `/setup` endpoint is permanently locked.

### Registration Modes

Configured via `REGISTRATION_MODE` in `.env`:

| Mode | Behavior |
|------|----------|
| `closed` (default) | Only admins can create users. Recommended for self-hosted. |
| `invite-only` | Admins generate invite links. |
| `open` | Anyone can register. SaaS-style. |

### Single vs Multi-Tenant

Configured via `MULTI_TENANT` in `.env`:

| Mode | Behavior |
|------|----------|
| `false` (default) | Login requires only email + password. Single organization. |
| `true` | Login requires organization slug. Multiple isolated orgs. |

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/auth/status` | System status (needs setup?, registration mode) |
| POST | `/api/v1/auth/setup` | Initial setup (first admin + org) |
| POST | `/api/v1/auth/login` | Login, get JWT tokens |
| POST | `/api/v1/auth/register` | Register new org (when `REGISTRATION_MODE=open`) |

### Connections
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/connections` | List connections |
| POST | `/api/v1/connections` | Create connection |
| POST | `/api/v1/connections/:id/test` | Test connectivity |
| DELETE | `/api/v1/connections/:id` | Delete connection |

### Analysis
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/analysis/start` | Start analysis pipeline |
| GET | `/api/v1/analysis/procedures/:connId` | List procedures (paginated) |
| GET | `/api/v1/analysis/graph/:connId` | Get dependency graph |
| GET | `/api/v1/analysis/jobs/:connId` | List analysis jobs |

### Parser (direct)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/parse` | Parse single SQL |
| POST | `/api/v1/parse/batch` | Parse multiple SQL items |
| POST | `/api/v1/analyze` | Analyze SQL (deps, security, flow) |
| GET | `/api/v1/dialects` | List supported dialects |

Swagger UI available at `/docs` when `NODE_ENV=development`.

---

## Running Tests

```bash
# Parsing Engine (Python)
cd apps/parsing-engine
uv run pytest tests/ -v

# API Gateway (NestJS)
cd apps/api-gateway
pnpm test
```

---

## Project Structure

```
sqlatlas/
├── apps/
│   ├── api-gateway/             # NestJS backend (Clean Architecture)
│   │   ├── src/domain/          # Entities, repository interfaces
│   │   ├── src/application/     # Use cases, DTOs, ports
│   │   ├── src/infrastructure/  # TypeORM, connectors, security
│   │   └── src/presentation/    # Controllers, middleware, guards
│   ├── parsing-engine/          # Python FastAPI (Clean Architecture)
│   │   ├── src/domain/          # Entities, value objects
│   │   ├── src/application/     # Use cases, DTOs
│   │   ├── src/infrastructure/  # SQLGlot parsers, analyzers
│   │   └── src/presentation/    # Routes, schemas
│   └── web-client/              # React frontend
│       ├── src/pages/           # Dashboard, Graph, Flow, Security, etc.
│       ├── src/features/        # Visualization (Cytoscape.js)
│       └── src/shared/          # Auth store, API client, UI components
├── packages/shared-types/       # TypeScript types shared FE <-> BE
├── scripts/                     # setup.sh (Linux/macOS), setup.ps1 (Windows)
├── docker/                      # Docker Compose, PostgreSQL init
├── tools/db-scripts/            # SQL extraction scripts per engine
└── docs/                        # Deployment, security, architecture guides
```

---

## Security

See [SECURITY.md](SECURITY.md) for the full security policy and hardening checklist.

Highlights:
- JWT with HS256 algorithm pinning
- Bcrypt password hashing (12 rounds, max 128 chars)
- AES-256-GCM credential encryption (with Vault and AWS alternatives)
- SSRF protection (private IP blocking)
- Rate limiting (5 req/min auth, 100 req/min global)
- Helmet.js + strict CSP headers
- Audit logging for all mutations
- Docker containers run as non-root users
- No hardcoded secrets — all generated at setup time

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Deployment Guide](docs/deployment/docker.md) | Production Docker deployment |
| [Local Development](docs/deployment/local-dev.md) | Setting up a dev environment |
| [Security Hardening](docs/security/hardening.md) | Production security checklist |
| [Architecture](docs/architecture/overview.md) | System design and data flow |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Security Policy](SECURITY.md) | Vulnerability reporting |

---

## Live Demo

Explore SQLAtlas without installing anything: **[sqlatlas.netlify.app](https://sqlatlas.netlify.app)**

The demo includes pre-analyzed data from 3 database engines:

| Engine | Connection | Procedures | Dependencies | Tables |
|--------|-----------|-----------|--------------|--------|
| SQL Server | Banking Test (T-SQL) | 21 | 90 | 15 |
| PostgreSQL | Banking Demo (PL/pgSQL) | 53 | 16 | 19 |
| Oracle | PL/SQL Test | 53 | 11 | 6 |

All 127 procedures have pre-computed execution flow trees, dependency analysis, complexity metrics, and security findings. No backend required — the demo runs entirely in the browser.

---

## Acknowledgements

SQLAtlas is built on the shoulders of excellent open-source projects:

| Project | Role in SQLAtlas | License |
|---------|-----------------|---------|
| [SQLGlot](https://github.com/tobymao/sqlglot) | SQL parsing engine — the core that makes multi-dialect analysis possible | MIT |
| [NestJS](https://github.com/nestjs/nest) | API Gateway framework with dependency injection and modular architecture | MIT |
| [FastAPI](https://github.com/tiangolo/fastapi) | Parsing Engine web framework — high-performance async Python | MIT |
| [React](https://github.com/facebook/react) | Frontend UI library | MIT |
| [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | Interactive graph visualization for dependency maps and lineage | MIT |
| [TypeORM](https://github.com/typeorm/typeorm) | Database ORM with migration support | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | Utility-first CSS framework for the UI | MIT |
| [Vite](https://github.com/vitejs/vite) | Frontend build tooling | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | Lightweight state management | MIT |
| [Pydantic](https://github.com/pydantic/pydantic) | Data validation for the parsing engine | MIT |

Special thanks to the [SQLGlot](https://github.com/tobymao/sqlglot) project by Toby Mao — without its multi-dialect SQL parsing capabilities, SQLAtlas would not exist.

---

## License

[Apache License 2.0](LICENSE)

---

<sub>Built with care for the database community. If SQLAtlas helps you understand your database better, consider giving it a star.</sub>
