# Sling Scheduler API

Cloud Run-friendly Node.js API for Sling/Caspio orchestration.

## Local Run
1. Copy env template:
```bash
cp .env.example .env
```
2. Export envs and start:
```bash
set -a; source .env; set +a
npm start
```

## Tests
```bash
npm test
```

## Endpoints
- `GET /healthz`
- `GET /readyz`
- `GET /api/schedule?date=YYYY-MM-DD`
- `PUT /api/shifts/:occurrenceId`
- `POST /api/shifts/bulk`
