# Tasks: SP4 — History, Calendar, Log & the Week-4 Honesty Check

**Sub-project:** SP4 (Phase 4, depends on SP1 + SP2 + SP3)
**PRD source:** `/root/projects/linkedin-outreach-tool/.dev/linkedin-outreach-tool/04-history-and-checks/PRD.md`
**Fresh authoring** — no prior TASKS.md existed.

All `[OPEN]` items in PRD §9 were checked before writing this file: Q1–Q10 are every one `[RESOLVED]` or explicitly `[DEFERRED]` with reasoning stated (Q6 orphaned-item link, Q11-equivalent not present). None are `[OPEN]`. Task generation proceeded.

Cross-SP note baked into every task below that touches an SP3-owned file (`weekStore.svelte.js`, `EntryPreview.svelte`, `DiaryBox.svelte`, `TaskBar.svelte`): PRD §9 Q2 records these four requests (R-A–R-D) as already landed in SP3's own PRD/implementation. If, at the time a task below is executed, the target file does not yet contain the described shape, apply the exact diff shown — do not invent an alternative.

---

### Task 1 — `isoWeek.js`: client-safe ISO week utility

**Traced to PRD §4.5**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/isoWeek.js` (new)
- **Changes:** Create the file exactly as specified in PRD §4.5 — a byte-for-byte algorithmic duplicate of SP1's `src/lib/weeks.js` ISO-week maths, but with **no** `node:fs`/`node:path` import anywhere in the file (it must be safe to import from browser-bundled Svelte components). Export four names: `dateToWeekKey(date, timezone)`, `weekKeyToRange(key)`, and — new, not shown as an export in the PRD's own code block but required by Task 6 (`calendarMonth.js`) so the algorithm is not duplicated a third time within SP4 — `isoWeekKeyFromUTCDate(utcDate)`. Keep the private `localCalendarParts` helper un-exported.

  ```js
  // src/lib/utils/isoWeek.js — client-safe. No node:fs, no node:path, no fs-touching function at all.
  // MUST stay byte-for-byte algorithmically identical to SP1's src/lib/weeks.js. See isoWeek.test.js,
  // which asserts parity against the exact fixture set SP1's own PRD defines (§4.5 of SP1's PRD).

  const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

  export function isoWeekKeyFromUTCDate(utcDate) {
    const d = new Date(utcDate.getTime());
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const isoYear = d.getUTCFullYear();
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
    const week1Thursday = new Date(jan4);
    week1Thursday.setUTCDate(jan4.getUTCDate() - jan4DayNum + 3);
    const week = 1 + Math.round((d - week1Thursday) / (7 * 86400000));
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
  }

  function localCalendarParts(date, timezone) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
  }

  export function dateToWeekKey(date, timezone) {
    const { y, m, d } = localCalendarParts(typeof date === 'string' ? new Date(`${date}T12:00:00Z`) : date, timezone);
    return isoWeekKeyFromUTCDate(new Date(Date.UTC(y, m - 1, d)));
  }

  export function weekKeyToRange(key) {
    const m = key.match(WEEK_KEY_RE);
    if (!m) throw new Error(`Invalid week key "${key}"`);
    const isoYear = Number(m[1]), week = Number(m[2]);
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
    const monday = new Date(week1Monday);
    monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
  }
  ```

  Do **not** import anything from `$lib/weeks.js` (SP1's file) here — this file is a deliberate, standalone duplicate, per PRD §4.5's stated reasoning (importing SP1's file would pull `node:fs` into the client bundle even though the specific functions used are pure).

- **Acceptance criteria:**
  - `grep -c "node:fs\|node:path" src/lib/utils/isoWeek.js` (run from repo root) returns `0`.
  - `node --input-type=module -e "import('./src/lib/utils/isoWeek.js').then(m => console.log(m.dateToWeekKey('2026-08-24','America/Los_Angeles'), m.dateToWeekKey('2026-08-23','America/Los_Angeles')))"` prints `2026-W35 2026-W34` — the Monday and the Sunday immediately before it land in different, correctly-ordered weeks.
  - `node --input-type=module -e "import('./src/lib/utils/isoWeek.js').then(m => console.log(m.weekKeyToRange('2026-W35')))"` prints an object with `start: '2026-08-24'`, `end: '2026-08-30'`.
  - `isoWeekKeyFromUTCDate`, `dateToWeekKey`, and `weekKeyToRange` are all named exports (verify with `node --input-type=module -e "import('./src/lib/utils/isoWeek.js').then(m => console.log(Object.keys(m)))"`).

---

### Task 2 — `historyStatus.js`: classifying a week

**Traced to PRD §4.3**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/historyStatus.js` (new)
- **Changes:** Create `summarizeWeekStatus(week, config)` exactly as specified in PRD §4.3:

  ```js
  // src/lib/utils/historyStatus.js

  /**
   * @param {object} week    a projected week object (SP1's projectWeekForConfig shape:
   *                          { week, start, end, counts, metrics, items, entries })
   * @param {object} config  validated config (needs config.tasks: [{id, min}])
   * @returns {{
   *   week: string, start: string, end: string,
   *   status: 'filled' | 'partial' | 'empty',
   *   clearedCount: number, total: number, touched: boolean
   * }}
   */
  export function summarizeWeekStatus(week, config) {
    const total = config.tasks.length;
    const clearedCount = config.tasks.filter(t => (week.counts[t.id] ?? 0) >= t.min).length;
    const anyCounts = config.tasks.some(t => (week.counts[t.id] ?? 0) > 0);
    const anyEntries = (week.entries?.length ?? 0) > 0;
    const anyItems = (week.items?.length ?? 0) > 0;
    const touched = anyCounts || anyEntries || anyItems;

    let status;
    if (total > 0 && clearedCount === total) status = 'filled';
    else if (touched) status = 'partial';
    else status = 'empty';

    return { week: week.week, start: week.start, end: week.end, status, clearedCount, total, touched };
  }
  ```

  Note the deliberate ordering of the `if`/`else if`/`else`: `filled` is checked before `touched`, so a week that clears every task is `filled` even though it is also, definitionally, `touched` — the two are not mutually exclusive in the underlying booleans, only in the final `status` string.

- **Acceptance criteria:**
  - `node --input-type=module -e "import('./src/lib/utils/historyStatus.js').then(async m => { const cfg={tasks:[{id:'a',min:2},{id:'b',min:1}]}; console.log(m.summarizeWeekStatus({week:'2026-W01',start:'x',end:'y',counts:{},metrics:{},items:[],entries:[]}, cfg).status) })"` prints `empty`.
  - Same call with `counts:{a:1,b:0}` prints `partial`.
  - Same call with `counts:{a:2,b:1}` prints `filled`.
  - Full branch coverage (all 5 cases from PRD §7) is deferred to Task 17's dedicated test file — this task's own criteria are a quick sanity check only.

---

### Task 3 — `weekFourCheck.js`: D24, the honesty check

**Traced to PRD §4.7**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/weekFourCheck.js` (new)
- **Changes:** Create `weekFourCheck(touchedWeeksAscending)` **exactly** as specified in PRD §4.7 — this is the single most string-sensitive function in the whole app (per BRAINSTORM R1); copy the `line` templates verbatim, character for character, including punctuation:

  ```js
  // src/lib/utils/weekFourCheck.js

  /**
   * @typedef {{ week: string, metrics: { replies: number|null, calls_booked: number|null } }} TouchedWeekSlice
   * @typedef {'baseline'|'zero'|'up'|'down'|'flat'|'sparse'} WeekFourOutcome
   * @typedef {{
   *   due: boolean,
   *   outcome: WeekFourOutcome | null,
   *   checkNumber: number | null,
   *   currentTotal: number | null,
   *   priorTotal: number | null,
   *   currentWeeks: string[],
   *   priorWeeks: string[] | null,
   *   line: string | null
   * }} WeekFourCheckResult
   *
   * @param {TouchedWeekSlice[]} touchedWeeksAscending  every week that was `touched` per historyStatus.js,
   *   in ascending week-key order, up to and including the most recent touched week. Weeks with status
   *   'empty' are NOT included.
   */
  export function weekFourCheck(touchedWeeksAscending) {
    const n = touchedWeeksAscending.length;
    const due = n > 0 && n % 4 === 0;
    if (!due) {
      return { due: false, outcome: null, checkNumber: null, currentTotal: null, priorTotal: null, currentWeeks: [], priorWeeks: null, line: null };
    }

    const checkNumber = n / 4;
    const current = touchedWeeksAscending.slice(n - 4, n);
    const currentWeeks = current.map(w => w.week);
    const laneASum = w => (w.metrics.replies ?? 0) + (w.metrics.calls_booked ?? 0);
    const currentTotal = current.reduce((s, w) => s + laneASum(w), 0);
    const bothNullCount = current.filter(w => w.metrics.replies == null && w.metrics.calls_booked == null).length;

    if (bothNullCount >= 2) {
      return {
        due: true, outcome: 'sparse', checkNumber, currentTotal, priorTotal: null, currentWeeks, priorWeeks: null,
        line: `Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something.`
      };
    }

    if (checkNumber === 1) {
      return {
        due: true, outcome: 'baseline', checkNumber, currentTotal, priorTotal: null, currentWeeks, priorWeeks: null,
        line: `Lane A (replies + calls booked) so far: ${currentTotal}. First checkpoint — nothing to compare against yet.`
      };
    }

    const prior = touchedWeeksAscending.slice(n - 8, n - 4);
    const priorWeeks = prior.map(w => w.week);
    const priorTotal = prior.reduce((s, w) => s + laneASum(w), 0);

    let outcome, line;
    if (currentTotal === 0) {
      outcome = 'zero';
      line = priorTotal === 0
        ? `Lane A (replies + calls booked): 0 this period, same as the one before.`
        : `Lane A (replies + calls booked): 0 this period, down from ${priorTotal}.`;
    } else if (currentTotal > priorTotal) {
      outcome = 'up';
      line = `Lane A (replies + calls booked): ${currentTotal} this period, up from ${priorTotal}.`;
    } else if (currentTotal < priorTotal) {
      outcome = 'down';
      line = `Lane A (replies + calls booked): ${currentTotal} this period, down from ${priorTotal}.`;
    } else {
      outcome = 'flat';
      line = `Lane A (replies + calls booked): ${currentTotal} this period, same as the one before.`;
    }

    return { due: true, outcome, checkNumber, currentTotal, priorTotal, currentWeeks, priorWeeks, line };
  }
  ```

  Branch order matters and must not be reordered: `bothNullCount >= 2` (sparse) is checked before `checkNumber === 1` (baseline), which is checked before the up/down/flat/zero comparison — a `checkNumber === 1` window with `currentTotal === 0` must return `'baseline'`, never `'zero'` (there is no prior period to be "down from" yet).

- **Acceptance criteria:**
  - `node --input-type=module -e "import('./src/lib/utils/weekFourCheck.js').then(m => console.log(m.weekFourCheck([]).due, m.weekFourCheck([{week:'a',metrics:{replies:0,calls_booked:0}}]).due))"` prints `false false`.
  - A quick 4-element array with `metrics:{replies:1,calls_booked:0}` on each → `outcome === 'baseline'` and `line` contains the exact substring `First checkpoint — nothing to compare against yet.`
  - Full 12-case branch coverage (including the exact copy-string assertions) is Task 20's dedicated test file — this task's own criteria are a quick sanity check only.

---

### Task 4 — `mergeLogRows.js`: pure log-row merge/sort/de-dupe

**Traced to PRD §6.2**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/mergeLogRows.js` (new)
- **Changes:**

  ```js
  // src/lib/utils/mergeLogRows.js

  /**
   * @param {LogRow[]} existingRows
   * @param {object[]} newWeeks   full projected week objects (from GET /api/week/[week])
   * @returns {LogRow[]}  merged, de-duped by row id, sorted descending by `at`
   */
  export function mergeLogRows(existingRows, newWeeks) {
    const rowsFromWeek = (w) => [
      ...w.entries.map(e => ({ id: `entry:${e.id}`, kind: 'entry', weekKey: w.week, at: e.at, entry: e })),
      ...w.items.map(it => ({ id: `item:${it.id}`, kind: 'item', weekKey: w.week, at: it.at, item: it, taskId: it.taskId }))
    ];
    const byId = new Map(existingRows.map(r => [r.id, r]));
    for (const w of newWeeks) for (const row of rowsFromWeek(w)) byId.set(row.id, row);
    return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
  ```

  Note the `id` scheme (`entry:<id>` / `item:<id>`) prevents an entry and an item that happen to share a raw UUID from colliding in the `Map`.

- **Acceptance criteria:**
  - `node --input-type=module -e "import('./src/lib/utils/mergeLogRows.js').then(m => { const w={week:'2026-W35',entries:[{id:'e1',at:'2026-08-24T10:00:00Z'}],items:[{id:'i1',taskId:'post',at:'2026-08-24T11:00:00Z'}]}; const rows=m.mergeLogRows([], [w]); console.log(rows.length, rows[0].id, rows[1].id) })"` prints `2 item:i1 entry:e1` (the later `at` timestamp — the item — sorts first).
  - Full de-dupe/interleave coverage is Task 21's dedicated test file.

---

### Task 5 — Request R-A: `weekStore.svelte.js` dirty-week signal

**Traced to PRD §4.2 (Request R-A)**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/stores/weekStore.svelte.js` (edit — SP3-owned file; PRD §9 Q2 records this addition as already agreed/landed with SP3. If the store does not yet expose `historyVersion`/`lastDirtyWeek`/`markWeekDirty`, add them now exactly as below.)
- **Changes:** Inside `createWeekStore()`, add:

  ```js
  let historyVersion = $state(0);
  let lastDirtyWeek = $state(null);

  function markWeekDirty(weekKey) {
    lastDirtyWeek = weekKey;
    historyVersion++;
  }
  ```

  And add to the object `createWeekStore()` returns (alongside the existing `week`/`weekKey`/`config`/`bumpLocalCount`/`setLocalMetric`/`replaceWeek`):

  ```js
  get historyVersion() { return historyVersion; },
  get lastDirtyWeek() { return lastDirtyWeek; },
  markWeekDirty
  ```

  Do not touch anything else in the file — `bumpLocalCount`, `setLocalMetric`, `replaceWeek`, `provideWeekStore`, `getWeekStore` are all SP3-owned and unchanged.

- **Acceptance criteria:**
  - `grep -n "markWeekDirty\|historyVersion\|lastDirtyWeek" src/lib/stores/weekStore.svelte.js` shows all three names, both in the function body and in the returned object literal.
  - A component calling `getWeekStore().markWeekDirty('2026-W30')` followed by reading `getWeekStore().historyVersion` and `getWeekStore().lastDirtyWeek` observes `1` and `'2026-W30'` respectively (verify via a throwaway `.svelte` smoke component during dev, or defer to Task 8/9/10's own manual verification once those consumers exist).

---

### Task 6 — `HistoryStrip.svelte`: slot 5, part A

**Traced to PRD §4.4**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/components/HistoryStrip.svelte` (new)
- **Changes:** Create the component exactly as specified in PRD §4.4, **plus** the dirty-week reconciliation `$effect` from §4.10 step 6 (the PRD gives this pattern once and says "same pattern each" for `HistoryStrip`/`MonthCalendar`/`DiaryLog`):

  ```svelte
  <!-- HistoryStrip.svelte -->
  <script>
    import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
    import { summarizeWeekStatus } from '$lib/utils/historyStatus.js';
    import { base } from '$app/paths';

    let { weeks, weeksCompletedCount, currentWeekKey } = $props();
    const store = getWeekStore();

    let localWeeks = $state(weeks);
    let localCount = $state(weeksCompletedCount);

    function formatRange(start, end) { /* e.g. "Aug 17–23" — reuse across components; simple Intl.DateTimeFormat, no library */ }

    $effect(() => {
      const dirty = store.historyVersion > 0 ? store.lastDirtyWeek : null;
      if (!dirty) return;
      fetch(`${base}/api/week/${dirty}`).then(r => r.json()).then(fresh => {
        const summary = summarizeWeekStatus(fresh, store.config);
        localWeeks = localWeeks.map(w => (w.week === dirty ? summary : w));
        localCount = localWeeks.filter(w => w.status === 'filled').length;
      });
    });
  </script>

  <div class="history-strip-wrap">
    {#if localCount === 0 && localWeeks.length <= 1}
      <p class="history-empty-note">Your history starts this week.</p>
    {:else}
      <p class="history-count">{localCount} week{localCount === 1 ? '' : 's'} completed</p>
    {/if}
    <div class="history-strip">
      {#each localWeeks as w (w.week)}
        <a
          class="history-square {w.status} {w.week === currentWeekKey ? 'current' : ''}"
          href="{base}/week/{w.week}"
          title="{formatRange(w.start, w.end)} · {w.status === 'empty' ? 'not logged' : `${w.clearedCount}/${w.total} cleared`}"
        ></a>
      {/each}
    </div>
  </div>

  <style>
    .history-strip { display: flex; gap: 4px; overflow-x: auto; padding: 0.25rem 0; }
    .history-square { flex-shrink: 0; width: 14px; height: 14px; border-radius: 3px; display: block; transition: transform 0.1s; }
    .history-square:hover { transform: scale(1.25); }
    .history-square.filled { background: var(--fg); opacity: 0.85; }
    .history-square.partial { background: var(--muted); opacity: 0.5; }
    .history-square.empty { background: transparent; border: 1px dashed var(--card-border); opacity: 0.55; }
    .history-square.current { outline: 1px solid var(--fg-secondary); outline-offset: 2px; }
    .history-count, .history-empty-note { font-size: 0.78rem; color: var(--muted); margin: 0 0 0.4rem; }
  </style>
  ```

  Squares are plain `<a href>` elements, never a JS `onclick` handler (PRD §4.4 "click behaviour" — must work with middle-click/new-tab with no extra logic). No new hue anywhere — only `--fg`, `--muted`, `--card-border`, `--fg-secondary` (SP3's existing custom properties).

- **Acceptance criteria:**
  - Rendering with `weeks` = a single current-week entry with `status: 'empty'` and `weeksCompletedCount: 0` shows the text "Your history starts this week." and exactly one square (verify by counting `.history-square` elements in the rendered DOM = 1).
  - Rendering with 2+ weeks, `weeksCompletedCount: 0`, shows "0 weeks completed", not the empty-note copy (the boundary condition from PRD §4.4 — `weeks.length <= 1` is the only thing that suppresses the count line, not `weeksCompletedCount === 0` alone).
  - The hover `title` attribute on any square never contains the words "missed" or "failed" — `grep -n "missed\|failed" src/lib/components/HistoryStrip.svelte` returns no matches.
  - No hex color or `red`/`green` literal anywhere in the `<style>` block — `grep -Ei "red|green|#[0-9a-f]{3,6}" src/lib/components/HistoryStrip.svelte` returns no matches (only `var(--...)` references are used).

---

### Task 7 — `calendarMonth.js`: pure month-shaping function

**Traced to PRD §4.6**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/calendarMonth.js` (new)
- **Changes:**

  ```js
  // src/lib/utils/calendarMonth.js
  import { isoWeekKeyFromUTCDate } from './isoWeek.js';

  /**
   * @param {number} year
   * @param {number} month        1-12
   * @param {Record<string, object>} weeksByKey   projected week objects, keyed by their own `week`,
   *                                               covering every ISO week that overlaps this month
   * @param {string} currentWeekKey
   * @param {string} todayStr      YYYY-MM-DD
   * @returns {{
   *   year: number, month: number,
   *   days: { date: string, inMonth: boolean, weekKey: string, isToday: boolean,
   *           entryCount: number, itemCount: number, isCurrentWeek: boolean }[]
   * }}
   */
  export function buildCalendarMonth(year, month, weeksByKey, currentWeekKey, todayStr) {
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const startDow = (firstOfMonth.getUTCDay() + 6) % 7; // Mon=0
    const gridStart = new Date(firstOfMonth);
    gridStart.setUTCDate(gridStart.getUTCDate() - startDow);

    const days = [];
    for (let i = 0; i < 42; i++) { // 6 full weeks, always — fixed grid height, no layout jump month to month
      const d = new Date(gridStart);
      d.setUTCDate(gridStart.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const weekKey = isoWeekKeyFromUTCDate(d);
      const week = weeksByKey[weekKey];
      const dayEntries = week ? week.entries.filter(e => e.date === dateStr).length : 0;
      const dayItems = week ? week.items.filter(it => it.at.slice(0, 10) === dateStr).length : 0;
      days.push({
        date: dateStr,
        inMonth: d.getUTCMonth() + 1 === month,
        weekKey,
        isToday: dateStr === todayStr,
        entryCount: dayEntries,
        itemCount: dayItems,
        isCurrentWeek: weekKey === currentWeekKey
      });
    }
    return { year, month, days };
  }
  ```

- **Acceptance criteria:**
  - `node --input-type=module -e "import('./src/lib/utils/calendarMonth.js').then(m => console.log(m.buildCalendarMonth(2026, 8, {}, '2026-W35', '2026-08-29').days.length))"` prints `42` for every month (verify at least once with a month whose 1st falls on a Sunday and once where it falls on a Monday, per Task 18's dedicated test file).
  - Full grid/edge-case coverage is Task 18's dedicated test file.

---

### Task 8 — `MonthCalendar.svelte`: slot 5, part B — calendar + next-week view

**Traced to PRD §4.6**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/components/MonthCalendar.svelte` (new)
- **Changes:** Build the component around `buildCalendarMonth` (Task 7). Props: `{ month, nextWeek, config }` where `month` is the already-server-built `calendarMonth` object and `nextWeek` is `{ weekKey, tasks: [{id, label, min, target}] }`.

  Grid rendering — a dot, never a number, never a color scale:
  ```svelte
  <div class="cal-grid">
    {#each localMonth.days as day (day.date)}
      <div class="cal-day {day.inMonth ? '' : 'out-of-month'} {day.isCurrentWeek ? 'current-week-row' : ''}">
        <span class="cal-date-num {day.isToday ? 'today' : ''}">{Number(day.date.slice(8, 10))}</span>
        {#if day.entryCount + day.itemCount > 0}
          <span class="cal-dot {day.entryCount + day.itemCount >= 3 ? 'large' : day.entryCount + day.itemCount === 2 ? 'medium' : 'small'}"></span>
        {/if}
      </div>
    {/each}
  </div>
  <div class="next-week">
    <p class="next-week-label">Next week ({nextWeek.weekKey})</p>
    <p class="next-week-line">
      {nextWeek.tasks.map(t => `${t.min}${t.min !== t.target ? `–${t.target}` : ''} ${t.label.toLowerCase()}`).join(' · ')}
    </p>
  </div>
  ```
  `.cal-dot` is always `background: var(--fg-secondary)` at one of three fixed sizes via the `small`/`medium`/`large` classes — one color, three sizes, no gradient/heat-map. `.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }`.

  **Dirty-week reconciliation** (same pattern as Task 6, adapted): on `store.historyVersion` change, `fetch` the dirty week; if its key is one of the keys already present in the locally-held `weeksByKey` (i.e. it overlaps the month currently shown), splice it into a fresh call to `buildCalendarMonth` and replace `localMonth`. If the dirty week's key does not overlap the shown month, do nothing (the calendar simply doesn't need to change).

  **Month navigation.** Prev/next arrows mutate local `year`/`month` state and, for any week key in the new month's overlap set not already cached client-side, `fetch(`${base}/api/week/${wk}`)` and call `buildCalendarMonth` again once all needed weeks have resolved (PRD §4.6, §9 Q9 — reuses the plain `GET /api/week/[week]` endpoint per week, no new endpoint).

- **Acceptance criteria:**
  - Rendered grid always contains exactly 42 `.cal-day` elements regardless of the month passed in (spot-check two different months in a manual dev-server check).
  - A day with `entryCount: 2, itemCount: 0` renders a `.cal-dot.medium` element; a day with `entryCount: 0, itemCount: 0` renders no `.cal-dot` element at all.
  - The next-week line renders as one line with tasks joined by ` · `, and for a task where `min === target` shows just `{min}`, not `{min}–{target}` (e.g. a task with `min: 1, target: 1` renders `1 posts published`, not `1–1 posts published`).
  - `grep -Ei "red|green|#[0-9a-f]{3,6}" src/lib/components/MonthCalendar.svelte` returns no matches.

---

### Task 9 — `DiaryLog.svelte` + `LogRow.svelte`: the log, with `GET /api/weeks` pagination

**Traced to PRD §4.1, §4.9 (item rows), §6.2, §6.3**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/lib/components/DiaryLog.svelte` (new)
  - `/root/projects/linkedin-outreach-tool/src/lib/components/LogRow.svelte` (new)
- **Changes:**

  `DiaryLog.svelte`, exactly as specified in PRD §6.2:
  ```svelte
  <script>
    import LogRow from './LogRow.svelte';
    import { mergeLogRows } from '$lib/utils/mergeLogRows.js';
    import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
    import { base } from '$app/paths';

    let { initial, oldestLoadedWeek: initialOldest, config } = $props();
    const store = getWeekStore();

    let rows = $state(initial);
    let oldestLoaded = $state(initialOldest);
    let loading = $state(false);
    let exhausted = $state(false);

    async function loadEarlier() {
      loading = true;
      const listRes = await fetch(`${base}/api/weeks?before=${oldestLoaded}&limit=4`);
      const { weeks: olderKeys } = await listRes.json();
      if (olderKeys.length === 0) { exhausted = true; loading = false; return; }
      const fetched = await Promise.all(olderKeys.map(wk => fetch(`${base}/api/week/${wk}`).then(r => r.json())));
      rows = mergeLogRows(rows, fetched);
      oldestLoaded = olderKeys[olderKeys.length - 1];
      loading = false;
    }

    $effect(() => {
      const dirty = store.historyVersion > 0 ? store.lastDirtyWeek : null;
      if (!dirty) return;
      fetch(`${base}/api/week/${dirty}`).then(r => r.json()).then(fresh => {
        rows = mergeLogRows(rows.filter(r => r.weekKey !== dirty), [fresh]);
      });
    });
  </script>

  <div class="diary-log">
    {#each rows as row (row.id)}
      <LogRow {row} {config} />
    {/each}
    {#if !exhausted}
      <button class="load-earlier" onclick={loadEarlier} disabled={loading}>
        {loading ? 'Loading…' : 'Load earlier'}
      </button>
    {/if}
  </div>
  ```

  `LogRow.svelte`, exactly as specified in PRD §6.3 (import `EntryPreview` from SP3's `$lib/components/EntryPreview.svelte`, and `LinkAttachForm` from Task 11):
  ```svelte
  <script>
    import EntryPreview from '$lib/components/EntryPreview.svelte';
    import LinkAttachForm from './LinkAttachForm.svelte';
    import { base } from '$app/paths';

    let { row, config } = $props();
    const task = $derived(row.kind === 'item' ? config.tasks.find(t => t.id === row.taskId) : null);

    async function reparse(weekKey, entryId) {
      const res = await fetch(`${base}/api/week/${weekKey}/entry/${entryId}/reparse`, { method: 'POST' });
      const { entry } = await res.json();
      row.entry = entry;
    }

    function summarizeApplied(applied, cfg) {
      const parts = [];
      for (const [id, v] of Object.entries(applied?.counts ?? {})) parts.push(`${taskLabel(cfg, id)} ${v}`);
      for (const [id, v] of Object.entries(applied?.metrics ?? {})) parts.push(`${metricLabel(cfg, id)} →${v}`);
      return parts.join(' · ');
    }
    function taskLabel(cfg, id) { return cfg.tasks.find(t => t.id === id)?.label ?? id; }
    function metricLabel(cfg, id) { return cfg.metrics.find(m => m.id === id)?.label ?? id; }
  </script>

  {#if row.kind === 'entry'}
    {@const entry = row.entry}
    <div class="log-row log-entry">
      <p class="log-date">{entry.date}</p>
      <p class="log-text">{entry.text}</p>
      {#if entry.parseStatus === 'pending' && entry.proposed}
        <EntryPreview {entry} weekKey={row.weekKey} onResolved={() => {}} onReparse={() => reparse(row.weekKey, entry.id)} />
      {:else if entry.parseStatus === 'ok'}
        <p class="log-applied">applied: {summarizeApplied(entry.applied, config)}</p>
      {:else if entry.parseStatus === 'discarded'}
        <p class="log-discarded">not applied</p>
      {:else if entry.parseStatus === 'failed'}
        <p class="log-failed">couldn't read it automatically —
          <button class="retry-link" onclick={() => reparse(row.weekKey, entry.id)}>try again</button>
        </p>
      {/if}
    </div>
  {:else}
    <div class="log-row log-item">
      <p class="log-date">{row.item.at.slice(0, 10)}</p>
      <p class="log-text">{task?.label ?? row.taskId}</p>
      <LinkAttachForm item={row.item} weekKey={row.weekKey} onSaved={(updated) => { row.item = updated; }} />
    </div>
  {/if}

  <style>
    .log-row { padding: 0.65rem 0; border-bottom: 1px solid var(--card-border); }
    .log-date { font-size: 0.72rem; color: var(--muted); margin: 0 0 0.2rem; }
    .log-text { font-size: 0.85rem; color: var(--fg); margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .log-applied, .log-discarded { font-size: 0.76rem; color: var(--muted); margin: 0.3rem 0 0; }
    .log-failed { font-size: 0.76rem; color: var(--muted); margin: 0.3rem 0 0; }
  </style>
  ```

  Critical detail carried over from PRD §6.3: **`{task?.label ?? row.taskId}` is the orphaned-taskId fallback** (PRD §9 Q5) — an item row whose `taskId` no longer exists in `config.tasks` renders the raw id string instead of crashing on `task.label` of `undefined`. Do not add a `?? 'Unknown task'` placeholder or any "no longer tracked" badge — the PRD explicitly rules this out as unnecessary polish.

  `.log-discarded` and `.log-failed` **must** use the exact same CSS rule/color as `.log-applied` (`color: var(--muted)`) — no separate warning-colored class for either.

- **Acceptance criteria:**
  - With `config.tasks` not containing an id present on one item row's `taskId`, that row still renders (no thrown error) and its label text equals the raw `taskId` string verbatim.
  - `grep -n "log-discarded\|log-failed\|log-applied" src/lib/components/LogRow.svelte` shows all three classes styled with `color: var(--muted)` and no other color property.
  - `.log-text`'s CSS contains `white-space: pre-wrap` and `overflow-wrap: anywhere`, and contains neither `text-overflow: ellipsis` nor `-webkit-line-clamp` (`grep -n "ellipsis\|line-clamp" src/lib/components/LogRow.svelte` returns no matches) — a long retro-logged entry's full text is never truncated.
  - Clicking "Load earlier" with a mocked/dev-server `GET /api/weeks?before=...&limit=4` returning `{ weeks: [] }` sets the button to disappear (verify `exhausted` state flips and no further `fetch` calls fire on subsequent clicks).
  - Clicking "Load earlier" with two weeks returned merges rows into the existing list with no duplicate `row.id` values (spot check against Task 21's `mergeLogRows.test.js`, which covers this in the pure function directly).

---

### Task 10 — Request R-B: `EntryPreview.svelte` routes against the entry's own week

**Traced to PRD §4.2 (Request R-B), §4.10**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/components/EntryPreview.svelte` (edit — SP3-owned file; PRD §9 Q2 records this fix as already landed. If the guard below is missing, add it now.)
- **Changes:** `apply()` must gate its optimistic local-store mutation and its post-apply `weekStore.replaceWeek` refetch behind `isLiveWeek = weekKey === store.weekKey`, and both `apply()` and `discard()` must call `store.markWeekDirty(weekKey)` and pass `weekKey` to `onResolved`:

  ```js
  async function apply() {
    if (busy) return;
    busy = true;
    const isLiveWeek = weekKey === store.weekKey;
    if (isLiveWeek) {
      for (const [taskId, delta] of Object.entries(entry.proposed.counts)) store.bumpLocalCount(taskId, delta);
      for (const [metricId, value] of Object.entries(entry.proposed.metrics)) store.setLocalMetric(metricId, value);
    }
    try {
      await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/apply`, { method: 'POST' });
      if (isLiveWeek) {
        const truth = await (await fetch(`${base}/api/week/${weekKey}`)).json();
        store.replaceWeek(truth);
      }
      store.markWeekDirty(weekKey);
      onResolved(weekKey);
    } finally { busy = false; }
  }

  async function discard() {
    if (busy) return;
    busy = true;
    await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/discard`, { method: 'POST' });
    store.markWeekDirty(weekKey);
    onResolved(weekKey);
    busy = false;
  }
  ```

  Do not change anything about the props (`entry, weekKey, onResolved, onReparse`) or the rendered markup — only the two function bodies above.

- **Acceptance criteria:**
  - `grep -n "isLiveWeek" src/lib/components/EntryPreview.svelte` shows the guard used before both the `bumpLocalCount`/`setLocalMetric` loop and the reconciling `GET`/`replaceWeek` call.
  - `grep -n "markWeekDirty" src/lib/components/EntryPreview.svelte` shows it called in both `apply()` and `discard()`.
  - Manual check (via Task 9's log or Task 12's retro-logging flow): applying a pending entry whose `weekKey` differs from `store.weekKey` results in zero visible change to any currently-displayed counter/metric on the page — the only network calls fired are `POST .../apply` (and, if `isLiveWeek`, the reconciling `GET`, which does not fire here since it isn't the live week).

---

### Task 11 — `LinkAttachForm.svelte` + Request R-D: item-creation for `link:"required"` tasks

**Traced to PRD §4.9, §4.2 (Request R-D)**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/lib/components/LinkAttachForm.svelte` (new)
  - `/root/projects/linkedin-outreach-tool/src/lib/components/TaskBar.svelte` (edit — SP3-owned file; PRD §9 Q2 records R-D as already landed. If `tap()` does not yet branch on `task.link === 'required'`, add the branch now.)
- **Changes:**

  `LinkAttachForm.svelte`, exactly as specified in PRD §4.9:
  ```svelte
  <script>
    import { base } from '$app/paths';
    let { item, weekKey, onSaved } = $props();
    let editing = $state(!item.link);
    let url = $state(item.link?.url ?? '');
    let label = $state(item.link?.label ?? '');
    let error = $state(null);

    function validUrl(u) {
      try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
    }

    async function save() {
      if (!validUrl(url)) { error = "needs to look like a web address"; return; }
      if (!label.trim()) { error = "give it a short label"; return; }
      error = null;
      const res = await fetch(`${base}/api/week/${weekKey}/items/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: { url: url.trim(), label: label.trim() } })
      });
      const { item: updated } = await res.json();
      editing = false;
      onSaved(updated);
    }
  </script>

  {#if editing}
    <div class="link-form">
      <input class="link-url" type="text" bind:value={url} placeholder="https://…" />
      <input class="link-label" type="text" bind:value={label} placeholder="Label" maxlength="80" />
      <button class="link-save" onclick={save}>Save</button>
      {#if item.link}<button class="link-cancel" onclick={() => editing = false}>Cancel</button>{/if}
      {#if error}<p class="link-error">{error}</p>{/if}
    </div>
  {:else}
    <div class="link-attached">
      <a class="link-pill" href={item.link.url} target="_blank" rel="noopener">{item.link.label}</a>
      <button class="link-edit" onclick={() => editing = true} aria-label="Edit link">edit</button>
    </div>
  {/if}
  ```
  `.link-pill`/`.link-attached` must reuse SP3's `PinnedLinks.svelte`'s existing `.link-pill` custom properties/classes (same visual language) — do not invent a new pill style.

  `TaskBar.svelte`'s `tap()`, modified exactly per PRD §4.9:
  ```js
  async function tap(delta) {
    if (task.link === 'required' && delta > 0) {
      const res = await fetch(`${base}/api/week/${store.weekKey}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, link: null })
      });
      const { counts } = await res.json();
      store.replaceWeek({ ...store.week, counts });
      return;
    }
    store.bumpLocalCount(task.id, delta);
    pendingDelta += delta;
    flush();
  }
  ```
  This is a full server round-trip on the tap (no optimism) — deliberate, since it's a single click, not a rapid-tap sequence, and the item-creation response is authoritative. `−1` on a `link:"required"` task still goes through the pre-existing plain count-delta path unchanged (falls through to the bottom of the function).

- **Acceptance criteria:**
  - `grep -n "link === 'required'" src/lib/components/TaskBar.svelte` shows the guard is scoped to `delta > 0` only — a negative tap on the same task must not hit this branch (verify by reading the `if` condition includes `&& delta > 0`).
  - Tapping `+1` on a `link:"required"` task (e.g. `post`) fires exactly one `POST /api/week/[week]/items` call with body `{"taskId":"post","link":null}`, and the resulting count is taken from the response's `counts` field, not incremented client-side.
  - `LinkAttachForm` rendered with `item.link === null` starts with `editing === true` (the form is already open — no separate "add a link" first click).
  - Entering `not a url` into the URL field and clicking Save shows the exact text "needs to look like a web address" and fires no network request.
  - Entering a valid `https://...` URL and a non-empty label, then Save, replaces the form with a `.link-pill` matching `PinnedLinks`' existing pill markup/classes.

---

### Task 12 — Request R-C: `DiaryBox.svelte` retro-logging — landed-week tracking + label

**Traced to PRD §4.2 (Request R-C), §4.10**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/components/DiaryBox.svelte` (edit — SP3-owned file; PRD §9 Q2 records this fix as already landed. If `entryWeekKey`/the retro-log label are missing, add them now.)
- **Changes:** Confirm/add the following (SP3's own §6.4 already documents `entryWeekKey` as the state variable name; this task adds the **advisory label**, which is the piece specifically requested by SP4):

  ```js
  import { dateToWeekKey, weekKeyToRange } from '$lib/utils/isoWeek.js'; // Task 1's client-safe util

  // store.config is already available via getWeekStore() — no new prop needed.
  const targetWeekLabel = $derived.by(() => {
    const targetKey = dateToWeekKey(date, store.config.timezone);
    if (targetKey === weekKey) return null; // today's (displayed) week — nothing to say
    const { start, end } = weekKeyToRange(targetKey);
    return `Logging into ${formatRange(start, end)} (${targetKey})`;
  });
  ```
  ```svelte
  <input class="date-input" type="date" bind:value={date} max={new Date().toISOString().slice(0,10)} />
  {#if targetWeekLabel}
    <p class="retro-label">{targetWeekLabel}</p>
  {/if}
  ```
  Add a `.retro-label` style consistent with SP3's existing muted-text conventions (e.g. `font-size: 0.76rem; color: var(--muted); margin: 0.2rem 0 0;`). This label is **advisory only** — it is never sent to the server and never used to choose which endpoint any call in this file targets; `entryWeekKey` (set from the server's own response `week` field on Save, per SP3 §6.4) remains the only value ever used for routing. Do not wire `targetWeekLabel`'s computed `targetKey` into any `fetch` call.

- **Acceptance criteria:**
  - Setting the date picker to a date in a different ISO week than the currently displayed week (e.g. `2026-08-23`, a Sunday, while `weekKey` is `2026-W35`) shows the text `Logging into Aug 17–23 (2026-W34)` under the input (exact wording per PRD §4.2/§6.4 — verify the date-range formatting matches whatever `formatRange` helper the rest of SP3/SP4 already shares).
  - Setting the date picker back to a same-week date makes `targetWeekLabel` (and therefore the `<p class="retro-label">`) disappear entirely.
  - `grep -n "targetKey" src/lib/components/DiaryBox.svelte` shows `targetKey` used only inside `targetWeekLabel`'s computation — never passed to `fetch(...)`.

---

### Task 13 — `WeekFourCheck.svelte`: slot 5, part C — placement, dismissal, exact copy

**Traced to PRD §4.7, §4.8**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/components/WeekFourCheck.svelte` (new)
- **Changes:** Create exactly as specified in PRD §4.8:

  ```svelte
  <!-- WeekFourCheck.svelte -->
  <script>
    let { result } = $props(); // WeekFourCheckResult from +page.server.js

    function dismissKey(checkNumber) { return `linkedin-outreach:week4check:dismissed:${checkNumber}`; }

    let dismissed = $state(false);
    $effect(() => {
      if (!result?.due) return;
      try { dismissed = localStorage.getItem(dismissKey(result.checkNumber)) === '1'; } catch { dismissed = false; }
    });
    function dismiss() {
      dismissed = true;
      try { localStorage.setItem(dismissKey(result.checkNumber), '1'); } catch {}
    }
  </script>

  {#if result?.due && !dismissed}
    <div class="week4-card {result.outcome === 'zero' ? 'week4-notable' : ''}">
      <p class="week4-line">{result.line}</p>
      <button class="week4-dismiss" onclick={dismiss}>Got it</button>
    </div>
  {/if}

  <style>
    .week4-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: 0.7rem 1rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 9px; }
    .week4-notable { border-left: 3px solid var(--fg-secondary); }
    .week4-line { font-size: 0.85rem; color: var(--fg); margin: 0; }
    .week4-dismiss { flex-shrink: 0; background: none; border: 1px solid var(--chip-border); border-radius: 7px;
      padding: 0.3rem 0.7rem; font-size: 0.76rem; color: var(--fg-secondary); cursor: pointer; }
  </style>
  ```

  Placement (in `+page.svelte`, Task 16): between `HistoryStrip` and `MonthCalendar`, inside `section[data-slot="history-calendar"]` — never in slots 1–4, never styled as a notification/toast.

- **Acceptance criteria:**
  - `result.due === false` renders nothing (no `.week4-card` element in the DOM at all — not hidden via CSS, absent).
  - `result.outcome === 'zero'` is the only outcome that adds the `.week4-notable` class; every other outcome (`baseline`/`up`/`down`/`flat`/`sparse`) renders `.week4-card` with no extra class.
  - `.week4-notable`'s only style difference from `.week4-card` is `border-left` — `grep -A2 "week4-notable" src/lib/components/WeekFourCheck.svelte` shows no `color`, `background`, or any red/orange/yellow value.
  - Clicking "Got it" hides the card immediately and sets `localStorage['linkedin-outreach:week4check:dismissed:{checkNumber}'] = '1'`; re-rendering the component with the same `result.checkNumber` (simulating a reload) keeps it dismissed; rendering with a **different** `checkNumber` (the next multiple of 4) shows the card again even though the previous key is still `'1'` in storage.
  - `grep -n "Got it" src/lib/components/WeekFourCheck.svelte` — confirm no exclamation mark anywhere in the button copy.

---

### Task 14 — `/week/[week]` detail route

**Traced to PRD §4.11**

- **Files:**
  - `/root/projects/linkedin-outreach-tool/src/routes/week/[week]/+page.server.js` (new)
  - `/root/projects/linkedin-outreach-tool/src/routes/week/[week]/+page.svelte` (new)
  - `/root/projects/linkedin-outreach-tool/src/lib/components/WeekSnapshotBar.svelte` (new)
  - `/root/projects/linkedin-outreach-tool/src/lib/components/WeekSnapshotMetrics.svelte` (new)
- **Changes:**

  `+page.server.js`, exactly as specified in PRD §4.11:
  ```js
  import { loadConfig, ConfigError } from '$lib/config.js';
  import { readWeek, projectWeekForConfig, isValidWeekKey, currentWeekKey } from '$lib/weeks.js';
  import { error } from '@sveltejs/kit';

  export function load({ params }) {
    if (!isValidWeekKey(params.week)) throw error(400, 'Invalid week key');
    let config;
    try { config = loadConfig(); }
    catch (e) { if (e instanceof ConfigError) return { configError: { message: e.message, field: e.field }, config: null, week: null }; throw e; }

    const raw = readWeek(params.week, config);
    const week = projectWeekForConfig(raw, config);
    return { config, week, weekKey: params.week, isCurrentWeek: params.week === currentWeekKey(config.timezone) };
  }
  ```

  `+page.svelte`, exactly as specified in PRD §4.11 (uses a `buildRowsForWeek` helper — implement it as a thin adapter that wraps a single week object the same way `mergeLogRows`'s `rowsFromWeek` does, so `LogRow`'s expected row shape (`{id, kind, weekKey, at, entry|item, taskId}`) is identical whether it's rendered from `DiaryLog` or this page):
  ```svelte
  <script>
    import WeekSnapshotMetrics from '$lib/components/WeekSnapshotMetrics.svelte';
    import WeekSnapshotBar from '$lib/components/WeekSnapshotBar.svelte';
    import LogRow from '$lib/components/LogRow.svelte';
    import { base } from '$app/paths';

    let { data } = $props();

    function buildRowsForWeek(w) {
      return [
        ...w.entries.map(e => ({ id: `entry:${e.id}`, kind: 'entry', weekKey: w.week, at: e.at, entry: e })),
        ...w.items.map(it => ({ id: `item:${it.id}`, kind: 'item', weekKey: w.week, at: it.at, item: it, taskId: it.taskId }))
      ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    }
    const rows = $derived(buildRowsForWeek(data.week));
  </script>

  {#if data.configError}
    <!-- identical config-error panel pattern to SP3's root page -->
  {:else}
    <main class="week-snapshot">
      <p class="week-range">{formatRange(data.week.start, data.week.end)} · {data.weekKey}</p>
      {#if data.isCurrentWeek}<a class="back-link" href="{base}/">This is the current week — go there</a>{/if}

      <WeekSnapshotMetrics week={data.week} config={data.config} />

      <div class="lanes">
        {#each data.config.lanes as lane (lane.id)}
          <div class="lane">
            <span class="lane-label">{lane.label}</span>
            {#each data.config.tasks.filter(t => t.lane === lane.id) as task (task.id)}
              <WeekSnapshotBar {task} weekKey={data.weekKey} counts={data.week.counts} />
            {/each}
          </div>
        {/each}
      </div>

      <div class="week-log">
        {#each rows as row (row.id)}
          <LogRow {row} config={data.config} />
        {/each}
      </div>
    </main>
  {/if}
  ```

  `WeekSnapshotBar.svelte`, exactly as specified in PRD §4.11:
  ```svelte
  <script>
    import { base } from '$app/paths';
    let { task, weekKey, counts } = $props();
    let count = $state(counts[task.id] ?? 0);
    async function correct(delta) {
      const res = await fetch(`${base}/api/week/${weekKey}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts: { [task.id]: delta } })
      });
      const updated = await res.json();
      count = updated.counts[task.id] ?? 0;
    }
  </script>
  <div class="snapshot-bar">
    <span class="task-label">{task.label}</span>
    <span class="count-label">{count} / {task.min}–{task.target}</span>
    <button onclick={() => correct(-1)} disabled={count === 0} aria-label="Correct: -1">−</button>
    <button onclick={() => correct(1)} aria-label="+1">+1</button>
  </div>
  ```
  Deliberately no `weekStore`/context read here — this page shows a *different* week than any live `weekStore` might represent (per PRD's explicit reasoning); it carries its own tiny local `count` state and PATCHes directly, no optimism, no debounce (a correction to a past week is a rare, deliberate action).

  `WeekSnapshotMetrics.svelte`: a lightweight, non-interactive readout of `week.metrics` keyed by `config.metrics` (labels + current values) — no sparkline, no editing controls (that's slot-2 territory SP3 owns for the *current* week only).

- **Acceptance criteria:**
  - `GET`-navigating to `/week/2026-W01` (a week with no file on disk) does not throw — `readWeek` returns SP1's empty-week template, the page renders all-zero bars.
  - Navigating to `/week/not-a-week` returns HTTP 400 (verify `isValidWeekKey` gate fires before any filesystem read).
  - Visiting the current week's own `/week/[currentWeekKey]` shows the "This is the current week — go there" link; visiting any other week does not show it.
  - Tapping `+1` on `WeekSnapshotBar` for a past week persists across a full page reload (fetch again and confirm the count).
  - `grep -n "getWeekStore" src/lib/components/WeekSnapshotBar.svelte src/lib/components/WeekSnapshotMetrics.svelte` returns no matches — confirms neither component reads the live `weekStore` context.

---

### Task 15 — `+page.server.js` extension (root page `load()`)

**Traced to PRD §4.12**

- **Files:** `/root/projects/linkedin-outreach-tool/src/routes/+page.server.js` (edit — SP3-owned file; this task **only appends**, per the PRD's explicit instruction that SP3's own `load()` is never replaced)
- **Changes:** Append the following to the existing `load()` function, after everything SP3's version already computes, and add the new keys to the existing return object (do not remove any SP3 key):

  ```js
  import { listWeekKeys, readWeek, projectWeekForConfig, nextWeekKey, prevWeekKey, weekKeyToRange } from '$lib/weeks.js';
  import { summarizeWeekStatus } from '$lib/utils/historyStatus.js';
  import { buildCalendarMonth } from '$lib/utils/calendarMonth.js';
  import { weekFourCheck } from '$lib/utils/weekFourCheck.js';

  const HISTORY_WEEKS_MAX = 52;

  // ...inside load(), after config/weekKey/week/sparkline are already computed:

  const allKnownWeeks = listWeekKeys();
  const firstWeek = allKnownWeeks[0] ?? weekKey;
  const windowStart = laterOf(firstWeek, weekNWeeksBefore(weekKey, HISTORY_WEEKS_MAX));
  const historyKeys = weekKeysBetween(windowStart, weekKey);

  const historyWeeks = historyKeys.map(wk => {
    const w = wk === weekKey ? week : projectWeekForConfig(readWeek(wk, config), config);
    return { ...summarizeWeekStatus(w, config) };
  });
  const weeksCompletedCount = historyWeeks.filter(w => w.status === 'filled').length;

  const touchedWeeks = historyKeys
    .map(wk => wk === weekKey ? week : projectWeekForConfig(readWeek(wk, config), config))
    .filter(w => summarizeWeekStatus(w, config).touched)
    .map(w => ({ week: w.week, metrics: { replies: w.metrics.replies ?? null, calls_booked: w.metrics.calls_booked ?? null } }));

  const weekFourResult = weekFourCheck(touchedWeeks);

  const today = new Date();
  const [calYear, calMonth] = [today.getUTCFullYear(), today.getUTCMonth() + 1];
  const monthWeekKeys = weekKeysOverlappingMonth(calYear, calMonth);
  const weeksByKey = Object.fromEntries(monthWeekKeys.map(wk => [wk, wk === weekKey ? week : projectWeekForConfig(readWeek(wk, config), config)]));
  const calendarMonth = buildCalendarMonth(calYear, calMonth, weeksByKey, weekKey, week.start);

  const nextWeekPreview = { weekKey: nextWeekKey(weekKey), tasks: config.tasks.map(t => ({ id: t.id, label: t.label, min: t.min, target: t.target })) };

  const prevKey = prevWeekKey(weekKey);
  const prevWeek = projectWeekForConfig(readWeek(prevKey, config), config);
  const logInitial = buildLogRows([week, prevWeek]); // interleaves entries[]+items[], sorted desc by `at` — same shape as Task 14's buildRowsForWeek merged across two weeks; implement as a two-week call into mergeLogRows.js: mergeLogRows([], [week, prevWeek])

  return {
    /* ...all existing SP3 keys unchanged: configError, config, week, weekKey, sparkline, headlineMetricId... */
    historyWeeks, weeksCompletedCount, calendarMonth, nextWeekPreview,
    logInitial, logOldestLoadedWeek: prevKey, weekFourCheck: weekFourResult
  };
  ```

  `laterOf`, `weekNWeeksBefore`, `weekKeysBetween`, and `weekKeysOverlappingMonth` are small pure helpers not otherwise specified in the PRD's code block — implement them locally in this file (or in `src/lib/utils/isoWeek.js` if reused elsewhere) using only `dateToWeekKey`/`weekKeyToRange`/plain date arithmetic already available; no new npm dependency. `buildLogRows` is simply `mergeLogRows([], weeksArray)` from Task 4 — use that directly rather than writing a third implementation of the same merge logic.

- **Acceptance criteria:**
  - `historyWeeks.length === 1` and `historyWeeks[0].week === weekKey` on a completely fresh `data/` directory (no week files at all) — confirms `firstWeek` correctly falls back to `weekKey` when `listWeekKeys()` is empty.
  - `calendarMonth.days.length === 42` on every load.
  - `logInitial` contains rows from both the current week and the immediately previous week, sorted descending by `at`, with no duplicate `id`.
  - Existing SP3 keys (`config`, `week`, `weekKey`, `sparkline`, `headlineMetricId`, `configError`) are still present and unchanged in the returned object — diff the object's key set before/after this edit and confirm it's a strict superset.
  - On a `data/` directory with 60+ week files, the total number of `readFileSync`-backed calls (`readWeek` calls) made by this `load()` stays ≤ 58 (1 + up to 51 history + ~5 calendar + 1 previous-week) — spot-check by instrumenting/counting calls in a scratch test, or reason about it directly from the code (no unbounded loop reads `listWeekKeys()`'s full result through `readWeek`).

---

### Task 16 — `+page.svelte` slot fill (root page)

**Traced to PRD §4.13**

- **Files:** `/root/projects/linkedin-outreach-tool/src/routes/+page.svelte` (edit — SP3-owned file; fills the two empty `<section data-slot>` elements SP3 already reserved, per SP3 §4.6)
- **Changes:**

  ```svelte
  <section class="sp4-slot" data-slot="history-calendar">
    <HistoryStrip weeks={data.historyWeeks} weeksCompletedCount={data.weeksCompletedCount} currentWeekKey={data.weekKey} />
    <WeekFourCheck result={data.weekFourCheck} />
    <MonthCalendar month={data.calendarMonth} nextWeek={data.nextWeekPreview} config={data.config} />
  </section>

  <section class="sp4-slot" data-slot="diary-log">
    <DiaryLog initial={data.logInitial} oldestLoadedWeek={data.logOldestLoadedWeek} config={data.config} />
  </section>
  ```
  Add the corresponding `import` statements for `HistoryStrip`, `WeekFourCheck`, `MonthCalendar`, `DiaryLog` at the top of the `<script>` block. Do not touch slots 1–4 or anything else in this file. Both new components read `getWeekStore()` internally (already wired in Tasks 6/8/9/13) rather than receiving the store as a prop.

- **Acceptance criteria:**
  - `grep -n 'data-slot="history-calendar"' src/routes/+page.svelte` shows the section now containing three child components, not empty.
  - `grep -n 'data-slot="diary-log"' src/routes/+page.svelte` shows `DiaryLog` mounted, not empty.
  - Loading the root page in a dev server renders the history strip, the calendar, and the log below slots 1–4 with no console errors.
  - `grep -n "provideWeekStore" src/routes/+page.svelte` shows it called exactly once (SP3's original call) — confirms Task 16 did not add a second call.

---

### Task 17 — Test: `historyStatus.test.js`

**Traced to PRD §7**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/historyStatus.test.js` (new)
- **Changes:**

  ```js
  import { describe, it, expect } from 'vitest';
  import { summarizeWeekStatus } from './historyStatus.js';

  const config = { tasks: [{ id: 'a', min: 2 }, { id: 'b', min: 1 }] };
  const baseWeek = { week: '2026-W01', start: '2026-01-01', end: '2026-01-07', counts: {}, metrics: {}, items: [], entries: [] };

  describe('summarizeWeekStatus', () => {
    it('a fresh empty week is empty and untouched', () => {
      const r = summarizeWeekStatus(baseWeek, config);
      expect(r.status).toBe('empty');
      expect(r.touched).toBe(false);
    });

    it('one count below min is partial and touched', () => {
      const r = summarizeWeekStatus({ ...baseWeek, counts: { a: 1 } }, config);
      expect(r.status).toBe('partial');
      expect(r.touched).toBe(true);
    });

    it('every task at or above min is filled', () => {
      const r = summarizeWeekStatus({ ...baseWeek, counts: { a: 2, b: 1 } }, config);
      expect(r.status).toBe('filled');
    });

    it('zero counts but one entries[] row (any parseStatus) is partial and touched', () => {
      const r1 = summarizeWeekStatus({ ...baseWeek, entries: [{ id: 'e1', parseStatus: 'discarded' }] }, config);
      expect(r1.status).toBe('partial');
      expect(r1.touched).toBe(true);
      const r2 = summarizeWeekStatus({ ...baseWeek, entries: [{ id: 'e2', parseStatus: 'failed' }] }, config);
      expect(r2.status).toBe('partial');
      expect(r2.touched).toBe(true);
    });

    it('config.tasks length 0 does not crash and is empty', () => {
      const r = summarizeWeekStatus(baseWeek, { tasks: [] });
      expect(r.status).toBe('empty');
      expect(r.total).toBe(0);
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/utils/historyStatus.test.js` shows 5 passing tests (matching PRD §7's exact enumerated case list), 0 failures.

---

### Task 18 — Test: `isoWeek.test.js` (parity + retro ISO-boundary correctness)

**Traced to PRD §7, §4.5, §4.10**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/isoWeek.test.js` (new)
- **Changes:**

  ```js
  import { describe, it, expect } from 'vitest';
  import { dateToWeekKey, weekKeyToRange } from './isoWeek.js';
  import * as sp1Weeks from '../weeks.js'; // Node-only test environment, fine under vitest per PRD §7

  const TZ = 'UTC';

  describe('isoWeek.js — SP1 fixture parity', () => {
    const fixtures = [
      ['2023-01-01', '2022-W52'],
      ['2027-01-01', '2026-W53'],
      ['2021-01-01', '2020-W53'],
      ['2026-12-31', '2026-W53'],
      ['2020-12-31', '2020-W53'],
      ['2026-01-01', '2026-W01']
    ];
    it.each(fixtures)('%s -> %s', (dateStr, expected) => {
      expect(dateToWeekKey(dateStr, TZ)).toBe(expected);
    });

    it('every fixture matches SP1\'s own dateToWeekKey byte-for-byte', () => {
      for (const [dateStr, expected] of fixtures) {
        const sp1Result = sp1Weeks.dateToWeekKey(new Date(`${dateStr}T12:00:00Z`), TZ);
        expect(dateToWeekKey(dateStr, TZ)).toBe(sp1Result);
        expect(sp1Result).toBe(expected);
      }
    });
  });

  describe('weekKeyToRange round-trip', () => {
    it.each(['2026-W01', '2026-W35', '2026-W53', '2020-W53'])('%s round-trips to a Monday-Sunday range', (key) => {
      const { start, end } = weekKeyToRange(key);
      expect(dateToWeekKey(start, TZ)).toBe(key);
      expect(dateToWeekKey(end, TZ)).toBe(key);
    });
  });

  describe('retro-logging ISO-boundary correctness (PRD §4.10)', () => {
    it('a Sunday and the Monday immediately after it land in different, correctly-ordered weeks', () => {
      // 2026-08-17 is a Monday (verified: Jan 1 2026 is a Thursday per SP1 §9 Q1;
      // day-229-of-year arithmetic places Aug 17 on a Monday).
      expect(dateToWeekKey('2026-08-23', TZ)).toBe('2026-W34'); // Sunday, last day of that week
      expect(dateToWeekKey('2026-08-24', TZ)).toBe('2026-W35'); // Monday, first day of the next week
    });

    it('a same-week date picked at either end of the week resolves identically', () => {
      expect(dateToWeekKey('2026-08-17', TZ)).toBe(dateToWeekKey('2026-08-23', TZ));
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/utils/isoWeek.test.js` shows all fixture, parity, round-trip, and retro-boundary tests passing (at least 6 fixture + 1 parity + 4 round-trip + 2 boundary = 13 assertions across test cases), 0 failures.
  - The parity test specifically imports SP1's real `src/lib/weeks.js` and fails loudly (not silently) if SP4's duplicate ever drifts from it — confirm this by temporarily changing one constant in `isoWeek.js` locally, observing the parity test fail, then reverting.

---

### Task 19 — Test: `calendarMonth.test.js`

**Traced to PRD §7**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/calendarMonth.test.js` (new)
- **Changes:**

  ```js
  import { describe, it, expect } from 'vitest';
  import { buildCalendarMonth } from './calendarMonth.js';

  describe('buildCalendarMonth', () => {
    it('always returns exactly 42 day cells, regardless of which weekday the 1st falls on', () => {
      // August 2026's 1st is a Saturday; February 2026's 1st is a Sunday — two different offsets.
      expect(buildCalendarMonth(2026, 8, {}, '2026-W35', '2026-08-01').days.length).toBe(42);
      expect(buildCalendarMonth(2026, 2, {}, '2026-W35', '2026-02-01').days.length).toBe(42);
    });

    it('marks leading/trailing days from adjacent months as inMonth: false', () => {
      const { days } = buildCalendarMonth(2026, 8, {}, '2026-W35', '2026-08-01');
      expect(days[0].inMonth).toBe(false); // grid always starts on a Monday before or on the 1st
      expect(days.some(d => d.inMonth && d.date === '2026-08-01')).toBe(true);
    });

    it('isCurrentWeek matches the correct week key for a day in the current ISO week', () => {
      const { days } = buildCalendarMonth(2026, 8, {}, '2026-W35', '2026-08-01');
      const day = days.find(d => d.date === '2026-08-24'); // Monday of 2026-W35
      expect(day.weekKey).toBe('2026-W35');
      expect(day.isCurrentWeek).toBe(true);
    });

    it('entryCount/itemCount bucket by the entry\'s own date / item\'s at-timestamp day, not the week\'s dates', () => {
      const week = {
        week: '2026-W35',
        entries: [{ id: 'e1', date: '2026-08-25' }, { id: 'e2', date: '2026-08-25' }],
        items: [{ id: 'i1', taskId: 'post', at: '2026-08-26T14:00:00Z' }]
      };
      const { days } = buildCalendarMonth(2026, 8, { '2026-W35': week }, '2026-W35', '2026-08-01');
      const day25 = days.find(d => d.date === '2026-08-25');
      const day26 = days.find(d => d.date === '2026-08-26');
      expect(day25.entryCount).toBe(2);
      expect(day25.itemCount).toBe(0);
      expect(day26.entryCount).toBe(0);
      expect(day26.itemCount).toBe(1);
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/utils/calendarMonth.test.js` shows all 4 cases (matching PRD §7's exact list) passing, 0 failures.

---

### Task 20 — Test: `weekFourCheck.test.js` (every branch, exact copy asserted verbatim)

**Traced to PRD §7 — "the single most important string in the app per BRAINSTORM R1"**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/weekFourCheck.test.js` (new)
- **Changes:**

  ```js
  import { describe, it, expect } from 'vitest';
  import { weekFourCheck } from './weekFourCheck.js';

  function w(week, replies, calls_booked) { return { week, metrics: { replies, calls_booked } }; }

  describe('weekFourCheck', () => {
    it.each([0, 1, 2, 3])('n=%i is not due', (n) => {
      const weeks = Array.from({ length: n }, (_, i) => w(`2026-W0${i + 1}`, 1, 0));
      expect(weekFourCheck(weeks).due).toBe(false);
    });

    it('n=4, no nulls -> baseline, with the exact "First checkpoint" copy', () => {
      const weeks = [w('W1', 1, 0), w('W2', 0, 1), w('W3', 2, 0), w('W4', 0, 0)];
      const r = weekFourCheck(weeks);
      expect(r.due).toBe(true);
      expect(r.outcome).toBe('baseline');
      expect(r.line).toBe('Lane A (replies + calls booked) so far: 4. First checkpoint — nothing to compare against yet.');
    });

    it('n=4, currentTotal=0 -> still baseline, NOT zero (no prior period exists)', () => {
      const weeks = [w('W1', 0, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)];
      const r = weekFourCheck(weeks);
      expect(r.outcome).toBe('baseline');
    });

    it('n=8, current > prior -> up, exact copy', () => {
      const prior = [w('W1', 1, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 1
      const current = [w('W5', 2, 0), w('W6', 1, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 3
      const r = weekFourCheck([...prior, ...current]);
      expect(r.outcome).toBe('up');
      expect(r.line).toBe('Lane A (replies + calls booked): 3 this period, up from 1.');
    });

    it('n=8, current < prior -> down, exact copy', () => {
      const prior = [w('W1', 3, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 3
      const current = [w('W5', 1, 0), w('W6', 0, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 1
      const r = weekFourCheck([...prior, ...current]);
      expect(r.outcome).toBe('down');
      expect(r.line).toBe('Lane A (replies + calls booked): 1 this period, down from 3.');
    });

    it('n=8, current === prior (both nonzero) -> flat, exact copy', () => {
      const prior = [w('W1', 2, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 2
      const current = [w('W5', 1, 1), w('W6', 0, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 2
      const r = weekFourCheck([...prior, ...current]);
      expect(r.outcome).toBe('flat');
      expect(r.line).toBe('Lane A (replies + calls booked): 2 this period, same as the one before.');
    });

    it('n=8, currentTotal=0, priorTotal>0 -> zero, "down from" copy', () => {
      const prior = [w('W1', 4, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)]; // total 4
      const current = [w('W5', 0, 0), w('W6', 0, 0), w('W7', 0, 0), w('W8', 0, 0)]; // total 0
      const r = weekFourCheck([...prior, ...current]);
      expect(r.outcome).toBe('zero');
      expect(r.line).toBe('Lane A (replies + calls booked): 0 this period, down from 4.');
    });

    it('n=8, currentTotal=0, priorTotal=0 -> zero, "same as the one before" copy — the hardest string in the app', () => {
      const weeks = Array.from({ length: 8 }, (_, i) => w(`W${i + 1}`, 0, 0));
      const r = weekFourCheck(weeks);
      expect(r.outcome).toBe('zero');
      expect(r.line).toBe('Lane A (replies + calls booked): 0 this period, same as the one before.');
      // No adjective, no "unfortunately", no exclamation mark anywhere in the string.
      expect(r.line).not.toMatch(/unfortunately|unfortunately|!|sorry|bad|worse|fail/i);
    });

    it('n=8, 2+ weeks in the current window both-null -> sparse, checked before zero/up/down/flat', () => {
      const prior = [w('W1', 1, 0), w('W2', 1, 0), w('W3', 1, 0), w('W4', 1, 0)];
      const current = [w('W5', null, null), w('W6', null, null), w('W7', 0, 0), w('W8', 0, 0)];
      const r = weekFourCheck([...prior, ...current]);
      expect(r.outcome).toBe('sparse');
      expect(r.line).toBe('Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something.');
    });

    it.each([5, 6, 7])('n=%i (between checkpoints) is not due', (n) => {
      const weeks = Array.from({ length: n }, (_, i) => w(`W${i + 1}`, 1, 0));
      expect(weekFourCheck(weeks).due).toBe(false);
    });

    it('a week with replies:null, calls_booked:3 does NOT count toward bothNullCount (only both-null counts)', () => {
      const current = [w('W5', null, 3), w('W6', null, 3), w('W7', 0, 0), w('W8', 0, 0)]; // 0 fully-null weeks
      const prior = [w('W1', 0, 0), w('W2', 0, 0), w('W3', 0, 0), w('W4', 0, 0)];
      const r = weekFourCheck([...prior, ...current]);
      expect(r.outcome).not.toBe('sparse'); // exactly 0 both-null weeks, below the >=2 threshold
    });

    it('n=12 -> checkNumber 3, currentWeeks/priorWeeks slice the correct windows by key, not just by total', () => {
      const weeks = Array.from({ length: 12 }, (_, i) => w(`W${i + 1}`, 1, 0));
      const r = weekFourCheck(weeks);
      expect(r.checkNumber).toBe(3);
      expect(r.currentWeeks).toEqual(['W9', 'W10', 'W11', 'W12']);
      expect(r.priorWeeks).toEqual(['W5', 'W6', 'W7', 'W8']);
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/utils/weekFourCheck.test.js` shows all 13 test cases passing (matching PRD §7's full enumerated list), 0 failures.
  - Every `line` assertion above uses `.toBe(...)` (exact string equality), never `.toContain(...)` or a regex that could pass on a paraphrase — confirm by inspecting the test file itself: `grep -c "\.line)\.toBe(" src/lib/utils/weekFourCheck.test.js` returns at least `7` (baseline, up, down, flat, zero×2, sparse).

---

### Task 21 — Test: `mergeLogRows.test.js`

**Traced to PRD §7**

- **Files:** `/root/projects/linkedin-outreach-tool/src/lib/utils/mergeLogRows.test.js` (new)
- **Changes:**

  ```js
  import { describe, it, expect } from 'vitest';
  import { mergeLogRows } from './mergeLogRows.js';

  describe('mergeLogRows', () => {
    it('merges two disjoint weeks into one sorted-descending list with no duplicates', () => {
      const w1 = { week: '2026-W34', entries: [{ id: 'e1', at: '2026-08-20T09:00:00Z' }], items: [] };
      const w2 = { week: '2026-W35', entries: [], items: [{ id: 'i1', taskId: 'post', at: '2026-08-25T10:00:00Z' }] };
      const rows = mergeLogRows([], [w1, w2]);
      expect(rows.map(r => r.id)).toEqual(['item:i1', 'entry:e1']);
    });

    it('re-merging the same week (dirty-week reconciliation) replaces rows by id, no duplication', () => {
      const w1v1 = { week: '2026-W35', entries: [{ id: 'e1', at: '2026-08-24T09:00:00Z' }], items: [] };
      const rows1 = mergeLogRows([], [w1v1]);
      const w1v2 = { week: '2026-W35', entries: [{ id: 'e1', at: '2026-08-24T09:00:00Z', parseStatus: 'ok' }], items: [] };
      const rows2 = mergeLogRows(rows1, [w1v2]);
      expect(rows2.length).toBe(1);
      expect(rows2[0].entry.parseStatus).toBe('ok');
    });

    it('entries and items from the same week interleave by at timestamp, not grouped by kind', () => {
      const w1 = {
        week: '2026-W35',
        entries: [{ id: 'e1', at: '2026-08-24T08:00:00Z' }, { id: 'e2', at: '2026-08-24T12:00:00Z' }],
        items: [{ id: 'i1', taskId: 'post', at: '2026-08-24T10:00:00Z' }]
      };
      const rows = mergeLogRows([], [w1]);
      expect(rows.map(r => r.id)).toEqual(['entry:e2', 'item:i1', 'entry:e1']);
    });
  });
  ```

- **Acceptance criteria:**
  - `npx vitest run src/lib/utils/mergeLogRows.test.js` shows all 3 cases (matching PRD §7's exact list) passing, 0 failures.

---

### Task 22 — Manual smoke pass

**Traced to PRD §7 "Manual smoke pass" (this app's slice of BRAINSTORM §3.7)**

- **Files:** none — verification only, run against a real dev server (`npm run dev`) with SP1+SP2+SP3+SP4 all in place and a scratch `data/` directory
- **Changes:** none. Walk every item below in order and confirm the stated behavior. This task cannot be automated (no component-testing framework exists in this project, matching SP3's own explicit precedent of relying on manual smoke passes for rendered-component behavior) — treat it as a checklist, not code to write.

  1. Fresh app, zero weeks logged: the history strip shows exactly one (current-week) square and "Your history starts this week."; the calendar renders with only today marked; the week-4 check renders nothing (`due: false`).
  2. Log for 4 distinct weeks (any mix of clearing/not): the week-4 card appears on the 4th, showing the `baseline` copy; dismiss it; reload; confirm it stays dismissed.
  3. Continue to 8 touched weeks with `replies`/`calls_booked` left at 0 throughout while task bars clear normally: the card reappears with the `zero` outcome and the exact copy `Lane A (replies + calls booked): 0 this period, same as the one before.`; confirm nothing about its styling reads as an error (no red, no icon beyond the border-weight change).
  4. Back-date a diary entry via the current week's date picker into a week from 3 ISO weeks ago: confirm the "Logging into…" label appears before Save; Apply it; confirm the current week's bars are unaffected; confirm the history strip's square for that past week updates without a page reload (watch the network tab for exactly one `GET /api/week/[that week]`, not a full reload).
  5. Click a history-strip square for a past week: confirm `/week/[week]` renders that week's bars/metrics/log; make a correction tap; confirm it persists on reload.
  6. Log a `post` task item via its tap (Task 11's R-D change): confirm it appears in the log immediately with the unlinked-nudge form already open; fill in a bad URL (e.g. `not a url`) and confirm the inline error; fill in a valid one and confirm it renders as a pill matching `PinnedLinks`' styling.
  7. Click "Load earlier" in the log repeatedly until `exhausted`: confirm the button disappears and no further network calls fire.
  8. Resize to a phone viewport: confirm the history strip scrolls horizontally, the calendar grid stays legible, and touch targets on `WeekSnapshotBar` are ≥40px.
  9. **(Added by this TASKS.md, not in the PRD's own enumerated list — orphaned-taskId coverage per PRD §9 Q5, requested explicitly in the task-generation brief.)** Manually remove a task id from `config/config.json` that has an existing logged item referencing it, reload the log: confirm that item's row still renders (no crash, no blank row) showing the raw task id string instead of a label.

- **Acceptance criteria:**
  - All 9 items above are walked and confirmed by a human (or a browser-driving agent) against a real running dev server; any failure is filed as a bug against the specific task above whose acceptance criteria it violates, not patched ad hoc without updating that task's own file.

---

## Summary of what requires you (not a dev agent)

- **Nothing new is required to implement this PRD's own files.** PRD §8 confirms both items that once needed cross-SP confirmation (R-A–R-D landing in SP3's files, and `GET /api/weeks` landing in SP2's routes) are already `[RESOLVED]`/confirmed as of this PRD's final reconciliation pass (§9 Q2, Q3).
- **Task 22 (manual smoke pass) needs eyes-on verification** — either the user or a browser-driving agent, run against a live dev server. It is not something a code-writing sub-agent can mark done from source alone; flag it as a distinct, later verification step once Tasks 1–21 are implemented and committed.
- No `05-deploy-and-docs` (SP5) work is assumed or required anywhere in the above — every task runs against the app standalone with no path prefix, per this project's own current scope note (hosting/deployment is out of scope for now).
