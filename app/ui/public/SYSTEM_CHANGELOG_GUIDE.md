# system-changelog.json — Writing Guide

This file powers the "What's New" panel in the UI. It is **not** the same as `docs/operations/CHANGELOG.md` (which is the technical ops log).

## Rules

1. **User-friendly language only.** Write as if explaining to a non-technical user. No code names, service names, file paths, or internal jargon.
   - Bad: "Fixed Firestore Timestamp serialization in audit query pipeline"
   - Good: "Improved how timestamps are displayed in the Recent Activity feed."

2. **Focus on what changed for the user**, not how it was implemented.
   - Bad: "Added React.forwardRef to trigger button components"
   - Good: "Fixed an issue that could prevent the Activity panel from opening."

3. **Positive framing.** Lead with what's better, not what was broken.
   - Bad: "Fixed crash when opening Activity drawer"
   - Good: "Improved reliability when viewing recent activity."

4. **Keep entries short.** One sentence each. No bullet sub-lists.

5. **Newest dates first.** The array is ordered newest-to-oldest.

6. **Date format:** `YYYY-MM-DD` string. Multiple entries per date are fine — group them under one date object.

7. **Not every ops change needs an entry.** Only add things the user would notice or care about. Internal refactors, infra changes, and test-only changes should be skipped.

8. **Special field: `clearInvestigating`.** Adding `"clearInvestigating": true` to a date entry will clear the investigating indicator in the UI for all users on next load. Use this after resolving an incident that triggered the automatic investigating flag.

## Schema

```json
[
  {
    "date": "2026-02-13",
    "entries": [
      "Short, friendly sentence about what improved.",
      "Another improvement."
    ],
    "clearInvestigating": true
  }
]
```

Only `date` and `entries` are required. `clearInvestigating` is optional.

## Deployment

This file lives in `app/ui/public/` and deploys automatically with the UI via Netlify on push to `main`. No API or Cloud Run deploy needed.
