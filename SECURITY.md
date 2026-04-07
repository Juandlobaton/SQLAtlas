# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability, **please do NOT open a public issue**.

Instead, report it responsibly by emailing: **security@sqlatlas.dev**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will acknowledge receipt within **48 hours** and aim to release a patch within **7 days** for critical issues.

## Security Architecture

### Authentication
- **JWT tokens** with HS256 algorithm pinning (no algorithm substitution)
- **Bcrypt** password hashing with 12 salt rounds
- Access tokens expire in 15 minutes; refresh tokens in 7 days
- Rate limiting on auth endpoints (5 req/min login, 3 req/min setup)

### Credential Storage
- Database connection passwords encrypted with **AES-256-GCM** (authenticated encryption)
- Random 12-byte IV per credential, authentication tag verified on decrypt
- Optional backends: HashiCorp Vault, AWS Secrets Manager

### Input Validation
- Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`
- All database queries use parameterized statements (TypeORM + manual parameterization)
- Password max length enforced (128 chars) to prevent bcrypt DoS

### Network Security
- **Helmet.js** security headers (HSTS, X-Frame-Options, CSP, etc.)
- CORS restricted to configured origins (no wildcards)
- SSRF protection: blocks private IP ranges, loopback, and cloud metadata endpoints
- Rate limiting on all endpoints (100 req/min global)

### Infrastructure
- Docker containers run as non-root users
- Secrets required via environment variables (fail-fast if missing)
- Audit logging for all mutating operations

## Hardening Checklist

When deploying SQLAtlas to production:

- [ ] Generate strong secrets using the setup script (`./scripts/setup.sh`)
- [ ] Set `NODE_ENV=production` (disables Swagger, debug logging, TypeORM sync)
- [ ] Use a strong `JWT_SECRET` (minimum 64 bytes recommended)
- [ ] Generate a unique `CREDENTIAL_ENCRYPTION_KEY` (32-byte hex)
- [ ] Set `REGISTRATION_MODE=closed` (default) unless open registration is needed
- [ ] Configure `CORS_ORIGINS` to your actual domain (not `localhost`)
- [ ] Use HTTPS with a reverse proxy (nginx, Caddy, Traefik)
- [ ] Consider `CREDENTIAL_BACKEND=vault` or `aws` for production key management
- [ ] Enable PostgreSQL SSL (`?ssl=true` in connection string)
- [ ] Review Docker resource limits for your workload
- [ ] Run `pnpm audit` regularly to check for dependency vulnerabilities

## Known Limitations

- Tokens are returned in JSON response bodies (not HTTP-Only cookies). XSS protection relies on CSP headers and input sanitization.
- No CSRF tokens — mitigated by Bearer token auth pattern (tokens not sent automatically by browsers).
- No per-user rate limiting — only per-endpoint. High-volume accounts are not individually throttled.
- Audit logs contain email addresses (PII). Consider retention policies for compliance.
