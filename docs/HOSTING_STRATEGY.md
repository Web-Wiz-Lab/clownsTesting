# Hosting Strategy

## Recommended Model
- Caspio: launcher only.
- Netlify: hosts the full UI (`app/ui`).
- Cloud Run: hosts API (`services/api`).

This keeps Caspio simple while allowing future migration to React/shadcn/ui without Caspio HTML DataPage limitations.

## Request Flow
1. Coordinator clicks `Manage in Sling` in Caspio.
2. Caspio opens Netlify URL with `?date=MM/DD/YYYY`.
3. UI converts date and calls Cloud Run API.
4. Cloud Run talks to Sling/Caspio securely.

## CORS Recommendation
Set `CORS_ALLOWED_ORIGINS` to UI origins only.

Use this initially:
- `https://<your-netlify-site>.netlify.app`

Add Caspio origin only if Caspio pages call API directly:
- `https://c0ebl152.caspio.com`

## Why this is future-proof
- UI framework can evolve independently.
- Backend remains stable integration layer.
- Operational debugging stays centralized in Cloud Run logs.
