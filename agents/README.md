# Agent System

This folder defines role-based agents to execute the rebuild systematically.

## Current Files
- `00-orchestrator-agent.md` (retained)
- `STATUS.md` (retained)
- `MASTER_HISTORY.md` (archived compact history for retired agent/handoff docs)
- `handoffs/00-orchestrator-handoff.md` (retained)

## Archived
The retired specialist agent docs and their handoffs (`01-05` + `handoffs/01-05`) were compacted into:
- `agents/MASTER_HISTORY.md`

## Ground Rules
- Do not modify legacy files in `pastVersions/`.
- Build new code in new folders/files only.
- Treat backend as the only system allowed to talk to Sling.
- Enforce single-occurrence update behavior.
- Keep timezone logic centralized and explicit (`America/New_York`).

## Handoff Contract
Each agent must provide:
- What was built
- What was validated
- Open risks/blockers
- Files changed
