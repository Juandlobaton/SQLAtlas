# Architecture Overview

## System Design

SQLAtlas is a monorepo with three independent services that communicate via HTTP:

```
                    +-----------------+
                    |   Web Client    |  React + Vite
                    |  (port 5173)    |  Static SPA
                    +--------+--------+
                             |
                    HTTP (fetch API)
                             |
                    +--------v--------+
                    |  API Gateway    |  NestJS
                    |  (port 3000)    |  Auth, RBAC, Orchestration
                    +--------+--------+
                             |
                    HTTP (internal)
                             |
                    +--------v--------+
                    | Parsing Engine  |  FastAPI + SQLGlot
                    |  (port 8100)    |  SQL Parsing & Analysis
                    +-----------------+

           +-----------+       +-----------+
           | PostgreSQL|       |   Redis   |
           | (port 5433)       | (port 6380)
           +-----------+       +-----------+
```

## Service Responsibilities

### Parsing Engine (Python)

Stateless SQL parsing service. No database access.

- Parses SQL using SQLGlot (T-SQL, PL/pgSQL, PL/SQL)
- Extracts: dependencies, table references, security findings, complexity metrics, execution flow
- Returns structured JSON

### API Gateway (NestJS)

Orchestration layer. Owns the database and business logic.

- Authentication (JWT) and authorization (RBAC)
- Database connection management (encrypted credentials)
- Analysis orchestration: connects to target DB, extracts SPs, sends to parser, stores results
- Dependency graph construction
- Audit logging

### Web Client (React)

Static SPA served by Vite (dev) or nginx (production).

- Cytoscape.js for interactive dependency graphs
- Dashboard, security scanner, documentation views
- i18n (English, Spanish)
- Zustand for state management

## Clean Architecture

Each service follows Clean Architecture with strict layer boundaries:

```
presentation/     Controllers, routes, guards, middleware
    |
    v (depends on)
application/      Use cases, DTOs, port interfaces
    |
    v (depends on)
domain/           Entities, repository interfaces, value objects
    ^
    | (implemented by)
infrastructure/   TypeORM repos, SQLGlot parsers, bcrypt, HTTP clients
```

**The Dependency Rule**: Inner layers never import from outer layers. `domain/` has zero framework imports.

## Data Flow: Analysis Pipeline

When a user triggers an analysis:

```
1. Frontend: POST /api/v1/analysis/start { connectionId }
2. API Gateway:
   a. Decrypt connection credentials (AES-256-GCM)
   b. Connect to target database (SQL Server / PostgreSQL / Oracle)
   c. Extract all stored procedures via SQL queries
   d. For each procedure:
      - POST to Parsing Engine /api/v1/analyze { sql, dialect }
      - Parse response: dependencies, table access, security, complexity
   e. Build dependency graph from parsed data
   f. Store everything in PostgreSQL
   g. Invalidate Redis cache
3. Frontend: Fetches results, renders Cytoscape graph
```

## Multi-Tenancy

Data isolation is enforced at the query level. Every database table includes a `tenant_id` column, and every query filters by the authenticated user's tenant.

```
JWT payload: { sub, email, tenantId, role }
                                |
                    Query: WHERE tenant_id = :tenantId
```

Roles: Owner > Admin > Analyst > Viewer (each is a strict superset of permissions).

## Authentication Flow

```
First visit (empty DB):
  GET /auth/status -> { needsSetup: true }
  -> Redirect to /setup wizard
  -> POST /auth/setup { email, password, orgName }
  -> JWT tokens returned

Subsequent visits:
  GET /auth/status -> { needsSetup: false, registrationMode, multiTenant }
  -> Show login form (hide org slug if single-tenant)
  -> POST /auth/login { email, password, tenantSlug? }
  -> JWT tokens returned
```

## Technology Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SQL Parser | SQLGlot | Supports T-SQL, PL/pgSQL, PL/SQL. Active maintenance. |
| Graph Viz | Cytoscape.js | 5 layout algorithms, performant with 1000+ nodes |
| ORM | TypeORM | First-class NestJS integration, supports migrations |
| Auth | JWT (HS256) | Stateless, no session store needed |
| Encryption | AES-256-GCM | Authenticated encryption, industry standard |
| Cache | Redis | Fast, persistent, used for graph caching |
| Monorepo | pnpm + Turbo | Fast installs, parallel builds, dependency caching |
