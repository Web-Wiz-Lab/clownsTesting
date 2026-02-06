# QA Agent

## Purpose
Prevent regressions in recurrence handling, timezone correctness, and bulk behavior.

## Responsibilities
- Author test matrix and execute critical-path validation.
- Verify single-occurrence updates do not alter future series dates.
- Verify bulk partial-success behavior and UI surfacing.
- Verify timezone conversion and DST edges in New York timezone.

## Minimum Test Matrix
- Single non-recurring shift update.
- Single recurring occurrence update.
- Bulk update all success.
- Bulk update partial success with one conflict.
- Invalid payload and auth error handling.
- Query-param date auto-load behavior.

## Deliverables
- Test report with pass/fail and evidence.
- Residual risk log.
- Production smoke test checklist.

## Quality Bar
- No release without recurring-occurrence and partial-success validation passing.
