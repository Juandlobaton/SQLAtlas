#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# SQLAtlas — First-time setup script (Linux / macOS)
# Checks dependencies, validates ports, generates secrets, creates
# .env files, installs packages, starts infrastructure, and
# optionally launches all 3 services.
#
# Usage:
#   ./scripts/setup.sh            # Setup infra only (postgres + redis)
#   ./scripts/setup.sh --full     # Setup + install deps + start all services
#   ./scripts/setup.sh --check    # Validate only, don't change anything
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}[ OK ]${NC}  %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail()  { printf "${RED}[FAIL]${NC}  %s\n" "$1"; exit 1; }
step()  { printf "\n${BOLD}── %s ──${NC}\n" "$1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$ROOT_DIR/docker"
ENV_FILE="$DOCKER_DIR/.env"
API_DIR="$ROOT_DIR/apps/api-gateway"
PARSER_DIR="$ROOT_DIR/apps/parsing-engine"
WEB_DIR="$ROOT_DIR/apps/web-client"

# Parse flags
MODE="setup"       # setup | full | check
for arg in "$@"; do
  case "$arg" in
    --full)  MODE="full" ;;
    --check) MODE="check" ;;
  esac
done

ERRORS=0
WARNINGS=0

# ─── 1. Check dependencies ──────────────────────────────────────
step "1/6  Checking dependencies"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found: $(command -v "$1")"
    return 0
  else
    warn "$1 not found"
    return 1
  fi
}

check_version() {
  local name="$1" actual="$2" required_major="$3" required_minor="${4:-0}"
  local actual_major actual_minor
  actual_major=$(echo "$actual" | cut -d. -f1)
  actual_minor=$(echo "$actual" | cut -d. -f2)
  if [ "$actual_major" -gt "$required_major" ] || { [ "$actual_major" -eq "$required_major" ] && [ "$actual_minor" -ge "$required_minor" ]; }; then
    ok "$name $actual (>= $required_major.$required_minor required)"
    return 0
  else
    warn "$name $actual found, but >= $required_major.$required_minor required"
    return 1
  fi
}

# Docker (required)
HAS_DOCKER=false
if check_cmd docker; then
  HAS_DOCKER=true
  if docker compose version &>/dev/null 2>&1; then
    ok "docker compose plugin available"
  elif check_cmd docker-compose; then
    ok "docker-compose standalone available"
  else
    warn "Neither 'docker compose' nor 'docker-compose' found"
    ((ERRORS++))
  fi
fi
if [ "$HAS_DOCKER" = false ]; then ((ERRORS++)); fi

# Node.js
HAS_NODE=false
if check_cmd node; then
  NODE_VER=$(node -v | sed 's/v//')
  if check_version "Node.js" "$NODE_VER" 20; then
    HAS_NODE=true
  else
    ((WARNINGS++))
  fi
else
  ((WARNINGS++))
fi

# pnpm
HAS_PNPM=false
if check_cmd pnpm; then
  HAS_PNPM=true
else
  if [ "$HAS_NODE" = true ]; then
    warn "pnpm not found — install with: npm install -g pnpm@9"
  fi
  ((WARNINGS++))
fi

# Python
HAS_PYTHON=false
if check_cmd python3; then
  PY_VER=$(python3 --version | awk '{print $2}')
  if check_version "Python" "$PY_VER" 3 11; then
    HAS_PYTHON=true
  else
    ((WARNINGS++))
  fi
elif check_cmd python; then
  PY_VER=$(python --version | awk '{print $2}')
  PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
  if [ "$PY_MAJOR" -ge 3 ]; then
    if check_version "Python" "$PY_VER" 3 11; then
      HAS_PYTHON=true
    else
      ((WARNINGS++))
    fi
  fi
else
  ((WARNINGS++))
fi

# uv (Python package manager)
HAS_UV=false
if check_cmd uv; then
  HAS_UV=true
else
  if [ "$HAS_PYTHON" = true ]; then
    warn "uv not found — install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
  fi
  ((WARNINGS++))
fi

# Summary
echo ""
if [ "$ERRORS" -gt 0 ]; then
  fail "Found $ERRORS critical error(s). Fix them and re-run."
fi
if [ "$WARNINGS" -gt 0 ]; then
  warn "$WARNINGS optional dependency warnings (needed for local dev, not Docker)"
fi

if [ "$MODE" = "check" ]; then
  step "Validation complete"
  echo "  Errors:   $ERRORS"
  echo "  Warnings: $WARNINGS"
  exit 0
fi

# ─── 2. Validate ports ──────────────────────────────────────────
step "2/6  Checking ports"

check_port() {
  local port="$1" name="$2"
  if lsof -i :"$port" -sTCP:LISTEN &>/dev/null 2>&1 || ss -tlnp 2>/dev/null | grep -q ":$port "; then
    warn "Port $port ($name) is already in use"
    if lsof -i :"$port" -sTCP:LISTEN 2>/dev/null | head -2; then true; fi
    return 1
  else
    ok "Port $port ($name) is available"
    return 0
  fi
}

PORT_OK=true
check_port 5433  "PostgreSQL"   || PORT_OK=false
check_port 6380  "Redis"        || PORT_OK=false
check_port 3000  "API Gateway"  || PORT_OK=false
check_port 8100  "Parser"       || PORT_OK=false
check_port 5173  "Web Client"   || PORT_OK=false

if [ "$PORT_OK" = false ]; then
  warn "Some ports are in use. Services on those ports may fail to start."
  echo "  Tip: stop conflicting services or change ports in docker/.env"
fi

# ─── 3. Generate .env files ─────────────────────────────────────
step "3/6  Environment configuration"

if [ -f "$ENV_FILE" ]; then
  warn ".env already exists at $ENV_FILE"

  # Check for missing vars compared to example
  if [ -f "$DOCKER_DIR/.env.example" ]; then
    MISSING_VARS=()
    while IFS= read -r line; do
      [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
      KEY="${line%%=*}"
      if ! grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
        MISSING_VARS+=("$KEY")
      fi
    done < "$DOCKER_DIR/.env.example"

    if [ ${#MISSING_VARS[@]} -gt 0 ]; then
      warn "Missing vars in .env (present in .env.example):"
      for v in "${MISSING_VARS[@]}"; do echo "    - $v"; done
    else
      ok "All expected vars present in .env"
    fi
  fi

  read -rp "  Overwrite .env? (y/N): " OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    info "Keeping existing .env"
  else
    rm "$ENV_FILE"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  info "Generating secrets and .env file..."

  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  JWT_SECRET=$(openssl rand -base64 48)
  ENCRYPTION_KEY=$(openssl rand -hex 32)

  echo ""
  info "Optional: Pre-configure admin account (skip with Enter for web wizard)"
  read -rp "  Admin email (leave empty to skip): " ADMIN_EMAIL
  ADMIN_PASSWORD=""
  ADMIN_DISPLAY_NAME=""
  ORG_NAME=""

  if [ -n "$ADMIN_EMAIL" ]; then
    while true; do
      read -rsp "  Admin password (min 8 chars, upper+lower+number+special): " ADMIN_PASSWORD
      echo ""
      if [ ${#ADMIN_PASSWORD} -ge 8 ]; then break; fi
      warn "Password too short, try again"
    done
    read -rp "  Display name [Admin]: " ADMIN_DISPLAY_NAME
    ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-Admin}"
    read -rp "  Organization name [My Organization]: " ORG_NAME
    ORG_NAME="${ORG_NAME:-My Organization}"
  fi

  cat > "$ENV_FILE" <<EOF
# SQLAtlas — Generated by setup.sh on $(date -Iseconds)
# ── Database ──
POSTGRES_USER=sqlatlas
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=sqlatlas

# ── Security ──
JWT_SECRET=$JWT_SECRET
CREDENTIAL_ENCRYPTION_KEY=$ENCRYPTION_KEY

# ── Auth ──
REGISTRATION_MODE=closed
MULTI_TENANT=false

# ── Ports ──
API_PORT=3000
WEB_PORT=5173
PARSER_PORT=8100
DB_PORT=5433
REDIS_PORT=6380

# ── CORS ──
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
EOF

  if [ -n "$ADMIN_EMAIL" ]; then
    cat >> "$ENV_FILE" <<EOF

# ── Auto-setup admin ──
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_DISPLAY_NAME=$ADMIN_DISPLAY_NAME
ORG_NAME=$ORG_NAME
EOF
  fi

  ok ".env created at $ENV_FILE"
fi

# Create api-gateway .env for local dev
API_ENV="$API_DIR/.env"
if [ ! -f "$API_ENV" ] && [ "$HAS_NODE" = true ]; then
  info "Creating api-gateway .env for local development..."
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  cat > "$API_ENV" <<EOF
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
DB_HOST=localhost
DB_PORT=${DB_PORT:-5433}
DB_USERNAME=${POSTGRES_USER:-sqlatlas}
DB_PASSWORD=${POSTGRES_PASSWORD}
DB_DATABASE=${POSTGRES_DB:-sqlatlas}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
PARSING_ENGINE_URL=http://localhost:${PARSER_PORT:-8100}
REDIS_HOST=localhost
REDIS_PORT=${REDIS_PORT:-6380}
CREDENTIAL_BACKEND=aes
CREDENTIAL_ENCRYPTION_KEY=${CREDENTIAL_ENCRYPTION_KEY}
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
REGISTRATION_MODE=${REGISTRATION_MODE:-closed}
MULTI_TENANT=${MULTI_TENANT:-false}
EOF

  if [ -n "${ADMIN_EMAIL:-}" ]; then
    cat >> "$API_ENV" <<EOF
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_DISPLAY_NAME=${ADMIN_DISPLAY_NAME:-Admin}
ORG_NAME=${ORG_NAME:-My Organization}
EOF
  fi
  ok "api-gateway .env created"
fi

# ─── 4. Install dependencies ────────────────────────────────────
step "4/6  Installing dependencies"

if [ "$HAS_PNPM" = true ]; then
  info "Installing Node.js dependencies (pnpm install)..."
  cd "$ROOT_DIR"
  pnpm install --frozen-lockfile 2>&1 | tail -3
  ok "Node.js dependencies installed"
else
  warn "Skipping Node.js deps (pnpm not available)"
fi

if [ "$HAS_UV" = true ]; then
  info "Installing Python dependencies (uv sync)..."
  cd "$PARSER_DIR"
  uv sync 2>&1 | tail -3
  ok "Python dependencies installed"
elif [ "$HAS_PYTHON" = true ]; then
  warn "uv not found — trying pip fallback..."
  cd "$PARSER_DIR"
  if [ -d ".venv" ]; then
    source .venv/bin/activate 2>/dev/null || true
  else
    python3 -m venv .venv
    source .venv/bin/activate
  fi
  pip install -q -e "." 2>&1 | tail -3
  ok "Python dependencies installed (pip)"
else
  warn "Skipping Python deps (no Python >= 3.11)"
fi

cd "$ROOT_DIR"

# ─── 5. Start infrastructure ────────────────────────────────────
step "5/6  Starting infrastructure (PostgreSQL + Redis)"

cd "$DOCKER_DIR"

if docker compose version &>/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

$COMPOSE --env-file "$ENV_FILE" up -d postgres redis 2>&1 | tail -3

info "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-sqlatlas}" &>/dev/null; then
    ok "PostgreSQL is ready (localhost:${DB_PORT:-5433})"
    break
  fi
  if [ "$i" -eq 30 ]; then fail "PostgreSQL did not start in 30s"; fi
  sleep 1
done

info "Waiting for Redis..."
for i in $(seq 1 15); do
  if $COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis is ready (localhost:${REDIS_PORT:-6380})"
    break
  fi
  if [ "$i" -eq 15 ]; then fail "Redis did not start in 15s"; fi
  sleep 1
done

cd "$ROOT_DIR"

# ─── 6. Full mode: start all services ───────────────────────────
if [ "$MODE" = "full" ]; then
  step "6/6  Starting all services"

  if [ "$HAS_UV" = true ] || [ "$HAS_PYTHON" = true ]; then
    info "Starting Parsing Engine (port 8100)..."
    cd "$PARSER_DIR"
    if [ "$HAS_UV" = true ]; then
      uv run uvicorn src.main:app --host 0.0.0.0 --port 8100 &
    else
      source .venv/bin/activate 2>/dev/null
      uvicorn src.main:app --host 0.0.0.0 --port 8100 &
    fi
    PARSER_PID=$!
    cd "$ROOT_DIR"

    # Wait for parser health
    for i in $(seq 1 20); do
      if curl -sf http://localhost:8100/health &>/dev/null; then
        ok "Parsing Engine is healthy (PID: $PARSER_PID)"
        break
      fi
      if [ "$i" -eq 20 ]; then warn "Parser health check timed out (may still be starting)"; fi
      sleep 1
    done
  fi

  if [ "$HAS_PNPM" = true ]; then
    info "Starting API Gateway (port 3000)..."
    cd "$API_DIR"
    pnpm dev &
    API_PID=$!
    cd "$ROOT_DIR"

    # Wait for API health
    sleep 3
    for i in $(seq 1 20); do
      if curl -sf http://localhost:3000/health &>/dev/null; then
        ok "API Gateway is healthy (PID: $API_PID)"
        break
      fi
      if [ "$i" -eq 20 ]; then warn "API health check timed out (may still be starting)"; fi
      sleep 1
    done

    info "Starting Web Client (port 5173)..."
    cd "$WEB_DIR"
    pnpm dev &
    WEB_PID=$!
    cd "$ROOT_DIR"
    sleep 2
    ok "Web Client started (PID: $WEB_PID)"
  fi
fi

# ─── Summary ────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
printf "${GREEN}${BOLD} SQLAtlas setup complete!${NC}\n"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Infrastructure:"
echo "    PostgreSQL : localhost:${DB_PORT:-5433}"
echo "    Redis      : localhost:${REDIS_PORT:-6380}"
echo ""

if [ "$MODE" = "full" ]; then
  echo "  Services (running in background):"
  echo "    Parsing Engine : http://localhost:8100  (PID: ${PARSER_PID:-N/A})"
  echo "    API Gateway    : http://localhost:3000  (PID: ${API_PID:-N/A})"
  echo "    Web Client     : http://localhost:5173  (PID: ${WEB_PID:-N/A})"
  echo ""
  echo "  Open: ${BOLD}http://localhost:5173${NC}"
  echo "  Stop: kill ${PARSER_PID:-} ${API_PID:-} ${WEB_PID:-}"
else
  if [ "$HAS_NODE" = true ] && [ "$HAS_PNPM" = true ]; then
    echo "  Quick start (3 terminals):"
    echo "    T1: cd apps/parsing-engine && uv run uvicorn src.main:app --port 8100 --reload"
    echo "    T2: cd apps/api-gateway && pnpm dev"
    echo "    T3: cd apps/web-client && pnpm dev"
    echo ""
    echo "  Or run everything at once:"
    echo "    ./scripts/setup.sh --full"
  else
    echo "  Docker-only mode:"
    echo "    cd docker && $COMPOSE --env-file .env up -d"
    echo "    Open http://localhost:3000"
  fi
fi

echo ""
if [ -n "${ADMIN_EMAIL:-}" ]; then
  echo "  Admin: ${ADMIN_EMAIL} (auto-created on first API boot)"
else
  echo "  First visit: http://localhost:5173/setup"
fi
echo "  Swagger: http://localhost:3000/docs (dev mode)"
echo ""

if [ "$MODE" = "full" ]; then
  info "Press Ctrl+C to stop all services"
  wait
fi
