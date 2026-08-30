# Review — SP3 (03-week-view-ui)

**Diff:** `main...feat/sp3-week-view-ui`
**Personas:** Bug Hunter, Security, Architect, Test Coverage (dev-review, opus)
**Implementation:** Tasks 1–13 (Svelte 5 UI) + pure-util unit tests (Tasks 14–16); Tasks 17–20 are
**manual** verification, deferred to the end-to-end real-user simulation.
Suite 289 → **315 tests green** after fixes; `npm run build` clean; dev-server SSR renders the full
week view (verified via HTTP).

## Verdict: PASS (after one fix loop)

Initial verdict **NEEDS_CHANGES** (all four personas). All must-fix items fixed on the branch and
confirmed by a Bug Hunter re-review (**PASS**, no new bugs). The single most safety-critical piece —
the retro-logging week-key fix (apply/discard/reparse target the entry's own week, never the
displayed week) — was verified **correct** by both Bug Hunter and Architect.

## Must-fix findings — all CLOSED

1. **MetricsRow cleared a metric to `0`, not `null`** (Bug Hunter). Svelte 5 binds an emptied
   `<input type="number">` to `null`; the guard missed `null` and `Number(null) === 0`, so the metric
   became `0`, rendered `0`, and was unclearable. **Fix:** guard now treats `''`/`null` as clear-to-null
   and ignores non-finite input (commit `02d6cf4`).

2. **DiaryBox `save()`/`reparse()` had no error handling** (Bug Hunter). A non-2xx (e.g. a 400 from an
   emptied date field, or any 5xx) destructured `undefined`, **wiped the typed diary text**, threw, and
   left `phase` stuck at `'saving'` — the box locked until a full reload. **Fix:** Save gated on
   `date && text.trim()`; both handlers wrapped in try/catch with a `response.ok` check; on failure the
   phase is restored (`idle`/`failed`) and text is **never** cleared (it is cleared only after a verified
   2xx + parsed entry). Retro-logging preserved (commit `02d6cf4`).

3. **EntryPreview summary re-derived clamp arithmetic inline against the displayed week** (Architect +
   Bug Hunter). `Math.max(0, store.week.counts[id] + delta)` duplicated `applyLocal` (defeating Task 9's
   whole purpose) and showed the *wrong week's* numbers for a back-dated entry. **Fix:** imports
   `bumpLocalCount`; live week shows `before→after` via `bumpLocalCount({...store.week.counts}, …)`;
   cross-week shows signed **deltas only** (no fabricated baseline); metrics stay `→absolute`
   (commit `17b5255`).

4. **PinnedLinks `href` `javascript:` XSS** (Security). `href={link.url}` rendered a raw config URL;
   an imported config bundle could set `url: "javascript:…"` that executes in-origin on click. **Fix:**
   `isSafeUrl()` renders an `<a>` only for `http(s)`/root-relative URLs; anything else falls back to the
   existing inert `<span>` (commit `c906ba2`).

5. **applyLocal `bumpLocalCount` drifted from SP1 on non-integer deltas + coverage gaps** (Test Cov).
   SP1's `bumpCount` throws on a non-integer delta; the mirror silently produced `{a:3.5}`. **Fix:** the
   mirror now no-ops on a non-integer delta (rejects like SP1 without throwing); added parity + missing-key
   (`?? 0`) tests (commit `9680739`).

6. **weekKeyFmt error branches untested** (Test Cov). The Thursday-year/out-of-range guard that
   distinguishes `formatWeekRange` from a naive impl had no test. **Fix:** added `formatWeekRange('2025-W53')`
   throws (52-week year) + malformed-input cases (commit `9680739`).

## Additional hardening (from the confirming re-review)

- **EntryPreview `apply()` now reverts on failure** (commit `0fe26ef`). Previously a failed apply left the
  optimistic counts applied with the button live (double-count/stale risk — the same class as #2). Now it
  snapshots the week before the optimistic merge, checks `response.ok`, restores the snapshot on failure,
  and only calls `onResolved` on success.

## Considered and accepted (non-blocking)

- **`+page.svelte` dropped the config-error `field` line** (Task 13 microcopy pass; Architect note).
  Accepted: PRD §6.8's copy table is the authority for the three-line panel, and SP1's `ConfigError`
  message already names the field, so no information is lost.
- **Cross-component optimistic staleness** (Bug Hunter note): a sibling `TaskBar`/`MetricsRow` flush that
  lands with a pre-PATCH snapshot can momentarily revert another control's optimistic value on-screen; data
  is safe server-side and self-heals on the next round-trip/reload. Inherent to the whole-week
  `replaceWeek` optimistic-UI model; not worth locking for a single-user tool.
- **Silent save/reparse failure** (Bug Hunter note): text is preserved and the box is usable, but there is
  no on-screen signal. Left as-is to avoid introducing copy outside §6.8's table.

## Known out-of-scope follow-up (not SP3)

- **Built adapter-node server can't find `config/`.** `src/lib/config.js` computes `CONFIG_PATH` from
  `__dirname`, which under the bundled `build/` output resolves to `build/config/config.json` (absent), so
  `node build/index.js` renders the config-error branch. `npm run dev` works (real `src/lib`). This is an
  SP1 (`config.js` path resolution) / SP5 (deployment) concern — flagged for the owner; the real-user
  simulation runs against `npm run dev`.

## Next step

SP3 clear to land. Squash-merge `feat/sp3-week-view-ui` into `main`; proceed to SP4.

## Changelog
- 2026-08-29 17:20 — 4-persona review (NEEDS_CHANGES ×4), fix loop (6 must-fixes + apply() hardening),
  Bug Hunter confirming re-review (PASS). Synthesized by the orchestrator.
