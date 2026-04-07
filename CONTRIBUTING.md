# Contributing to SQLAtlas

Thank you for your interest in contributing to SQLAtlas!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USER/sqlatlas.git`
3. Install dependencies:
   - Root: `pnpm install`
   - Parsing Engine: `cd apps/parsing-engine && uv sync`
4. Start services: `docker compose -f docker/docker-compose.yml up -d`

## Development

- **Parsing Engine** (Python): `cd apps/parsing-engine && uv run uvicorn src.main:app --reload --port 8100`
- **API Gateway** (NestJS): `cd apps/api-gateway && pnpm dev`
- **Web Client** (React): `cd apps/web-client && pnpm dev`

## Architecture

This project follows **Clean Architecture**. Before contributing, understand the layer rules:

```
domain/          ← Pure business logic. ZERO framework imports.
application/     ← Use cases. Only imports domain interfaces.
infrastructure/  ← Framework implementations (SQLGlot, TypeORM, etc.)
presentation/    ← HTTP controllers, WebSocket gateways.
```

**The dependency rule**: dependencies only point inward. `domain` never imports from `infrastructure`.

## Pull Requests

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat(parser): add MySQL dialect support`
3. Write tests for new functionality
4. Ensure all tests pass: `pnpm test`
5. Submit a PR with a clear description

## Adding a New SQL Dialect

1. Create parser in `apps/parsing-engine/src/infrastructure/parsers/`
2. Implement `ISqlParser` interface from `src/domain/services/sql_parser.py`
3. Register in `src/infrastructure/web/container.py`
4. Add test fixtures in `tests/fixtures/`

## Code of Conduct

Be respectful, inclusive, and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
