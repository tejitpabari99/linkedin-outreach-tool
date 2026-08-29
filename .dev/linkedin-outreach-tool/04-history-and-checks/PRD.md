# PRD: SP4 — History, Calendar, Log & the Week-4 Honesty Check

**Sub-project:** SP4 (Phase 4, depends on SP1 + SP2 + SP3)
**Repo:** `/root/projects/linkedin-outreach-tool`
**Date:** 2026-08-29
**Status:** Planning — no implementation started

---

## 1. Problem

SP3 built the week that fits on one screen: open it, see it's nearly done, do one thing, close it. That half of the product answers "what do I do right now." It says nothing about "how far have I come" — and BRAINSTORM is explicit that the *absence* of that feeling is part of what makes routine work decay into boredom (§1: "esp if I don't see results, I feel discouraged... I tend to give up on routine").

So this sub-project exists to answer "how far have I come" — and it is also, by BRAINSTORM's own admission (§5, R1), the sub-project most capable of doing the opposite. A history view is where a bad month becomes visible. D19 is not a suggestion here, it's the whole design constraint: *"The page must never deliver a verdict on a bad week."* Every component in this PRD has to hold two things in tension at once — genuine, visible progress, and genuine refusal to score a miss.

R1 sharpens this further: *"The tool becomes the accomplishment instead of the outreach... the bars fill, the dopamine lands, and logging quietly substitutes for doing."* A history strip that only ever shows filled squares is not proof the tool is working — it might be exactly the failure mode R1 describes, invisible from inside the app because the app only measures its own inputs (D2's whole reason for existing: effort is scored, outcomes are displayed but never scored). D24 is the one place in the entire system that is allowed, on a fixed schedule, to look at outcomes and say something true about them — deterministically, without an LLM, without moralizing. Writing that string is the hardest part of this PRD and the reason R1 names it as the cheapest test of whether the tool should keep existing.

Two structural gaps show up while designing this, both resolved here rather than deferred:

1. **Retro-logging already has a UI (SP3's date picker) but not a correct backend wiring.** SP3's `EntryPreview.svelte` applies a diary entry's deltas against `store.weekKey` — the *currently displayed* week — regardless of which week the entry's own date actually landed in. For a same-week entry this is harmless. For a back-dated entry into a prior ISO week (the explicit weekend-catch-up case D11 exists for), it is wrong: it would optimistically bump the *wrong* week's live counts and then call `apply`/`discard` against the wrong week's file. This is exactly the "getting it wrong silently corrupts history" failure the task brief warns about, and it's SP4's to fix because retro-logging is SP4's item.
2. **SP2 never built a way to list weeks**, and flagged the gap explicitly for whoever needs it. The history strip's "how far does it render" and the log's "how much history is loaded" both need it. §5 resolves it with a request to SP2.

## 2. Goals

1. A history strip that reads as *progress*, not a report card — filled/partial/empty with a palette that makes "not yet" and "cleared" both calm, and a weeks-completed count that doesn't read as a low score in week 1.
2. A month calendar that earns its space beyond the strip (day-level granularity within a month) and a next-week view that makes the week ahead look small and known before it starts.
3. A reverse-chronological log that renders `entries[]` and `items[]` verbatim and faithfully, handles all four `parseStatus` values without any of them looking like failure except the one that is, and stays fast as months of history accumulate.
4. Retro-logging that is provably correct across an ISO-week boundary: a diary entry back-dated into a prior week updates *that* week's file and nothing else, with the fix to SP3's `EntryPreview`/`DiaryBox` spelled out precisely.
5. A concrete, adopted position on `items[]` granularity (SP1's open Q9) and a working link-attach UI built on it, honoring the already-settled ruling that D15 wins over SP2 §4E's server-side gate.
6. `weekFourCheck()` — a pure, unit-tested, deterministic function implementing D24, placed where it can be seen without ever being pushed at anyone, with copy for every outcome including the zero case.
7. A `+page.server.js` extension and two `+page.svelte` slot fills that respect SP3's append-only `load()` contract and shared `weekStore` context exactly as documented.

## 3. Non-Goals

- Slots 1–4 (pinned links, metrics row, two lanes, diary box) — SP3's, untouched except for the three precisely-scoped requests in §4.2.
- Any change to D24's own numbers (D5's quotas, D6's metric list) — this PRD consumes them, doesn't relitigate them.
- A dedicated "log a past week" UI distinct from the existing date picker — D11 already specifies one control (a back-datable date picker), and SP3 already built it; SP4's job is making what it points at (apply/discard routing, history refresh) correct, not building a second entry point.
- Export/import UI — SP2 ships the endpoints; the UI for them is now assigned to SP3 (§6.10 there), not built here (see §9 Q8).
- Auth — D25, SP5's proxy layer, invisible to this app.
- Any new runtime dependency. No date library, no calendar package, no charting library. Hand-rolled, matching SP3's own constraint.

## 4. Architecture Decisions

### 4.1 File list

```
src/routes/
  week/[week]/
    +page.svelte                 new — read-mostly snapshot of one arbitrary (usually past) week
    +page.server.js              new — loads that week via SP1's readWeek/projectWeekForConfig

src/lib/
  utils/
    historyStatus.js             new — pure: classify a week as filled/partial/empty
    historyStatus.test.js        new
    isoWeek.js                   new — client-safe duplicate of SP1's pure ISO-week algorithm
    isoWeek.test.js              new — parity-tested against SP1's own fixtures
    calendarMonth.js             new — pure: shape a month's days from already-fetched week data
    calendarMonth.test.js        new
    weekFourCheck.js             new — pure: D24, the honesty check
    weekFourCheck.test.js        new
    mergeLogRows.js              new — pure: merge/sort/de-dupe log rows across weeks
    mergeLogRows.test.js         new
  components/
    HistoryStrip.svelte          new — slot 5, part A
    MonthCalendar.svelte         new — slot 5, part B (calendar + next-week view)
    WeekFourCheck.svelte         new — slot 5, part C (the honesty-check card)
    DiaryLog.svelte              new — slot 6 (reverse-chron log + pagination)
    LogRow.svelte                new — one entry or item row; shared by DiaryLog and /week/[week]
    LinkAttachForm.svelte        new — URL + label inline form, used inside LogRow item rows
    WeekSnapshotBar.svelte       new — lightweight, non-optimistic task bar for /week/[week]
    WeekSnapshotMetrics.svelte   new — lightweight metrics readout for /week/[week]
```

No file under `src/routes/api/**`, `src/lib/config.js`, `src/lib/weeks.js`, or SP3's own component files is edited directly by SP4 — SP4 either mounts into SP3's reserved slots (§4.13, the one edit SP3 already anticipated) or requests three precisely-scoped changes to SP3-owned files (§4.2), never edits them unilaterally.

### 4.2 Cross-SP requests to SP3 (read this section first — everything else depends on it)

Retro-logging (§4.10) and the item-creation flow for link-required tasks (§4.9) both need three small, precisely-scoped changes to files SP3 owns. Each is stated here once; referenced by number elsewhere.

**Request R-A — `weekStore.svelte.js` gains a dirty-week signal.**

```js
// added to createWeekStore() in src/lib/stores/weekStore.svelte.js
let historyVersion = $state(0);
let lastDirtyWeek = $state(null);

function markWeekDirty(weekKey) {
  lastDirtyWeek = weekKey;
  historyVersion++;
}

// added to the returned object:
get historyVersion() { return historyVersion; },
get lastDirtyWeek() { return lastDirtyWeek; },
markWeekDirty
```
Purpose: SP4's `HistoryStrip`/`MonthCalendar`/`DiaryLog` are siblings of `DiaryBox` in the component tree (both descend from `+page.svelte`, per SP3 §4.6), not ancestors/descendants of each other, so they can't call each other directly. `weekStore` is the one thing every slot already shares via context (SP3 §4.5) — extending it with a version counter is the smallest correct way to let "an entry in week X was just applied" reach components that never see the event directly.

**Request R-B — `EntryPreview.svelte` routes against the entry's own week, not the display week.**

Today (SP3 §6.4): `apply()`/`discard()` always call `${base}/api/week/${weekKey}/entry/${entry.id}/apply`, and always call `store.bumpLocalCount`/`setLocalMetric` unconditionally — both using whatever `weekKey` prop was passed in, which SP3's `DiaryBox` currently hardcodes to `store.weekKey` (the *currently displayed* week) regardless of which week the entry actually lives in. For a same-week entry this is invisible. For a back-dated entry it is wrong twice over: it optimistically edits the wrong week's live bars, then calls apply/discard against the wrong week's file (404, or worse, a false success against an unrelated entry id that happens not to exist there).

Required change:
```js
// EntryPreview.svelte — weekKey prop MUST be the entry's own home week, documented as such
let { entry, weekKey, onResolved, onReparse } = $props();
const store = getWeekStore();

async function apply() {
  if (busy) return;
  busy = true;
  const isLiveWeek = weekKey === store.weekKey;   // NEW guard
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
    store.markWeekDirty(weekKey);      // NEW — R-A
    onResolved(weekKey);               // NEW — pass which week changed, was onResolved()
  } finally { busy = false; }
}
```
`discard()` gets the same `store.markWeekDirty(weekKey)` + `onResolved(weekKey)` treatment, without the local-mutation branch (discard never touches counts/metrics either way). This is the one change that makes reuse of `EntryPreview.svelte` inside SP4's log (§4.8) *and* correct retro-logging inside SP3's `DiaryBox` (§4.10) both true at once — the same component, driven correctly by whichever week its caller actually passes in.

**Request R-C — `DiaryBox.svelte` tracks the entry's actual landed week, and shows a small "logging into week X" label when it differs from today.**

```js
// DiaryBox.svelte
import { dateToWeekKey, weekKeyToRange } from '$lib/utils/isoWeek.js'; // SP4's client-safe util, §4.5

let landedWeek = $state(null);   // NEW — replaces the implicit assumption that entries live in `weekKey`

async function save() {
  // ...unchanged through the POST...
  const { week: returnedWeek, entry } = await res.json();
  landedWeek = returnedWeek;     // NEW — the server's own answer, always authoritative (§4.10)
  activeEntry = entry;
  // ...unchanged...
}

// pass landedWeek, not the outer weekKey prop, to EntryPreview:
// <EntryPreview entry={activeEntry} weekKey={landedWeek} onResolved={onResolved} onReparse={reparse} />

// NEW — advisory-only label, never used for routing (see §4.10 for why this distinction matters):
const targetWeekLabel = $derived.by(() => {
  const targetKey = dateToWeekKey(date, config.timezone); // config passed as a prop, or read off store
  if (targetKey === weekKey) return null; // today's week, nothing to say
  const { start, end } = weekKeyToRange(targetKey);
  return `Logging into ${formatRange(start, end)} (${targetKey})`;
});
```
```svelte
<input class="date-input" type="date" bind:value={date} max={todayStr} />
{#if targetWeekLabel}
  <p class="retro-label">{targetWeekLabel}</p>
{/if}
```

**Request R-D — the item-creation tap for `link:"required"` tasks.** Stated in full in §4.9 since it's specifically about link-attach UI ownership; referenced here only so §4.2 is a complete index of every file SP4 asks SP3 to touch: `TaskBar.svelte`'s `tap()` function.

These four are the entire footprint SP4 asks of SP3-owned files. Everything else in this PRD is new, SP4-owned code.

### 4.3 `historyStatus.js` — classifying a week (pure, no I/O)

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

Deliberate choices worth stating:
- **`filled` matches SP3's confetti condition exactly** (`config.tasks.every(t => counts[t.id] >= t.min)`, SP3 §6.5) — the history strip's "cleared" square and the moment confetti fires describe the same underlying fact by construction, not by coincidence kept in sync by hand.
- **`touched` counts a diary attempt even if it produced nothing** — a week with one discarded/failed entry and zero counts is `partial`, not `empty`. This is a deliberate reading of D2's spirit: effort is scored (here, "did something happen"), not outcome ("did it land"). A week where Tejit tried and the parse failed should not look identical, in the strip, to a week he never opened the app at all.
- **No status is ever a hard error or negative signal** — `empty` is the only state for an untouched week, and it renders identically whether the week is a genuine miss or simply hasn't happened yet (a future/current week, handled separately in §4.4's rendering, not by this function).

### 4.4 `HistoryStrip.svelte` — the emotional core of this sub-project

**How far back it renders.** From `max(firstEverLoggedWeek, 52 weeks before current)` to `currentWeekKey`, ascending. `firstEverLoggedWeek` is `listWeekKeys()[0]` (SP1, cheap directory read) — this is the choice that makes week 1 read correctly: with no prior weeks logged, the strip renders exactly **one square** (the current week), not fifty-two empty squares stretching into a past before the tool existed. The 52-week cap exists purely to bound `+page.server.js`'s read cost as history grows past a year — see §9 for the tradeoff.

**Palette — no red, no green, no pass/fail color at all.** Reuses exactly the custom properties already established by SP3's `+layout.svelte`/`TaskBar.svelte` palette (`--fg`, `--muted`, `--card-border`, `--fg-secondary`) — no new hue is introduced anywhere in this component:

| Status | Rendering | Why |
|---|---|---|
| `filled` | solid square, `background: var(--fg); opacity: 0.85` | A plain, confident fact — this happened. Same "done" language TaskBar already uses for a cleared bar, extended to a week. |
| `partial` | square, `background: var(--muted); opacity: 0.5` | Visibly less than filled, never red. Reads as "some," not "short." |
| `empty` (past week, genuinely untouched) | `background: transparent; border: 1px dashed var(--card-border); opacity: 0.55` | A dashed outline reads as *absence*, not *failure* — the same visual grammar as `PinnedLinks`' empty-URL pill (SP3 §6.1), reused deliberately so "not yet filled in" looks the same everywhere in this app. |
| current week (any status) | adds `outline: 1px solid var(--fg-secondary); outline-offset: 2px` on top of whatever its status square already is | The one week that's still open needs to be findable without color-coding it as good or bad — an outline says "this one's live," independent of how much of it is done. |

Squares for weeks with no file on disk (gaps inside the render window, e.g. a week skipped between two touched weeks) render as `empty` using `emptyWeek(weekKey, config)` — no `readWeek` call needed for those, since SP1's `emptyWeek` is pure and free.

**Weeks-completed count (D20).** `historyWeeks.filter(w => w.status === 'filled').length`, computed over the same bounded window as the strip itself (not literally all-time — see §9). Rendered as a plain number with no superlative language ("cleared", not "won" or "crushed").

**Week-1 / no-history state.** When `historyWeeks.length === 1` (only the current week exists), the count line reads differently on purpose:

```svelte
{#if weeksCompletedCount === 0 && historyWeeks.length <= 1}
  <p class="history-empty-note">Your history starts this week.</p>
{:else}
  <p class="history-count">{weeksCompletedCount} week{weeksCompletedCount === 1 ? '' : 's'} completed</p>
{/if}
```
"Your history starts this week" is deliberately not "0 weeks completed" — a bare `0` as the first thing a brand-new user sees reads as a score already in the negative, exactly the discouragement risk D19 names. Once a second week exists (even if still `empty`), the plain count line takes over, including when it says `0 weeks completed` — at that point `0` is one data point among several visible squares, not the entire screen's verdict.

**Component:**
```svelte
<!-- HistoryStrip.svelte -->
<script>
  let { weeks, weeksCompletedCount, currentWeekKey } = $props(); // weeks: HistoryWeek[] from +page.server.js
</script>

<div class="history-strip-wrap">
  {#if weeksCompletedCount === 0 && weeks.length <= 1}
    <p class="history-empty-note">Your history starts this week.</p>
  {:else}
    <p class="history-count">{weeksCompletedCount} week{weeksCompletedCount === 1 ? '' : 's'} completed</p>
  {/if}
  <div class="history-strip">
    {#each weeks as w (w.week)}
      <a
        class="history-square {w.status} {w.week === currentWeekKey ? 'current' : ''}"
        href="{base}/week/{w.week}"
        title="{formatRange(w.start, w.end)} · {w.status === 'filled' ? `${w.clearedCount}/${w.total} cleared` : w.status === 'partial' ? `${w.clearedCount}/${w.total} cleared` : 'not logged'}"
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

**Click behaviour.** Each square is a plain `<a href="{base}/week/{weekKey}">` — a real link, not a JS click handler, so it works with middle-click/new-tab and needs no extra logic. Navigates to the read-mostly detail page, §4.11. Hover shows the native `title` tooltip with the date range and a neutral fact (`"3/5 cleared"`) — never `"2/5 missed"`.

### 4.5 `isoWeek.js` — the client-safe ISO week util, and why it exists

SP1's `src/lib/weeks.js` imports `node:fs` at module scope for `readWeek`/`writeWeek`/`listWeekKeys`. Even though `dateToWeekKey`/`weekKeyToRange`/`isoWeekKeyFromUTCDate` are individually pure, they live in the same file — importing any one of them into browser-bundled code (SP4's `DiaryBox` retro-log label, R-C above) would pull `node:fs` into the client bundle. Rather than ask SP1 to restructure a file it owns and has already shipped a contract for, SP4 carries a small, deliberate duplicate:

```js
// src/lib/utils/isoWeek.js — client-safe. No node:fs, no node:path, no fs-touching function at all.
// MUST stay byte-for-byte algorithmically identical to SP1's src/lib/weeks.js. See isoWeek.test.js,
// which asserts parity against the exact fixture set SP1's own PRD defines (§4.5 of SP1's PRD).

const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

function isoWeekKeyFromUTCDate(utcDate) {
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

**Why a plain `<input type="date">` value never needs the timezone-sensitive path anyway.** `dateToWeekKey`'s only real job here is turning the picker's `YYYY-MM-DD` string into a week key for the *display label*. The HTML date input's value is already an unambiguous calendar date with zero time-of-day or timezone component — the `T12:00:00Z` anchor above (noon UTC) is deliberately chosen so that converting it back to a local calendar day in any real-world timezone (`config.timezone`) can never cross a midnight boundary and flip the date. This side-steps the exact Sunday-vs-Monday ambiguity named in the task brief for the *label's own computation* — see §4.10 for why the label is allowed to be advisory rather than load-bearing regardless.

### 4.6 `calendarMonth.js` + `MonthCalendar.svelte` — what the calendar adds

**What it adds over the strip, stated plainly (it has to earn this, D20 kept it at Tejit's explicit override):** the strip shows one dot per *week* — a trend line. The calendar shows one cell per *day* within a month — whether work was spread across the week or crammed into one evening, which the strip physically cannot represent since it aggregates to a single square per week. It also carries the **next-week view** (D20's second explicit ask), which the strip has no natural place for (a strip square for a week with no data yet is indistinguishable from a missed week — exactly the ambiguity D20's "next-week view" exists to avoid).

**Pure shaping function** (server calls it after fetching the ~5 week files a month can span):
```js
// src/lib/utils/calendarMonth.js

/**
 * @param {number} year
 * @param {number} month        1-12
 * @param {Record<string, object>} weeksByKey   projected week objects, keyed by their own `week`,
 *                                               covering every ISO week that overlaps this month
 * @param {string} currentWeekKey
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
    const weekKey = isoWeekKeyFor(d); // local copy of isoWeekKeyFromUTCDate, see isoWeek.js
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
`entryCount`/`itemCount` (rather than a single boolean "had activity") because a day with 3 diary entries vs. 1 should look visibly different (a slightly larger dot, not a number — see rendering below; a numeral would start to feel like a score).

**Rendering — a dot, never a number, never a color scale.** Each in-month day cell shows a small filled dot only if `entryCount + itemCount > 0`, sized by a simple 1/2/3+ tier (`small`/`medium`/`large` CSS class), always in `var(--fg-secondary)` — one color, three sizes, no gradient that could read as a heat-map "how good was this day."

**Current week marking.** Every day cell whose `isCurrentWeek` is true gets a subtle `background: var(--card-bg)` band across the row — same visual language as the history strip's current-week outline, applied at the row level here since a week is a row in a calendar grid.

**Next-week view.** Rendered as a compact strip below the calendar grid, not another dot-per-day grid (there's nothing to show per-day yet — it hasn't happened):
```js
// computed inline in +page.server.js — trivial enough not to need its own file/test:
function buildNextWeekPreview(config, nextWeekKeyValue) {
  return {
    weekKey: nextWeekKeyValue,
    tasks: config.tasks.map(t => ({ id: t.id, label: t.label, min: t.min, target: t.target }))
  };
}
```
```svelte
<!-- inside MonthCalendar.svelte -->
<div class="next-week">
  <p class="next-week-label">Next week ({nextWeek.weekKey})</p>
  <p class="next-week-line">
    {nextWeek.tasks.map(t => `${t.min}${t.min !== t.target ? `–${t.target}` : ''} ${t.label.toLowerCase()}`).join(' · ')}
  </p>
</div>
```
Renders as one line, e.g. `10–15 targeted connection requests · 2–4 follow-up dms · 1–2 call asks sent · 5–10 substantive comments · 1 posts published` — deliberately the exact same quota numbers as this week's own bars will show once it arrives, so nothing about it is a surprise. This is why "recommend: the upcoming quota" (the task brief's own suggestion) is adopted as-is rather than inventing something else — the quota is genuinely all there is to say about a week with no data yet, and saying exactly that (not "get ready!", not a countdown) is what makes it look small and known rather than blank.

**Month navigation.** Prev/next arrows change `year`/`month`; going further back than what `+page.server.js` server-rendered triggers a client-side fetch — see §4.12 for exactly which months are server-rendered vs. fetched.

### 4.7 `weekFourCheck.js` — D24, in full

**Trigger — "week 4," defined precisely.** Not the 4th calendar week since signup, and not a fixed one-time check — R1 needs this to keep firing, because a tool that could pass once by luck in week 4 and never check again would leave R1 undetected in month 3. Trigger is keyed to **touched** weeks (§4.3's `touched` flag — a week that was genuinely engaged with, whether or not it cleared), so a long gap in usage doesn't fast-forward the check past data that was never produced:

```js
// src/lib/utils/weekFourCheck.js

/**
 * @typedef {{ week: string, metrics: { replies: number|null, calls_booked: number|null } }} TouchedWeekSlice
 * @typedef {'baseline'|'zero'|'up'|'down'|'flat'|'sparse'} WeekFourOutcome
 * @typedef {{
 *   due: boolean,
 *   outcome: WeekFourOutcome | null,
 *   checkNumber: number | null,     // 1 on the 4th touched week, 2 on the 8th, etc.
 *   currentTotal: number | null,    // replies + calls_booked summed over the current 4-week window
 *   priorTotal: number | null,      // same, prior window — null when outcome is 'baseline' or 'sparse'
 *   currentWeeks: string[],
 *   priorWeeks: string[] | null,
 *   line: string | null             // the ready-to-render one-line copy; null when !due
 * }} WeekFourCheckResult
 *
 * @param {TouchedWeekSlice[]} touchedWeeksAscending  every week that was `touched` per historyStatus.js,
 *   in ascending week-key order, up to and including the most recent touched week. Weeks that were
 *   fully skipped (status 'empty') are NOT included — they don't count toward the 4, matching D19's
 *   "a missed week is neutral": a gap shouldn't be able to pad the count toward a check firing sooner,
 *   nor should it silently reset progress toward one.
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

  // Data-quality escape hatch: if more than half the current window never had these two metrics
  // entered at all, a confident "0" would misdiagnose R2 (logging fatigue on metrics) as R1
  // (outreach isn't working). The check should never assert an outcome it doesn't have evidence for.
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

**On the zero-case copy, precisely, since the task calls it the hardest string in the app.** The line is deliberately just the two numbers and a direction word (`down from`, or `same as`) — no adjective, no "unfortunately," no "let's see if we can turn this around." BRAINSTORM's own words for D24 are "no judgement, just the number," and R1's own conclusion ("the tool failed — delete it") is explicitly *Tejit's* verdict to reach looking at the number, not a verdict the tool delivers about itself — a tool that told its own user "you failed" would be doing exactly the thing D19 rules out, just aimed at a 4-week window instead of a single week. The mirror shows the number; it does not narrate what the number means. `"Lane A (replies + calls booked): 0 this period, same as the one before."` is the complete, final copy for the case where the check has real evidence and that evidence is silence.

**Why `zero` outranks `down`/`flat` in priority even though the branch structure could reach either.** If `currentTotal === 0`, that's the single fact R1 cares about most, regardless of whether it's a decline from a good prior period or a continuation of an already-bad one — both are worth a visually slightly firmer presentation than an "up"/"down"/"flat" nonzero comparison (see `WeekFourCheck.svelte` below), so `zero` is checked and returned first.

### 4.8 `WeekFourCheck.svelte` — placement and dismissal

**Placement.** Inside slot 5, between the history strip and the calendar — visible only when someone scrolls down to look at their own history (an act of reflection), never in slots 1–4 (the "no scroll to see the week" core view) and never anywhere resembling a notification. This is a direct extension of D18's "no notifications, no email, passive only" logic to a check that only makes sense on a 4-week cadence — it should be exactly as passive as the tab title counter, just positioned where looking back naturally leads.

**Dismissal.** A card that disappears once acknowledged, reappearing only when the *next* multiple of 4 becomes due — not a permanent scoreboard (which would start to look like the outcomes-are-scored thing D2 rules out). State lives in `localStorage`, same pattern and same reasoning as SP3's confetti "once" bookkeeping (SP3 §6.5: purely a UI/session flag, no forensic value, not worth a schema change SP1 would need to sign off on):

```js
function dismissKey(checkNumber) { return `linkedin-outreach:week4check:dismissed:${checkNumber}`; }
```

```svelte
<!-- WeekFourCheck.svelte -->
<script>
  let { result } = $props(); // WeekFourCheckResult from +page.server.js

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
  .week4-notable { border-left: 3px solid var(--fg-secondary); } /* slightly firmer, never red */
  .week4-line { font-size: 0.85rem; color: var(--fg); margin: 0; }
  .week4-dismiss { flex-shrink: 0; background: none; border: 1px solid var(--chip-border); border-radius: 7px;
    padding: 0.3rem 0.7rem; font-size: 0.76rem; color: var(--fg-secondary); cursor: pointer; }
</style>
```

`week4-notable` (the `zero` outcome's only visual distinction) is a border weight change, not a color — deliberately the smallest possible amount of "pay attention here" that still stops short of anything resembling a warning color.

### 4.9 Item-creation, link-attach, and SP1's open Q9 — a concrete position

**Adopted position on `items[]` granularity**, extending SP3's own resolution (SP3 §9 Q8) rather than diverging from it: plain `+1`/`−1` taps on `link:"optional"` tasks (invites, dms, call_ask, comments) never create an `items[]` row — pure count deltas, exactly as SP3 already built. For `link:"required"` tasks (today: `post`), **every log of that task always creates an item**, via `POST /api/week/[week]/items`, even with `link: null` — never a bare count delta. This is the piece SP3 left "contingent" and omitted from its committed snippets; SP4 settles it because SP4 owns the link-attach UI that needs an item to exist in order to attach a link to it later (D15: "the icon appears after logging and can be filled later" only works if logging always leaves something to attach to).

**Request R-D (added to §4.2's index): `TaskBar.svelte`'s `tap()` branches on `task.link`:**
```js
// TaskBar.svelte — tap(), modified
async function tap(delta) {
  if (task.link === 'required' && delta > 0) {
    const res = await fetch(`${base}/api/week/${store.weekKey}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, link: null })
    });
    const { counts } = await res.json();
    store.replaceWeek({ ...store.week, counts }); // server truth — a deliberate single click, no optimism needed
    return;
  }
  // unchanged: optimistic delta path for link:"optional" tasks, and for any negative delta
  store.bumpLocalCount(task.id, delta);
  pendingDelta += delta;
  flush();
}
```
A `−1` correction on `post` still goes through the plain count-delta `PATCH` (there is no `DELETE` on `items[]` in SP2's contract) — this can leave an orphaned item with no matching count, mirroring the exact precedent SP2 already accepted for `DELETE /api/week/[week]/entry/[id]` on an applied entry (SP2 §4B: "the numeric effect will visibly outlive the text that produced it... judged acceptable"). Flagged `[DEFERRED]` in §9, non-blocking.

**Server-side link-required gate — already ruled `[RESOLVED]` before this PRD started, restated for completeness.** SP2 §4E's `POST /api/week/[week]/items` currently 400s if a `link:"required"` task is created without both `link.url` and `link.label`. D15 wins: the server must accept `link: null` unconditionally at creation, for every task including `post`. This PRD's `link: null` payload above depends on that. Since the ruling was made before this PRD began, no further request is issued here — it's assumed already directed to SP1/SP2.

**`LinkAttachForm.svelte` — the attach/edit affordance.**
```svelte
<script>
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
The unlinked/nudge state (`!item.link`) opens straight into edit mode with no separate "add a link" button first-click needed — one tap to start typing, matching the same "never block, but make it one click away" spirit as SP3's quota-edit affordance. The `link-pill`/`link-attached` classes intentionally reuse `PinnedLinks`' `.link-pill` visual language (SP3 §6.1) so an attached item link reads as the same *kind of thing* as a pinned link everywhere else in the app.

**The nudge, specifically.** D15 requires the "required" designation to surface as a UI nudge, never a gate (the settled ruling in the task brief). It surfaces exactly once, in the one place SP4 owns that will always show every `post` item: the log (§4.8). An unlinked post item's `LogRow` renders `LinkAttachForm` already in edit mode, styled identically to any other inline form in the app — not bordered in a warning color, not accompanied by an icon that reads as an error. It is visible for as long as the link is missing and disappears the moment it's filled in; nothing escalates it, nothing reminds about it a second time beyond it simply still being there next time the log is opened.

### 4.10 Retro-logging — the full flow, and the ISO-boundary correctness argument

**The flow, end to end:**
1. Tejit opens the date picker in the current week's `DiaryBox` (SP3, slot 4 — unchanged UI, already back-datable, `max={today}`, no `min` — any past date is accepted, matching D19's "any past week is retro-loggable").
2. As soon as the picked date resolves (client-side, via R-C's `isoWeek.js`) to a week other than the one currently displayed, a small label appears under the date input: `"Logging into Aug 17–23 (2026-W34)"`. This is the concrete answer to "how the UI makes clear you are writing to a past week" — it's advisory text computed from the *same string the input already holds*, not a separate confirmation step or modal (retro-logging must stay exactly as frictionless as same-week logging; the only thing that changes is what's printed under the box).
3. Save calls `POST /api/entry` (unchanged, SP2) with `{ date, text }` — the server, not the client, decides the week key (`weeks.dateToWeekKey(date, config.timezone)`, SP1's own algorithm, the one true source of truth). If the week's file doesn't exist yet, SP1's `readWeek` returns the empty template and the subsequent `writeWeek` creates it (SP1 §4.6 — no new work needed here, already handled).
4. The response's `week` field (`landedWeek`) is what R-C's `DiaryBox` now tracks and passes to `EntryPreview` as its `weekKey` prop (not the display week) — this is what makes Apply/Discard/Reparse route correctly regardless of which week the entry landed in.
5. Because R-B's `EntryPreview` only merges into `weekStore`'s live counts/metrics when `weekKey === store.weekKey`, a back-dated Apply never touches the currently-displayed week's bars — "what happens to the current-week view while a past week is being edited" is answered structurally: nothing happens to it, by construction, not by a check anyone has to remember to add later.
6. R-B's `EntryPreview` calls `store.markWeekDirty(landedWeek)` on successful Apply/Discard regardless of which week it was. `HistoryStrip`, `MonthCalendar`, and `DiaryLog` each `$effect` on `weekStore.historyVersion` (R-A) and, when it changes, re-fetch just `GET /api/week/${weekStore.lastDirtyWeek}` and patch their own local view of that one week — never a full page reload, never a re-fetch of everything:
```js
// inside HistoryStrip.svelte (and MonthCalendar.svelte, DiaryLog.svelte, same pattern each)
const store = getWeekStore();
let localWeeks = $state(weeks); // seeded from the server-rendered prop

$effect(() => {
  const dirty = store.historyVersion > 0 ? store.lastDirtyWeek : null;
  if (!dirty) return;
  fetch(`${base}/api/week/${dirty}`).then(r => r.json()).then(fresh => {
    const projected = projectForDisplay(fresh); // client-side reuse of the same shape summarizeWeekStatus expects
    localWeeks = localWeeks.map(w => w.week === dirty ? { ...summarizeWeekStatus(projected, config), ...projected } : w);
  });
});
```

**Why the ISO-boundary case cannot silently corrupt history here, stated as an explicit argument (the task asks to think hard about this specifically):**
- The client never computes a week key that gets *persisted* anywhere. `isoWeek.js` (§4.5) is used exactly once, for the advisory label text, and its output is never sent to the server and never used to choose which endpoint to call.
- Every write path (`POST /api/entry`, and every `apply`/`discard`/`reparse` call that follows) is keyed by the **server's own returned `week` field**, which is itself derived by SP1's `dateToWeekKey` from the exact same `date` string the picker produced — one authority, computed once, on the server, using `config.timezone` (not the browser's local timezone, which could differ from Tejit's actual configured zone if he's traveling — another reason this must be server-side).
- The one place a *client-side* week-key computation could theoretically diverge from the server's (a stale timezone assumption, a bug in the duplicate algorithm) only ever affects the **label text** shown before Save — a cosmetic near-miss, not a data-integrity one. `isoWeek.test.js` guards against that divergence anyway (parity-tested against SP1's own fixture set, §7), but the correctness of the actual write never depends on that test passing.
- The date picker itself introduces no ambiguity to begin with: `<input type="date">`'s value is a plain `YYYY-MM-DD` string with no time-of-day or timezone component per the HTML spec — there is no "11:40pm Sunday" instant for the *entry's own date* to be misread from, unlike the `at` timestamp SP1 already handles carefully for other purposes. The Sunday-vs-Monday risk named in the task brief is real, but it's a risk in *server-side* week-key derivation from a date string (already solved by SP1 §4.5's algorithm) and in any code that carelessly re-wraps that string in `new Date(...)` and lets an implicit UTC-midnight interpretation shift it — which is exactly the mistake `isoWeek.js`'s `dateToWeekKey` avoids by anchoring at `T12:00:00Z` (§4.5) specifically so a local-timezone reformat can never cross a day boundary.

### 4.11 `/week/[week]` — the detail page a history-strip or calendar click lands on

A second, SP4-owned route, deliberately separate from the root `+page.svelte` SP3 owns (which only ever shows `currentWeekKey`, SP3 §4.4). Read-mostly: shows that week's bars and metrics, and allows *correction* taps (D10's correction path applies to any week, not just the current one) — but does not carry the current-week-specific machinery (confetti, tab-title counter, "do this next" pointer, batched optimistic taps) that only make sense for the week actually being lived in right now.

```js
// src/routes/week/[week]/+page.server.js
import { loadConfig, ConfigError } from '$lib/config.js';
import { readWeek, projectWeekForConfig, isValidWeekKey, currentWeekKey } from '$lib/weeks.js';
import { error } from '@sveltejs/kit';

export function load({ params }) {
  if (!isValidWeekKey(params.week)) throw error(400, 'Invalid week key');
  let config;
  try { config = loadConfig(); }
  catch (e) { if (e instanceof ConfigError) return { configError: { message: e.message, field: e.field }, config: null, week: null }; throw e; }

  const raw = readWeek(params.week, config); // never throws for "missing" — SP1's guarantee
  const week = projectWeekForConfig(raw, config);
  return { config, week, weekKey: params.week, isCurrentWeek: params.week === currentWeekKey(config.timezone) };
}
```

```svelte
<!-- src/routes/week/[week]/+page.svelte -->
<script>
  import WeekSnapshotMetrics from '$lib/components/WeekSnapshotMetrics.svelte';
  import WeekSnapshotBar from '$lib/components/WeekSnapshotBar.svelte';
  import LogRow from '$lib/components/LogRow.svelte';
  import { base } from '$app/paths';

  let { data } = $props();
  const rows = $derived(buildRowsForWeek(data.week)); // same row-shaping helper DiaryLog uses, §4.8
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
      {#each rows as row (row.entry?.id ?? row.item?.id)}
        <LogRow {row} config={data.config} />
      {/each}
    </div>
  </main>
{/if}
```

`WeekSnapshotBar.svelte` is deliberately not `TaskBar.svelte` reused — it has no `weekStore` context to read (this page shows a *different* week than whatever `+page.svelte`'s store holds, if that page is even open in another tab), so it carries its own tiny local state and PATCHes `/api/week/[week]` directly:
```svelte
<!-- WeekSnapshotBar.svelte -->
<script>
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
No debounce/optimism here — a correction on a past week is a rare, deliberate action, not a rapid-tap session, so a plain await-then-render is both simpler and correct.

### 4.12 `+page.server.js` — the full additive extension

SP3's own `load()` (§4.4 of its PRD) is never replaced, only extended, per its own explicit instruction. Everything below is appended to the return object it already produces:

```js
// added imports
import { listWeekKeys, readWeek, projectWeekForConfig, nextWeekKey, prevWeekKey, weekKeyToRange } from '$lib/weeks.js';
import { summarizeWeekStatus } from '$lib/utils/historyStatus.js';
import { buildCalendarMonth } from '$lib/utils/calendarMonth.js';
import { weekFourCheck } from '$lib/utils/weekFourCheck.js';

const HISTORY_WEEKS_MAX = 52; // bounds load() cost as history grows past a year — see §9

// ...inside load(), after everything SP3's version already computes (config, weekKey, week, sparkline):

const allKnownWeeks = listWeekKeys(); // cheap directory read, ascending
const firstWeek = allKnownWeeks[0] ?? weekKey;
const windowStart = laterOf(firstWeek, weekNWeeksBefore(weekKey, HISTORY_WEEKS_MAX)); // both pure helpers, isoWeek.js-adjacent
const historyKeys = weekKeysBetween(windowStart, weekKey); // ascending, inclusive — fills gaps, doesn't require a file

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

// current month calendar — reads only the weeks that overlap it (~5 readWeek calls)
const today = new Date();
const [calYear, calMonth] = [today.getUTCFullYear(), today.getUTCMonth() + 1];
const monthWeekKeys = weekKeysOverlappingMonth(calYear, calMonth); // pure, ~5 keys
const weeksByKey = Object.fromEntries(monthWeekKeys.map(wk => [wk, wk === weekKey ? week : projectWeekForConfig(readWeek(wk, config), config)]));
const calendarMonth = buildCalendarMonth(calYear, calMonth, weeksByKey, weekKey, week.start /* today string proxy */);

const nextWeekPreview = { weekKey: nextWeekKey(weekKey), tasks: config.tasks.map(t => ({ id: t.id, label: t.label, min: t.min, target: t.target })) };

// log's first paint: current week (free, already loaded) + previous full week (1 extra readWeek)
const prevKey = prevWeekKey(weekKey);
const prevWeek = projectWeekForConfig(readWeek(prevKey, config), config);
const logInitial = buildLogRows([week, prevWeek]); // interleaves entries[]+items[], sorted desc by `at`

return {
  configError: null, config, week, weekKey, sparkline, headlineMetricId, // SP3's existing keys, untouched
  historyWeeks, weeksCompletedCount, calendarMonth, nextWeekPreview,
  logInitial, logOldestLoadedWeek: prevKey, weekFourCheck: weekFourResult
};
```

**Cost, stated plainly.** Per page load: 1 (current) + up to 51 history-window reads + ~5 calendar-month reads + 1 previous-week-for-log read ≈ ≤58 `readFileSync` calls on a fresh Node process, each sub-millisecond per SP1's own performance note (SP1 §4.4). Comfortably fast for a single-user app; the `HISTORY_WEEKS_MAX` cap exists specifically so this stays true as the tool is used for years, not just months — see §9 for the exact tradeoff this cap makes.

### 4.13 `+page.svelte` — filling SP3's two reserved slots

The one edit to an SP3-owned file that isn't a "request" — SP3 explicitly reserved these two empty `<section data-slot>` elements for SP4 (SP3 §4.6):

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
Both components read `getWeekStore()` internally where needed (R-A's dirty-signal watching) rather than receiving the store as a prop — matching SP3's own established convention that every descendant of `+page.svelte` reaches the store via context, never prop-drilling (SP3 §4.5).

## 5. API Change Summary

SP4 consumes this subset of SP2's existing §5 table:

| Method | Path | When SP4 calls it |
|---|---|---|
| GET | `/api/week/[week]` | `WeekSnapshotBar` corrections' response; dirty-week refresh in `HistoryStrip`/`MonthCalendar`/`DiaryLog` (§4.10 step 6); `DiaryLog`'s "Load earlier" (§4.8/§4.9 pagination) |
| PATCH | `/api/week/[week]` | `WeekSnapshotBar` corrections on a past week (§4.11) |
| POST | `/api/week/[week]/entry/[id]/apply` | via reused `EntryPreview.svelte` for older pending entries surfaced in the log |
| POST | `/api/week/[week]/entry/[id]/discard` | same |
| POST | `/api/week/[week]/entry/[id]/reparse` | log's `failed`-status rows, and reused `EntryPreview` |
| POST | `/api/week/[week]/items` | requested change to `TaskBar.svelte`'s `tap()` for `link:"required"` tasks (§4.9, R-D) |
| PATCH | `/api/week/[week]/items/[id]` | `LinkAttachForm.svelte` (§4.9) |

**New endpoint requested from SP2 — `GET /api/weeks`.**

SP2's own §9 flagged this gap and left a recommended shape for "whoever needs client-side week enumeration." SP4 is that sub-project, specifically for `DiaryLog`'s pagination (§4.8/§4.9): after the server-rendered first paint (current + previous week), a "Load earlier" click needs to discover which week keys exist further back *without* a full page reload (SvelteKit's `load()` only re-runs on navigation, not on an in-page button click) and without walking the filesystem from the client (impossible) or re-fetching everything ever logged (exactly the heaviness this whole sub-project is asked to avoid).

Requested shape, deliberately narrower and cheaper than SP2's own suggested version (no `cleared`/`start`/`end` — those require reading week *contents*; this endpoint should only ever touch `listWeekKeys()`, never `readWeek`):

```
GET /api/weeks?before=<ISO week key>&limit=<n, default 8, max 26>
```

| | |
|---|---|
| **Request** | `before`: a week key (same `^\d{4}-W\d{2}$` regex guard as every other `[week]`-bearing route, SP2 §4C); `limit`: integer, default 8, clamped to `[1, 26]` |
| **200 response** | `{ "weeks": ["2026-W33", "2026-W32", "2026-W31", "2026-W30"] }` — descending, strictly earlier than `before`, drawn from `listWeekKeys()` only |
| **400** | malformed `before` (fails the week-key regex) — same error shape as every other route, `{ "error": "..." }` |
| **Cost** | one `readdirSync` + one filter/sort — no per-file reads, matching the cheap end of SP2's own existing route costs |

`DiaryLog`'s "Load earlier" then does, for each returned key, a plain `GET /api/week/[week]` (already exists) to get that week's actual `entries[]`/`items[]` — the new endpoint's only job is answering "what week keys exist before this one," which `+page.server.js`'s one-time `load()` genuinely cannot answer for a click that happens later in the same page session.

## 6. Frontend Change Summary

### 6.1 Component tree (additions only)

```
+page.svelte (SP3)
├─ ...slots 1–4 (SP3, unchanged)
├─ section[data-slot=history-calendar]      SP3-reserved, filled by SP4 (§4.13)
│  ├─ HistoryStrip.svelte
│  ├─ WeekFourCheck.svelte
│  └─ MonthCalendar.svelte
│     └─ (next-week preview rendered inline, no separate component)
└─ section[data-slot=diary-log]             SP3-reserved, filled by SP4 (§4.13)
   └─ DiaryLog.svelte
      └─ LogRow.svelte (× N)
         ├─ EntryPreview.svelte (SP3, reused as-is for pending entries)
         └─ LinkAttachForm.svelte (item rows)

week/[week]/+page.svelte (SP4, new route)
├─ WeekSnapshotMetrics.svelte
├─ WeekSnapshotBar.svelte (× tasks)
└─ LogRow.svelte (× N, reused from the tree above)
```

### 6.2 `DiaryLog.svelte` — pagination, in full

```svelte
<script>
  import LogRow from './LogRow.svelte';
  import { mergeLogRows } from '$lib/utils/mergeLogRows.js';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';

  let { initial, oldestLoadedWeek: initialOldest, config } = $props();
  const store = getWeekStore();

  let rows = $state(initial);           // reverse-chronological, already sorted server-side
  let oldestLoaded = $state(initialOldest);
  let loading = $state(false);
  let exhausted = $state(false);        // no more weeks before oldestLoaded

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

  // dirty-week reconciliation — same pattern as §4.10 step 6
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

`mergeLogRows.js` (pure, unit-tested):
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
  for (const w of newWeeks) for (const row of rowsFromWeek(w)) byId.set(row.id, row); // newer wins on de-dupe
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
```

### 6.3 `LogRow.svelte` — every `parseStatus`, none of them look like failure except one

```svelte
<script>
  let { row, config } = $props();
  const task = $derived(row.kind === 'item' ? config.tasks.find(t => t.id === row.taskId) : null);
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

**Why `discarded` and `failed` share the same muted styling as `applied`, not a warning treatment.** The task brief is explicit that `discarded` "is not a failure state and must not look like one" — a diary entry someone chose to discard (bad parse, changed their mind) is a normal, expected outcome of D9's own preview-before-commit design, not an error. `failed` is the one row that legitimately needs an action (retry), but even there the styling stays identical to everything else — only the presence of the "try again" link signals anything is different, never a color or an icon. `.log-text` never truncates (`white-space: pre-wrap; overflow-wrap: anywhere`, no `-webkit-line-clamp`, no `text-overflow: ellipsis`) — D8's "the words survive" extends to rendering: a long retro-logged catch-up entry is shown in full, however long it runs.

### 6.4 Copy — every new string, deliberately

| Context | Copy | Why |
|---|---|---|
| History strip, no history yet | "Your history starts this week." | Not "0 weeks completed" — a bare zero as the first thing a new user sees reads as a score already lost. |
| History strip, N weeks in | "{N} week{s} completed" | Plain count, no superlative. |
| History square hover | "{date range} · {cleared}/{total} cleared" (any status) | Same neutral phrasing whether the week is filled, partial, or empty — never "missed" or "failed." |
| Week-4 check, baseline | "Lane A (replies + calls booked) so far: {n}. First checkpoint — nothing to compare against yet." | States the fact; frames the absence of a comparison honestly rather than faking one. |
| Week-4 check, up/down/flat | "Lane A (replies + calls booked): {n} this period, {up from / down from / same as} {prior}." | One template, three directional words, no adjective anywhere in it. |
| Week-4 check, zero | "Lane A (replies + calls booked): 0 this period, {same as / down from} {prior}." | The number does the talking. No "unfortunately," no "let's fix this." |
| Week-4 check, sparse data | "Not enough replies/calls data logged in the last 4 weeks to compare — fill in the metrics to make this check mean something." | The one line that nudges an action — about data hygiene (R2), not performance (R1), and framed as the check's own limit, not a scold. |
| Week-4 dismiss button | "Got it" | Plain acknowledgement, not "OK!" with an exclamation mark. |
| Log, discarded entry | "not applied" | Neutral fact, not "discarded ✗" or similar. |
| Log, failed entry | "couldn't read it automatically — **try again**" | Matches SP3's own DiaryBox failure copy verbatim (SP3 §6.8) for consistency across the two surfaces. |
| Log, applied entry | "applied: {before}→{after} · …" | Same `before→after`/`→absolute` phrasing convention as SP3's live preview (SP3 §6.8), reused for the historical record. |
| Retro-log label (DiaryBox, R-C) | "Logging into {date range} ({week key})" | States the fact plainly; appears only when it's true, disappears for a same-week entry. |
| Unlinked item nudge | *(no extra copy — the empty `LinkAttachForm` itself, already in edit mode, is the nudge)* | A form waiting to be filled in reads as an invitation, not a warning; no red asterisk, no "required!" label. |
| Next-week preview | "Next week ({week key})" + the quota line | States what's coming without a countdown or "get ready." |
| Load earlier button | "Load earlier" / "Loading…" | Plain, matches SP3's "Saving…" pattern. |

**What never appears anywhere in SP4's UI**, mirroring SP3's own list (SP3 §6.8) verbatim: "streak," "miss," "behind," "failed" (except inside the literal file/JS identifier `failed` never surfaced as user-facing text), any exclamation mark used for encouragement, red as a semantic color for anything, a days-remaining countdown, or copy that frames one week/month against another as better or worse rather than simply different.

### 6.5 Responsiveness

- **History strip**: horizontal scroll (`overflow-x: auto`), same pattern as `PinnedLinks` — never wraps, since wrapping a 52-square row would be a wall of squares on any screen width.
- **Calendar grid**: `grid-template-columns: repeat(7, 1fr)`, collapses gracefully on mobile since cells are already small and text-free (just dots); month nav arrows sit above the grid, always visible without scrolling horizontally.
- **Log rows**: single-column, full-width text — no layout change needed at any width since rows are already vertically stacked.
- **`LinkAttachForm`**: two inputs stack vertically under 480px, matching `DiaryBox`'s own `.diary-controls` breakpoint (SP3 §6.9).
- **Touch targets**: `WeekSnapshotBar`'s `+1`/`−1` buttons match SP3's ≥40px minimum exactly, same CSS values.

## 7. Testing

Per BRAINSTORM §3.7, pure functions are where silent corruption would live — this sub-project's pure functions are the priority, and there are more of them here than in any other sub-project because the whole point of SP4 is deterministic computation over historical data.

**`historyStatus.test.js`:**
- A fresh `emptyWeek()` → `status: 'empty'`, `touched: false`.
- A week with one nonzero count below its task's min → `partial`, `touched: true`.
- A week with every task's count ≥ its min → `filled`.
- A week with zero counts but one `entries[]` row (any `parseStatus`, including `discarded`/`failed`) → `partial`, `touched: true` — the explicit "an attempt counts" case.
- A week with `config.tasks` length 0 (degenerate, shouldn't happen but shouldn't crash) → `empty`, not a division error.

**`isoWeek.test.js` — parity, not just correctness:**
- Every fixture from SP1's own PRD (§4.5): `2023-01-01`→`2022-W52`, `2027-01-01`→`2026-W53`, `2021-01-01`→`2020-W53`, `2026-12-31`→`2026-W53`, `2020-12-31`→`2020-W53`, `2026-01-01`→`2026-W01`.
- `weekKeyToRange` round-trips for a sample of keys, matching SP1's own round-trip test.
- **Explicit parity test**: import both SP1's `weeks.js` (Node-only test environment, fine under vitest) and SP4's `isoWeek.js` in the same test file, run every fixture date through both, assert identical output — this is the test that catches the two implementations silently drifting apart over a future edit to one and not the other.

**`calendarMonth.test.js`:**
- A month grid always has exactly 42 day cells (6 full weeks) regardless of which weekday the 1st falls on.
- `inMonth` correctly marks leading/trailing days from adjacent months.
- `isCurrentWeek` matches on the correct week key for a day known to fall in the current ISO week.
- `entryCount`/`itemCount` correctly bucket entries by their own `date` field (not the week's date) and items by the calendar-day slice of their `at` timestamp.

**`weekFourCheck.test.js` — every branch:**
- `n = 0, 1, 2, 3` → `due: false`.
- `n = 4`, no nulls → `outcome: 'baseline'`, `line` includes "First checkpoint."
- `n = 4`, `currentTotal = 0` → still `'baseline'` (not `'zero'` — no prior period exists to compare against, checked explicitly since it's an easy off-by-priority bug).
- `n = 8`, current > prior → `'up'`; current < prior → `'down'`; current === prior (both nonzero) → `'flat'`.
- `n = 8`, `currentTotal = 0`, `priorTotal > 0` → `'zero'`, line says "down from {priorTotal}."
- `n = 8`, `currentTotal = 0`, `priorTotal = 0` → `'zero'`, line says "same as the one before."
- `n = 8`, 2+ weeks in the current window have both `replies` and `calls_booked` null → `'sparse'`, regardless of what the other weeks show (checked before the zero/up/down/flat branch).
- `n = 5, 6, 7` (between checkpoints) → `due: false`.
- A week with `replies: null, calls_booked: 3` is NOT counted toward `bothNullCount` (only both-null counts as a missing week) — explicit test, since this is an easy off-by-one in the escape-hatch condition.
- `n = 12` → `checkNumber: 3`, windows correctly slice `[4:8]` vs `[0:4]`... i.e. `[n-8:n-4]` vs `[n-4:n]` — assert the exact week keys in `currentWeeks`/`priorWeeks` match expectation, not just the totals, since a slicing-index bug could produce a right-looking number from the wrong weeks.

**`mergeLogRows.test.js`:**
- Merging two disjoint weeks' rows produces one sorted-descending list with no duplicates.
- Re-merging the same week (dirty-week reconciliation case) replaces rows by id rather than duplicating them.
- Entries and items from the same week interleave correctly by `at` timestamp, not grouped by kind.

**Manual smoke pass** (SP4's slice of BRAINSTORM §3.7's plan):
1. Fresh app, zero weeks logged: confirm the history strip shows exactly one (current-week) square and "Your history starts this week," confirm the calendar renders with only today marked, confirm the week-4 check renders nothing (`due: false`).
2. Log for 4 distinct weeks (any mix of clearing/not), confirm the week-4 card appears on the 4th, showing `baseline` copy; dismiss it; reload; confirm it stays dismissed.
3. Continue to 8 touched weeks with `replies`/`calls_booked` left at 0 throughout while task bars clear normally — confirm the card reappears with the `zero` outcome and the exact copy from §4.7, and confirm nothing about its styling reads as an error (no red, no icon beyond the border-weight change).
4. Back-date a diary entry via the current week's date picker into a week from 3 ISO weeks ago; confirm the "Logging into…" label appears before Save; Apply it; confirm the current week's bars are unaffected; confirm the history strip's square for that past week updates without a page reload (watch the network tab for exactly one `GET /api/week/[that week]`, not a full reload).
5. Click a history-strip square for a past week; confirm `/week/[week]` renders that week's bars/metrics/log; make a correction tap; confirm it persists on reload.
6. Log a `post` task item via its tap (once R-D lands); confirm it appears in the log immediately with the unlinked-nudge form already open; fill in a bad URL (e.g. `not a url`) and confirm the inline error; fill in a valid one and confirm it renders as a pill matching `PinnedLinks`' styling.
7. Click "Load earlier" in the log repeatedly until `exhausted`; confirm the button disappears and no further network calls fire.
8. Resize to a phone viewport; confirm the history strip scrolls horizontally, the calendar grid stays legible, and touch targets on `WeekSnapshotBar` are ≥40px.

## 8. Manual Intervention Required From You

None required to implement this PRD's own files. Two items worth flagging for awareness, not action:

1. ~~Confirm requests R-A through R-D land in SP3's files~~ — confirmed landed, see §9 Q2 / SP3 §9 Q13 / §6.4.
2. ~~Confirm the `GET /api/weeks` endpoint (§5) is added to SP2's routes~~ — confirmed added, see §9 Q3 / SP2 §4/§5.

## 9. Open Questions & Decisions

| # | Item | Status |
|---|---|---|
| Q1 | SP1's own open Q9 — `items[]` granularity policy | `[RESOLVED, extending SP3's Q8]` — `link:"optional"` tasks never create items (pure count deltas, unchanged from SP3); `link:"required"` tasks (today: `post`) always create an item on every log, even with `link: null`, so an item always exists to attach a link to later. See §4.9. |
| Q2 | The `EntryPreview`/`DiaryBox`/`weekStore` cross-SP requests (R-A through R-D) | `[RESOLVED: fix confirmed landed in SP3 §9 Q13 / §6.4.]` |
| Q3 | `GET /api/weeks` endpoint | `[RESOLVED: added to SP2 §4/§5 exactly per this PRD's §5 spec — confirmed.]` |
| Q4 | `weeksCompletedCount` reflecting a 52-week window rather than literal all-time history | `[RESOLVED, with a stated tradeoff]` — an unbounded `listWeekKeys()` + `readWeek` over every week ever logged would grow `+page.server.js`'s cost linearly with the tool's own lifetime, working directly against "this page must stay fast" (task brief) and BRAINSTORM §3.7's own performance framing. 52 weeks (~1 year) is chosen as generous enough that the cap is invisible for the first year of use; past that, the count and strip both quietly become "the last year" rather than "ever," which is judged an acceptable trade for guaranteed load() speed. Revisit if the tool is still in daily use after a year and the boundary becomes visible/confusing. |
| Q5 | Orphaned `items[]`/`entries[]` rows referencing a task id removed from config (SP1's Q10, deferred to SP4 by both SP1 and SP3) | `[RESOLVED]` — `LogRow.svelte`'s `task` lookup falls back to the raw `taskId` string when `config.tasks.find(...)` returns nothing (§6.3: `task?.label ?? row.taskId`), so an orphaned item still renders (never crashes, never silently disappears) with a plain id instead of a friendly label. No special "no longer tracked" badge is added — judged unnecessary polish for a rare edge case; the raw id is self-explanatory enough in a single-user tool where Tejit authored the config himself. |
| Q6 | `−1` correction on a `link:"required"` task orphaning an item row (no `DELETE /api/week/[week]/items/[id]` exists) | `[DEFERRED]` — mirrors the precedent SP2 already accepted for `DELETE .../entry/[id]` on an applied entry (SP2 §4B). Revisit only if this turns out to happen often enough in practice to be confusing; not built preemptively. |
| Q7 | Whether the week-4 check should ever re-fire *within* the same 4-week block if dismissed, e.g. if new data arrives that would change `currentTotal` before the next checkpoint | `[RESOLVED: no]` — dismissal is keyed to `checkNumber`, not to the specific numbers shown; once acknowledged, the card stays gone until the *next* multiple of 4, even if metrics for the already-checked window are edited afterward (a manual correction to a `replies` value from two weeks ago, say). Re-computing and re-surfacing a dismissed check on every metric edit would turn a periodic reflection into exactly the kind of naggy, re-litigating mechanic D18/D19 rule out. |
| Q8 | Export/import UI (SP2 ships the endpoints; no PRD builds a UI for them) | `[RESOLVED: assigned to SP3 §6 — SP3 now owns a small "Data" export/import affordance near its pinned-links area.]` |
| Q9 | Whether `MonthCalendar`'s month-navigation (browsing to a month outside the server-rendered current month) needs its own dedicated endpoint, or can reuse `GET /api/week/[week]` per overlapping week | `[RESOLVED: reuse `GET /api/week/[week]``]` — a month overlaps at most ~6 ISO weeks; navigating to a different month client-side fires up to 6 plain `GET /api/week/[week]` calls (already exists), no new endpoint needed. Only the log's pagination needed a *list* endpoint (§5), because it doesn't know which week keys exist at all without one — the calendar always knows exactly which keys a given month spans, computed locally from the same ISO-week math already in `isoWeek.js`. |
| Q10 | Whether `historyStatus.js`'s `touched` definition (counts a discarded/failed diary attempt as "something happened") could be gamed to inflate the week-4 check's touched-week tally without real outreach happening | `[RESOLVED: accepted as designed — no guard added, reasoning above stands.]` — a determined user could type nonsense into the diary box 4 times to force a checkpoint without doing any outreach. Judged not worth guarding against: (a) the checkpoint firing early just means an honest read happens sooner, never a worse outcome for R1's purpose; (b) this is a single-user tool Tejit built for himself — gaming it would only be lying to himself, which is a much larger problem than this PRD can or should solve in code. |
