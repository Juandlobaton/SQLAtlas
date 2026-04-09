# ─────────────────────────────────────────────────────────────────
# SQLAtlas — First-time setup script (Windows PowerShell)
# Checks dependencies, validates ports, generates secrets, creates
# .env files, installs packages, starts infrastructure, and
# optionally launches all 3 services.
#
# Usage:
#   .\scripts\setup.ps1            # Setup infra only
#   .\scripts\setup.ps1 -Full      # Setup + install deps + start all
#   .\scripts\setup.ps1 -Check     # Validate only
# ─────────────────────────────────────────────────────────────────
param(
    [switch]$Full,
    [switch]$Check
)

$ErrorActionPreference = "Stop"

function Write-Info  { Write-Host "[INFO]  $args" -ForegroundColor Cyan }
function Write-Ok    { Write-Host "[ OK ]  $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[WARN]  $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[FAIL]  $args" -ForegroundColor Red; exit 1 }
function Write-Step  { Write-Host "`n-- $args --" -ForegroundColor White }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir
$DockerDir = Join-Path $RootDir "docker"
$EnvFile   = Join-Path $DockerDir ".env"
$ApiDir    = Join-Path $RootDir "apps\api-gateway"
$ParserDir = Join-Path $RootDir "apps\parsing-engine"
$WebDir    = Join-Path $RootDir "apps\web-client"

$Errors = 0
$Warnings = 0

# ─── 1. Check dependencies ──────────────────────────────────────
Write-Step "1/6  Checking dependencies"

# Docker (required)
$HasDocker = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Ok "docker found"
    $HasDocker = $true
    try {
        docker compose version 2>$null | Out-Null
        Write-Ok "docker compose plugin available"
    } catch {
        Write-Warn "docker compose not available"
        $Errors++
    }
} else {
    Write-Warn "docker not found"
    $Errors++
}

# Node.js
$HasNode = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    $NodeVer = (node -v) -replace "v", ""
    $NodeMajor = [int]($NodeVer.Split(".")[0])
    if ($NodeMajor -ge 20) {
        Write-Ok "Node.js $NodeVer (>= 20 required)"
        $HasNode = $true
    } else {
        Write-Warn "Node.js $NodeVer found, but >= 20.0.0 required"
        $Warnings++
    }
} else {
    Write-Warn "Node.js not found (needed for local dev)"
    $Warnings++
}

# pnpm
$HasPnpm = $false
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Ok "pnpm found"
    $HasPnpm = $true
} else {
    if ($HasNode) { Write-Warn "pnpm not found -- install with: npm install -g pnpm@9" }
    $Warnings++
}

# Python
$HasPython = $false
$PythonCmd = $null
foreach ($cmd in @("python3", "python")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $PyVer = & $cmd --version 2>&1 | ForEach-Object { ($_ -replace "Python ", "").Trim() }
        $PyParts = $PyVer.Split(".")
        if ([int]$PyParts[0] -ge 3 -and [int]$PyParts[1] -ge 11) {
            Write-Ok "Python $PyVer (>= 3.11 required)"
            $HasPython = $true
            $PythonCmd = $cmd
            break
        } else {
            Write-Warn "Python $PyVer found, but >= 3.11 required"
            $Warnings++
        }
    }
}
if (-not $HasPython) { Write-Warn "Python >= 3.11 not found (needed for parsing engine)"; $Warnings++ }

# uv (Python package manager)
$HasUv = $false
if (Get-Command uv -ErrorAction SilentlyContinue) {
    Write-Ok "uv found"
    $HasUv = $true
} else {
    if ($HasPython) { Write-Warn "uv not found -- install with: powershell -c `"irm https://astral.sh/uv/install.ps1 | iex`"" }
    $Warnings++
}

Write-Host ""
if ($Errors -gt 0) {
    Write-Fail "Found $Errors critical error(s). Fix them and re-run."
}
if ($Warnings -gt 0) {
    Write-Warn "$Warnings optional dependency warnings (needed for local dev)"
}

if ($Check) {
    Write-Step "Validation complete"
    Write-Host "  Errors:   $Errors"
    Write-Host "  Warnings: $Warnings"
    exit 0
}

# ─── 2. Validate ports ──────────────────────────────────────────
Write-Step "2/6  Checking ports"

function Test-Port {
    param([int]$Port, [string]$Name)
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn[0].OwningProcess -ErrorAction SilentlyContinue
        Write-Warn "Port $Port ($Name) is in use by $($proc.ProcessName) (PID: $($conn[0].OwningProcess))"
        return $false
    } else {
        Write-Ok "Port $Port ($Name) is available"
        return $true
    }
}

$PortOk = $true
if (-not (Test-Port 5433 "PostgreSQL"))  { $PortOk = $false }
if (-not (Test-Port 6380 "Redis"))       { $PortOk = $false }
if (-not (Test-Port 3000 "API Gateway")) { $PortOk = $false }
if (-not (Test-Port 8100 "Parser"))      { $PortOk = $false }
if (-not (Test-Port 5173 "Web Client"))  { $PortOk = $false }

if (-not $PortOk) {
    Write-Warn "Some ports are in use. Services may fail to start."
}

# ─── 3. Generate .env files ─────────────────────────────────────
Write-Step "3/6  Environment configuration"

if (Test-Path $EnvFile) {
    Write-Warn ".env already exists at $EnvFile"

    # Check for missing vars
    $ExampleFile = Join-Path $DockerDir ".env.example"
    if (Test-Path $ExampleFile) {
        $existingKeys = @()
        Get-Content $EnvFile | ForEach-Object {
            if ($_ -match "^([^#][^=]+)=") { $existingKeys += $Matches[1].Trim() }
        }
        $missingVars = @()
        Get-Content $ExampleFile | ForEach-Object {
            if ($_ -match "^([^#][^=]+)=") {
                $key = $Matches[1].Trim()
                if ($key -notin $existingKeys) { $missingVars += $key }
            }
        }
        if ($missingVars.Count -gt 0) {
            Write-Warn "Missing vars in .env (present in .env.example):"
            $missingVars | ForEach-Object { Write-Host "    - $_" }
        } else {
            Write-Ok "All expected vars present in .env"
        }
    }

    $Overwrite = Read-Host "  Overwrite .env? (y/N)"
    if ($Overwrite -ne "y" -and $Overwrite -ne "Y") {
        Write-Info "Keeping existing .env"
    } else {
        Remove-Item $EnvFile
    }
}

if (-not (Test-Path $EnvFile)) {
    Write-Info "Generating secrets and .env file..."

    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $DbPassword = [Convert]::ToBase64String($bytes) -replace "[/+=]", "" | ForEach-Object { $_.Substring(0, [Math]::Min(24, $_.Length)) }

    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $JwtSecret = [Convert]::ToBase64String($bytes)

    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $EncryptionKey = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""

    Write-Host ""
    Write-Info "Optional: Pre-configure admin account (skip with Enter)"
    $AdminEmail = Read-Host "  Admin email (leave empty to skip)"
    $AdminPassword = ""; $AdminDisplayName = ""; $OrgName = ""

    if ($AdminEmail) {
        do {
            $SecurePass = Read-Host "  Admin password (min 8 chars)" -AsSecureString
            $AdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePass))
            if ($AdminPassword.Length -lt 8) { Write-Warn "Password too short" }
        } while ($AdminPassword.Length -lt 8)
        $AdminDisplayName = Read-Host "  Display name [Admin]"
        if (-not $AdminDisplayName) { $AdminDisplayName = "Admin" }
        $OrgName = Read-Host "  Organization name [My Organization]"
        if (-not $OrgName) { $OrgName = "My Organization" }
    }

    $EnvContent = @"
# SQLAtlas -- Generated by setup.ps1 on $(Get-Date -Format o)
# -- Database --
POSTGRES_USER=sqlatlas
POSTGRES_PASSWORD=$DbPassword
POSTGRES_DB=sqlatlas

# -- Security --
JWT_SECRET=$JwtSecret
CREDENTIAL_ENCRYPTION_KEY=$EncryptionKey

# -- Auth --
REGISTRATION_MODE=closed
MULTI_TENANT=false

# -- Ports --
API_PORT=3000
WEB_PORT=5173
PARSER_PORT=8100
DB_PORT=5433
REDIS_PORT=6380

# -- CORS --
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
"@

    if ($AdminEmail) {
        $EnvContent += "`n# -- Auto-setup admin --`nADMIN_EMAIL=$AdminEmail`nADMIN_PASSWORD=$AdminPassword`nADMIN_DISPLAY_NAME=$AdminDisplayName`nORG_NAME=$OrgName"
    }

    Set-Content -Path $EnvFile -Value $EnvContent -Encoding UTF8
    Write-Ok ".env created at $EnvFile"
}

# Create api-gateway .env
$ApiEnv = Join-Path $ApiDir ".env"
if (-not (Test-Path $ApiEnv) -and $HasNode) {
    Write-Info "Creating api-gateway .env..."
    $envVars = @{}
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") { $envVars[$Matches[1].Trim()] = $Matches[2].Trim() }
    }

    $ApiContent = @"
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
DB_HOST=localhost
DB_PORT=$($envVars['DB_PORT'])
DB_USERNAME=$($envVars['POSTGRES_USER'])
DB_PASSWORD=$($envVars['POSTGRES_PASSWORD'])
DB_DATABASE=$($envVars['POSTGRES_DB'])
JWT_SECRET=$($envVars['JWT_SECRET'])
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
PARSING_ENGINE_URL=http://localhost:$($envVars['PARSER_PORT'])
REDIS_HOST=localhost
REDIS_PORT=$($envVars['REDIS_PORT'])
CREDENTIAL_BACKEND=aes
CREDENTIAL_ENCRYPTION_KEY=$($envVars['CREDENTIAL_ENCRYPTION_KEY'])
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
REGISTRATION_MODE=$($envVars['REGISTRATION_MODE'])
MULTI_TENANT=$($envVars['MULTI_TENANT'])
"@

    if ($envVars['ADMIN_EMAIL']) {
        $ApiContent += "`nADMIN_EMAIL=$($envVars['ADMIN_EMAIL'])`nADMIN_PASSWORD=$($envVars['ADMIN_PASSWORD'])`nADMIN_DISPLAY_NAME=$($envVars['ADMIN_DISPLAY_NAME'])`nORG_NAME=$($envVars['ORG_NAME'])"
    }

    Set-Content -Path $ApiEnv -Value $ApiContent -Encoding UTF8
    Write-Ok "api-gateway .env created"
}

# ─── 4. Install dependencies ────────────────────────────────────
Write-Step "4/6  Installing dependencies"

if ($HasPnpm) {
    Write-Info "Installing Node.js dependencies..."
    Push-Location $RootDir
    pnpm install --frozen-lockfile 2>&1 | Select-Object -Last 3
    Pop-Location
    Write-Ok "Node.js dependencies installed"
} else {
    Write-Warn "Skipping Node.js deps (pnpm not available)"
}

if ($HasUv) {
    Write-Info "Installing Python dependencies..."
    Push-Location $ParserDir
    uv sync 2>&1 | Select-Object -Last 3
    Pop-Location
    Write-Ok "Python dependencies installed"
} elseif ($HasPython) {
    Write-Warn "uv not found -- trying pip fallback..."
    Push-Location $ParserDir
    if (-not (Test-Path ".venv")) { & $PythonCmd -m venv .venv }
    & ".venv\Scripts\Activate.ps1"
    pip install -q -e "." 2>&1 | Select-Object -Last 3
    Pop-Location
    Write-Ok "Python dependencies installed (pip)"
} else {
    Write-Warn "Skipping Python deps"
}

# ─── 5. Start infrastructure ────────────────────────────────────
Write-Step "5/6  Starting infrastructure (PostgreSQL + Redis)"

Push-Location $DockerDir
docker compose --env-file $EnvFile up -d postgres redis 2>&1 | Select-Object -Last 3

Write-Info "Waiting for PostgreSQL..."
for ($i = 1; $i -le 30; $i++) {
    try {
        docker compose exec -T postgres pg_isready -U sqlatlas 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Ok "PostgreSQL is ready"; break }
    } catch {}
    if ($i -eq 30) { Write-Fail "PostgreSQL did not start in 30s" }
    Start-Sleep -Seconds 1
}

Write-Info "Waiting for Redis..."
for ($i = 1; $i -le 15; $i++) {
    try {
        $result = docker compose exec -T redis redis-cli ping 2>&1
        if ($result -match "PONG") { Write-Ok "Redis is ready"; break }
    } catch {}
    if ($i -eq 15) { Write-Fail "Redis did not start in 15s" }
    Start-Sleep -Seconds 1
}

Pop-Location

# ─── 6. Full mode: start all services ───────────────────────────
if ($Full) {
    Write-Step "6/6  Starting all services"

    if ($HasUv -or $HasPython) {
        Write-Info "Starting Parsing Engine (port 8100)..."
        $ParserJob = Start-Job -ScriptBlock {
            param($dir, $hasUv)
            Set-Location $dir
            if ($hasUv) { uv run uvicorn src.main:app --host 0.0.0.0 --port 8100 }
            else { .\.venv\Scripts\Activate.ps1; uvicorn src.main:app --host 0.0.0.0 --port 8100 }
        } -ArgumentList $ParserDir, $HasUv

        for ($i = 1; $i -le 20; $i++) {
            try { $r = Invoke-WebRequest -Uri "http://localhost:8100/health" -UseBasicParsing -ErrorAction SilentlyContinue; if ($r.StatusCode -eq 200) { Write-Ok "Parser is healthy"; break } } catch {}
            if ($i -eq 20) { Write-Warn "Parser health check timed out" }
            Start-Sleep -Seconds 1
        }
    }

    if ($HasPnpm) {
        Write-Info "Starting API Gateway (port 3000)..."
        $ApiJob = Start-Job -ScriptBlock { param($dir); Set-Location $dir; pnpm dev } -ArgumentList $ApiDir
        Start-Sleep -Seconds 5

        for ($i = 1; $i -le 20; $i++) {
            try { $r = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -ErrorAction SilentlyContinue; if ($r.StatusCode -eq 200) { Write-Ok "API is healthy"; break } } catch {}
            if ($i -eq 20) { Write-Warn "API health check timed out" }
            Start-Sleep -Seconds 1
        }

        Write-Info "Starting Web Client (port 5173)..."
        $WebJob = Start-Job -ScriptBlock { param($dir); Set-Location $dir; pnpm dev } -ArgumentList $WebDir
        Start-Sleep -Seconds 3
        Write-Ok "Web Client started"
    }
}

# ─── Summary ────────────────────────────────────────────────────
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " SQLAtlas setup complete!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Infrastructure:"
Write-Host "    PostgreSQL : localhost:5433"
Write-Host "    Redis      : localhost:6380"
Write-Host ""

if ($Full) {
    Write-Host "  Services (running as background jobs):"
    Write-Host "    Parsing Engine : http://localhost:8100"
    Write-Host "    API Gateway    : http://localhost:3000"
    Write-Host "    Web Client     : http://localhost:5173"
    Write-Host ""
    Write-Host "  Open: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "  Stop: Get-Job | Stop-Job | Remove-Job"
} else {
    if ($HasNode -and $HasPnpm) {
        Write-Host "  Quick start (3 terminals):"
        Write-Host "    T1: cd apps\parsing-engine; uv run uvicorn src.main:app --port 8100 --reload"
        Write-Host "    T2: cd apps\api-gateway; pnpm dev"
        Write-Host "    T3: cd apps\web-client; pnpm dev"
        Write-Host ""
        Write-Host "  Or run everything at once:"
        Write-Host "    .\scripts\setup.ps1 -Full"
    } else {
        Write-Host "  Docker-only mode:"
        Write-Host "    cd docker; docker compose --env-file .env up -d"
        Write-Host "    Open http://localhost:3000"
    }
}

Write-Host ""
if ($envVars -and $envVars['ADMIN_EMAIL']) {
    Write-Host "  Admin: $($envVars['ADMIN_EMAIL']) (auto-created on first boot)"
} else {
    Write-Host "  First visit: http://localhost:5173/setup"
}
Write-Host "  Swagger: http://localhost:3000/docs (dev mode)"
Write-Host ""
