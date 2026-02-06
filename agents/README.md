# Agent System

This folder defines role-based agents to execute the rebuild systematically.

## Sequence
1. `00-orchestrator-agent.md`
2. `01-architecture-agent.md`
3. `02-backend-agent.md`
4. `03-frontend-agent.md`
5. `04-qa-agent.md`
6. `05-devops-agent.md`

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
