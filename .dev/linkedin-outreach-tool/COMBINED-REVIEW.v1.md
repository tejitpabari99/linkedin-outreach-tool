# Combined Deep + Adversarial Review — LinkedIn Outreach Tool (SP2–SP4 + hardening)

**Date:** 2026-08-29
**Scope:** The whole app on `main` (SP1–SP4 combined), reviewed after SP2/SP3/SP4 each landed via
their own `dev-review` loop. This pass is the deeper cross-cutting + adversarial review the project
owner asked for, plus a real-user (degraded-mode) simulation, an edge-case sweep, and CI wiring.
**Branch:** `chore/ci-and-hardening` (squash-merged to `main`).

## Final scores (opus adversarial reviewers, after fixes)

| Lane | Initial | Final |
|---|---|---|
| Integration & correctness | 58/100 | **92/100** |
| Full-stack security | 84/100 | **93/100** |

Both comfortably clear the ≥85% bar. Every defect raised across three fix rounds was verified closed
against the current code (not the changelog), with no remaining exploitable issue and no silent
count-corrupting path on the normal single-user flow.

Suite: **387 tests green** (was 361 at SP4 merge). `npm run build` clean. Dev SSR verified. Real-user
degraded-mode simulation: **all core flows PASS**.

## Critical / must-fix defects found & fixed

- **C1 — `structuredClone(store.week)` threw `DataCloneError` on a Svelte 5 `$state` proxy**, running
  *before* the `try`, leaving `busy=true` and **permanently disabling Apply/Discard on the current
  week** (the flagship diary flow). This regression was introduced by SP3's own apply-revert hardening
  and survived every read-only per-SP review because there are no component tests and SSR doesn't click
  Apply — the adversarial reviewer caught it by executing the proxy clone. Fixed: `$state.snapshot(...)`.
- **C2 — diary date default/`max` used UTC**, not `config.timezone`, misfiling evening-PT entries into
  the next ISO week. Fixed (DiaryBox + the month calendar/`isToday`) to derive "today" from the config
  timezone.
- **C3 — root `load()` only caught `ConfigError`**, so one corrupt historical week file 500'd the whole
  home page. Fixed to substitute an empty week per unreadable historical file (display only).
- **C4 — a failed count PATCH was never retried** despite a "will retry" tooltip. Fixed with a
  reconcile-safe backoff retry (re-reads server truth, PATCHes only the residual → no double-count on a
  lost ack, and captures tap intent at failure time so a concurrent write can't drop the tap).
- **Security MEDIUM — `isSafeUrl` bypasses** (`/\evil.com`, and later `/⇥/evil.com` via WHATWG
  tab/newline stripping) → open redirect on a pinned/item link. Fixed with a URL-parse allowlist +
  C0-control-char rejection, in both render sinks, and pushed server-side into `validateConfig` and
  `assertValidLink` and the `import` route so no write path can persist a dangerous link.

## Regressions from the fixes — found & fixed

- **N1 (data loss)** — the C3 resilience fix made `GET /api/export/all` fabricate an empty week for a
  corrupt file, so a backup silently zeroed it and a re-import destroyed recoverable data. Fixed:
  corrupt weeks are omitted from the export and listed in `unreadableWeeks`; never synthesized. Test
  added (and the export test's incomplete `$lib/weeks.js` mock was completed).
- Routes now return a clean **400** for out-of-ISO-range keys and a generic **500** (no absolute-path
  leak) for a corrupt file, consistent with `GET /api/week`.
- **D24 honesty** — `weekFourCheck` could print "up from 0" when the prior 4-week window had no logged
  replies/calls. Fixed to treat a sparse prior window as `sparse`, not a fabricated comparison.

## Real-user simulation (degraded mode, LLM unavailable)

Drove the full journey over HTTP: degraded diary save (verbatim text persisted, `parseStatus:'failed'`,
no 20s hang), manual counts/metrics, over-decrement clamp, required-link item creation + link attach,
quota edit (+ invalid config rejected with the old config intact), export/import round-trip (+ malicious
`javascript:` import rejected, nothing written), retro-logging into a prior week (current week
untouched), navigation + edge keys (`bad-key`/`W54`/`W00` → 400, no 500s), apply/discard 409 in degraded
mode, delete-doesn't-reverse. **20 concurrent PATCHes → 20/20 applied, zero lost updates.** XSS payloads
correctly escaped. Verdict: **a real person can fully use the app in degraded mode; nothing is lost when
the parser is down.**

The simulation found one real data-correctness bug — **impossible calendar dates accepted** by
`POST /api/entry` (`2026-02-30` silently rolled to Mar 2 / W10; `0000-01-01` → 1901) because `Date.parse`
normalizes them and the earlier guard only checked the *derived week key*. Fixed with strict round-trip
calendar-date validation (rejects impossible days + out-of-range years) + regression tests.

## CI

Added `.github/workflows/ci.yml` — runs `npm ci`, `npm test`, and `npm run build` on Node 22 for every
pull request and push to `main`, so all future PRs are gated on the SP1–SP4 suite and a clean build.

## Accepted non-blocking items (documented, not fixed)

- Current-week `readWeek` in `load()` is still unwrapped (a corrupt *current*-week file 500s the page —
  defensible; nothing to render, matches `GET /api/week`'s own 500).
- `validateConfig`'s new link-scheme rule is a migration hazard for a pre-existing config with a
  non-http(s) pinned link → note for SP5 deploy docs.
- `tap(-1)` on a `link:"required"` task leaves an orphaned `items[]` row (counts/items diverge on a
  correction — rare edge).
- No `hooks.server.js`/CSP; `data/.backups/` is never pruned; `writeConfig` reformats the hand-aligned
  seed JSON on any edit (cosmetic git diff).
- Built adapter-node server resolves `config/` under `build/` (dev works) — SP1/SP5 deploy follow-up.
- No component-testing framework (by design); Svelte component behavior is covered by build + adversarial
  review + the manual/simulation pass, not unit tests.

## Changelog
- 2026-08-29 — Combined adversarial review (2 opus reviewers, 3 fix rounds), degraded-mode real-user
  simulation (+1 fix), and GitHub Actions CI. Final scores 92 (integration) / 93 (security); 387 tests.
