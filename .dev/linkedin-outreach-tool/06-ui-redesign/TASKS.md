# Tasks: SP6 — UI Redesign

**Sub-project:** SP6 (depends on SP1 + SP2 + SP3 + SP4)
**Repo:** `Q:\Repos\linkedin-outreach-tool`
**PRD source:** `Q:\Repos\linkedin-outreach-tool\.dev\linkedin-outreach-tool\06-ui-redesign\PRD.md`
**Branch:** `feat/ui-redesign` (already checked out)
**Fresh authoring** — no prior `TASKS.md` existed.

**Gate check performed:** The PRD is approved. PRD §9 Q1–Q10 are all `[RESOLVED]`; there are zero open questions. Safe to implement one task at a time, in the dependency order below, with one commit per implementation task.

**Runtime/build contract:** SvelteKit 2, Svelte 5 runes, ESM, adapter-node, Node 22, Vite 7, and Vitest 4. Use `npm test` for the full suite and `npm run build` for the production build. There is no Svelte component-test framework and this plan must not add one. Test pure `.js` schema, API, aggregation, tally, mapping, and progress logic with Vitest; verify `.svelte` behavior with `npm run build` plus Task 29's manual pass. After every implementation task, run both `npm test` and `npm run build`; do not commit a red suite or build.

**SP1/SP2 contract this plan depends on (do not rename or re-invent):**

- `src/lib/config.js` currently exports `CONFIG_PATH`, `ConfigError`, `isAllowedUrl(u)`, `validateConfig(raw)`, `loadConfig(configPath = CONFIG_PATH)`, and `writeConfig(config, configPath = CONFIG_PATH)`. `validateConfig` currently returns the validated object; SP6 makes that returned object a normalized clone whose missing `tasks[].linePct` values are `75`, and `writeConfig` persists that normalized result.
- `src/lib/weeks.js` currently exports `DATA_DIR`, `WeekError`, `isValidWeekKey`, `dateToWeekKey`, `currentWeekKey`, `weekKeyToRange`, `nextWeekKey`, `prevWeekKey`, `listWeekKeys`, `emptyWeek`, `readWeek`, `writeWeek`, `projectWeekForConfig`, `bumpCount`, `setMetric`, `appendEntry`, `applyEntryToWeek`, `discardEntry`, `markEntryFailed`, `removeEntry`, `appendItem(week, { taskId, link = null })`, and `attachItemLink(week, itemId, link)`. Keep all existing exports. Add `appendItems(week, { taskId, notes }) -> { week, items }` and `removeItems(week, { taskId, itemIds }) -> { week, removedIds }`; these new helpers own the one-item/one-count invariant.
- `GET /api/week/[week]` returns the week object; `PATCH /api/week/[week]` retains `{ counts, metrics }` delta/absolute behavior. `PATCH /api/week/[week]/items/[id]` retains the existing `{ link }` contract for past-week compatibility.
- The collection route becomes `POST /api/week/[week]/items` with `{ taskId, notes: string[] }` and response `{ items, week }`, plus `DELETE /api/week/[week]/items` with `{ taskId, itemIds: string[] }` and response `{ removedIds, week }`. One request performs one read-modify-write. The legacy single-item POST may remain accepted, but the SP6 main page must never use it.
- `POST /api/import` continues to validate the entire payload before backups or writes. It gains additive `item.note` validation and old-config normalization. Export routes remain shape-transparent and therefore preserve `note` without special handling.
- Existing `selectNextTask(config, counts)`, diary Apply/Discard/Reparse routes, `weekFourCheck(...)`, and `/week/[week]` remain behaviorally compatible. SP6 changes presentation and adds confirmed-total/dirty-week reconciliation; it does not change diary parsing or D24 math.

**Execution rule:** A task may touch an SP1/SP2 contract only where explicitly identified below. Such a task must update its contract tests in the same commit. Component tasks must not add a rendering-test dependency. Tasks 2–13 are prerequisites for the component sequence; Tasks 14–27 may then proceed in their stated dependency order. Task 28 is the final automated regression gate, and Task 29 is explicitly manual.

---

### Task 1 — Tailwind v4, DaisyUI v5, and persistent themes

**Traced to PRD §4.B, §6.2**

- **Depends on:** none.
- **Files:**
  - `package.json`
  - `package-lock.json`
  - `vite.config.js`
  - `src/app.css` (new)
  - `src/app.html` (only for the pre-hydration theme bootstrap)
  - `src/routes/+layout.svelte`
- **Changes:** Run `npm install --save-dev tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 daisyui@5.7.22`; do not hand-edit the lockfile. This machine's configured npm proxy may lag the public registry and direct public npm is TLS-blocked. Try the exact versions first; if any exact version is unresolvable through the configured proxy, pin only that package to the nearest available compatible version and record the substitution in the commit body and this file's Changelog before committing. Add `@tailwindcss/vite` to Vite's existing `plugins` without removing `sveltekit()`. Create the single CSS entry with Tailwind v4 and DaisyUI v5 registration and only `cupcake`/`synthwave` enabled. Import it once from `+layout.svelte`; remove the old global custom-property palette rather than layering two theme systems. Preserve localStorage key `theme`, values `light|dark`, default dark; map light to `document.documentElement.dataset.theme = 'cupcake'` and dark to `synthwave`. Establish the saved/default theme before hydration in `app.html` so a saved light theme does not flash synthwave. Keep storage access guarded and expose no unsaved popup state through storage.
- **Acceptance criteria:**
  - `package.json` and lockfile contain the exact three requested versions, or the nearest-proxy exception is explicitly documented as required above.
  - Computed `data-theme` is `synthwave` for no saved value/dark and `cupcake` for light; both choices survive reload with no opposite-theme flash.
  - There is no Tailwind v3 config file and no second global theme layer.
  - `npm test` and `npm run build` pass.

---

### Task 2 — Config `linePct` normalization and validation (SP1 touch, test-first)

**Traced to PRD §4.C, §5.1, §7.1**

- **Depends on:** Task 1.
- **Files:**
  - `src/lib/config.js`
  - `src/lib/config.test.js`
  - `src/routes/api/config/config.server.test.js` (update only if response expectations require normalized output)
- **Changes:** Before production edits, add failing Vitest cases. Change `validateConfig(raw)` to normalize an omitted `tasks[i].linePct` to `75` without mutating the caller, and validate a present value as an integer in `[1,100]`, reporting the exact field `tasks[i].linePct`. Keep every existing id/lane/min/target/link rule. Ensure `loadConfig` returns normalized data and `writeConfig` writes the normalized result so an old config becomes explicit on its next successful Save/PUT. This is an SP1 config-contract change; update its unit/API tests in this same commit.
- **Acceptance criteria:**
  - Vitest cases prove omission becomes `75`; `1` and `100` pass; `0`, `101`, fractions, strings, and `null` throw `ConfigError` with `field === 'tasks[i].linePct'`.
  - A test proves normalization does not mutate its input object.
  - PUT of an old config succeeds and the object passed to `writeConfig` has explicit `linePct: 75` on every formerly-missing task.
  - Existing config-validation tests still pass; `npm test` and `npm run build` pass.

---

### Task 3 — Additive item notes and atomic week helpers (SP1 touch, test-first)

**Traced to PRD §4.G, §4.H, §5.2, §7.1**

- **Depends on:** Task 2.
- **Files:**
  - `src/lib/weeks.js`
  - `src/lib/weeks.apply.test.js`
  - `src/lib/weeks.io.test.js`
- **Changes:** Add optional `item.note` while retaining legacy nullable `item.link`, week version `1`, `appendItem`, and `attachItemLink`. Add exported pure `appendItems(week, { taskId, notes })` and `removeItems(week, { taskId, itemIds })`. `appendItems` validates 1–50 strings, trims each to non-empty text of at most 4,000 characters, appends N unique UUID rows in input order as `{id,taskId,at,note,link:null}`, and raises `counts[taskId]` by N in one cloned result. `removeItems` requires a non-empty unique id array, validates existence and task ownership for every id plus `count >= N`, then removes exactly those rows and subtracts N without changing the unitemized residual. Any validation failure throws before returning a changed clone. Preserve untouched counts, metrics, entries, and items. Keep `readWeek` backward-compatible with absent `items`, absent `note`, orphan task ids, and legacy links. This is an SP1 week-contract change; update tests in the same commit.
- **Acceptance criteria:**
  - Vitest proves N notes create N distinct ordered rows, trim text, increment once per row, and do not mutate input.
  - Invalid batch size, blank note, non-string note, and >4,000-character note produce no partial result.
  - Remove tests cover duplicate, missing, stale, and cross-task ids; `count < selectedCount` rejects rather than clamps.
  - Valid removal covers `count > itemCount` and `count === itemCount`, preserves the residual, and changes no unrelated field.
  - Legacy rows with no `note` and safe/null `link` still read and round-trip; `npm test` and `npm run build` pass.

---

### Task 4 — Seed `linePct`, supplied links, and schema documentation

**Traced to PRD §4.D, §5.1, §8**

- **Depends on:** Tasks 2–3.
- **Files:**
  - `config/config.json`
  - `config/README.md`
- **Changes:** Add `linePct: 75` to all five live tasks without changing their current `min`, `target`, lane, label, or link policy. Preserve the existing LinkedIn Notifications and Creator Analytics URLs; fill the three blank entries exactly with the supplied Reachouts sheet, My profile, and Strategy doc URLs, leaving all five entries in their current config order. Document `linePct` as an independent 1–100 visual guide (default 75), not a quota or alias for `min`. Correct the stale D15 prose: `link:"required"` is a UI nudge only and must never block a manual increment; SP6 notes are valid concrete items. Document optional `item.note`/legacy `item.link` compatibility and no version bump.
- **Acceptance criteria:**
  - `loadConfig()` accepts the seed and all five tasks have explicit `75`.
  - Config contains the five PRD §4.D names/URLs in order and no quota changed.
  - README examples and validation table match the normalized runtime contract.
  - `npm test` and `npm run build` pass.

---

### Task 5 — Batch-add and bulk-remove item API (SP2 touch, test-first)

**Traced to PRD §4.G, §4.H, §5.4, §7.1**

- **Depends on:** Task 3.
- **Files:**
  - `src/routes/api/week/[week]/items/+server.js`
  - `src/routes/api/week/[week]/items/items.server.test.js`
- **Changes:** Replace the redesigned collection path with batch `POST {taskId,notes}` using `appendItems`, returning `{items,week}`; add collection `DELETE {taskId,itemIds}` using `removeItems`, returning `{removedIds,week}`. Validate the real ISO week key before body/config/disk access, require a configured task id, and perform exactly one `readWeek` plus one `writeWeek` only after all validation succeeds. Never gate creation on `task.link === 'required'`. Keep the existing single-item POST only if needed for backward compatibility, clearly isolated from the SP6 path. Keep `PATCH /items/[id]` unchanged. This is an SP2 API-contract change; route tests belong in this commit.
- **Acceptance criteria:**
  - POST tests cover ordered N-row creation/count `+N`, 1 and 50 boundaries, 0 and 51 rejection, invalid-note all-or-nothing behavior, unknown task, corrupt week, and path traversal.
  - Notes containing plain text, safe http/https, malformed URL text, `javascript:`, `data:`, protocol-relative, backslash-obfuscated, or control-character text are stored as plain note strings; route creation does not promote any value to `href`.
  - DELETE tests cover unique ownership/existence/count validation, duplicate/missing/stale/cross-task rejection with zero writes, and exact residual-preserving subtraction.
  - Successful POST and DELETE each call `writeWeek` exactly once and return the authoritative projected week; the existing item PATCH tests remain green.
  - `npm test` and `npm run build` pass.

---

### Task 6 — Import note validation and normalized round-trip (SP2 touch, test-first)

**Traced to PRD §5.3, §7.1**

- **Depends on:** Tasks 2–3.
- **Files:**
  - `src/routes/api/import/+server.js`
  - `src/routes/api/import/import.server.test.js`
  - `src/routes/api/import/import.realdisk.server.test.js`
  - `src/routes/api/export/export.server.test.js` (round-trip assertion only)
- **Changes:** Extend `structuralCheckWeek` to validate item `id`, `taskId`, and `at` as strings; when `note` is present, require a string with non-empty trim and at most 4,000 characters. Continue to allow historical orphan task ids and legacy missing `note`; continue validating `link` with `isAllowedUrl`. Normalize an imported old bundle config through `validateConfig` before any backup/write and persist its defaulted `linePct`. Preserve notes exactly during import/export serialization. Keep the existing validate-all → backup-all → write flow; no invalid note may create a backup or write. This is an SP2 import contract change and its route/real-disk tests must change in this commit.
- **Acceptance criteria:**
  - Tests reject invalid note type, blank note, excessive length, and unusable item structure before `existsSync`, backups, `writeConfig`, or `writeWeek`.
  - Legacy item rows without `note` still import; orphan `taskId` remains accepted.
  - An old bundle config imports with explicit `linePct:75` persisted.
  - Export → import → export preserves safe URL notes, unsafe URL-like notes, plain notes, and legacy links exactly.
  - `npm test` and `npm run build` pass.

---

### Task 7 — Canonical task visual vocabulary (test-first)

**Traced to PRD §4.C, §7.1**

- **Depends on:** Task 1.
- **Files:**
  - `src/lib/utils/taskVisuals.js` (new)
  - `src/lib/utils/taskVisuals.test.js` (new)
- **Changes:** Define the single id-keyed map for `post ✦ Posts secondary/rose`, `comments ◆ Comments accent/violet`, `invites ➜ Requests info/cyan`, `dms ◇ DMs primary/blue`, and `call_ask ◎ Calls warning/amber`. Export a lookup accepting `(taskId, configLabel)` and returning symbol, short text, and Daisy semantic color-role/class data. Unknown ids return `•`, the supplied config label (or id), and neutral base-content styling; never throw. Components must consume this helper rather than duplicate symbols or colors.
- **Acceptance criteria:**
  - Tests assert all five exact symbol/text mappings and safe fallback behavior.
  - No helper output depends on current theme or DOM state.
  - `npm test` and `npm run build` pass.

---

### Task 8 — All-time totals aggregation (test-first)

**Traced to PRD §4.E, §5.5, §7.1**

- **Depends on:** Task 3.
- **Files:**
  - `src/lib/utils/allTimeTotals.js` (new)
  - `src/lib/utils/allTimeTotals.test.js` (new)
- **Changes:** Export `sumAllTimeTotals(config, readableWeeks)` returning every current task id initialized to zero and summing only `week.counts[id] ?? 0`. Do not add entries or items separately, cap at 52, or include orphan ids. Keep filesystem/error handling out of this pure helper; `+page.server.js` owns unreadable-week isolation.
- **Acceptance criteria:**
  - Tests cover no weeks, manual-item, diary-applied, mixed, and orphan-task weeks and prove counts are summed exactly once.
  - A fixture with more than 52 weeks includes every week.
  - Returned keys follow current config task ids and all missing values are zero.
  - `npm test` and `npm run build` pass.

---

### Task 9 — Timezone-correct activity tally and ranges (test-first)

**Traced to PRD §4.I, §5.6, §7.1**

- **Depends on:** Task 3.
- **Files:**
  - `src/lib/utils/activityTally.js` (new)
  - `src/lib/utils/activityTally.test.js` (new)
- **Changes:** Export pure helpers `buildActivityIndex(weeks, config)` and `activityRange(index, startDate, endDate)`. Index only diary entries with `parseStatus:'ok'` using `entry.applied.counts` on explicit `entry.date`, and one contribution per manual item on the local calendar date of `item.at` in `config.timezone`. Never add aggregate `week.counts`. Preserve post item note/link display data by item id, safely classified with the existing strict URL semantics; identical text from distinct ids remains distinct. Normalize reversed/cross-month ranges and emit every date ascending, including zero rows. Use `Intl.DateTimeFormat(...,{timeZone})`; never slice a UTC item timestamp for its local date.
- **Acceptance criteria:**
  - Tests exclude pending, failed, discarded, proposed-only entries, raw text, metrics, and legacy count-only deltas.
  - Mixed diary/manual days do not double-count.
  - Pacific-boundary fixtures land on the configured local date.
  - Single-day, reversed, and cross-month ranges normalize and include zero days.
  - Post notes/legacy links stay on the correct day; unsafe URL-like notes remain text.
  - `npm test` and `npm run build` pass.

---

### Task 10 — Progress and gradient math (test-first)

**Traced to PRD §4.C, §7.1**

- **Depends on:** Task 2.
- **Files:**
  - `src/lib/utils/progressMath.js` (new)
  - `src/lib/utils/progressMath.test.js` (new)
- **Changes:** Export `progressPercent(count,target)` and `gradientStops(linePct)`. Progress clamps to `0..100`; target zero returns 100 without division. Gradient output uses shared Daisy theme variables for the same low/guide/complete family on every bar and varies only the middle stop position. Make the output suitable for a full-width track gradient that is clipped by a progress-width mask, not compressed into the fill width.
- **Acceptance criteria:**
  - Tests cover negative/zero/partial/target/over-target counts and zero target with no `NaN`/Infinity.
  - Tests prove `linePct` controls only the middle stop and low/complete stops remain identical across tasks.
  - No result selects a grey completion class.
  - `npm test` and `npm run build` pass.

---

### Task 11 — One-active-popup and Escape controller

**Traced to PRD §4.D, §4.K, §7.2**

- **Depends on:** Task 1.
- **Files:**
  - `src/lib/stores/popupStore.svelte.js` (new)
- **Changes:** Implement a Svelte 5 context store with one active popup `{id,discard,trigger}`. `open(id, discard, trigger)` first invokes the current discard callback when changing popups; `close(id)` clears only the owner; one document-level Escape handler invokes discard and clears state. Provide focus-return support to the trigger and small helpers for modal focus trapping. The provider must install/remove exactly one key listener for the page tree. Unsaved drafts remain component-local and are discarded, never persisted or sent.
- **Acceptance criteria:**
  - A small browser/build smoke proves opening B discards A, Escape discards only the active popup, and close returns focus to the trigger.
  - No component-test dependency is added; detailed keyboard behavior remains in Task 29.
  - `npm test` and `npm run build` pass.

---

### Task 12 — Root server load: totals, activity slices, and isolated failures

**Traced to PRD §4.E, §4.I, §5.5, §5.6, §7.1**

- **Depends on:** Tasks 8–9.
- **Files:**
  - `src/routes/+page.server.js`
  - `src/routes/+page.server.test.js` (new)
- **Changes:** Keep the existing `ConfigError` short-circuit and current `week`/`weekKey`. Replace the 12-week sparkline, main-page metrics/history/log/next-week payload with: (1) `allTimeTotals` from every key returned by `listWeekKeys()` and every readable projected week, using `sumAllTimeTotals`; (2) `totalsIncomplete` plus a server warning when an individual `readWeek` raises `WeekError`, omitting only that week; (3) `activityWeeks`, a minimal map of every ISO week overlapping the current calendar month/grid, each value containing only `{week,entries,items}`; and (4) the existing deterministic `weekFourCheck` result, reusing readable week data rather than adding duplicate reads. Include the current week even when no file exists. Do not add a totals/calendar endpoint or a 52-week cap.
- **Acceptance criteria:**
  - Mocked-load tests prove missing data yields five zero totals, more than 52 files are all counted, and mixed weeks use counts once.
  - One corrupt/unreadable week does not crash load, sets `totalsIncomplete:true`, and valid weeks still total correctly.
  - Activity payload contains actual entries/items for every current-grid overlapping week and no aggregate placeholder counts.
  - Returned main-page data no longer contains `sparkline`, `headlineMetricId`, `historyWeeks`, `calendarMonth`, `nextWeekPreview`, `logInitial`, or `logOldestLoadedWeek`.
  - Existing D24 output remains unchanged; `npm test` and `npm run build` pass.

---

### Task 13 — Reactive week store, totals, config, and dirty-week truth

**Traced to PRD §4.E, §4.I, §4.K**

- **Depends on:** Tasks 8 and 12.
- **Files:**
  - `src/lib/stores/weekStore.svelte.js`
- **Changes:** Extend `createWeekStore(initialWeek, config, allTimeTotals)` while retaining `week`, `weekKey`, `historyVersion`, `lastDirtyWeek`, `bumpLocalCount`, `setLocalMetric`, `replaceWeek`, `markWeekDirty`, and context APIs for `/week/[week]` compatibility. Make `config` and `allTimeTotals` replaceable reactive state; add `replaceConfig(nextConfig)`, `replaceAllTimeTotals(nextTotals)`, and `adjustAllTimeTotal(taskId, confirmedDelta)`. Only callers with a successful server-confirmed mutation may adjust totals. `replaceWeek` remains authoritative after every response.
- **Acceptance criteria:**
  - Existing current/past-week behavior still builds.
  - A browser smoke shows config/totals replacements rerender consumers and dirty-week version/key still advance.
  - Failed requests cannot leave an optimistic all-time total.
  - `npm test` and `npm run build` pass.

---

### Task 14 — JSON editor shell and pure config mappings

**Traced to PRD §4.D, §4.F, §7.1**

- **Depends on:** Tasks 2, 11, and 13.
- **Files:**
  - `src/lib/components/JsonListEditor.svelte` (new)
  - `src/lib/utils/configEditors.js` (new)
  - `src/lib/utils/configEditors.test.js` (new)
- **Changes:** Build the reusable DaisyUI modal shell with one JSON textarea, Save/Discard, parse/value errors naming the failing array index, focus trap, viewport-clamped scrolling, and popup-store registration. Add pure mappings: links expose `[{name,link}]` from internal `{label,url}` and replace only latest config `links`; lane rows expose `[{task,min,target,linePct}]` and replace only numeric fields for the exact ids already in that lane. Lane validation rejects missing/duplicate/unknown/cross-lane/added/removed ids, non-integers, negatives, `min>target`, and `linePct` outside 1–100. Links permit empty URLs and otherwise reuse strict http/https validation. Save callers must GET latest config, apply a pure mapping, PUT the full config, then replace store config only on success.
- **Acceptance criteria:**
  - Vitest proves link mapping round-trips order and `{name,link}`/`{label,url}` without changing any non-link field.
  - Vitest proves lane edits preserve ids/order/other lanes/labels/link policy and reject every forbidden structural/numeric case.
  - Invalid JSON/value keeps the modal and draft open; Discard/backdrop/Escape sends no request.
  - `npm test` and `npm run build` pass.

---

### Task 15 — Stable header: Links, Data, Keyboard, theme

**Traced to PRD §4.B, §4.D, §6.1–§6.3**

- **Depends on:** Tasks 7, 11, 13, and 14.
- **Files:**
  - `src/lib/components/AppHeader.svelte` (new)
  - `src/routes/+layout.svelte`
- **Changes:** Render exact order `brand · Links · Data · Keyboard · theme toggle`. Anchor each dropdown in a relative wrapper with absolute Daisy `dropdown-content`; opening cannot change header/trigger geometry, and only one popup is active. Links render in config order; safe URLs use external anchors with `target="_blank" rel="noopener noreferrer"`, empty URLs are inert, and final item is always Edit → links-mode `JsonListEditor`. Data contains only Export this week, Export everything, and Import. Import failure stays readable without replacing state; success calls `invalidateAll()`. Keyboard opens a modal with all five shared visual rows and `<kbd>Escape</kbd> — discard / close any popup`. Theme toggle synchronously updates `theme=light|dark` and `data-theme`. On small screens keep one stable non-wrapping row via compact labels/horizontal action scrolling; clamp dropdowns to the viewport.
- **Acceptance criteria:**
  - Header order and dropdown contents/copy are exact.
  - Links/Data opening does not change parent dimensions or move neighboring triggers; outside click/Escape closes.
  - Import success invalidates; failure leaves config/week/totals unchanged and readable.
  - Keyboard navigation, focus return, safe URL handling, both theme values, and no overflow pass a build/browser smoke.
  - `npm test` and `npm run build` pass.

---

### Task 16 — Five compact all-time totals

**Traced to PRD §4.E, §6.1–§6.2**

- **Depends on:** Tasks 7 and 13.
- **Files:**
  - `src/lib/components/TotalsRow.svelte` (new)
- **Changes:** Render exactly five compact boxes in fixed product order Posts, Comments, Requests, DMs, Calls, using `taskVisuals` and reactive store totals. Each contains symbol, short text, and count only. Provide compact five-across then 3+2/horizontal behavior; do not create five vertically stacked dashboard cards. Color is supplementary to symbol/text.
- **Acceptance criteria:**
  - Missing totals render zero and unknown config data cannot crash the fixed five.
  - No comparison, target, trend, celebration, or “best” language appears.
  - Both themes have visible text/focus and responsive layout without document overflow.
  - `npm test` and `npm run build` pass.

---

### Task 17 — Weekly goals and embedded D24 row

**Traced to PRD §4.E, §4.J, §6.1**

- **Depends on:** Tasks 7, 13, and 14.
- **Files:**
  - `src/lib/components/WeekGoals.svelte` (new)
  - `src/lib/components/WeekFourCheck.svelte`
- **Changes:** Render `This week’s goals`, Monday–Sunday range, and five compact entries using shared visuals and `count / min–target` (or `count / target` when equal). Call existing `selectNextTask`; show exactly `Next: {symbol} {short label} · {N} to the minimum`, or verbatim `This week is done. Anything from here is extra.` once all minima clear. Move/restyle existing deterministic `WeekFourCheck` immediately below that line as a small dismissible row; preserve its formula, copy, outcome semantics, and dismissal key. Use factual copy only.
- **Acceptance criteria:**
  - Config-authored current counts/min/targets update reactively and selection remains deterministic.
  - Done copy is exact; no days-left, comparison, good/bad, streak, missed, or encouragement copy is introduced.
  - D24 remains distinct, small, dismissible, and absent when not due.
  - `npm test` and `npm run build` pass.

---

### Task 18 — Dynamic multi-note add dialog

**Traced to PRD §4.G, §7.2**

- **Depends on:** Tasks 5, 7, 11, and 13.
- **Files:**
  - `src/lib/components/ItemAddDialog.svelte` (new)
- **Changes:** Accept the task/current week and open with one empty freeform text input. Once the last field has non-whitespace text, append exactly one trailing empty field; clearing a middle field never destroys later fields. Save filters/trims non-empty rows in order and sends one `POST {taskId,notes}`. Disable Save until at least one filled value. On success replace week from response, adjust all-time total by `items.length` exactly once, mark the current week dirty, clear draft, and close. On failure keep dialog/draft open with neutral retry text. Discard/backdrop/Escape makes no request and stores nothing.
- **Acceptance criteria:**
  - Build/browser verification covers one input, trailing blank creation, middle clearing, ordered filtering, and one batch request.
  - Safe URLs, unsafe URL-like text, names, and ordinary notes are accepted as freeform text; no `{@html}` exists.
  - Success uses server week truth; failure and discard do not change totals/store/disk.
  - Focus trap/return and mobile scrolling work; `npm test` and `npm run build` pass.

---

### Task 19 — Atomic multi-select remove dialog

**Traced to PRD §4.H, §7.2**

- **Depends on:** Tasks 5, 7, 11, and 13.
- **Files:**
  - `src/lib/components/ItemRemoveDialog.svelte` (new)
- **Changes:** List only current-week manual items matching the task, consistently newest first, one checkbox each, showing safe note/link fallback plus local date/time. Provide Remove and Discard; disable Remove until selected. Submit one collection DELETE. On success replace week, decrement all-time total by `removedIds.length` exactly once, mark dirty, clear, and close. On failure retain selection/dialog. When count is positive but no matching item exists, show verbatim `No manually logged items to remove. Diary and older count-only activity stays with its record.` and keep Remove disabled. Notes render as anchors only through strict safe URL checking; otherwise escaped wrapped text.
- **Acceptance criteria:**
  - No diary contribution or anonymous residual can be selected/decremented.
  - Multi-select issues exactly one DELETE and reconciles from its response.
  - Empty-state copy is exact; destructive action is text-labeled Remove, not color/icon alone.
  - Discard/Escape makes no request; focus/mobile behavior passes build/browser verification.
  - `npm test` and `npm run build` pass.

---

### Task 20 — Redesigned task bar with inline minus/bar/plus

**Traced to PRD §4.C, §4.F, §4.G–§4.H**

- **Depends on:** Tasks 10, 13, 18, and 19.
- **Files:**
  - `src/lib/components/TaskBar.svelte`
- **Changes:** Replace debounced count-tap/quota-edit behavior on the main page with only two rows: shared symbol + short label, then inline `− · progress bar · +`. Minus/plus open their dialogs and never PATCH counts directly. Put numeric `count / min–target` inside or immediately over the bar. Render a full-track shared gradient clipped to `progressPercent`, internal guide at `linePct`, terminal line at 100%, and no grey completion state. The accessible bar name states task/count/min/target/guide. Keep buttons at least 40×40; minus disables only at count zero (positive/no-removable-items opens truthful empty state). Remove per-task editing.
- **Acceptance criteria:**
  - Every bar uses identical low/guide/complete stops; only `linePct` moves the middle stop; over-target stays at warm 100%.
  - Guide and terminal lines remain structurally distinct in both themes.
  - No main-page path calls `PATCH /api/week/[week]` for plus/minus.
  - Touch, keyboard, screen-reader names, reduced motion, and both themes pass build/browser verification.
  - `npm test` and `npm run build` pass.

---

### Task 21 — Lane shell and one editor per lane

**Traced to PRD §4.F, §6.1–§6.2**

- **Depends on:** Tasks 14 and 20.
- **Files:**
  - `src/lib/components/WeekLanes.svelte`
- **Changes:** Keep Outreach then Presence in config order. Each heading has exactly one edit symbol opening lane-mode `JsonListEditor`; no task has an editor. Render redesigned TaskBars for that lane in authored task order. Successful edit GETs latest config, replaces only `min/target/linePct` for exact lane ids, PUTs the full config, then calls `replaceConfig`; failure keeps draft/config unchanged. Include help that `linePct` is an independent getting-warmer guide, while min/target are quotas. Stack lanes on small screens without reordering.
- **Acceptance criteria:**
  - Exactly two lane-level edit triggers and zero task-level edit triggers render for the seed.
  - Invalid/restructured JSON causes no PUT; successful lane edits preserve every unrelated field.
  - Task control rows never wrap minus/bar/plus out of order.
  - `npm test` and `npm run build` pass.

---

### Task 22 — Diary and preview DaisyUI migration with confirmed totals

**Traced to PRD §4.I, §4.K, §7.2**

- **Depends on:** Tasks 7 and 13.
- **Files:**
  - `src/lib/components/DiaryBox.svelte`
  - `src/lib/components/EntryPreview.svelte`
- **Changes:** Restyle with Daisy semantic classes while retaining the full idle/saving/preview/failed/reparse state machine, verbatim failure copy, Apply/Discard gate, and authoritative `entryWeekKey` retro-routing. Harden non-OK/network/invalid-response paths so drafts and state do not disappear incorrectly. On successful Apply, inspect the existing `{entry,alreadyApplied}` response: adjust all-time totals by `entry.applied.counts` only when `alreadyApplied === false`, never on repeated/already-applied responses; mark the entry's own week dirty. Reconcile live bars only when entry week equals store week. Discard changes no total. Keep LLM-down verbatim-save behavior.
- **Acceptance criteria:**
  - Current-week first Apply updates bars/totals once; repeated Apply updates neither twice.
  - Retro Apply leaves current bars unchanged, adjusts totals once, and dirties the historical week.
  - Discard and failed requests do not alter totals; failed parse still offers try again.
  - No diary prompt/provider/schema/API call-count change is made.
  - `npm test` and `npm run build` pass.

---

### Task 23 — Smaller selectable heat calendar

**Traced to PRD §4.I, §4.J, §6.1–§6.2**

- **Depends on:** Tasks 9, 10, and 13.
- **Files:**
  - `src/lib/components/MonthCalendar.svelte`
- **Changes:** Replace dot/current-week/next-week rendering with a smaller seven-column button grid. Seed cache from `data.activityWeeks`, derive four stable activity levels (1, 2–4, 5–9, 10+) from `activityTally`, and use the shared low→guide→complete family. Default selection is today. Plain click sets anchor/start/end to one day; Shift-click extends from prior anchor and normalizes either direction. Preserve selection through month navigation; allow cross-month ranges and fetch/cache every overlapping ISO week through existing `GET /api/week/[week]`. On `historyVersion/lastDirtyWeek`, refetch affected cached week and rederive heat/tally. Distinguish today, endpoints, range body, and heat structurally; add date/activity `aria-label` and selection/range ARIA state. Remove next-week preview entirely.
- **Acceptance criteria:**
  - Plain, Shift-reversed, month-navigation, and cross-month selections produce deterministic normalized ranges.
  - Dirty weeks refresh without full reload and no new calendar endpoint is called.
  - Grid remains seven columns/smaller on phones; no next-week or Load earlier copy exists.
  - Heat is not sole information and all selection states are distinct in both themes.
  - `npm test` and `npm run build` pass.

---

### Task 24 — Read-only “What happened” tally

**Traced to PRD §4.I, §4.J, §6.1**

- **Depends on:** Tasks 7, 9, and 23.
- **Files:**
  - `src/lib/components/WhatHappened.svelte` (new)
- **Changes:** Consume calendar's selected range and cached week data through an explicit prop/callback contract, then call `activityRange`. For one day show one compact shared-symbol tally row; for a range show every day ascending, including neutral `Nothing recorded`. Show that day's post notes/legacy links as wrapped chips/text, de-duped only by item id and promoted to anchors only by strict URL validation. Keep it read-only: no edit, parse-status, Apply, delete, raw diary paragraph, pagination, or LLM summary.
- **Acceptance criteria:**
  - Task order/symbol/short labels match all other surfaces.
  - Single day and cross-month range update immediately with zero-day rows preserved.
  - Unsafe values render as escaped text; safe links use `_blank` plus `noopener noreferrer`; no `{@html}` exists.
  - `npm test` and `npm run build` pass.

---

### Task 25 — Theme-aware, reduced-motion confetti

**Traced to PRD §6.4, §4.K, §7.3**

- **Depends on:** Tasks 1 and 13.
- **Files:**
  - `src/lib/components/Confetti.svelte`
- **Changes:** Preserve once-per-week localStorage semantics and no burst on an already-cleared initial load. Replace hard-coded hue pieces with theme-compatible semantic colors. Under `prefers-reduced-motion: reduce`, remove movement and either show a static brief color treatment or no confetti; completion state must remain unchanged. Keep storage guarded and cosmetic only.
- **Acceptance criteria:**
  - Clearing the final minimum fires once; reload does not replay.
  - Cupcake/synthwave pieces remain visible without becoming a second game system.
  - Reduced motion has no falling/rotating animation.
  - `npm test` and `npm run build` pass.

---

### Task 26 — Exact SP6 root-page wiring and old-main removal

**Traced to PRD §4.J, §6.1**

- **Depends on:** Tasks 12–25.
- **Files:**
  - `src/routes/+page.svelte`
- **Changes:** Initialize `createWeekStore(data.week,data.config,data.allTimeTotals)` and provide both week and popup contexts. Render exact order: AppHeader; TotalsRow; WeekGoals (including D24); WeekLanes; DiaryBox; MonthCalendar; WhatHappened. Repurpose/rename SP4 slots to calendar-only and `what-happened`; do not append a second history area. Remove root imports/mounts for `PinnedLinks`, `MetricsRow`, `Sparkline`, `HistoryStrip`, `DiaryLog`, and their load-earlier/next-week behavior. Move Confetti without changing visual order/accessibility. Keep the config-error branch readable under DaisyUI.
- **Acceptance criteria:**
  - DOM order matches PRD §4.J exactly.
  - `/` contains no MetricsRow, Sparkline, HistoryStrip, weeks-completed copy, next-week preview, DiaryLog rows, or Load earlier.
  - Add/remove/diary/import/config mutations reconcile week, totals, config, and dirty-week caches through their specified server-truth paths.
  - `npm test` and `npm run build` pass.

---

### Task 27 — Retained past-week route and components under DaisyUI

**Traced to PRD §4.A, §4.K, Non-Goals**

- **Depends on:** Tasks 1, 3, and 22.
- **Files:**
  - `src/routes/week/[week]/+page.svelte`
  - `src/lib/components/LogRow.svelte`
  - `src/lib/components/LinkAttachForm.svelte`
  - `src/lib/components/WeekSnapshotBar.svelte`
  - `src/lib/components/WeekSnapshotMetrics.svelte`
- **Changes:** Migrate every still-rendered retained surface from removed `--card-bg`/`--fg` variables to DaisyUI/Tailwind semantic styling. Preserve `/week/[week]` count correction, metrics readout, EntryPreview reuse, legacy link PATCH, orphan task-id fallback, safe URL defenses, and current-week link. Teach LogRow/LinkAttachForm to safely display additive `item.note` first, with legacy `item.link` fallback, without changing note text or introducing `{@html}`. Do not redesign APIs or remove retained components.
- **Acceptance criteria:**
  - Current and past-week pages build/render in cupcake and synthwave without undefined old custom properties.
  - Legacy link attach/edit and past-week correction persist as before.
  - New notes, legacy links, orphan ids, pending previews, and applied/discarded/failed entries render without crash.
  - `npm test` and `npm run build` pass.

---

### Task 28 — Final automated regression and dead-reference cleanup

**Traced to PRD §3, §7.1–§7.2**

- **Depends on:** Tasks 1–27.
- **Files:**
  - `src/routes/+page.server.js`
  - `src/routes/+page.svelte`
  - `src/lib/components/**` and `src/lib/utils/**` only where dead SP6 references or directly coupled regressions are found
  - Existing/new Vitest files from Tasks 2–12
- **Changes:** Reconcile the complete test matrix: config linePct/default persistence; item note/batch add/bulk remove/residuals; import round-trip; all-time totals; activity tally/timezone/ranges; task visual fallback; config-editor mappings; and progress math. Remove dead root-page imports/props/load fields and old CSS-variable dependencies from rendered surfaces. Do not delete old components merely because `/` no longer mounts them if another route imports them. Run the full suite and production build under Node 22-equivalent. Fix only regressions directly caused by SP6.
- **Acceptance criteria:**
  - `npm test` passes the entire existing and SP6 suite, including the named matrices above.
  - `npm run build` passes with no unresolved import, Svelte warning caused by SP6, or client import of server-only `weeks.js`.
  - Searches confirm no root-page reference to MetricsRow/Sparkline/HistoryStrip/DiaryLog/next-week/load-earlier and no rendered component dependency on removed custom theme variables.
  - No component-test framework, chart/calendar/modal/icon/date/animation library, database, auth, or new endpoint was added.

---

### Task 29 — Manual smoke pass in both themes

**Traced to PRD §7.3. Explicitly manual: the project has no component-testing framework and this task must not add one.**

- **Depends on:** Task 28.
- **Files:** none — verification only against a real Node 22 dev/production-equivalent run. No commit is required unless the pass uncovers a defect; fix any defect in the owning task's files/tests and rerun Tasks 28–29.
- **Changes:** Walk the complete release checklist once in `cupcake` and once in `synthwave`.
- **Acceptance criteria:**
  1. Inspect normal, hover, focus, disabled, loading, empty, error, selected, and destructive states; normal text meets 4.5:1, large/non-text controls 3:1, and focus is visible.
  2. Reload after both theme choices; the same `theme=light|dark` value returns and no opposite-theme flash appears.
  3. Open Links, Data, and Keyboard; each overlays below its trigger without moving any header button. Outside click and Escape discard/close and return focus.
  4. Edit links with valid reordered JSON, Save, reload, and confirm exact order/URLs. Repeat malformed JSON/unsafe URL then Escape; config remains untouched.
  5. Edit both lanes' min/target/linePct; only that lane's numeric fields change and all bars retain one shared gradient family.
  6. Add one plain note, one safe URL, and three notes in one Save; exactly N rows and `+N` count/total result, with no trailing blank stored.
  7. Type an unsaved plus draft and press Escape; network/disk show no write.
  8. Remove two selected manual items while diary-originated residual exists; only selected rows and exactly two counts/totals disappear. Count-positive/item-zero shows the explicit empty state.
  9. Unset the LLM key and restart using the existing degraded-mode procedure; every manual/header/config/calendar/import/export flow still works and DiaryBox saves verbatim failed-parse text.
  10. Back-date a diary entry across an ISO-week boundary and Apply; current bars do not change, all-time totals change once, and the historical calendar/tally refreshes.
  11. Confirm today is selected by default; plain-click a day; navigate months; Shift-click earlier/later across a month; normalized highlighted range and every ascending day tally are correct.
  12. Calendar heat, today marker, range body, and endpoints remain distinct in both themes and without relying on hue alone.
  13. Confirm HistoryStrip, weeks-completed copy, next-week preview, DiaryLog, and Load earlier are absent from `/`; D24 remains a small distinct goals row when due.
  14. At phone width and with touch/keyboard: no horizontal document overflow, plus/minus targets are at least 40px, header is stable, dialogs scroll internally with actions visible, and calendar remains seven columns/readable.
  15. Enable reduced motion; progress/popup motion is removed and confetti is static or absent without changing completion.
  16. Re-run `npm test` and `npm run build`; no diary/API/import/export/past-week regression is accepted.

---

## Changelog
- 2026-08-31 — Initial dependency-ordered SP6 plan: foundation → SP1/SP2 contracts → pure tested utilities/server/store → incremental DaisyUI components → root/past-week integration → automated regression → two-theme manual release pass.
