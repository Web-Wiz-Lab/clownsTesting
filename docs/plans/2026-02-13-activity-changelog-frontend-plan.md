# Activity & Changelog Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Required Reading

Read these files before starting implementation:

**Design doc:**
- `docs/plans/2026-02-13-activity-changelog-design.md` — feature design, API contract, and behavior specs

**Existing frontend code (understand patterns before writing anything):**
- `app/ui/src/lib/api.ts` — `apiRequest()` function, `API_BASE` resolution, `ApiError` interface
- `app/ui/src/lib/errors.ts` — `reportErrorToOps()`, `getErrorContext()`, `sanitizeForReport()` — you will modify this file
- `app/ui/src/hooks/use-schedule.ts` — existing hook pattern (state management, error handling, `reportErrorToOps` calls)
- `app/ui/src/types/schedule.ts` — existing TypeScript type conventions
- `app/ui/src/features/schedule/SchedulePage.tsx` — main page component (understand layout and how features are composed)
- `app/ui/src/App.tsx` — root component

**Static data file (already created by backend):**
- `app/ui/public/system-changelog.json` — the changelog JSON the frontend loads

**Backend API contract (from design doc):**

`GET /api/audit-log?limit=N&cursor=ID` returns:
```json
{
  "requestId": "...",
  "entries": [
    {
      "id": "firestore-doc-id",
      "timestamp": "2026-02-13T18:22:47.568Z",
      "outcome": "success",
      "type": "single",
      "summary": "Team 25 shifts updated for August 3, 2026",
      "scheduleDate": "2026-08-03",
      "requestId": "28779d6c-...",
      "groups": [
        { "groupId": "Team 25", "status": "success" }
      ]
    }
  ],
  "nextCursor": "firestore-doc-id-N"
}
```

- `type`: `"single"` or `"bulk"`
- `outcome`: `"success"`, `"failure"`, or `"partial"`
- `groups`: always present, 1 entry for single, N entries for bulk
- `nextCursor`: `null` when no more pages
- Entries are newest-first

---

**Goal:** Build the frontend for two features — Recent Activity (live feed from API) and System Change Log (static JSON + investigating indicator) — and wire them into the existing app.

**Architecture:** Two independent data sources (API endpoint + static JSON file), each with its own data-fetching logic and display. The investigating flag bridges `reportErrorToOps()` to the changelog via `localStorage`. All UI/component/layout decisions are yours.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (New York style). Run `npm run lint && npm run build` in `app/ui/` to validate.

---

### Task 1: TypeScript types and data-fetching layer

Add types and data-fetching functions for both features. No UI yet — just the data layer.

**Files:**
- Modify: `app/ui/src/types/schedule.ts` (or create a new types file if you prefer separation)
- Modify or create: data-fetching functions (hook, utility, or inline — your call)

**Types needed:**

```typescript
// Activity entry from GET /api/audit-log
interface ActivityEntry {
  id: string;
  timestamp: string;           // ISO string
  outcome: 'success' | 'failure' | 'partial';
  type: 'single' | 'bulk';
  summary: string;
  scheduleDate: string | null;
  requestId: string | null;
  groups: Array<{
    groupId: string;
    status: string;
  }>;
}

// Response from GET /api/audit-log
interface ActivityResponse {
  requestId: string;
  entries: ActivityEntry[];
  nextCursor: string | null;
}

// Changelog entry from system-changelog.json
interface ChangelogDay {
  date: string;              // "2026-02-13"
  entries: string[];
  clearInvestigating?: boolean;
}
```

**Data fetching:**

1. **Activity:** Call `apiRequest<ActivityResponse>('/api/audit-log?limit=20')` using the existing `apiRequest` from `lib/api.ts`. Support pagination by passing `cursor` query param.

2. **Changelog:** Fetch `/system-changelog.json` from the app's own origin (it's in `public/`). This is a static file, not an API call — use plain `fetch()`, not `apiRequest`.

**Validation:** `npm run lint` in `app/ui/` should pass with the new types.

---

### Task 2: Investigating flag logic in errors.ts

Wire `reportErrorToOps()` to set a `localStorage` flag when a failure or partial outcome occurs. This flag will be read by the System Change Log feature.

**Files:**
- Modify: `app/ui/src/lib/errors.ts`

**What to do:**

1. After `reportErrorToOps()` successfully sends the error report (i.e., after the `apiRequest` call succeeds and `result?.data?.triggered === true`), set a `localStorage` item:

```typescript
localStorage.setItem('changelog_investigating', JSON.stringify({
  investigating: true,
  timestamp: new Date().toISOString()
}));
```

2. Export helper functions for the changelog feature to use:

```typescript
export function getInvestigatingFlag(): { investigating: boolean; timestamp: string } | null {
  // Read and parse the localStorage item. Return null if not set or invalid.
}

export function clearInvestigatingFlag(): void {
  // Remove the localStorage item.
}
```

**Important:** The `localStorage` write should not break `reportErrorToOps()` if it fails (e.g., storage full, private browsing). Wrap it in try/catch.

**Validation:** `npm run lint` in `app/ui/` should pass. Existing behavior of `reportErrorToOps()` must not change.

---

### Task 3: Recent Activity feature

Build the UI for the Recent Activity feed. **All component structure, layout, and styling decisions are yours.** The requirements are behavioral:

**Behavior requirements:**

1. Fetch activity entries from `GET /api/audit-log` on mount.
2. Display entries newest-first with:
   - Timestamp formatted in `America/New_York` timezone (the app's timezone) — e.g., "February 13, 2026 at 6:10 PM"
   - Outcome indicator (success/failure/partial)
   - Summary text (provided by backend, display as-is)
3. **Single entries** (`type: "single"`): show summary directly.
4. **Bulk entries** (`type: "bulk"`): show summary, and support expanding to see per-team `groupId` and `status` from the `groups` array.
5. **Pagination:** If `nextCursor` is returned, provide a way to load more entries.
6. Handle loading state and error state (fetch failure).

**Validation:** `npm run lint && npm run build` in `app/ui/` should pass.

---

### Task 4: System Change Log feature with investigating indicator

Build the UI for the System Change Log. **All component structure, layout, and styling decisions are yours.** The requirements are behavioral:

**Behavior requirements:**

1. Load `system-changelog.json` from the app's public directory.
2. Display entries grouped by date, newest first. Each date has an array of string entries.
3. **Investigating indicator:**
   - On render, check `getInvestigatingFlag()` from `errors.ts`.
   - If the flag is set (`investigating: true`), show an auto-generated entry at the top: _"Investigating an isolated incident that prevented a team from being updated. System remains operational."_
   - When the user opens/views the changelog, call `clearInvestigatingFlag()` to dismiss the indicator.
4. **Developer clear via JSON:**
   - When loading `system-changelog.json`, check each entry for `clearInvestigating: true`.
   - If found, call `clearInvestigatingFlag()`. This allows the developer to remotely clear the investigating state by deploying a changelog update.
5. **Visual indicator:** When the investigating flag is active, the entry point to the changelog (button, icon, tab — whatever you build) should have a visual cue to draw user attention.

**Validation:** `npm run lint && npm run build` in `app/ui/` should pass.

---

### Task 5: Integration and final validation

Wire both features into the app and run full validation.

**Files:**
- Modify: whatever files are needed to make both features accessible from the main app (navigation, layout, SchedulePage, App.tsx — your decision)

**Requirements:**
1. Both features must be accessible from the existing app. How they're accessed (sidebar, tabs, buttons, drawer, modal — your call) is a design decision.
2. The existing schedule functionality must continue to work unchanged.
3. The investigating indicator must be visible even when the changelog is not open.

**Final validation checklist:**
```bash
cd /workspaces/clownsTesting/app/ui && npm run lint && npm run build
cd /workspaces/clownsTesting/services/api && node --test
```

All must pass. No regressions to existing 55 API tests.

---

### Task 6: Local preview/test page with simulated states

Create a standalone preview page that runs locally so the developer can visually verify all UI states and edge cases before deploying to production.

**Files:**
- Create: a preview page/route within the Vite dev server (e.g., `/preview` route, or a separate entry point — your call on mechanism)

**How it works:**

The preview page renders the **same real components** from Tasks 3-5 (not copies or screenshots). It must be visually identical to what the deployed version looks like. Two key differences from production:

1. **All PUT/POST requests are disabled.** The preview must not make any write requests to the real API. GET requests (like fetching audit-log entries) can still work if the API is reachable, or can be mocked — your call. But no writes can fire.

2. **A simulation control panel** is visible alongside the real UI. The panel lets the developer toggle states and see exactly what the user would see. Required controls:

   **Recent Activity states:**
   - Empty state (no activity entries)
   - Single successful entry
   - Single failed entry
   - Bulk entry with mixed outcomes (partial — some teams success, some failed)
   - Multiple entries (enough to show pagination / "load more")
   - Loading state
   - Fetch error state (API unreachable)

   **System Change Log states:**
   - Normal state (entries loaded from real `system-changelog.json`)
   - Investigating flag active (simulates `localStorage` flag being set)
   - Investigating flag cleared (simulates user opening changelog)
   - Empty changelog (no entries)

   **Alerts/modals (from existing schedule features):**
   - Success alert after single team update
   - Error alert after failed update (with user-friendly error message)
   - Partial failure alert after bulk edit (rollback vs. no-rollback variants)
   - Operation modal in loading state
   - Operation modal in success state
   - Operation modal in error state

   The panel should use buttons/toggles to switch between states. Each state change should immediately update what the real components render.

**Implementation approach:**

The simplest approach: wrap the real components but inject mock data/props instead of live API calls. For example, provide a mock `apiRequest` or mock hook return values. The control panel sets which mock data is active. The components themselves are the real production components — not stubs.

**Running it:**

The developer should be able to run the preview with a single command, e.g.:
```bash
cd /workspaces/clownsTesting/app/ui && npm run dev
```
Then navigate to the preview route (e.g., `http://localhost:5173/preview`).

**Important:**
- The preview page must NOT be included in the production build. Guard it behind a dev-only check (e.g., `import.meta.env.DEV`) or exclude the route in production.
- The preview page does not need to be pretty — the control panel is a developer tool, not a user-facing feature. Function over form.

**Validation:** `npm run lint && npm run build` in `app/ui/` should pass. The preview page should not appear in the production bundle.
