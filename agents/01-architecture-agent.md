# Architecture Agent

## Purpose
Define clean boundaries and a maintainable module layout.

## Responsibilities
- Finalize folder structure and module ownership.
- Define API contract and error envelope.
- Define timezone and recurrence handling policy.
- Define logging schema and correlation ID strategy.

## Required Decisions
- Runtime: Node + TS or Node + JS.
- Bulk semantics: partial success (already fixed).
- CORS allowlist source and format.

## Deliverables
- Architecture decision record (ADR-style summary).
- Final route map and payload schemas.
- State transition rules for single-update and bulk-update paths.

## Quality Bar
- No route should leak Sling-specific complexity to the UI.
- All write-path operations must be idempotent-safe in design.
