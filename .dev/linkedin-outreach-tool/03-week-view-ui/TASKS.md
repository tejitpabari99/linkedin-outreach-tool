# Tasks: SP3 — Week View UI

**Sub-project:** SP3 (Phase 3, depends on SP1 + SP2)
**Repo:** `/root/projects/linkedin-outreach-tool`
**PRD source:** `/root/projects/linkedin-outreach-tool/.dev/linkedin-outreach-tool/03-week-view-ui/PRD.md`
**Fresh authoring** — no prior `TASKS.md` existed.

**Gate check performed:** PRD §9 has 14 items (Q1–Q14), every one `[RESOLVED...]` or `[DEFERRED to SP4]`. Zero `[OPEN]` items. Safe to generate tasks.

**Prerequisite these tasks assume:** SP1's app scaffold (`package.json`, `svelte.config.js`, `vitest.config.js` with `include: ['src/lib/**/*.test.js']`, `src/app.html`) and SP1's `src/lib/config.js`/`src/lib/weeks.js` module surface (PRD-01 §9 Q13's final export list) already exist in the repo, and SP2's routes under `src/routes/api/**` already exist and match PRD-02 §5's table exactly (including `link: null` accepted unconditionally at item creation). If either is not yet merged when a task below starts, coordinate with that sub-project's implementation before proceeding — do not stub or guess at either contract.

**No new runtime dependencies, no new HTTP routes.** Every task below only touches `src/routes/{+layout.svelte,+page.server.js,+page.svelte}` and `src/lib/{stores,components,utils}/**`, per PRD §4.1's file list.

---

### Task 1 — `+layout.svelte`: global shell, theme toggle, shared palette

**Traced to PRD §4.3**

- **Files:** `/root/projects/linkedin-outreach-tool/src/routes/+layout.svelte` *(new file)*

- **Changes:** Create the root layout exactly as specified in PRD §4.3: a `dark` `$state(true)` toggle persisted to `localStorage` under key `theme` (`'dark'`/`'light'`), applied by toggling a `.light` class on `document.documentElement`, wrapped in `try {} catch {}` (localStorage can throw in private browsing — must not crash the shell). Header contains only a brand span (`"LinkedIn Outreach"`) and the theme-toggle icon button — no login/logout link, no role branching (D25: auth is out of scope for this app entirely).

  Copy the sun/moon SVG `<path>` markup verbatim from `/root/projects/cc-gateway/src/routes/+layout.svelte`'s `.icon-link.theme-toggle` button (the two `<svg>` blocks conditioned on `dark`).

  Copy the **entire** `:global(:root) { ... }` and `:global(:root.light) { ... }` custom-property blocks verbatim from `/root/projects/cc-gateway/src/routes/+layout.svelte` — every variable (`--bg`, `--fg`, `--fg-secondary`, `--card-bg`, `--card-border`, `--card-hover-bg`, `--card-hover-border`, `--muted`, `--header-border`, `--icon-bg`, `--input-bg`, `--input-border`, `--input-focus-border`, `--input-placeholder`, `--chip-bg`, `--chip-border`, `--chip-active-bg`, `--chip-active-border`, `--chip-active-color`, `--row-hover`, `--row-divider`, `--tag-bg`, `--tag-border`, `--tag-color`, `--table-header-color`, `--table-header-border`, `--modal-bg`, `--modal-border`, `--modal-inner-bg`, `--modal-inner-border`, `--prose-fg`, `--prose-heading`, `--prose-hr`, `--prose-code-bg`, `--prose-pre-bg`, `--prose-pre-border`, `--section-border`), for both the dark values and the `.light` override values. Do not re-derive or approximate any hex value — copy-paste exactly. Also copy the base `:global(body)` rule (background/color/font-family off these variables) and the reset (`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`) and `:global(html) { font-size: 110%; }`.

  Add scoped `header`/`.brand`/`.icon-link`/`.theme-toggle` styles matching cc-gateway's own (padding, flex layout, hover color transition) minus anything role/logout-related.

  `{@render children()}` renders the page content below the header, per the PRD's exact snippet.

- **Acceptance criteria:**
  - `npm run dev` boots with no console errors; the page (even with nothing else built yet — a blank `+page.svelte` is fine at this point) shows the header with brand text and a working theme toggle.
  - Toggling the theme button flips `document.documentElement`'s `.light` class, persists across a reload (same theme comes back), and every one of the ~35 custom properties listed above is defined identically to cc-gateway's for both dark and light — spot check by comparing `getComputedStyle(document.documentElement).getPropertyValue('--bg')` in both apps' dev consoles.
  - No hardcoded hex color appears anywhere in this file outside the two `:global(:root...)` blocks.

---

### Task 2 — `weekStore.svelte.js`: reactive current-week state + Svelte context

**Traced to PRD §4.5**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/stores/weekStore.svelte.js` *(new file)*

- **Changes:** Implement exactly the module in PRD §4.5:
  - `export const WEEK_STORE_KEY = 'linkedin-outreach:weekStore';`
  - `createWeekStore(initialWeek, config)` — internal `$state` for `week` and `weekKey` (`initialWeek.week`); returns an object exposing `get week()`, `get weekKey()`, `get config()` (plain, non-reactive — config is not mutated live, only re-read via `GET /api/config` when needed per §6.3), plus three mutator functions:
    - `bumpLocalCount(taskId, delta)` — `week.counts[taskId] = Math.max(0, (week.counts[taskId] ?? 0) + delta)` (clamp-at-zero, additive — mirrors SP1's `bumpCount`, but this is a *display-only* mirror; the server call is the source of truth).
    - `setLocalMetric(metricId, value)` — `week.metrics[metricId] = value` (absolute overwrite, no add).
    - `replaceWeek(nextWeek)` — `week = nextWeek` (used after every server round-trip that returns the authoritative week object — reconciliation).
  - `provideWeekStore(store)` / `getWeekStore()` — thin wrappers over Svelte's `setContext`/`getContext` keyed by `WEEK_STORE_KEY`.

  This file is a `.svelte.js` module (Svelte 5's supported pattern for reactive state outside a `.svelte` component) — do not rename to `.js`, runes will not work without the `.svelte.js` extension.

- **Acceptance criteria:**
  - `createWeekStore({week:'2026-W35', counts:{a:2}, metrics:{m:5}, entries:[]}, {tasks:[],lanes:[],metrics:[],links:[]})` returns an object where `.week.counts.a === 2`; calling `.bumpLocalCount('a', -5)` then reading `.week.counts.a` yields `0`, never negative.
  - `.setLocalMetric('m', null)` followed by reading `.week.metrics.m` yields `null` (not coerced to `0` or dropped).
  - `provideWeekStore`/`getWeekStore` round-trip correctly when called from a parent/child component pair in a scratch test page (or verified in Task 4's `+page.svelte` once it calls `provideWeekStore` and a child component calls `getWeekStore()` and gets the same object back, per `===` reference equality).

---

### Task 3 — `+page.server.js`: load, config-error path, sparkline data

**Traced to PRD §4.4**

- **Files:** `/root/projects/linkedin-outreach-tool/src/routes/+page.server.js` *(new file)*

- **Changes:** Implement `load()` exactly as PRD §4.4 specifies:
  1. `try { config = loadConfig(); } catch (e) { if (e instanceof ConfigError) return { configError: { message: e.message, field: e.field }, config: null, week: null }; throw e; }` — a broken config must short-circuit before any week data is touched (matches SP1's own guarantee that a broken config never causes a read, let alone a write).
  2. `const weekKey = currentWeekKey(config.timezone);`
  3. `const rawWeek = readWeek(weekKey, config);` (never throws for a missing file — SP1 returns `emptyWeek()`), then `const week = projectWeekForConfig(rawWeek, config);`.
  4. `const headlineMetric = config.metrics.find(m => m.headline);`
  5. Build the sparkline: `const SPARKLINE_WEEKS = 12;` (see PRD §9 Q9 — chosen window, not derived from anything else). `listWeekKeys()` (sorted ascending), filter `k <= weekKey`, take the last 12, force-include `weekKey` if it's missing (current week may have no file yet). Map each key to `{ week: wk, value: w.metrics[headlineMetric.id] ?? null }`, reusing the already-loaded `week` object for `wk === weekKey` and calling `projectWeekForConfig(readWeek(wk, config), config)` for every other key.
  6. Return `{ configError: null, config, week, weekKey, sparkline, headlineMetricId: headlineMetric.id }` — every key here is part of the contract SP4 extends (append-only); do not remove or rename any of them later.

  Do **not** add a `GET /api/weeks` fetch here or anywhere — per PRD §4.4/§9 Q6, the sparkline is populated via direct same-process module calls (`listWeekKeys`/`readWeek`), not HTTP, and this is deliberate: SP3 needs no such route.

- **Acceptance criteria:**
  - With a valid `config/config.json` and no week files at all, `load()` returns `configError: null`, `week` equal to an empty-week shape with all counts/metrics at their defaults, and `sparkline` containing exactly one entry (the current week, `value: null`).
  - With `config/config.json` intentionally broken (e.g. a duplicated task id), `load()` returns `{ configError: { message, field }, config: null, week: null }` and does not throw, and no file under `data/` is read or written as a result (verify via a filesystem-watch or by confirming `readWeek`/`listWeekKeys` are never invoked in this branch — e.g. temporarily log-and-remove, or trust the early `return` placement above the `readWeek` call).
  - With 15 prior week files on disk plus the current week, `sparkline.length === 12` and its last entry's `week === weekKey`.

---

### Task 4 — `+page.svelte`: page shell, store wiring, config-error branch, SP4 mount points

**Traced to PRD §4.4 (config-error render), §4.5 (store wiring), §4.6 (layout slots)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/routes/+page.svelte` *(new file)*

- **Changes:** Create the page shell. At this stage only the config-error branch and the slot *structure* are wired — slots 1–4's actual component imports land in Tasks 5, 6, 8, 10 below (this task deliberately leaves them as empty placeholders so each later task's diff is small and self-contained); do not import `PinnedLinks`, `MetricsRow`, `WeekLanes`, `DiaryBox`, or `Confetti` yet.

  ```svelte
  <script>
    import { createWeekStore, provideWeekStore } from '$lib/stores/weekStore.svelte.js';

    let { data } = $props();

    const store = data.configError ? null : createWeekStore(data.week, data.config);
    if (store) provideWeekStore(store);
  </script>

  {#if data.configError}
    <main class="config-error">
      <p class="config-error-title">Config problem</p>
      <p class="config-error-msg">{data.configError.message}</p>
      {#if data.configError.field}
        <p class="config-error-field">Field: <code>{data.configError.field}</code></p>
      {/if}
      <p class="config-error-hint">Nothing was changed. Fix <code>config/config.json</code> and reload.</p>
    </main>
  {:else}
    <main class="week-view">
      <!-- SLOT 1 — pinned links: Task 5 -->
      <!-- SLOT 2 — metrics row: Task 6 -->
      <!-- SLOT 3 — this week (two lanes): Task 8 -->
      <!-- SLOT 4 — diary box: Task 10 -->

      <!-- SLOT 5 — SP4: history strip + month calendar + next-week view.
           getWeekStore() is available to anything rendered here. This section is expected
           to require scrolling — only slots 1–4 are the "no scrolling to see the week"
           requirement (BRAINSTORM §3.5). Do not remove or restyle this placeholder. -->
      <section class="sp4-slot" data-slot="history-calendar"></section>

      <!-- SLOT 6 — SP4: reverse-chronological diary log with links.
           Reuse EntryPreview.svelte (Task 10) for any entry still parseStatus:'pending' with a
           proposed preview that isn't the most-recent one (DiaryBox only surfaces the latest). -->
      <section class="sp4-slot" data-slot="diary-log"></section>
    </main>
  {/if}

  <style>
    .week-view { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1.75rem; }
    @media (max-width: 640px) {
      .week-view { padding: 1.25rem 1rem 3rem; gap: 1.25rem; }
    }
    .config-error { max-width: 500px; margin: 4rem auto; padding: 1.5rem; text-align: center; }
    .config-error-title { font-size: 1.1rem; font-weight: 600; color: var(--fg); margin-bottom: 0.75rem; }
    .config-error-msg { color: var(--fg-secondary); margin-bottom: 0.5rem; }
    .config-error-field { color: var(--muted); font-size: 0.85rem; margin-bottom: 1rem; }
    .config-error-hint { color: var(--muted); font-size: 0.85rem; }
  </style>
  ```

  The two `<section data-slot="...">` elements must keep those exact `data-slot` attribute values (`"history-calendar"` and `"diary-log"`) — SP4's PRD references these literal strings as its mount points.

- **Acceptance criteria:**
  - With `data.configError` set (simulate by temporarily breaking config), the page renders only the config-error panel — no `<section data-slot>` elements are present in the DOM in this branch (matches SP1's guarantee that nothing downstream is reached).
  - With a valid config, the page renders `<main class="week-view">` containing (in DOM order) two empty `<section data-slot="history-calendar">` / `<section data-slot="diary-log">` elements and nothing else yet.
  - `document.querySelector('[data-slot="history-calendar"]')` and `document.querySelector('[data-slot="diary-log"]')` both resolve to non-null empty elements.
  - No console errors on load.

---

### Task 5 — `PinnedLinks.svelte`: slot 1

**Traced to PRD §6.1**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/lib/components/PinnedLinks.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/routes/+page.svelte` *(edit — mount slot 1)*

- **Changes:** Create `PinnedLinks.svelte` exactly per PRD §6.1: accepts `{ links }` (`config.links: [{label, url}]`), renders each as `<a class="link-pill">` when `link.url` is truthy, or an inert `<span class="link-pill link-pill-empty" title="Not set yet">` when it is not — **never** a `<a href="">`. Wrap the strip in `.links-strip { overflow-x: auto; ... }` (horizontal scroll, never wraps — wrapping would consume vertical budget the "no scroll to see the week" requirement can't spare, per §6.9). Copy the styles verbatim from the PRD snippet.

  In `+page.svelte`, import `PinnedLinks` and replace the `<!-- SLOT 1 -->` comment with `<PinnedLinks links={store.config.links} />`.

- **Acceptance criteria:**
  - With one of the three seed links (Reachouts sheet, My profile, Strategy doc — SP1 §4.3) having a blank `url`, that pill renders as a `<span>`, not an `<a>`, and clicking it produces no navigation and no console error/warning.
  - The links strip scrolls horizontally (not wrapping) when there are enough links to overflow a 900px-wide container — verified by resizing the viewport narrower and confirming pills stay on one row with a scrollbar rather than wrapping to a second row.
  - Non-empty links open in a new tab (`target="_blank" rel="noopener"`).

---

### Task 6 — `MetricsRow.svelte` + `Sparkline.svelte`: slot 2

**Traced to PRD §6.2**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/lib/components/MetricsRow.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/lib/components/Sparkline.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/routes/+page.svelte` *(edit — mount slot 2)*

- **Changes:**
  - `MetricsRow.svelte`: accepts `{ sparkline: initialSparkline, headlineMetricId }`, calls `getWeekStore()`. Renders one tile per `store.config.metrics` — label plus a click-to-edit value (`<button class="metric-value">` toggling to a `<input type="number">` on click, committing on blur or Enter). **No bar, no target comparison, no color-coding by performance anywhere in this component (D2)** — it renders numbers and, for the headline metric only, one `<Sparkline>`. On commit: optimistic `store.setLocalMetric(metricId, value)` (empty input → `null`; non-finite parse → silently ignore, no error text per §6.8), `PATCH ${base}/api/week/${store.weekKey}` with `{ metrics: { [metricId]: value } }`, `store.replaceWeek(updated)` on success, revert both the local metric and (if this was the headline metric) the sparkline's last point on failure. When the headline metric commits successfully, replace the sparkline's last entry in place (`[...sparkline.slice(0, -1), { week: store.weekKey, value }]`) — no refetch (per PRD §4.4's "keeping the sparkline's last point live without a reload").
  - `Sparkline.svelte`: accepts `{ points }` (`[{week, value}]`, `value: number|null`). Renders an inline `<svg viewBox="0 0 100 24" preserveAspectRatio="none">`. Null-state: when fewer than 2 points have a non-null value, render a flat muted dashed baseline (`stroke-dasharray`, `opacity: 0.4`) — never a jagged single-point spike, never text. With ≥2 known points, render one `<polyline>` scaled by `min`/`max` of known values (`range = Math.max(1, max-min)` to avoid div-by-zero on a flat series).

  In `+page.svelte`, import `MetricsRow` and replace `<!-- SLOT 2 -->` with `<MetricsRow sparkline={data.sparkline} headlineMetricId={data.headlineMetricId} />`.

- **Acceptance criteria:**
  - No pixel of this component ever turns red or renders a quota/target bar — grep the finished component files for `--danger`/red hex values/any `target`-comparison class name and confirm none exist.
  - With a sparkline of all-`null` values, the SVG shows the flat dashed baseline, no crash, no `NaN` in any coordinate attribute.
  - With exactly 1 known value, a single dot renders at the horizontal midpoint; with ≥2, a polyline renders scaled to fit the viewBox.
  - Editing the headline metric's value and having the network call fail (simulate via devtools offline) reverts both the displayed value and the sparkline's last point to their pre-edit values.
  - Editing a non-headline metric never touches `sparkline` at all.

---

### Task 7 — `weekKeyFmt.js`: debounce + date-range formatting utility

**Traced to PRD §4.1 (file list), §4.8 (TaskBar's debounced flush import)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/weekKeyFmt.js` *(new file)*

- **Changes:** Export two small pure helpers:
  - `debounce(fn, waitMs)` — standard trailing-edge debounce: returns a wrapped function that, when called repeatedly within `waitMs` of each other, only invokes `fn` once, `waitMs` after the *last* call. This is what `TaskBar.svelte` (Task 8) imports to batch rapid taps into one `PATCH` call.
  - `formatWeekRange(weekKey)` — given an ISO week key string (`"2026-W35"`), returns the same `{ start, end }` calendar-date shape SP1's own `weeks.js` `weekKeyToRange(key)` produces (Monday–Sunday of that ISO week), computed with plain `Date` arithmetic. This is a deliberate client-side *reimplementation*, not an import of `$lib/weeks.js` — that module is server-only (uses `node:fs` internally) and must never be pulled into the client bundle. Used by `DiaryBox`/`MetricsRow` for any "which week does this land in" display context; do not gate any other component's core functionality on this helper existing — it is a formatting nicety, not load-bearing logic.

- **Acceptance criteria:**
  - `const fn = debounce(cb, 500)`; calling `fn()` five times within 100ms of each other results in `cb` being called exactly once, ~500ms after the last call (not the first).
  - `formatWeekRange('2026-W35')` returns the same `{start, end}` date pair as SP1's `weekKeyToRange('2026-W35')` (cross-check by running SP1's own function on the same input in a scratch Node REPL and comparing).
  - `formatWeekRange` handles a 53-week year's `W53` correctly, matching SP1's own ISO week-numbering behavior.

---

### Task 8 — `selectNext.js` + `WeekLanes.svelte` + `TaskBar.svelte`: slot 3, the core screen

**Traced to PRD §4.7 (selection rule), §4.8 (TaskBar), §6.3 (WeekLanes, quota editing)**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/lib/utils/selectNext.js` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/lib/components/WeekLanes.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/lib/components/TaskBar.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/routes/+page.svelte` *(edit — mount slot 3, add `nextTaskId` derived)*

- **Changes:**
  - `selectNext.js`: implement `selectNextTask(config, counts)` exactly per PRD §4.7 — flatten `config.lanes` in authored order, then within each lane filter `config.tasks` by `t.lane === lane.id` (authored task order), return the id of the first task whose count is below its `min`, or `null` if every task has cleared. Pure, deterministic, no randomness, no timestamp/recency dependency of any kind.
  - `WeekLanes.svelte`: accepts `{ nextTaskId }`, calls `getWeekStore()`. Renders one `.lane` per `store.config.lanes` (label + blurb), each containing a `<TaskBar task isNext={task.id === nextTaskId} />` per `store.config.tasks.filter(t => t.lane === lane.id)`. Below the lanes, `{#if nextTaskId === null}<p class="week-status">This week is done. Anything from here is extra.</p>{/if}` — this exact copy, no exclamation mark, no congratulations (§6.8). Grid: 2 columns desktop, 1 column under 700px (§6.9), preserving lane order in both.
  - `TaskBar.svelte`: accepts `{ task, isNext }`. `count`/`cleared`/`maxed` derived off `store.week.counts[task.id]`. Grey-out/shrink transition: only animate on a *live* transition witnessed this session (`mounted` flag skips animation on first paint — a reload of an already-cleared week must never replay the settle animation). Optimistic tap handling exactly per PRD §4.8: `tap(delta)` calls `store.bumpLocalCount` instantly, accumulates `pendingDelta`, and a `debounce`d (500ms, from Task 7's `weekKeyFmt.js`) `flush()` sends one `PATCH ${base}/api/week/${weekKey}` with `{ counts: { [task.id]: delta } }`, calling `store.replaceWeek(res)` on success (server truth always wins) or setting a quiet `syncFailed` flag on failure (optimistic value stands, no alarming error — tooltip copy "Not saved yet — will retry" per §6.8). Both `.tap-plus`/`.tap-minus` buttons are always visible (never hover-revealed — no hover state on touch, §6.9), ≥40px in both dimensions, and the `−` button disables at `count === 0`. Both the `min` mark and the `target` (track's right edge) are always visible on the bar regardless of clear state (D4). No red anywhere; "cleared" state reads as quieter (lower opacity, shrunk padding), not pass/fail-colored.

    Add the one-click quota-edit affordance described in PRD §6.3: a small pencil control next to the count label opens two inline number inputs (`min`/`target`) on the same row (no modal). Commit path: client-side guard `if (min > target) { quotaError = "min can't be above target"; return; }` (exact copy, §6.8) with nothing sent to the server in that case; otherwise `GET ${base}/api/config` first (never mutate a stale client-held copy — config is read-per-request, always fresh, per SP1 §4.4), build the next config with only this task's `min`/`target` changed, `PUT ${base}/api/config`, and on success update `store.config.tasks.find(t => t.id === taskId)` in place.

  - In `+page.svelte`: add `import { selectNextTask } from '$lib/utils/selectNext.js';` and `const nextTaskId = $derived(store ? selectNextTask(store.config, store.week.counts) : null);`, import `WeekLanes`, replace `<!-- SLOT 3 -->` with `<WeekLanes {nextTaskId} />`.

- **Acceptance criteria:**
  - With 5 tasks across two lanes, all below `min`: the "next" flag renders on the first outreach-lane task in config-authored order. Tapping that task's `+1` enough times to clear its `min` moves the "next" flag to the next task in lane-then-task order on the very next render — no flicker, no jump to an unrelated task.
  - Once every task clears its `min`, no "next" flag renders anywhere, and `<p class="week-status">This week is done. Anything from here is extra.</p>` appears exactly once.
  - Tapping `+1` five times rapidly (within 500ms) on the same task results in exactly one `PATCH` network call (confirm via browser devtools Network tab or by counting calls to a mocked `fetch`), and the bar visually updates on every tap with no lag.
  - With the network unreachable (devtools offline), tapping still updates the bar instantly and shows the sync-pending indicator (a small muted `•` with title "Not saved yet — will retry"); no red, no alert, no thrown exception in the console.
  - A `-1` correction tap that drops a cleared task back under its `min` causes the "next" flag to return to that task on the next render, and its bar visually un-greys.
  - Editing a quota with `min` set above `target` shows the inline error text and confirmed (via network tab) that no `PUT /api/config` request is sent.
  - Every tap/decrement button measures ≥40×40px in the rendered DOM (inspect computed box size).

---

### Task 9 — `applyLocal.js`: pure client-side arithmetic mirror

**Traced to PRD §6.4 ("Why Apply does an optimistic local merge... resolving the SP2 contract gap"), §9 Q5**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/applyLocal.js` *(new file)*

- **Changes:** Export two pure functions that are exact two-line mirrors of SP1's `bumpCount`/`setMetric` semantics (SP1 PRD §4, "Testing" bullets: "`bumpCount` clamps at 0... `setMetric` rejects negative/NaN/non-number; accepts `null`"):
  - `bumpLocalCount(counts, taskId, delta)` — returns a new counts-shaped update (or mutates in place, matching how `EntryPreview.svelte`'s `apply()` will call it in Task 10 — `store.bumpLocalCount` already exists on the store from Task 2; this file exists specifically so the *arithmetic rule* lives in one small tested place, not duplicated ad hoc inside `EntryPreview.svelte`) — clamps at 0, never negative, additive.
  - `setLocalMetric(metrics, metricId, value)` — absolute overwrite (never additive), accepts `null` to clear, rejects (no-ops on) `NaN`/negative/non-number values the same way SP1's `setMetric` does.

  This is the file the PRD's §9 Q5 resolution refers to: rather than trusting a hand-rolled re-derivation scattered across components, the arithmetic lives here once, gets tested here once (Task 15), and both `weekStore.svelte.js` (Task 2) and `EntryPreview.svelte` (Task 10) call through it for any optimistic local merge.

- **Acceptance criteria:**
  - `bumpLocalCount({a: 2}, 'a', -5)` yields `{a: 0}`, never negative — matches SP1's `bumpCount` clamp-at-zero rule exactly.
  - `setLocalMetric({m: 5}, 'm', null)` yields `{m: null}`; `setLocalMetric({m: 5}, 'm', -3)` and `setLocalMetric({m: 5}, 'm', NaN)` both leave `m` at its prior value `5` (no-op on invalid input), matching SP1's `setMetric` rejection rule.
  - Running the exact same input fixtures used in SP1's own `weeks.test.js` for `bumpCount`/`setMetric` (if present) against these two functions produces byte-identical output.

---

### Task 10 — `DiaryBox.svelte` + `EntryPreview.svelte`: slot 4, full state machine + retro-logging week-key fix

**Traced to PRD §6.4 in full, including §9 Q13's `[RESOLVED]` retro-logging bug fix — this is the most detailed and most safety-critical component in the sub-project.**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/lib/components/DiaryBox.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/lib/components/EntryPreview.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/routes/+page.svelte` *(edit — mount slot 4)*

- **Changes:**

  **`DiaryBox.svelte`** — states `idle → saving → (preview | failed)`, plus `failed → reparsing → (preview | failed)` as the retry loop (`reparsing` reuses the `saving` phase value/spinner — no separate visual state needed). All state is local `$state` inside this component (`text`, `date`, `phase`, `activeEntry`) — **nothing else on the page reads `phase`**; this is what makes "diary Save must never block the rest of the page" structurally true rather than a convention that could be forgotten (verify: no other component in the tree imports or reads anything from `DiaryBox`).

  Critical piece — **`entryWeekKey` tracking (the retro-logging fix, PRD §9 Q13):**
  ```js
  let { weekKey, initialEntries } = $props(); // weekKey = the DISPLAYED week
  let activeEntry = $state(findLatestPendingPreview(initialEntries)); // most recent pending+proposed entry, on mount only — older pending previews are NOT shown here, they belong to SP4's log (slot 6)
  let entryWeekKey = $state(weekKey); // the ACTIVE entry's OWN home week — starts equal to the displayed week (correct at mount, since initialEntries came from store.week.entries), diverges only after a retro-dated save() below
  if (activeEntry) phase = 'preview';

  async function save() {
    phase = 'saving';
    const res = await fetch(`${base}/api/entry`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date, text }) });
    const { week: landedWeek, entry } = await res.json();
    text = '';
    activeEntry = entry;
    entryWeekKey = landedWeek; // AUTHORITATIVE — the server decided which week this lands in (SP1's dateToWeekKey), NOT the displayed weekKey. A back-dated diary entry's landedWeek differs from the currently-displayed week.
    phase = entry.parseStatus === 'failed' ? 'failed' : 'preview';
  }

  async function reparse() {
    phase = 'saving';
    const res = await fetch(`${base}/api/week/${entryWeekKey}/entry/${activeEntry.id}/reparse`, { method: 'POST' }); // entryWeekKey, NEVER the outer weekKey prop
    const { entry } = await res.json();
    activeEntry = entry;
    phase = entry.parseStatus === 'failed' ? 'failed' : 'preview';
  }

  function onResolved() { // called by EntryPreview after Apply/Discard completes
    activeEntry = null;
    entryWeekKey = weekKey; // reset to the displayed week for whatever gets saved/logged next
    phase = 'idle';
  }
  ```
  `findLatestPendingPreview(entries)` filters to `parseStatus === 'pending' && e.proposed`, returns the one with the max `.at` timestamp, or `null`.

  Render: `idle`/`saving` → textarea (disabled while `saving`) + date input (`max` = today, D11) + Save button (spinner + "Saving…" while in flight, plain "Save" otherwise — never "Parsing with AI…", §6.8: the LLM step is invisible plumbing). `preview` → `<EntryPreview entry={activeEntry} weekKey={entryWeekKey} onResolved={onResolved} onReparse={reparse} />` — **pass `entryWeekKey`, never the outer `weekKey` prop.** `failed` → the exact copy from §6.8: `"Saved — couldn't read it automatically. The counters still work, or "` + a plain underlined `try again` link (not a button) calling `reparse()`.

  **`EntryPreview.svelte`** — shared verbatim with SP4's slot 6 for older unresolved entries, so its prop contract is load-bearing for every future caller, not just `DiaryBox`. `weekKey` prop is **the entry's own home week**, never assumed equal to the displayed week.
  ```js
  let { entry, weekKey, onResolved, onReparse } = $props();
  const store = getWeekStore();
  let busy = $state(false); // client-side double-click guard, belt-and-suspenders alongside SP2's own server-side parseStatus==='pending' guard

  async function apply() {
    if (busy) return;
    busy = true;
    const isLiveWeek = weekKey === store.weekKey; // guards whether weekStore (the on-screen bars) is touched at all
    if (isLiveWeek) {
      for (const [taskId, delta] of Object.entries(entry.proposed.counts)) store.bumpLocalCount(taskId, delta);
      for (const [metricId, value] of Object.entries(entry.proposed.metrics)) store.setLocalMetric(metricId, value);
    }
    try {
      await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/apply`, { method: 'POST' }); // ALWAYS the entry's own week, regardless of isLiveWeek
      if (isLiveWeek) {
        const truth = await (await fetch(`${base}/api/week/${weekKey}`)).json();
        store.replaceWeek(truth);
      }
      onResolved(weekKey);
    } finally { busy = false; }
  }

  async function discard() {
    if (busy) return;
    busy = true;
    await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/discard`, { method: 'POST' }); // entry's own week, no isLiveWeek branch needed — discard never touches counts/metrics
    busy = false;
    onResolved(weekKey);
  }
  ```
  Preview summary line: `counts` as `before→after` (e.g. `comments 0→4`), `metrics` as `→absolute` (e.g. `followers →1032`), joined with ` · ` — exact worked phrasing from §6.8, verbatim. Ignored keys render as `"not used: invites, followers"` (neutral wording, never "error"/"rejected"). Actions: exactly `"Discard"` / `"Apply"` (D9's two verbs, no synonyms), both `disabled={busy}`.

  In `+page.svelte`: import `DiaryBox`, replace `<!-- SLOT 4 -->` with `<DiaryBox weekKey={store.weekKey} initialEntries={store.week.entries} />`.

- **Acceptance criteria:** (functional coverage here; full state-machine and retro-logging *verification* tasks are Tasks 17 and 19 below — this task's own bar is that the code matches the spec precisely)
  - `DiaryBox`'s `phase` state is `let phase = $state(...)` declared inside `DiaryBox.svelte` only — grep confirms no other component file references `phase` from `DiaryBox`.
  - `EntryPreview.apply()` and `EntryPreview.discard()`'s fetch URLs both interpolate the `weekKey` **prop** (the entry's own week), never `store.weekKey` (the displayed week) — grep the finished file for every `fetch(` call inside `apply`/`discard`/`reparse` and confirm each uses the `weekKey` parameter, not `store.weekKey`.
  - `isLiveWeek` gates exactly three things: the optimistic `bumpLocalCount`/`setLocalMetric` loop, the reconciling `GET`, and `store.replaceWeek` — none of those three ever execute when `weekKey !== store.weekKey`, while the `POST .../apply` and `POST .../discard` calls execute unconditionally either way.
  - `DiaryBox.reparse()`'s fetch URL uses `entryWeekKey`, not the `weekKey` prop — confirm by reading the function body directly (this was the second half of the same bug SP4 found: `reparse` originally used the outer displayed week too).
  - Clicking "Apply" twice in rapid succession (simulated double-click) results in exactly one `POST .../apply` network call from the client (verify via network tab or a mocked-`fetch` call-count assertion) — `busy` is set synchronously before the first `await`.

---

### Task 11 — `Confetti.svelte` + tab-title counter

**Traced to PRD §6.5 (confetti), §6.7 (tab title), §4.6 (`leftCount`/`document.title` wiring)**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/lib/components/Confetti.svelte` *(new file)*
  - `/root/projects/linkedin-outreach-tool/src/routes/+page.svelte` *(edit — mount Confetti, add `leftCount` derived + tab-title effect)*

- **Changes:**
  - `Confetti.svelte`: accepts `{ weekKey, config }`, calls `getWeekStore()`. `allCleared = $derived(config.tasks.every(t => (store.week.counts[t.id] ?? 0) >= t.min))`. "Once" bookkeeping lives in `localStorage` keyed **per ISO week**, never in the week's own JSON file (PRD §9 Q10 — deliberately kept out of SP1's schema, since it's cosmetic and has no forensic value): `storageKey(wk) = \`linkedin-outreach:confetti:${wk}\``. On first mount (`mountedOnce` guard), if the week is *already* cleared when the page loads, mark the flag but animate nothing (a reload of an already-done week must never re-burst). On any subsequent reactive re-check, if `allCleared` becomes true and the flag isn't already set, fire the burst (`fired = $state`, auto-clears after 1200ms) and mark the flag. Every `localStorage` read/write is wrapped in `try {} catch {}` — if it throws (private browsing), the write silently no-ops and the burst may simply replay once more in a future private session; this is the accepted, documented behavior, not a bug to fix.
    - CSS-only burst: 14 `<span class="piece">` elements, each with an inline `--i`/`--hue` custom property, `position: fixed`, falling/rotating/fading via one `@keyframes fall` — no animation library, hand-rolled per the "no new runtime dependencies" constraint.
  - In `+page.svelte`:
    ```js
    const leftCount = $derived(
      store ? store.config.tasks.filter(t => (store.week.counts[t.id] ?? 0) < t.min).length : 0
    );
    $effect(() => {
      if (typeof document === 'undefined') return;
      document.title = leftCount > 0 ? `(${leftCount} left) LinkedIn` : 'LinkedIn';
    });
    ```
    Add `<svelte:head><title>{leftCount > 0 ? \`(${leftCount} left) LinkedIn\` : 'LinkedIn'}</title></svelte:head>` (SSR-safe initial title, matched by the client-side effect for subsequent updates). Import `Confetti` and mount it once at the top of the `.week-view` `<main>`: `<Confetti weekKey={store.weekKey} config={store.config} />`. This `leftCount`/title logic is the system's **only** notification (D18) — no other alert, badge, or push mechanism exists anywhere in this sub-project.

- **Acceptance criteria:**
  - Format is exactly `(N left) LinkedIn` while `N > 0`, and exactly `LinkedIn` (no "(0 left)", no trailing punctuation) once `N === 0` — check both `document.title` and the rendered `<title>` tag.
  - Clearing every task's `min` fires the confetti burst exactly once, precisely on the tap that clears the *last* remaining task — not before, not again on a subsequent unrelated tap.
  - Reloading the page after the week is already fully cleared shows **no** confetti burst, but the bars still render in their final grey/shrunk state with no animation flash (per Task 8's `mounted`-flag logic).
  - With `localStorage` disabled/throwing (simulate via a private-browsing window or by monkey-patching `localStorage.setItem` to throw), the app does not crash — the confetti effect silently no-ops on the write; a subsequent reload may re-fire the burst once, which is the accepted, documented behavior, not a defect.

---

### Task 12 — §6.10 Data export/import affordance

**Traced to PRD §6.10, §9 Q14 — closes SP4 §9 Q8**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/components/PinnedLinks.svelte` *(edit — append the Data affordance)*

- **Changes:** Append the small "Data" popover to the trailing end of the pinned-links strip, exactly per PRD §6.10 — **not** a new page, **not** a new route, **not** a prominent button; same visual weight as an inert link pill:
  ```svelte
  <div class="data-affordance">
    <button class="link-pill data-toggle" onclick={() => open = !open} aria-label="Export or import data">Data</button>
    {#if open}
      <div class="data-menu">
        <a class="data-action" href="{base}/api/export?week={weekKey}">Export this week</a>
        <a class="data-action" href="{base}/api/export/all">Export everything</a>
        <label class="data-action data-import">
          Import…
          <input type="file" accept="application/json" hidden onchange={onImportFile} />
        </label>
        {#if importResult}<p class="data-import-result">{importResult}</p>{/if}
      </div>
    {/if}
  </div>
  ```
  ```js
  async function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const body = await file.text();
    const res = await fetch(`${base}/api/import`, { method: 'POST', headers: {'Content-Type':'application/json'}, body });
    const result = await res.json();
    importResult = res.ok
      ? `Imported. Backup saved to ${result.backup}.`
      : `Import failed: ${result.error}`;
    open = false;
  }
  ```
  `PinnedLinks.svelte` needs a new `weekKey` prop (for the "export this week" link's query param) — add it to the component's `$props()` destructure and pass `weekKey={store.weekKey}` from `+page.svelte`'s existing `<PinnedLinks links={store.config.links} />` call site (Task 5). The two export links are plain `<a href>` downloads (the browser + SP2's `Content-Disposition` header handle the file save) — no `fetch`, no blob handling needed for those two. Only Import round-trips through `fetch`. Reuse `PinnedLinks`' existing `.link-pill`/chip custom properties for the popover's styling — no new palette introduced.

- **Acceptance criteria:**
  - The "Data" pill renders at the trailing end of the pinned-links strip with the same visual weight as an inert link pill (not a distinct prominent button, no new row).
  - Clicking it opens a small inline popover with exactly three actions: "Export this week", "Export everything", "Import…".
  - "Export this week"'s `href` includes the correct `week=` query param matching the currently-displayed week.
  - Selecting a valid export JSON file via "Import…" results in `importResult` showing `"Imported. Backup saved to <path>."` using SP2's own returned `backup` field, and the popover closes.
  - Selecting an invalid file shows `"Import failed: <error>"` using SP2's own returned `error` field, and the popover closes the same way (no separate confirmation dialog is built — the result line inside the popover is itself the confirmation).

---

### Task 13 — Styling and microcopy pass

**Traced to PRD §6.8 (copy table), §6.9 (responsiveness)**

- **Files:** All files under `/root/projects/linkedin-outreach-tool/src/lib/components/**` and `/root/projects/linkedin-outreach-tool/src/routes/{+layout.svelte,+page.svelte}` *(review/edit pass, no new files)*

- **Changes:** Walk every string literal rendered in the UI against PRD §6.8's copy table and confirm each matches **verbatim** (not paraphrased): diary placeholder, Save/Saving states, the failed-parse note and "try again" link, the preview summary format (`before→after` for counts, `→absolute` for metrics), the "not used: ..." ignored-keys line, "Discard"/"Apply", the "next" flag label, "This week is done. Anything from here is extra.", the config-error panel's three lines, the sync-failure tooltip, the quota-edit error line. Grep the entire `src/lib/components/` and `src/routes/` trees for the forbidden words/patterns listed in §6.8's closing paragraph: `streak`, `miss`, `behind`, any exclamation mark used for encouragement (a stray `!` in copy, not in code), any red hex value used as a semantic pass/fail color (a genuinely destructive action would be the only exception, and SP3 has none), any day-of-week/days-remaining countdown, any current-vs-previous-week comparison framing.

  Also verify each component's own responsive behavior from §6.9 is present and correctly scoped (not a single global breakpoint file): PinnedLinks' horizontal scroll strip, MetricsRow's grid collapse under ~600px, WeekLanes' 2-column→1-column collapse under 700px, DiaryBox's controls stacking under 640px, every tap target ≥40×40px, the quota-edit popover being an inline expansion (never a modal).

- **Acceptance criteria:**
  - `grep -rniE "streak|\bmiss(ed)?\b|behind" src/lib/components/ src/routes/` returns zero matches in rendered copy (code comments/variable names referencing "SP4" or similar are fine — only user-visible strings matter).
  - No hex color matching red/orange danger tones (`#f87171` or similar) appears in any SP3 component's `<style>` block.
  - Resizing the browser to a 375px-wide viewport shows: the pinned-links strip scrolling horizontally (not wrapping), the metrics row collapsed to 2 columns, the two lanes stacked in their original config order, and the diary controls (date input + Save button) stacked vertically.
  - Every string in the rendered UI that appears in PRD §6.8's table matches character-for-character.

---

### Task 14 — `selectNext.test.js`: unit tests for the "do this next" rule

**Traced to PRD §4.7, §6 testing appendix ("`selectNext.test.js`: ...")**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/selectNext.test.js` *(new file)*

- **Changes:** Using `vitest`, against a fixed two-lane config fixture (`lanes: [{id:'outreach'},{id:'presence'}]`, several tasks per lane with `min`/`target`), write these cases:
  - The pointer lands on the first outreach-lane task (in authored order) whose count is below `min`, when all tasks start at 0.
  - Once every outreach-lane task's count reaches its `min`, the pointer moves to the first presence-lane task below `min`.
  - Once every task across both lanes has reached its `min`, `selectNextTask` returns `null` — never a stretch-target task, per PRD §9 Q11's resolution.
  - Calling `selectNextTask` twice with byte-identical `(config, counts)` input returns identical output both times (the "no thrashing" property, made explicit as an assertion rather than left as a design claim).
  - Given a `counts` object where a previously-cleared task's count is manually dropped back under its `min` (simulating a `-1` correction tap), the pointer returns to that task on the next call.

- **Acceptance criteria:** `npx vitest run src/lib/utils/selectNext.test.js` exits 0 with all 5+ assertions passing (per SP1's own `src/lib/**/*.test.js` vitest convention/config, no SvelteKit runtime required for this file).

---

### Task 15 — `applyLocal.test.js`: unit tests for the optimistic-apply arithmetic

**Traced to PRD §6.4 ("Why Apply does an optimistic local merge"), §9 Q5, §6 testing appendix**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/applyLocal.test.js` *(new file)*

- **Changes:** This is the test that keeps the client-side optimistic-apply-then-reconcile arithmetic from silently drifting from SP1's real `applyEntryToWeek`/`bumpCount`/`setMetric` implementation over time. Cases:
  - `bumpLocalCount` clamps at 0 exactly like SP1's `bumpCount` (`bumpLocalCount({a:2}, 'a', -5)` → `{a:0}`, never negative).
  - `setLocalMetric` overwrites (never adds) and accepts `null` to clear a metric.
  - `setLocalMetric` rejects (no-ops on) negative/NaN/non-number values, matching SP1's `setMetric` rejection rule.
  - If SP1's own `weeks.test.js` has existing fixtures for `bumpCount`/`setMetric` (check `src/lib/weeks.test.js` once SP1 has landed), copy those exact input/output pairs here and assert byte-for-byte identical results — this is the mechanism that catches drift between the two implementations, not just independent correctness.

- **Acceptance criteria:** `npx vitest run src/lib/utils/applyLocal.test.js` exits 0. If SP1's fixtures were available and copied, a comment in the test file notes which SP1 test file/cases were mirrored.

---

### Task 16 — `weekKeyFmt.test.js`: unit tests for debounce + date-range formatting

**Traced to PRD §6 testing appendix ("`weekKeyFmt.test.js`: the debounce helper coalesces N calls...")**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/weekKeyFmt.test.js` *(new file)*

- **Changes:**
  - Using `vitest`'s fake timers, assert that N rapid calls to a `debounce`-wrapped function within the debounce window result in exactly 1 invocation of the underlying function, and that the invocation happens after the *last* call's delay window elapses, not the first.
  - Assert `formatWeekRange(weekKey)`'s output shape matches SP1's `weekKeyToRange` output shape for several sample keys, including a 53-week year's `W53`.

- **Acceptance criteria:** `npx vitest run src/lib/utils/weekKeyFmt.test.js` exits 0.

---

### Task 17 — Manual verification: diary state machine, every state

**Dedicated verification task — PRD §6.4 in full. Explicitly NOT automated: PRD's own testing appendix states "no component-testing framework is introduced... component behavior is covered by the manual smoke pass," so this task is a precise manual walkthrough, not a `vitest` file.**

- **Files:** None (manual procedure against a running dev server with SP1+SP2 in place). Record results inline in this file's checklist or in a scratch note — no code changes.

- **Changes:** none — this is a verification task.

- **Acceptance criteria (walk every state in order, confirm each before moving to the next):**
  1. **`idle`** — page loads with an empty textarea, Save button disabled (empty text).
  2. **`saving`** — type text, click Save; textarea disables, button shows spinner + "Saving…"; confirm (open a second tab, or watch the Network tab) that `POST /api/entry` is in flight while every other on-page control (counter taps, metric edits, pinned links) remains fully clickable and responsive — this is the "must never block the rest of the page" property (§6.4), verify it structurally, not just visually.
  3. **`preview`** (happy path) — once the response lands with a successful parse, the box swaps to `EntryPreview` showing the `before→after`/`→absolute` summary line exactly per §6.8's worked phrasing, and any ignored keys as `"not used: ..."`.
  4. **`applied`** — click Apply once; confirm the relevant `TaskBar`/metric values update, the box returns to `idle` (empty textarea, ready for a new entry), and a second click on the (now-gone) Apply button is impossible (component unmounted, not just disabled).
  5. **`discarded`** — save a second entry, reach `preview`, click Discard; confirm no counts/metrics change, the box returns to `idle`.
  6. **`failed`** — save a third entry with the LLM path forced to fail (see step 7's degraded-mode setup, or simulate a parse error if SP2 exposes a test hook); confirm the exact copy `"Saved — couldn't read it automatically. The counters still work, or try again."` renders, with "try again" as a plain underlined link, not a button.
  7. **`reparsing`** — click "try again" on a `failed` entry; confirm it transitions back through `saving`'s spinner state and lands in either `preview` or `failed` again, never silently stuck.
  8. **LLM-fully-unavailable degraded path** — unset `WORKER_API_KEY` in `.env` and restart the dev server per SP2 §8; confirm `POST /api/entry` still returns quickly (not hanging for SP2's full 20s timeout) with `parseStatus: 'failed'`, the diary box correctly shows the `failed` state and copy, and every other interaction on the page (taps, metric edits, quota edits, pinned links, export/import) continues to work with zero degradation — walk each of those explicitly and confirm none of them error.
  9. **Reload survival** — save an entry, reach `preview`, reload the page *before* clicking Apply/Discard; confirm the exact same preview reappears (via `findLatestPendingPreview` picking it up from `initialEntries`), not lost, not silently re-parsed a second time.

---

### Task 18 — Manual verification: confetti "once" bookkeeping

**Dedicated verification task — PRD §6.5, §9 Q10. Manual, for the same reason as Task 17 (no component-testing framework).**

- **Files:** None (manual procedure). No code changes.

- **Changes:** none — this is a verification task.

- **Acceptance criteria:**
  1. Clear every task's `min` one at a time in a fresh browser profile (empty `localStorage`) — confirm confetti fires exactly once, on the tap that clears the *last* remaining task, never earlier.
  2. Reload the page immediately after — confirm confetti does **not** replay (the `linkedin-outreach:confetti:<weekKey>` key is now set in `localStorage`; inspect via devtools Application tab to confirm the key and value `"1"`).
  3. Clear `localStorage` for the origin, reload the already-cleared week — confirm confetti fires again exactly once (the flag was the only thing preventing replay; removing it correctly allows one more burst, it does not become permanently silent by some other mechanism).
  4. Open the app in a private/incognito window where `localStorage.setItem` may throw (some browsers restrict it entirely in certain private modes) — confirm the app does not crash, the page still renders and functions, and the confetti effect either fires-and-silently-fails-to-persist or fails-and-still-lets-the-page-work; the acceptable outcome per §6.5 is that the burst *may* replay on a future private session, not that anything breaks.
  5. Confirm the bookkeeping key lives under `localStorage`, never inside any `data/*.json` week file on disk (inspect the week's JSON file directly after clearing it — no new field should appear there).

---

### Task 19 — Manual verification: retro-logging fix (critical — apply/discard/reparse target the entry's own week, never the displayed week)

**Dedicated verification task — the single most safety-critical test in this sub-project, per PRD §9 Q13: this closes the exact silent-corruption path SP4 found during cross-sub-project reconciliation, where a back-dated entry could previously bump the wrong week's live counts and call apply/discard/reparse against the wrong week's file.**

- **Files:** None (manual procedure, ideally paired with direct inspection of the on-disk `data/<week>.json` files before/after each step to confirm exactly one file changed). No code changes.

- **Changes:** none — this is a verification task.

- **Acceptance criteria:**
  1. With the currently-displayed week being, say, `2026-W35`, open the diary box and pick a date from **two ISO weeks prior** (e.g. a Monday in `2026-W33`), write a short entry, and Save.
  2. Confirm the response's `entryWeekKey` (internally tracked, but verifiable by inspecting the network response's top-level `week` field) equals `2026-W33`, **not** `2026-W35`.
  3. Confirm the on-screen `TaskBar`s and `MetricsRow` values (which represent `2026-W35`, the displayed week) do **not** change at all when the preview appears — no optimistic bump happened, because `isLiveWeek` was correctly `false`.
  4. Click Apply on that back-dated preview. Confirm (via direct file inspection or a follow-up `GET /api/week/2026-W33`) that `data/2026-W33.json`'s counts/metrics updated to reflect the entry's proposed deltas, and confirm `data/2026-W35.json` (the displayed week) is **byte-for-byte unchanged** by this action.
  5. Confirm the on-screen bars for `2026-W35` still show no change after Apply completes — no reconciling `GET` for the wrong week ever fired.
  6. Repeat steps 1–5 for Discard instead of Apply — confirm the discard hits `2026-W33`'s file, `2026-W35`'s file is untouched, and no counts move on-screen either way (Discard never touches counts/metrics regardless of week).
  7. Repeat with a back-dated entry that fails to parse, then click "try again" (`reparse`) — confirm the reparse request's URL targets `2026-W33` (the entry's own week), never `2026-W35`, by inspecting the actual outgoing request in devtools' Network tab.
  8. As a control, repeat steps 1–4 with a diary entry dated **within the currently-displayed week** — confirm this time the optimistic bump *does* show immediately on the on-screen bars, and the follow-up reconciling `GET` *does* fire for `2026-W35` — confirming `isLiveWeek`'s branch correctly activates for the matching case and correctly stays off for the non-matching case, not that it's simply broken in one direction.

---

### Task 20 — Full manual smoke-pass checklist

**Traced to the PRD's testing appendix (following §6.10, itself SP3's slice of BRAINSTORM §3.7's plan) — run against a real dev server with SP1+SP2 in place. This is PRD's own 13-item list plus one addition (item 14, the back-dating scenario) which the PRD's own list omits but which §6.4/§9 Q13 fully specify and which Task 19 above already covers in depth — included here too so the complete end-to-end pass is runnable as one checklist without cross-referencing.**

- **Files:** None (manual procedure). No code changes.

- **Changes:** none — this is a verification task.

- **Acceptance criteria (all 14 must pass in one sitting against a real dev server):**
  1. Load the page with an empty current week — all bars at 0, "do this next" on the first outreach task, no confetti, tab title shows the full left-count.
  2. Tap a counter rapidly (5+ taps in under a second) — bar updates on every tap with no visible lag; only one (or few, batched) network request fires; final server-reconciled count matches the number of taps.
  3. Tap a counter with the network throttled/offline — optimistic value holds, quiet sync-pending indicator appears, no alarming error; bring the network back and confirm it self-heals on the next tap.
  4. Clear every task's `min` one at a time — pointer moves task-to-task in the documented lane-then-task order; the last one clearing fires confetti exactly once; "This week is done" copy appears; the pointer disappears.
  5. Reload the now-cleared week — confetti does NOT replay; bars render already grey/shrunk with no animation flash.
  6. Write a diary entry, Save, wait for the preview, double-click Apply (mouse chatter) — counts move exactly once.
  7. Write a diary entry, Save, click Discard — counts don't move; the entry text is still associated with the (now-discarded) record.
  8. Unset `WORKER_API_KEY` in `.env` and restart — diary Save still returns quickly with the "couldn't read it automatically" note; every other interaction (taps, metric edits, quota edits, links, export/import) still works with zero degradation.
  9. Save a diary entry, then reload the page before clicking Apply/Discard — the preview reappears exactly as it was, not lost, not re-parsed.
  10. Edit a quota's `min` above its `target` — inline error appears, nothing is sent to the server.
  11. Break `config/config.json` (e.g. duplicate a task id) and reload — the readable config-error panel renders naming the field, no data file was touched.
  12. Resize to a phone viewport (or use an actual phone) — slots 1–4 fit without horizontal scroll; the pinned-links strip scrolls horizontally instead of wrapping; tap targets are comfortably thumb-sized.
  13. Click an empty-URL pinned-link pill — nothing happens (no navigation, no error).
  14. **(Addition, not in the PRD's own 13-item list — see Task 19 for the deep-dive version.)** Back-date a diary entry two ISO weeks into the past, Save, Apply — confirm only that prior week's file changes and the currently-displayed week's on-screen bars/metrics never move.

---

## Summary of what requires you (not a dev agent)

Per PRD §8, **none of these are blocking** — SP3's code is written to be correct regardless of how either resolves:

1. **Confirm the `/linkedin` base-path decision once SP5's PRD exists.** SP3 uses `${base}` from `$app/paths` at every fetch/href call site (per §4.2), which is correct whether SP5 ends up setting `kit.paths.base` or stripping the prefix via reverse proxy. This is a verification step for whenever SP5 work resumes, not a blocker now — per the project-wide scope note, hosting/gateway integration is currently out of scope entirely.

2. **Visual sanity check of the confetti burst and the grey/shrink transition timing on a real device**, after Task 11 and Task 8 land. The chosen durations (0.55s settle, 1.1s confetti fall) are reasonable defaults, not measured against a live human reaction, and are cheap to retune (two CSS values) if they read as too slow/fast in practice.

3. **Running Tasks 17–20's manual verification checklists yourself** (or delegating them to a QA pass) once all implementation tasks (1–13) are merged — these are not automated and the PRD deliberately does not introduce a component-testing framework to make them so; someone needs to actually click through the app against a live SP1+SP2 backend.
