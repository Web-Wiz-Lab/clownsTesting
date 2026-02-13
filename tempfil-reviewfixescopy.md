# Code Review Fixes Tracker

Identified: 2026-02-12
Status: Pending

Items are ordered by user-perceived impact. Check off items as they are completed.

---

## CRITICAL

### 1. [ ] Caspio client has no timeout — requests hang forever
- **File:** `services/api/src/clients/caspio.js` (lines 72, 114)
- **Confirmed:** Both `fetch()` calls have no `AbortController` or `signal`. Compare to `sling.js:37-46` which does it correctly.
- **Impact:** If Caspio stalls, the request hangs until Cloud Run's 5-minute timeout kills it. Users see an infinite spinner.
- **What to change:**
  - In `fetchWebhookToken` (line 72): wrap the `fetch(env.caspioTokenWebhookUrl, { method: 'GET' })` call with an `AbortController` + `setTimeout`, same pattern as `sling.js:37-38`.
  - In `request` (line 114): wrap the `fetch(url, { method: 'GET', headers: {...} })` call the same way.
  - Use `env.requestTimeoutMs` as the timeout value (already used by the Sling client).
  - On abort, throw `ApiError` with `statusCode: 504` and `code: 'CASPIO_TIMEOUT'`.
  - Always `clearTimeout` in a `finally` block to prevent leaks (see `sling.js:114-116`).
- **Reference pattern** — `sling.js:36-47`:
  ```js
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.requestTimeoutMs);
  try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  ```

### 2. [ ] Unhandled async rejection can crash the process
- **File:** `services/api/src/server.js` (line 23-24)
- **Confirmed:** `handler(req, res)` discards the promise. The `routeRequest` body in `app.js:253-461` is wrapped in try/catch, but the catch calls `sendError` -> `sendJson` -> `res.writeHead()`. If the client disconnected, `res.writeHead()` throws `ERR_STREAM_DESTROYED`, which escapes the catch and becomes an unhandled rejection. Node.js v20+ terminates the process on unhandled rejections.
- **Probability:** Low (requires client disconnect at exact wrong moment). **Severity:** High (kills all in-flight requests).
- **What to change:**
  - In `server.js:23-24`, add `.catch()` to the handler call:
    ```js
    const server = http.createServer((req, res) => {
      handler(req, res).catch((err) => {
        console.error(JSON.stringify({ level: 'error', msg: 'unhandled_request_error', error: err?.message }));
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ summary: 'failed', error: { code: 'INTERNAL_ERROR' } }));
        } else {
          res.destroy();
        }
      });
    });
    ```
  - Additionally, add a safety net in `server.js`:
    ```js
    process.on('unhandledRejection', (reason) => {
      console.error(JSON.stringify({ level: 'fatal', msg: 'unhandled_rejection', error: String(reason) }));
    });
    ```
  - In `app.js:460` (`sendError` inside catch), add a `res.headersSent` guard before calling `sendError`:
    ```js
    } catch (error) {
      console.error(...);
      if (!res.headersSent) {
        sendError(res, requestId, error, baseHeaders);
      }
    }
    ```

### 3. [ ] Sequential bulk updates — O(N) waterfall of groups
- **Files:** `services/api/src/routes/updates.js` (lines 179-195 AND lines 338-370)
- **Confirmed:** Both `processFlatUpdates` (line 179) and `processGroupedUpdates` (line 338) loop sequentially with `await` inside the loop.
- **Important context the reviewer missed:** The UI bulk edit flow (`use-schedule.ts:324-344`) sends each team as a separate group with `atomic: true`. So the primary bottleneck is `processGroupedUpdates` (line 338-370), not just `processFlatUpdates`. Each team = 1 group, each group = ~4 sequential Sling HTTP calls (2x getShiftById + 2x updateShift). 10 teams = 10 sequential groups = ~40 HTTP calls in waterfall.
- **What to change:**
  - **`processGroupedUpdates` (line 338-370):** The groups are independent (each targets a different team). Parallelize them with a concurrency limit. Each group's internal operations MUST stay sequential (atomic rollback depends on it). Example approach:
    ```js
    // Replace the sequential for-loop with:
    const CONCURRENCY = 5;
    const results = [];
    for (let i = 0; i < groups.length; i += CONCURRENCY) {
      const batch = groups.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((group, batchIdx) => {
          const groupIndex = i + batchIdx;
          const atomic = group?.atomic !== false;
          if (!atomic) {
            return processFlatUpdates({...}).then(flat => ({ index: groupIndex, ... }));
          }
          return processAtomicGroup({ group, groupIndex, slingClient, env, requestId });
        })
      );
      results.push(...batchResults);
    }
    ```
  - **`processFlatUpdates` (line 179-195):** Same pattern — parallelize with concurrency limit. Each item is independent (no rollback semantics in flat mode).
  - Do NOT parallelize the internal loop of `processAtomicGroup` (lines 269-291) — that must stay sequential for snapshot + rollback correctness.

### 4. [ ] `searchSchedule` clears the entire table before API responds
- **File:** `app/ui/src/hooks/use-schedule.ts` (lines 123-132)
- **Confirmed.** The `setState` call on line 123 immediately sets `teams: {}` and `unmatchedShifts: []` before the API call on line 136.
- **Trigger points:** This function is called on (a) initial date search, (b) after `updateTeam` succeeds (line 233), (c) after `updateAllTeams` succeeds (line 349). Cases (b) and (c) are the worst — the user just made an edit, sees success, then the table vanishes and reloads.
- **What to change:**
  - Remove `teams: {}` and `unmatchedShifts: []` from the initial setState (line 123-132). Keep only `loading: true` and the edit-state resets:
    ```ts
    setState((prev) => ({
      ...prev,
      loading: true,
      bulkEditMode: false,
      editedValues: {},
      editingTeam: null,
      unmatchedEditing: null,
    }));
    ```
  - The data replacement already happens on success (lines 141-147) — no change needed there.
  - On failure (line 151), the old data stays visible since we no longer cleared it. This is the correct behavior.

### 5. [ ] Bulk edit error auto-dismisses and destroys all user edits
- **File:** `app/ui/src/hooks/use-schedule.ts` (lines 360-370)
- **Confirmed.** On partial failure (line 360), the `setTimeout` at 2.5s sets `bulkEditMode: false, editedValues: {}`.
- **Ironic detail:** The total-failure path (lines 392-399) only clears `modal: null` and does NOT clear `bulkEditMode` or `editedValues`. So total failure preserves the user's edits, but partial failure destroys them.
- **What to change:**
  - **Partial failure (lines 360-370):** Remove `bulkEditMode: false` and `editedValues: {}` from the setTimeout callback. The modal can still auto-dismiss, but the user stays in bulk edit mode:
    ```ts
    setTimeout(() => {
      setState((prev) => ({ ...prev, modal: null }));
    }, 2500);
    ```
  - **Show which teams failed:** The `result.results` array contains per-group status. Surface this in the error message or state. The `summarizeGroupedFailure` call on line 372 already generates a message — consider including the failed group IDs (team names) in the UI error banner rather than only the modal.
  - **Cleanup the setTimeout:** Store the timer ID and clear it on unmount or next action. Simplest approach — store it in a ref, or clear it at the top of `updateAllTeams` before setting a new one.

### 6. [ ] No mutation guard for single-team edits
- **Files:** `app/ui/src/features/schedule/TeamRow.tsx` (line 60), `app/ui/src/hooks/use-schedule.ts`
- **Partially confirmed.** Bulk edits ARE guarded — the `OperationModal` (Radix Dialog with no `onOpenChange`) renders a blocking overlay that prevents all interaction. Single-team edits are NOT guarded.
- **What actually happens during a single-team edit:** `TeamRow.tsx:60-64` sets local `updating` state that disables that row's Update/Cancel buttons. But the SearchBar, date picker, "Edit All" button, and all other team rows' Edit buttons remain active. If the user clicks Search while a mutation is in-flight, `searchSchedule` fires, clears all state (`teams: {}`, edit modes reset), and the in-flight `updateTeam` callback tries to `searchSchedule` again on completion — causing a double-reload race.
- **What to change:**
  - Add `mutating: boolean` to `ScheduleState` (in `use-schedule.ts:13`).
  - Set `mutating: true` at the start of `updateTeam` (line 191), `updateAllTeams` (line 312), and `updateUnmatched` (line 437). Set `false` in both success and error paths.
  - Pass `mutating` through to `SchedulePage.tsx` and use it to disable:
    - `SearchBar` search button: pass `disabled={state.mutating}` (or reuse the existing `loading` prop).
    - `BulkControls` "Edit All" button: pass `disabled={state.mutating}`.
    - `TeamRow` Edit buttons: pass `disabled={state.mutating || state.editingTeam !== null}` via the existing `disabled` prop.
  - The `OperationModal` overlay already handles bulk edit blocking, so `mutating` is mainly for single-team and unmatched edits.

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
