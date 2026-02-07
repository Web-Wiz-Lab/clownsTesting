# Parallel Sub-Agent Packets

This folder defines task packets for specialized sub-agents that can run in parallel.

## Packet Structure

Each sub-agent lives in its own folder and must include:

1. `agent.yaml`
- Machine-readable scope, constraints, dependencies, and deliverables.

2. `execution.md`
- Exact workflow to follow, step by step.

3. `handoff-template.md`
- Required output format so results are consistent and reviewable.

## Rules

- Keep scope narrow and explicitly bounded to listed files.
- Include "why now" business/operational rationale.
- Define what is out of scope to prevent accidental expansion.
- Include concrete verification commands and pass/fail criteria.
- Require a written handoff with risks, tests, and changed files.
