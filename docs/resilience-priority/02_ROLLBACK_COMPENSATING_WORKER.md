# Rollback Compensating Worker

Last updated: 2026-02-09  
Priority: P1

## Why This Is Priority

Atomic grouped updates already attempt inline rollback in `services/api/src/routes/updates.js`, but rollback can still fail and return `rolledBack: false`.  
There is no asynchronous reconciliation path today.

## Current State (Verified)

- Atomic group flow snapshots original shifts and applies updates.
- On failure, inline rollback is attempted in reverse order.
- Response includes rollback status and failures.
- No persisted rollback task, queue, worker, or retry engine exists.

## Risks If Not Implemented

- Partial inconsistency can remain in Sling after a failed atomic update.
- User exits session with stale UI assumptions.
- Manual correction burden increases as traffic grows.

## Target Outcome

Introduce eventual self-healing for rollback failures:

- Inline rollback remains first attempt.
- Any rollback failure is persisted as a compensating task.
- Worker retries rollback asynchronously until success or dead-letter threshold.

## Functional Requirements

1. Persist compensating tasks for every rollback failure.
2. Worker retries with bounded exponential backoff.
3. Each task must be idempotent and safe to retry.
4. Track task status (`pending`, `processing`, `succeeded`, `failed_permanent`).
5. Emit structured logs/metrics for reconciliation outcomes.

## Recommended Architecture

## Task Payload

Each failed rollback entry should include:

- `taskId`
- `requestId`
- `groupId`
- `occurrenceId`
- snapshot payload needed to restore original shift
- attempt count and next-attempt timestamp

## Queue/Execution Options

1. Cloud Tasks + HTTP worker endpoint
- Strong delivery/retry controls and scheduling.

2. Pub/Sub + subscriber worker
- Good for streaming/event flow, more custom retry/state logic.

Recommended default: Cloud Tasks for explicit retry scheduling and easier operational control.

## Worker Behavior

1. Load task and validate status is retryable.
2. Call Sling `updateShift` with rollback snapshot.
3. On success:
  - mark task `succeeded`
4. On transient failure:
  - increment attempts
  - schedule next retry with backoff
5. On max attempts exceeded:
  - mark `failed_permanent`
  - raise operational alert

## Data Storage

Need a persistent task state store (Firestore, SQL, or equivalent) with:

- indexed status
- timestamps
- attempt metadata
- last error payload

## API Contract Impact

Grouped failure response can include optional fields:

- `reconciliationQueued: true|false`
- `reconciliationTaskCount`

This keeps UI messaging accurate when rollback is not fully complete inline.

## Implementation Plan

1. Add rollback-task persistence model and repository.
2. Enqueue failed rollback entries from grouped update flow.
3. Add worker endpoint/process for task execution.
4. Add retry policy + max-attempt + dead-letter handling.
5. Add operational logging and alert hooks.
6. Add UI-safe response fields for queued reconciliation.

## Test Plan

1. Unit tests:
  - task lifecycle transitions
  - retry scheduling rules
2. Route tests:
  - failed rollback enqueues tasks
  - response exposes reconciliation metadata
3. Worker tests:
  - success path
  - transient retry path
  - permanent failure path

## Acceptance Criteria

- Any `rolledBack: false` case creates durable compensating task(s).
- Worker retries are observable and bounded.
- Successful retries reduce unresolved rollback backlog to zero over time.
- Permanent failures are visible through logs/alerts.

## Open Decisions

1. Queue tech choice (Cloud Tasks vs Pub/Sub).
2. Max retry attempts and backoff curve.
3. Where to store reconciliation state and how long to retain history.
