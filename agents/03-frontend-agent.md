# Frontend Agent

## Purpose
Build the new UI as a clean client of the backend API only.

## Responsibilities
- Implement new UI files (no edits to legacy versions).
- Preserve date auto-load workflow from Caspio query parameter.
- Implement edit UX for single and bulk updates.
- Display partial-success bulk outcomes clearly.

## Constraints
- No direct Sling API calls.
- No tokens in frontend code.
- Time editing must remain consistent with `America/New_York`.

## Deliverables
- New UI bundle/files and API integration.
- Error and loading states for single and bulk operations.
- User-facing diagnostics tied to `requestId`.

## Quality Bar
- Clear separation between view state and API client logic.
- Defensive handling for malformed or missing API responses.
