# Source of Truth

Use this file as the single entry point for new AI sessions (Codex/Claude).

Last updated: 2026-02-09

## Current Work

### Session Stop Log

#### 2026-02-09 (latest)
- Completed:
  - Resolved Firestore idempotency rollout blockers:
    - Docker image now installs runtime dependencies for API.
    - Firestore non-default DB support added via `IDEMPOTENCY_DATABASE_ID`.
  - Documented and hardened deployment operations:
    - Single deployment authority rule (GitHub Actions).
    - Explicit Cloud Run traffic-routing policy.
    - Required runtime IAM/env guidance.
  - Consolidated retired agent docs:
    - `agents/01-05` and `agents/handoffs/01-05` archived into `agents/MASTER_HISTORY.md`.
- Current production guidance:
  - Keep API deploys single-writer (GitHub Actions).
  - Avoid "send all traffic to latest revision" if more than one deploy path is active.
  - For this project, set `IDEMPOTENCY_DATABASE_ID=sling-scheduler`.
- Next recommended starting point for a new session:
  - Check `docs/operations/CHANGELOG.md` newest entry.
  - Check `docs/operations/INCIDENT_REPORT.md` latest incident entry.
  - Verify Cloud Run revisions/traffic before debugging app behavior.

### How to Update This Section
- At the end of each session, append a new dated entry under `Session Stop Log` with:
  - Completed work
  - Current known state
  - Exact next starting point

## Markdown Map

Open order for most sessions:
1. `README.md`
2. `docs/operations/CHANGELOG.md`
3. `docs/operations/INCIDENT_REPORT.md`
4. `docs/operations/GCP_SETUP.md`
5. `infra/cloudrun/README.md`

### Core Runbooks and Architecture

| Path | What it contains | When to open |
|---|---|---|
| `SOURCE_OF_TRUTH.md` | Session stop log + markdown map for all project docs. | Always open first in new AI sessions. |
| `README.md` | Primary operations runbook and project-level guidance. | Start here for almost all sessions. |
| `docs/operations/CHANGELOG.md` | Session-by-session implementation history and deploy/config notes. | Use to understand recent changes and latest timeline. |
| `docs/operations/INCIDENT_REPORT.md` | Cloud Run/service incidents, root causes, and guardrails. | Open for deploy/runtime issues and drift investigation. |
| `docs/design/ARCHITECTURE.md` | System components, data flow, safety rules. | Open when changing architecture or boundaries. |
| `docs/design/API_CONTRACT.md` | Request/response contract for API routes. | Open when touching API behavior or UI/API integration. |
| `docs/design/IMPLEMENTATION_PLAN.md` | Original rebuild plan and acceptance criteria. | Use for historical planning context. |
| `docs/design/HOSTING_STRATEGY.md` | Caspio/Netlify/Cloud Run hosting model and rationale. | Open for hosting/topology decisions. |

### Deployment and Infra

| Path | What it contains | When to open |
|---|---|---|
| `docs/operations/GCP_SETUP.md` | End-to-end GCP setup steps, runtime vars, Firestore notes, revision sanity checks. | Open for Cloud Run runtime setup and project bootstrap. |
| `docs/operations/CI_CD.md` | GitHub Actions workflows, required secrets, deploy authority rule. | Open when pipeline/deployment behavior is in scope. |
| `docs/operations/NETLIFY_SETUP.md` | Netlify setup and UI deploy wiring. | Open for UI hosting/deploy changes. |
| `infra/cloudrun/README.md` | Cloud Run deploy runbook and runtime config reference. | Open for service deployment and runtime variables. |
| `infra/cloudrun/SERVICE_CONFIG.md` | Cloud Run service sizing/settings recommendations. | Open when tuning performance/cost/runtime settings. |

### Reliability and Follow-up Work

| Path | What it contains | When to open |
|---|---|---|
| `docs/operations/RESILIENCE_SELF_CORRECTION_FINDINGS.md` | Reliability status snapshot, verified items, open gaps. | Open when planning resilience work. |
| `docs/design/resilience-priority/README.md` | Index for resilience-priority planning docs. | Open before selecting resilience tasks. |
| `docs/design/resilience-priority/01_SHARED_IDEMPOTENCY_STORE.md` | Historical plan for shared idempotency store (implemented). | Reference for rationale/history of idempotency design. |
| `docs/design/resilience-priority/02_ROLLBACK_COMPENSATING_WORKER.md` | Plan for async rollback reconciliation worker (open item). | Open when implementing rollback self-healing. |
| `docs/design/resilience-priority/03_CASPIO_TIMEOUT_RETRY_PARITY.md` | Plan for Caspio timeout/retry parity (open item). | Open when improving Caspio client resilience. |
| `docs/design/resilience-priority/04_PUT_IDEMPOTENCY_MISMATCH.md` | Historical PUT idempotency mismatch plan (resolved). | Reference-only historical context. |

### Product and Historical Context

| Path | What it contains | When to open |
|---|---|---|
| `docs/design/the_problem.md` | Original problem narrative from legacy proxy era and migration rationale. | Use for historical context of why rebuild happened. |
| `responses.md` | Early requirement notes and examples captured during rebuild kickoff. | Historical context only. |

### API/UI Local Docs

| Path | What it contains | When to open |
|---|---|---|
| `services/api/README.md` | API local run/test quickstart and route list. | Open when working inside API folder. |
| `app/ui/README.md` | UI local preview and runtime API base config notes. | Open when working inside UI folder. |

### Agent Archives (Reference Only)

| Path | What it contains | When to open |
|---|---|---|
| `agents/README.md` | Notes on current archived agent structure. | Open only if touching `agents/` docs. |
| `agents/STATUS.md` | Historical checkpoint status; not current state. | Reference-only; do not use as latest truth. |
| `agents/MASTER_HISTORY.md` | Consolidated history of retired specialist agent files/handoffs. | Reference-only history. |
| `agents/00-orchestrator-agent.md` | Legacy orchestrator role definition. | Historical reference only. |
| `agents/handoffs/00-orchestrator-handoff.md` | Legacy orchestrator handoff snapshot. | Historical reference only. |

### Parallel Sub-agent Archive (Reference Only)

| Path | What it contains | When to open |
|---|---|---|
| `agents/handoffs/PARALLEL_SUBAGENTS_HISTORY.md` | Consolidated archive of retired `parallel-subagents/` packet docs and handoffs. | Historical reference only. |
