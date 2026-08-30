# Review — SP4 (04-history-and-checks)

**Diff:** `main...feat/sp4-history-and-checks`
**Personas:** Bug Hunter, Security, Architect, Test Coverage (dev-review, opus)
**Implementation:** Tasks 1–16 (utils, components, `/week/[week]` route, root-page extension, and the
cross-SP requests R-A..R-D that edit SP3 files) + pure-util unit tests (Tasks 17–21); Task 22 (manual
smoke) deferred to the end-to-end real-user simulation.
Suite 357 → **361 tests green**; `npm run build` clean; dev SSR verified (root + `/week/[week]` render;
`/week/bad` → 400).

## Verdict: PASS (after two fix loops)

Initial verdict **NEEDS_CHANGES** (all four personas). All must-fix items fixed; a confirming re-review
found one *new* must-fix introduced by the first `/week/[week]` fix, which was then fixed and re-verified.
Confirmed **correct** on first pass: the D24 `weekFourCheck` (byte-identical copy + branch order), the
dirty-week reconciliation `$effect`s (no self-retrigger / no mount-fire), the R-B merge (markWeekDirty in
the success path, SP3 snapshot/revert hardening preserved), bounded `readWeek` count in `load()`, the
`/week/[week]` path-traversal gate, and no `$lib/weeks.js` leaking into the client bundle.

## Must-fix findings — all CLOSED

1. **`/week/[week]` crashed on a week containing a pending entry** (Bug Hunter). `LogRow → EntryPreview`
   calls `getWeekStore()`, but the route never provided a store → SSR 500 (only reachable when a past
   week has an unapplied pending entry, which the smoke test's empty weeks didn't hit). **Fix:** the route
   now `createWeekStore(data.week, data.config)` + `provideWeekStore` (commit `4761e72`).

2. **`/week/[week]` link-attach / reparse were non-reactive** (Bug Hunter). `rows` was `$derived` over
   SvelteKit's non-proxied `$state.raw` page data, so `row.item = updated` / `row.entry = entry` mutations
   did nothing → stale render / `item.link` null-deref. **Fix:** `rows` is now reactive `$state` seeded via
   `mergeLogRows([], [data.week])` with an `$effect` reseed on navigation (commit `4761e72`).

3. **`/week/[week]` re-implemented row-shaping** instead of reusing `mergeLogRows` (Architect). Closed by
   the same change — `buildRowsForWeek` deleted, `mergeLogRows` reused (commit `4761e72`).

4. **`link:"required"` tap didn't refresh the log/calendar/history** (Bug Hunter). TaskBar's item-creation
   branch called `replaceWeek` but not `markWeekDirty`, so the new item was invisible until reload. **Fix:**
   `store.markWeekDirty(store.weekKey)` added to that branch (commit `f8d07f3`).

5. **LinkAttachForm `href` `javascript:` XSS** (Security). The attached-item link rendered a raw config URL;
   an imported item link with a `javascript:` URL (the import route doesn't validate item link scheme) was a
   click-to-execute sink on both `/` and `/week/[week]`. **Fix:** `isSafeUrl` guard renders an inert `<span>`
   for unsafe/null links, mirroring SP3's PinnedLinks (commit `651c261`).

6. **Test-coverage gaps** (Test Coverage). Added: `weekFourCheck` `n=4` with ≥2 both-null weeks → `'sparse'`
   precedence over `baseline` (the exact fabricated-number failure the D24 check exists to prevent); `isoWeek`
   `dateToWeekKey` with the real (LA) timezone + string input; `historyStatus` `anyItems` disjunct; a
   Monday-start `calendarMonth` `days[0]` assertion; a `weekKeyToRange` invalid-key throw (commit `16070be`).

## New must-fix from the confirming re-review — CLOSED

7. **`/week/[week]` Apply/Discard was a visual dead-end + failed-apply inflation** (Bug Hunter re-review).
   Providing the store (fix #1) let `EntryPreview.apply/discard` mutate the store, but the page still rendered
   metrics/bars from the static `data.week`, and nothing on the route subscribed to the dirty signal — so an
   apply showed no change, and because `createWeekStore`'s internal `week` proxied the *same* object as
   `data.week`, a failed apply left `data.week` visually inflated (server stays correct + idempotent — no
   persisted corruption). **Fix:** the detail page now renders metrics/bars from `store.week` (single source of
   truth) and reconciles on a dirty-week `$effect` (refetch → `replaceWeek` → reseed `rows`); `WeekSnapshotBar`
   syncs its displayed count to its `counts` prop (commit `dc9dd04`).

## Additional hardening (folded in)

- **`res.ok` guards** on the item-link PATCH (LinkAttachForm) and the required-link tap (TaskBar) so a failed
  write can't set `row.item = undefined` and later null-deref (commit `9dbf749`).
- **`isSafeUrl` rejects protocol-relative `//host`** (offsite-navigation) in both LinkAttachForm and PinnedLinks
  (commit `678499e`).
- **Extracted the triplicated `formatRange`** helper to `src/lib/utils/formatRange.js`, reused by HistoryStrip,
  DiaryBox, and the `/week/[week]` page (commit `a32b5a0`).

## Considered / accepted (non-blocking)

- **MonthCalendar `seedWeeks` fabricates week stubs** from `buildCalendarMonth`'s derived counts to re-run the
  builder on month-navigation (both Bug Hunter and Architect noted). Latent only because grid weeks past the
  month end are always future-dated (entries capped at today). Accepted — reworking the calendar's client-nav
  data flow is out of proportion to the risk.
- **`isoWeek.dateToWeekKey` noon-UTC anchoring** shifts a date-string's week for UTC±12 timezones (advisory
  label only; routing uses the server's own value). Matches SP1's server logic; the app is single-timezone
  (America/Los_Angeles). Documented as a known limitation; the LA path is tested.

## Known out-of-scope follow-up (SP1/SP2)

- Server-side `assertValidLink` / the import route don't validate a link's URL scheme — a defense-in-depth
  follow-up for SP1/SP2. The SP4-scoped render guard (finding #5) closes the client XSS.

## Next step

SP4 clear to land. Squash-merge `feat/sp4-history-and-checks` into `main`; then the combined deep +
adversarial review, real-user simulation, edge-case sweep, and CI wiring.

## Changelog
- 2026-08-29 19:00 — 4-persona review (NEEDS_CHANGES ×4), fix loop (6 must-fixes + coverage), confirming
  re-review (Security PASS; Bug Hunter found a new must-fix on the /week detail store consistency), second
  fix loop, final PASS. Synthesized by the orchestrator.
