# Review — SP6 (06-ui-redesign)

**Diff:** `main...feat/ui-redesign`
**Personas:** Bug Hunter, Security, Architect, Test Coverage (dev-review, opus) + a Bug Hunter confirming re-review.
**Implementation:** 28 code tasks (Tailwind v4 + DaisyUI foundation → schema/API contracts → tested pure
utils/server/store → DaisyUI components → page wiring → regression). Task 29 (manual smoke in both themes)
is a human step — see below.
Suite 470 → **483 tests green**; `npm run build` clean; dev SSR renders the full redesign (`/` and
`/week/[week]` → 200, real week view, all SP6 markers).

## Verdict: PASS (after one fix loop + a confirming re-review)

Initial verdict **NEEDS_CHANGES** (Bug Hunter, Architect, Test Coverage; Security PASS). All must-fix items
fixed; a Bug Hunter confirming re-review then found one new edge introduced by the import-sync fix, which
was fixed and verified. **Awaiting human visual sign-off (Task 29) before merge.**

## Must-fix findings — all CLOSED

1. **Diary Apply never adjusted all-time totals** (Bug Hunter + Architect). `EntryPreview.apply()` replaced
   the live week but never read the response or adjusted totals, so `TotalsRow` under-reported every
   diary-applied increment until reload (worst on retro Apply). **Fix:** on success, parse
   `{ entry, alreadyApplied }` and adjust all-time totals by `entry.applied.counts` only when
   `alreadyApplied === false` (no double-count on a repeat, no adjust on failure).

2. **Post-import `invalidateAll()` was a no-op for the redesigned page** (Bug Hunter + Architect). The store
   and calendar are built once via `untrack(...)`; nothing synced the reloaded `data` back in, so an import
   left totals/config/week/lanes/calendar pre-import. **Fix:** a `$effect` in `+page.svelte` pushes fresh
   `data.week/config/allTimeTotals/activityWeeks` into the store on `data` identity change. It reads only
   `data` and writes store `$state` (no read-write cycle → cannot loop), and normal +/- taps and diary
   Applies update the store directly (not `data`), so it can't clobber optimistic state.

3. **`allTimeTotals` tests exercised only the unused array overload** (Test Coverage) — production calls the
   config-first `sumAllTimeTotals(config, weeks)`, so the shipped branch was untested (a green suite could
   hide a totals-zeroing regression). **Fix:** added config-first cases (zero-init, orphan exclusion,
   malformed/absent `config.tasks`).

## New must-fix from the confirming re-review — CLOSED

4. **`replaceWeek` left `store.weekKey` stale** (Bug Hunter re-review). The new import-sync effect can push a
   week for a *different* key (an imported bundle can change `config.timezone`, changing the derived
   `weekKey`), leaving `weekKey` stale → +/- item taps would write to the wrong week file and `isLiveWeek`
   would mis-gate. **Fix:** `replaceWeek` now sets `weekKey` to the week's own key (a no-op for every
   same-week caller).

## High-value notes folded in

- **Items API returned the raw week, not projected** — `store.week` changed shape after the first +/-.
  Now `POST`/`DELETE /items` wrap the response in `projectWeekForConfig`.
- **One color vocabulary** — the `colorRole → class` map was copy-pasted across ~4 surfaces and
  `call_ask`'s role was undefined (uncolored symbol). Centralized in `taskVisuals.js` (call_ask → DaisyUI
  `warning`), reused by TotalsRow/WeekGoals/WhatHappened/AppHeader/TaskBar; the TaskBar symbol is now colored.
- **URL guards consolidated** onto `safeUrl.js` (`isAllowedUrl(value, { allowRelative })`), replacing the
  divergent inline copies in LinkAttachForm/AppHeader; default rejection behavior unchanged.
- **Tests added:** `DELETE /api/week/[week]/items` in the path-traversal key-guard matrix; an
  `activityTally` cross-week item-id de-dup case.
- **Calendar initial slices** now cover the full 42-day grid (matching the calendar's own grid) so the first
  paint isn't missing the trailing row's week.

## Security — PASS (no changes needed)

All freeform-`note`/link href sinks (ItemRemoveDialog, WhatHappened, LinkAttachForm, AppHeader) render as an
`<a href>` only when the value passes the strict `isAllowedUrl` guard (http/https, rejects
`javascript:`/`data:`/protocol-relative/backslash/control-char — 31 payloads verified), else escaped text via
`{}` (no `{@html}` anywhere). Every `[week]` segment is `isValidWeekKey`-gated before any fs access; config
links are validated server-side. Calendar week keys are machine-generated.

## Retro-logging / degraded mode — verified preserved

The DaisyUI restyle of DiaryBox/EntryPreview is style-only: apply/discard/reparse still target the entry's
own week (`entryWeekKey`), `isLiveWeek` gates the on-screen mutation + reconciling GET, snapshot/revert on
failure, `response.ok` checks, and the busy guard are intact; degraded-mode verbatim save is unchanged. Item
add/remove are atomic (all-or-nothing) with exact count reconciliation preserving the diary residual.

## Remaining human step (Task 29) — manual smoke in both themes

Not automatable here (no component-test framework by design). Recommended before/after merge, in both
`cupcake` and `synthwave`: the two in-place header dropdowns + Keyboard legend; the +/- dialogs (multi-note
add, checkbox remove, count-positive/item-zero empty state); lane min/target/linePct editor; calendar
click/shift-range across months + the read-only day/range tally; import refresh; and the degraded-mode
(LLM-off) manual paths. And — most importantly — a **visual sign-off on the cupcake/synthwave theme choice**
(easy to swap to another DaisyUI pair if you don't like it).

## Changelog
- 2026-08-31 — 4-persona review (NEEDS_CHANGES), fix loop (M1–M3 + notes), Bug Hunter confirming re-review
  (found + fixed M-A weekKey lockstep). 483 tests green, build clean, SSR verified. Synthesized by the
  orchestrator. Awaiting human visual sign-off (Task 29) before merge.
- 2026-09-01 — **Iteration 1** (owner feedback on the branch; PRD §10). Calmer **nord/dim** theme replacing
  cupcake/synthwave + muted teal/indigo/gold gradient and calm task-symbol colors; larger/most-prominent
  all-time totals and slightly larger this-week goals; calendar **Today** button; **`+` always counts on
  click** (bare item POST, optional link popup gated by a new per-task **`showPopup`** config field; note
  becomes optional/bare-item; Discard/Escape never undoes the +1); **`−`** opens the remove popup only when
  removable manual items exist; lane editor exposes `showPopup`. Focused Bug Hunter re-review → 2 fixes
  (note-Save now marks the week dirty so "What happened" refreshes; rapid `+` taps serialize into ≤50-item
  batches so none are dropped and there's no same-week write race). **502 tests green**, build clean, SSR
  verified (`dim` default, no neon). Still awaiting human visual sign-off before merge.
