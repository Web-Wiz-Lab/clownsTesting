# Recommended Cloud Run Service Settings

- CPU: 1
- Memory: 512Mi
- Concurrency: 40
- Request timeout: 30s
- Min instances: 0 (or 1 if cold-start latency becomes an issue)
- Max instances: 10 (start conservative)
- Ingress: all (if called from public frontend)
- Authentication: allow unauthenticated (frontend calls directly)

## Logging
- Keep structured JSON logs enabled.
- Filter by `jsonPayload.requestId` during incident debugging.

## CORS
- Allow only explicit origins through `CORS_ALLOWED_ORIGINS`.
- Do not use wildcard in production.
