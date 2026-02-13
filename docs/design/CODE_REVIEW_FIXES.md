# Code Review Fixes Tracker

Identified: 2026-02-12
Status: Pending

Items are ordered by user-perceived impact. Check off items as they are completed.

---

## CRITICAL

### 1. [x] Caspio client has no timeout — requests hang forever
- **File:** `services/api/src/clients/caspio.js`
- **Status: FIXED** — Reviewed 2026-02-12
- **What was done:**
  - `fetchWebhookToken` (now lines 72-112): Added `AbortController` + `setTimeout(env.requestTimeoutMs)` with `signal` passed to `fetch`. AbortError caught and thrown as `ApiError` with `statusCode: 504, code: 'CASPIO_TIMEOUT'`. `clearTimeout` in `finally` block.
  - `request` (now lines 128-175): Same pattern. The 401/403 retry path (line 147) correctly calls `clearTimeout(timeout)` before recursing, so the recursive call gets its own fresh timeout budget. `signal` passed to fetch, AbortError caught, `finally` cleanup.
  - Both use `env.requestTimeoutMs` (default 12000ms per `env.js:38`), matching the Sling client.
- **Review notes:** All 7 verification criteria passed. Pattern matches `sling.js:36-47` correctly while adapting to Caspio's different auth retry architecture (single-shot with token refresh vs Sling's retry loop). No regressions to token extraction, caching, query building, or public API methods. The `parseResponseBody` call runs under the same timeout (consistent with Sling behavior). Worst-case for a 401 retry is ~3x `requestTimeoutMs` (original + token fetch + retry), each with independent timeouts.

### 2. [x] Unhandled async rejection can crash the process
- **File:** `services/api/src/server.js`, `services/api/src/app.js`
- **Status: FIXED** — Reviewed 2026-02-12
- **What was done (3 layers of defense):**
  1. **`server.js:28-36`** — `.catch()` on handler promise. Catches any rejection that escapes `routeRequest`'s try/catch. Checks `res.headersSent` before writing a minimal 500 response; calls `res.destroy()` if headers already sent.
  2. **`server.js:23-25`** — `process.on('unhandledRejection')` safety net. Logs at `level: 'fatal'` without calling `process.exit()`, so the server continues running. Registered after startup `await`s so startup failures still crash normally.
  3. **`app.js:460-462`** — `if (!res.headersSent)` guard around `sendError` in the catch block. This is the primary fix — prevents `res.writeHead()` from throwing `ERR_STREAM_DESTROYED` when the client has disconnected, which was the root cause of the unhandled rejection.
- **Review notes:** All 8 verification criteria passed. Structured JSON logging matches existing codebase patterns. All 28 existing tests pass with no regressions. The outer `.catch()` response intentionally omits CORS headers and `requestId` — acceptable for a last-resort safety net since those values aren't reliably available at that layer.
- **Follow-up completed:** `res.destroy()` added to `else` branch of `app.js:462-463`. Both the inner layer (`app.js` catch) and outer layer (`server.js` `.catch()`) now explicitly clean up connections when `headersSent` is true.

### 3. [x] Sequential bulk updates — O(N) waterfall of groups
- **File:** `services/api/src/routes/updates.js`
- **Status: FIXED (with defect found)** — Reviewed 2026-02-12
- **What was done:**
  - Added module-level `const CONCURRENCY = 4` (line 169). Plan suggested 5; 4 is a conservative choice that still provides ~3.3x speedup.
  - **`processFlatUpdates` (lines 171-216):** Sequential for-loop replaced with batched `Promise.allSettled`. Pre-allocated results array (`new Array(updates.length)`), global index computed as `start + batchIndex`, results placed at correct positions. Inner async callback has try/catch so it never rejects — `settled.value` is always defined. `buildBulkSummary` called correctly on the full array.
  - **`processGroupedUpdates` (lines 337-400):** Same batched `Promise.allSettled` pattern. Groups processed in parallel batches of 4.
  - **`processAtomicGroup` (lines 250-335):** Correctly left unchanged — snapshot loop (278-285), update loop (287-300), and `rollbackAtomicSuccesses` (218-248) all remain sequential with `await` inside for-loops. Atomic rollback semantics preserved.
- **Performance:** 10 teams (the common case): old = 40 sequential HTTP calls (~8s), new = 3 batches x 4 rounds = ~12 rounds (~2.4s). ~3.3x speedup.
- **Review notes:** Index tracking, pre-allocation, `toSuccess`/`toFailure` integration, and `buildBulkSummary` all verified correct. `updateSingleOccurrence`, `updateBulkOccurrences`, and `normalizeSingleUpdateError` are all unchanged.
- **Defect fixed:** Non-atomic branch in `processGroupedUpdates` (lines 354-384) now wrapped in try/catch. On `processFlatUpdates` throw, returns a well-formed failure result object (`status: 'failed'`, matching the shape of other group results). The `batch.map()` callback now never rejects, so `settled.value` is always defined and downstream `results.filter(...)` is safe.

### 4. [x] `searchSchedule` clears the entire table before API responds
- **File:** `app/ui/src/hooks/use-schedule.ts` (lines 123-130)
- **Status: FIXED** — Reviewed 2026-02-12
- **What was done:**
  - Removed `teams: {}` and `unmatchedShifts: []` from the initial `setState` in `searchSchedule` (lines 123-130). Only `loading: true` and edit-state resets remain.
  - No other changes needed — the success path (lines 139-145) already atomically replaces data when the response arrives, and the error path (line 149) sets `loading: false` without touching data.
- **Review notes:** Minimal 2-line removal. All 6 call sites of `searchSchedule` verified — none separately clear data before calling it (`updateTeam` line 231, `updateAllTeams` line 347, `SchedulePage.tsx` URL auto-load and `handleSearch`). Grep for `teams: {}` across `app/ui/src` confirms only the initial useState value at line 48 sets an empty teams object, which is correct.
- **UX verified across all scenarios:**
  - Initial search: No old data exists (`teams` starts as `{}`), so the table area is naturally empty during loading. Correct.
  - Post-edit reload: Old data stays visible while `loading: true`. Fresh data replaces it atomically on success. No blank flash.
  - Failed reload: Old data stays visible, `loading: false`, error banner displays. User can see their data and the error.
- **No regressions:** `ScheduleState` interface unchanged. `normalizeScheduleToUi` unchanged. No other functions in the hook were modified.

### 5. [x] Bulk edit error auto-dismisses and destroys all user edits
- **File:** `app/ui/src/hooks/use-schedule.ts` (lines 366-375)
- **Status: FIXED** — Reviewed 2026-02-12
- **What was done:**
  - Partial failure `setTimeout` (lines 373-375) now only clears `modal: null`. The `bulkEditMode: false` and `editedValues: {}` assignments were removed from the callback. User stays in bulk edit mode after a partial failure and can retry or fix values.
  - Success path (lines 358-364) still correctly exits bulk edit mode (`modal: null, bulkEditMode: false, editedValues: {}`). This is correct — on full success, the edit session should end.
  - Total failure path (lines 398-404) was already correct — only clears `modal: null`.
- **Review notes:** The fix exactly matches the recommended change. All three paths now behave consistently:
  - **Full success:** Exit bulk edit, clear edits. Correct.
  - **Partial failure:** Dismiss modal, stay in bulk edit. User sees error banner via `summarizeGroupedFailure` (line 377) and can adjust values. Correct.
  - **Total failure:** Dismiss modal, stay in bulk edit. User sees error banner and can retry. Correct.
- **Not implemented (acceptable):** The two optional suggestions (surface which specific teams failed, cleanup `setTimeout` on unmount) were not implemented. These were enhancement suggestions, not correctness fixes. The core data-loss bug is resolved.

### 6. [x] No mutation guard for single-team edits
- **Files:** `app/ui/src/hooks/use-schedule.ts`, `app/ui/src/features/schedule/SchedulePage.tsx`, `TeamsTable.tsx`, `BulkControls.tsx`
- **Status: FIXED** — Reviewed 2026-02-12
- **What was done:**
  - Added `mutating: boolean` to `ScheduleState` interface (line 16) and initial state (line 49, default `false`).
  - **`updateTeam` (line 207):** Sets `mutating: true` before the try block. `finally` block (lines 281-283) sets `mutating: false`. Covers both success and error paths.
  - **`updateAllTeams` (lines 322-326):** Sets `mutating: true` alongside the loading modal. `finally` block (lines 422-424) sets `mutating: false`.
  - **`updateUnmatched` (line 460):** Sets `mutating: true` before try. `finally` block (lines 509-511) sets `mutating: false`.
  - **UI wiring in `SchedulePage.tsx`:**
    - `SearchBar`: `loading={state.loading || state.mutating}` (line 151) — piggybacks on the existing `loading` prop to disable the search button and auto-search during mutations.
    - `BulkControls`: `disabled={state.mutating}` (line 246) — disables "Edit All Teams" button during any mutation.
    - `TeamsTable`: `mutating={state.mutating}` (line 257) — new prop passed through.
  - **`TeamsTable.tsx`:** New `mutating?: boolean` prop (line 15). Passes `disabled={mutating || (editingTeam !== null && editingTeam !== teamName)}` to each `TeamRow` (line 80). This disables Edit buttons on all rows during mutations AND when another team is being edited.
  - **`BulkControls.tsx`:** New `disabled?: boolean` prop (line 7), applied to the "Edit All Teams" button (line 31).
  - **`TeamRow.tsx`:** No changes needed — already had a `disabled` prop on the Edit button.
  - **`SearchBar.tsx`:** No changes needed — already disabled via the `loading` prop, and the auto-search guard checks `!loading`.
- **Review notes:** All `finally` blocks correctly reset `mutating: false`, preventing stuck states on errors. The double-reload race (user clicks Search during in-flight mutation) is now blocked because the search button is disabled. The `editingTeam !== null && editingTeam !== teamName` condition in TeamsTable is a nice addition — prevents editing multiple teams simultaneously even when no mutation is in flight.
- **Minor gap:** `UnmatchedBanner` does not receive the `mutating` prop. Its Edit buttons remain clickable during mutations. Low risk because unmatched shifts use a different update path (`updateUnmatched`) that sets its own `mutating` flag — the race condition is the same as the team case but unmatched edits are less common. Consider wiring this in a follow-up.

### 7. [ ] Hardcoded `-05:00` fallback wrong during EDT
- **File:** `services/api/src/domain/timezone.js` (line 38)
- **Confirmed, but low-risk.** The fallback only fires when BOTH `dtstart` and `dtend` lack timezone offsets. Sling returns ISO 8601 datetimes with offsets (e.g. `2026-02-12T09:00:00-05:00`), so the `OFFSET_REGEX` on lines 32-35 should almost always match. The bug is dormant unless Sling changes its datetime format.
- **What to change (pick one):**
  - **Option A — Dynamic offset (preferred):** Replace the hardcoded fallback with a computed offset using `env.timezone` (`America/New_York`):
    ```js
    // Derive the current UTC offset for the configured timezone
    function getCurrentOffset(timezone) {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset',
      }).formatToParts(now);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      // tzPart.value is like "GMT-05:00" or "GMT-04:00"
      return tzPart?.value?.replace('GMT', '') || '-05:00';
    }
    ```
    Then pass `env.timezone` to `resolveOffset` and use `getCurrentOffset(timezone)` as the fallback.
  - **Option B — Throw instead of guessing:** Replace `return '-05:00'` with a thrown error:
    ```js
    throw new ApiError('Shift datetime missing timezone offset', {
      statusCode: 422,
      code: 'MISSING_TIMEZONE_OFFSET',
      details: { dtstart: shift?.dtstart, dtend: shift?.dtend }
    });
    ```
    This makes the failure explicit rather than silently writing wrong data. Preferred if you believe offset-less datetimes from Sling indicate a data integrity issue.
  - **Note:** `resolveOffset` is called from `buildOutboundShift` in `updates.js:127`. The offset is used to reconstruct `dtstart`/`dtend` when the user changes shift times. A wrong offset means the shift gets written to Sling at the wrong UTC instant.

---

## IMPORTANT

### 8. [ ] `OperationModal` has no close button — user can get permanently trapped
- **File:** `app/ui/src/features/schedule/OperationModal.tsx`
- **Impact:** The modal is opened with `open={true}` but has no `onOpenChange` handler. If the auto-dismiss `setTimeout` fails (JS error, component doesn't unmount cleanly), the modal stays open forever with no way to close it. The loading modal during bulk updates is especially dangerous — if the API hangs, the user can't interact with the page at all.
- **Fix:** Add `onOpenChange` that allows dismissing error-type modals. For loading type, add a fallback timeout (e.g. 30s) with "Taking longer than expected" messaging.

### 9. [ ] Caspio token refresh thundering herd under concurrent requests
- **File:** `services/api/src/clients/caspio.js` (lines 59-107)
- **Impact:** `tokenState` is shared mutable state. When the token expires, all concurrent requests call `fetchWebhookToken` simultaneously — N redundant token requests. Non-atomic writes to `tokenState.token` and `tokenState.expiresAt` can create mismatched state.
- **Fix:** Use a pending-promise pattern: store the in-flight refresh promise and have concurrent callers await it instead of starting their own.

### 10. [ ] `getUsersByIds` could run parallel with `getEntertainerSlingIds`
- **File:** `services/api/src/routes/schedule.js` (lines 46-79)
- **Impact:** These two calls run sequentially but are independent (both depend on Phase 1 results, not each other). Adds 200-500ms unnecessary latency to every page load.
- **Fix:** Wrap both in `Promise.all()`.

### 11. [ ] Unmatched shift editing uses array index as ID
- **File:** `app/ui/src/hooks/use-schedule.ts` (lines 422-503)
- **Impact:** If `unmatchedShifts` array is reordered between clicking "Edit" and "Update" (e.g. by a concurrent refresh), the index references the wrong shift. User could update a different person's shift.
- **Fix:** Use `shift.id` as the editing identifier instead of array index.

### 12. [ ] `shift.user.id` accessed without optional chaining — crashes endpoint
- **File:** `services/api/src/routes/schedule.js` (line 78)
- **Impact:** A single malformed Sling shift (missing `user` field) throws `TypeError`, crashing the entire `/api/schedule` request. All data for that date becomes unavailable. Earlier code on line 64-65 does use optional chaining, suggesting this is an oversight.
- **Fix:** Add optional chaining: `shift?.user?.id`, filter out nulls.

### 13. [ ] Time dropdown excludes midnight-6AM — overnight shifts broken
- **File:** `app/ui/src/lib/time.ts` (lines 41-45)
- **Impact:** `generateTimeOptions` only covers 6:00 AM - 11:45 PM. Overnight shifts ending between midnight and 5:59 AM can't be displayed or edited correctly.
- **Fix:** Add an early morning range (0:00-5:45), or ensure the current value is always present in options even if outside standard ranges.

### 14. [ ] `assertTimeRange` rejects overnight shifts as invalid
- **File:** `services/api/src/domain/timezone.js` (lines 58-64)
- **Impact:** Simple string comparison `startTime < endTime` means any shift crossing midnight (e.g. 22:00-02:00) fails validation with a 400 error. Users can't update overnight shifts via the API.
- **Fix:** If overnight shifts are valid, adjust validation logic. If not, document this in the error message.

### 15. [ ] Unescaped IDs in Caspio query string
- **File:** `services/api/src/clients/caspio.js` (line 155)
- **Impact:** Entertainer IDs are interpolated into a Caspio query with single-quote wrapping but no escaping. A single quote in an ID (e.g. `O'Brien`) breaks the query, causing `/api/schedule` to fail for that date.
- **Fix:** Escape single quotes: `String(id).replace(/'/g, "''")`
