# Redesign Frontend with React + Vite + shadcn UI

## Context

The Sling Schedule Manager frontend is currently vanilla HTML/CSS/JS (4 files in `app/ui/`). The goal is to migrate to React + Vite + Tailwind + shadcn UI for a modern tech look with Inter font, while preserving all existing UX patterns and functionality.

All work happens on the `ui-lab` branch. **Nothing merges to `main` or deploys to production until the redesign is fully reviewed and approved locally.** Multiple revision cycles are expected.

---

## Local Development Workflow

This is the primary way to review and iterate on the redesign before any commit or merge.

### Setup (one time)
```bash
cd app/ui
npm install
```

### Create local environment file
```bash
# app/ui/.env (git-ignored — never committed)
VITE_API_BASE_URL=https://sling-scheduling-89502226654.us-east1.run.app
```

### Run the dev server
```bash
cd app/ui
npm run dev
```
Vite starts at `http://localhost:5173` with hot module replacement — every saved file change reflects instantly in the browser without a page reload.

### Preview a production build locally
```bash
cd app/ui
npm run build && npm run preview
```
This builds to `dist/` and serves it at `http://localhost:4173`, matching exactly what Netlify would deploy.

### Branch strategy
- All frontend work stays on `ui-lab` (or child branches off `ui-lab`)
- Commit freely to `ui-lab` for checkpoints, but **do not merge to `main`** until the redesign passes the full UX Preservation Checklist below
- The existing production UI on `main` remains untouched throughout

---

## Step 1: Scaffold React + Vite project

Replace `app/ui/` contents with a Vite + React + TypeScript project.

```
app/ui/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json          # shadcn config
├── src/
│   ├── main.tsx             # Entry point
│   ├── App.tsx              # Root component
│   ├── index.css            # Tailwind directives + Inter font import
│   ├── lib/
│   │   ├── utils.ts         # shadcn cn() utility
│   │   ├── api.ts           # API client (apiRequest, idempotency, error reporting)
│   │   ├── errors.ts        # explainErrorCode, error context helpers
│   │   └── time.ts          # Time formatting, time select options generation
│   ├── hooks/
│   │   └── use-schedule.ts  # Schedule fetch + state management hook
│   ├── components/
│   │   └── ui/              # shadcn components installed here
│   └── features/
│       └── schedule/
│           ├── SchedulePage.tsx          # Main page (replaces index.html layout)
│           ├── SearchBar.tsx             # Date picker + Search button
│           ├── TeamsTable.tsx            # Main teams table
│           ├── TeamRow.tsx              # Single team row (display + edit modes)
│           ├── UnmatchedBanner.tsx       # Collapsible warning + unmatched table
│           ├── UnmatchedRow.tsx          # Single unmatched shift row
│           ├── BulkControls.tsx          # Edit All / Update All / Cancel buttons
│           ├── StatusBadge.tsx           # Published/Unpublished badge
│           ├── TimeSelect.tsx            # Time dropdown with MORNING/AFTERNOON/EVENING groups
│           ├── StatusSelect.tsx          # Publish/Unpublish dropdown
│           └── OperationModal.tsx        # Loading/Success/Error modal for bulk ops
└── public/
```

**Key setup tasks:**
- `npm create vite@latest . -- --template react-ts`
- Install Tailwind CSS 4 + `@tailwindcss/vite`
- Run `npx shadcn@latest init` to configure shadcn
- Add Inter font via `@fontsource/inter` or Google Fonts CDN link
- Set `VITE_API_BASE_URL` env var for API base URL

## Step 2: Install shadcn components

```
npx shadcn@latest add button table native-select badge alert collapsible dialog spinner popover calendar
```

**Component mapping:**

| Current UI Element | shadcn Component |
|---|---|
| `<button>` Search/Edit/Update/Cancel | `Button` (variants: default, outline, destructive, ghost) |
| `<table>` teams table | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` |
| `<select>` time dropdowns | `NativeSelect` with `NativeSelectOptGroup` (supports optgroups for MORNING/AFTERNOON/EVENING) |
| `.status-badge` Published/Unpublished | `Badge` (variant: default green / secondary yellow) |
| `.warning` banner | `Alert` (variant: warning) |
| `.unmatched-shifts` expandable section | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` |
| `.modal-overlay` loading/success/error | `Dialog`, `DialogContent` + `Spinner` |
| `<input type="date">` | `Popover` + `Calendar` (shadcn date picker pattern) |
| `.error` / `.success` messages | `Alert` (variant: destructive / default) |

## Step 3: Port core logic to `src/lib/`

Move from `main.js` into typed modules — **no logic changes, just restructuring**:

- **`api.ts`**: `apiRequest()`, `buildRequestId()`, `buildIdempotencyKey()`, `shouldSendIdempotencyKey()` — reads `VITE_API_BASE_URL` from `import.meta.env`
- **`errors.ts`**: `explainErrorCode()`, `explainApiError()`, `getErrorContext()`, `summarizeGroupedFailure()`, `reportErrorToOps()`, `showErrorAndReport()` (adapted to return values instead of DOM manipulation)
- **`time.ts`**: `formatTime24To12()`, `getTimeFromDateTime()`, `formatTime()`, `generateTimeOptions(minTime?)` (returns structured data for time select instead of creating DOM elements)

## Step 4: Build state management hook — `use-schedule.ts`

Single custom hook that manages all schedule state:

```ts
// State shape
{
  date: Date | undefined
  loading: boolean
  teams: Record<string, TeamData>
  unmatchedShifts: UnmatchedShift[]
  error: string | null
  success: string | null
  bulkEditMode: boolean
  editingTeam: string | null        // single-edit mode team name
  editedValues: Record<string, EditValues>  // tracks changes per team
  unmatchedEditing: number | null    // index of unmatched shift being edited
  modal: { message: string, type: 'loading' | 'success' | 'error' } | null
}
```

**Key actions exposed:**
- `searchSchedule(date)` — fetch + normalize
- `editTeam(name)` / `cancelTeamEdit(name)` / `updateTeam(name)`
- `enterBulkEdit()` / `cancelBulkEdit()` / `updateAllTeams()`
- `editUnmatched(index)` / `cancelUnmatched(index)` / `updateUnmatched(index)`

## Step 5: Build components top-down

### 5a. `SchedulePage.tsx` — main layout
- Contains SearchBar, Alert messages, UnmatchedBanner, BulkControls, TeamsTable, OperationModal
- Wires the `useSchedule` hook state to child components

### 5b. `SearchBar.tsx` — date picker + search
- shadcn `Popover` + `Calendar` for date selection (replaces `<input type="date">`)
- shadcn `Button` for Search
- Preserves: Enter key triggers search, auto-load from `?date=` URL param

### 5c. `TeamsTable.tsx` + `TeamRow.tsx` — main table
- shadcn `Table` components for structure
- Each `TeamRow` renders display mode or edit mode based on state
- Edit mode: `TimeSelect` + `StatusSelect` inline, Update/Cancel buttons
- Preserves: yellow highlight on edited rows (`bg-amber-50`), disabled Edit buttons during bulk edit

### 5d. `TimeSelect.tsx` — time dropdown
- Uses shadcn `NativeSelect` + `NativeSelectOptGroup` + `NativeSelectOption`
- Three groups: MORNING (6AM-11:45AM), AFTERNOON (12PM-5:45PM), EVENING (6PM-11:45PM)
- 15-minute intervals
- Accepts `minTime` prop to filter end times after start time
- **Critical UX**: When start time changes, end time dropdown regenerates with filtered options

### 5e. `StatusSelect.tsx` — status dropdown
- `NativeSelect` with Publish/Unpublish options

### 5f. `StatusBadge.tsx` — status indicator
- shadcn `Badge` with green dot for Published, yellow dot for Unpublished

### 5g. `UnmatchedBanner.tsx` + `UnmatchedRow.tsx`
- shadcn `Alert` wrapper with `Collapsible` for expand/collapse
- `CollapsibleTrigger` with arrow rotation (CSS transform via Tailwind)
- Nested `Table` inside `CollapsibleContent` for unmatched shifts
- Each `UnmatchedRow` has same edit pattern as `TeamRow`

### 5h. `BulkControls.tsx`
- Edit All / Update All / Cancel buttons using shadcn `Button` variants
- Visibility toggles based on `bulkEditMode` state

### 5i. `OperationModal.tsx`
- shadcn `Dialog` (controlled open/close via state)
- Shows `Spinner` for loading, checkmark for success, X for error
- Auto-dismisses after success/error (setTimeout)

## Step 6: Styling with Tailwind + Inter

- Import Inter font in `index.css`:
  ```css
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  ```
- Set `font-family: 'Inter', sans-serif` as default in Tailwind config
- Use shadcn's neutral color palette (zinc/slate grays)
- Status colors: green for published, amber for unpublished/warning, red for errors
- Card container: `rounded-lg border bg-card shadow-sm`
- Table: clean borders, subtle row hover (`hover:bg-muted/50`)
- Buttons: shadcn variants (primary for Search, outline for Edit, destructive for errors)

## Step 7: Update deployment

### `netlify.toml`
```toml
[build]
  base = "app/ui"
  command = "npm run build"
  publish = "dist"

[build.environment]
  VITE_API_BASE_URL = "https://sling-scheduling-89502226654.us-east1.run.app"
```

### `.github/workflows/deploy-ui-netlify.yml`
- Add `npm ci && npm run build` step before deploy
- Inject `VITE_API_BASE_URL` as build env var

## Step 8: Preserve Caspio integration

- In `App.tsx` or `SchedulePage.tsx`, read `?date=MM/DD/YYYY` from URL on mount
- Parse to ISO format and auto-trigger search (same as current `autoLoadFromURL()`)
- The Caspio launcher HTML at `integrations/caspio/manage-in-sling-launcher.html` remains unchanged

---

## UX Preservation Checklist

- [ ] Date selection + Search triggers schedule fetch
- [ ] Enter key on date input triggers search
- [ ] URL `?date=` parameter auto-loads schedule
- [ ] Teams table with all 7 columns
- [ ] Single-row edit mode with time/status dropdowns
- [ ] Bulk edit mode (Edit All → all rows editable)
- [ ] Edit All disabled during single-row edit
- [ ] End time filters based on start time selection
- [ ] Yellow highlight on rows with changes
- [ ] No-change detection (auto-cancels if unchanged)
- [ ] "Updating..." button text during submission
- [ ] Modal with loading → success/error for bulk operations
- [ ] Auto-dismiss modal after success/error
- [ ] Expandable warning banner with unmatched shifts count
- [ ] Arrow rotation animation on expand/collapse
- [ ] Unmatched shifts table with individual edit
- [ ] Green flash animation on successful unmatched update
- [ ] Error/success alert banners
- [ ] Error code → user-friendly message mapping
- [ ] Slack notification via error report API
- [ ] Error fingerprint dedup
- [ ] Idempotency keys on write operations
- [ ] X-Request-Id on all requests

---

## Verification

1. `cd app/ui && npm install && npm run dev` — should start Vite dev server
2. Set `VITE_API_BASE_URL` in `.env` for local testing
3. Test date selection → Search → table renders
4. Test single-row Edit → change time → Update
5. Test Edit All → modify multiple rows → Update All → modal flow
6. Test expandable warning banner + unmatched shift editing
7. Test `?date=02/08/2026` URL parameter auto-load
8. Test Enter key triggers search
9. `npm run build` produces working `dist/` output
10. Verify Netlify deploy config works with new build step
