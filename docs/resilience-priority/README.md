# Resilience Priority Workstream

Last updated: 2026-02-09

This folder contains focused planning docs for the current top-priority resilience items.

## Documents

1. `docs/resilience-priority/01_SHARED_IDEMPOTENCY_STORE.md`
2. `docs/resilience-priority/02_ROLLBACK_COMPENSATING_WORKER.md`
3. `docs/resilience-priority/03_CASPIO_TIMEOUT_RETRY_PARITY.md`
4. `docs/resilience-priority/04_PUT_IDEMPOTENCY_MISMATCH.md`

## Suggested Execution Order

1. Caspio timeout/retry parity (quickest reliability gain)
2. Shared idempotency store
3. PUT idempotency alignment (can be folded into #2)
4. Rollback compensating worker

## Notes

- `03_CASPIO_TIMEOUT_RETRY_PARITY.md` can be delivered independently.
- `04_PUT_IDEMPOTENCY_MISMATCH.md` is best done with `01_SHARED_IDEMPOTENCY_STORE.md`.
- `02_ROLLBACK_COMPENSATING_WORKER.md` introduces queue/worker architecture and should follow infra decisions.
