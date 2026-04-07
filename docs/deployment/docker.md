# Production Deployment with Docker

This guide covers deploying SQLAtlas with Docker Compose in a production environment.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A server with at least 2GB RAM and 2 CPU cores
- A domain name (for HTTPS)

## 1. Clone the repository

```bash
git clone https://github.com/YOUR_USER/sqlatlas.git
cd sqlatlas
```

## 2. Configure environment

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` and set **all required values**:

```env
# Required — Docker Compose will refuse to start without these
POSTGRES_PASSWORD=<generate a strong password>
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))">
CREDENTIAL_ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# Recommended
REGISTRATION_MODE=closed
MULTI_TENANT=false
CORS_ORIGINS=https://your-domain.com

# Optional — auto-create admin on first boot
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=ChangeMe!Str0ng#
ADMIN_DISPLAY_NAME=Admin
ORG_NAME=Your Company
```

Or use the setup script to generate secrets automatically:

```bash
./scripts/setup.sh    # Linux/macOS
.\scripts\setup.ps1   # Windows
```

## 3. Start services

```bash
cd docker
docker compose --env-file .env up -d
```

This starts:
- **PostgreSQL 16** — metadata database (port 5433)
- **Redis 7** — cache and sessions (port 6380)
- **Parsing Engine** — SQL parser API (port 8100)
- **API Gateway** — main backend (port 3000)

## 4. Verify health

```bash
# All services should be healthy
docker compose ps

# Individual health checks
curl http://localhost:8100/health   # Parsing Engine
curl http://localhost:3000/health   # API Gateway
```

## 5. Reverse proxy (HTTPS)

SQLAtlas should be behind a reverse proxy for HTTPS. Example with **nginx**:

```nginx
server {
    listen 443 ssl http2;
    server_name sqlatlas.your-domain.com;

    ssl_certificate     /etc/ssl/your-cert.pem;
    ssl_certificate_key /etc/ssl/your-key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Update `CORS_ORIGINS` in your `.env` to match your domain.

## 6. First-time setup

If you set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, the admin account is created automatically on first boot.

Otherwise, visit `http://your-domain:3000/setup` (or via reverse proxy) to run the web setup wizard.

## Resource Limits

Default limits in `docker-compose.yml`:

| Service | Memory | CPU |
|---------|--------|-----|
| PostgreSQL | 512 MB | - |
| Redis | 256 MB | - |
| Parsing Engine | 1 GB | 2.0 |
| API Gateway | 512 MB | 1.0 |

Adjust in `docker-compose.yml` under `deploy.resources.limits`.

## Backups

### PostgreSQL

```bash
# Backup
docker compose exec postgres pg_dump -U sqlatlas sqlatlas > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U sqlatlas sqlatlas
```

### Volumes

```bash
# List volumes
docker volume ls | grep sqlatlas

# Backup volume data
docker run --rm -v sqlatlas_pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata.tar.gz /data
```

## Updating

```bash
cd sqlatlas
git pull
cd docker
docker compose --env-file .env build
docker compose --env-file .env up -d
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `POSTGRES_PASSWORD is missing` | Set it in `docker/.env` |
| API Gateway won't start | Check `docker compose logs api-gateway` |
| Port conflict | Change `DB_PORT`, `API_PORT`, etc. in `.env` |
| Database not ready | Wait for health check: `docker compose ps` |
| Permission denied on setup.sh | Run `chmod +x scripts/setup.sh` |
