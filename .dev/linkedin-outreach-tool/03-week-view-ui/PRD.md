# PRD: SP3 — Week View UI

**Sub-project:** SP3 (Phase 3, depends on SP1 + SP2)
**Repo:** `/root/projects/linkedin-outreach-tool`
**Date:** 2026-08-29
**Status:** Planning — no implementation started

---

## 1. Problem

Every other sub-project exists to feed this screen or to extend it. SP1 gives us disk-backed config/week primitives; SP2 gives us an HTTP surface over them with a diary-parse round trip. None of that does anything for Tejit until it renders as one screen he can open, register at a glance as "nearly done," do one small thing on, and close.

The actual risk in this sub-project is not technical — it is that a UI which is *functionally* correct against SP2's contract can still fail BRAINSTORM's own test (§1): overwhelm, then boredom, then discouragement, then abandonment. A progress bar that shows "5 things left across two lanes" is functionally fine and psychologically wrong. A "do this next" pointer that jumps around between reloads for no visible reason erodes trust in the tool within a week. A diary Apply button that can be double-clicked into double-counting turns the one thing that's supposed to be trustworthy (D8's "the words survive") into one more reason to distrust it. A metric row that scores anything violates D2 outright. This PRD is the design of the thing that has to hold all of that at once, on a phone screen, without nagging.

Two structural tensions had to be resolved rather than assumed away, and both are recorded here rather than hidden in code: (1) BRAINSTORM D15 says attaching a link to a post "must never block a tap," while SP2 §4E enforces the link server-side at item-creation time for `link: "required"` tasks — a real contradiction, resolved in §9. (2) SP2's Apply response returns only `{ entry, alreadyApplied }`, not the updated week, which means the client must either duplicate SP1's apply arithmetic or pay a follow-up round trip — resolved in §6.4.

## 2. Goals

1. One screen, viewable without scrolling, that renders "this week" (pinned links, metrics, two lanes, diary box) so that a nearly-cleared week visibly looks nearly cleared.
2. Manual counter taps that feel instant regardless of network latency, with a defined optimistic-update/reconciliation/failure path.
3. A diary state machine — idle → saving/parsing → preview → applied/discarded/failed — that is fully usable with the LLM completely unreachable, and where a pending preview survives a page reload.
4. Exactly one deterministic "do this next" pointer, computed from a pure function of config + counts, that never thrashes between renders for the same underlying data.
5. A "week visibly empties" mechanic: completed tasks grey out and shrink, with a defined one-time (not per-load) transition.
6. Quotas editable in one click, round-tripping through `PUT /api/config`.
7. A tab-title counter as the system's only notification (D18), and confetti that fires exactly once per cleared week (D20).
8. Every string in the interface written deliberately — no streak language, no red, no verdicts on a bad week (D19).
9. A clean, documented seam (layout slots + a shared reactive store via Svelte context) for SP4 to mount the history strip, calendar, and diary log into the same page without SP3 needing to change.

## 3. Non-Goals

- The history strip, month calendar, next-week view, reverse-chronological log, retro-logging UI, and per-item link-attach UI — all SP4 (BRAINSTORM §3.5 items 5–6). SP3 defines the slots and the shared contract those need; it does not build them.
- The week-4 honesty check (D24) — SP4/display concern, computable from data SP3 already has but not this PRD's job to render.
- PM2/nginx/`kit.paths.base` decision — SP5, and out of scope: hosting/gateway integration is deferred for now (see §9 Q3). SP3 codes defensively via `${base}` regardless (§4.2), which costs nothing to leave in place.
- Any new HTTP endpoint. SP3 consumes SP2's contract exactly as documented; where it doesn't fit, that's flagged in §9, not silently worked around with a new route.
- Voice input (D21), XP/levels/badges (D20), notifications/email beyond the tab title (D18) — all explicitly cut, not revisited here.
- Auth/session logic — D25, entirely SP5's proxy layer; SP3 renders no login state and assumes every request it makes is already authorized.

## 4. Architecture Decisions

### 4.1 File list

```
src/routes/
  +layout.svelte              new — global shell, theme tokens, minimal header
  +page.server.js             new — load config + current week, sparkline data, config-error path
  +page.svelte                new — page shell; slots 1–4 rendered directly, slots 5–6 reserved for SP4

src/lib/
  stores/
    weekStore.svelte.js       new — reactive current-week state + context key, shared with SP4
  components/
    PinnedLinks.svelte        new — slot 1
    MetricsRow.svelte         new — slot 2 (wraps Sparkline)
    Sparkline.svelte          new — hand-rolled inline SVG, headline metric only
    WeekLanes.svelte          new — slot 3 container (two lanes)
    TaskBar.svelte            new — one task's bar: min/target marks, tap/decrement, quota edit, grey-shrink
    DiaryBox.svelte           new — slot 4: textarea + date picker + save + mounts EntryPreview
    EntryPreview.svelte       new — Apply/Discard preview UI; shared with SP4's log for older pending entries
    Confetti.svelte           new — CSS-only burst, mounted once at page level
  utils/
    selectNext.js             new — pure "do this next" selection rule
    selectNext.test.js         new — vitest, per SP1's `src/lib/**/*.test.js` convention
    applyLocal.js              new — pure client-side mirrors of SP1's bumpCount/setMetric, for optimistic merge
    applyLocal.test.js          new
    weekKeyFmt.js               new — small date-range / relative-time formatting helpers used by DiaryBox and MetricsRow
```

No file outside `src/routes/**` and `src/lib/{stores,components,utils}/**` is touched. `src/lib/config.js`, `src/lib/weeks.js`, and everything under `src/routes/api/**` are SP1/SP2's and are only ever imported (server-side) or fetched (client-side) — never modified.

### 4.2 The `/linkedin` base-path question — coded defensively, not guessed

SP5's PRD does not exist yet at `.dev/linkedin-outreach-tool/05-deploy-and-docs/PRD.md` (confirmed: directory absent). SP2's own §9 already flags the same uncertainty for its route file placement. Rather than guess which of `kit.paths.base = '/linkedin'` vs. proxy-stripping SP5 will land on, SP3 adopts the one pattern that is **correct under both**:

```js
// every fetch call site and every internal <a href> in SP3's components
import { base } from '$app/paths';

await fetch(`${base}/api/entry`, { method: 'POST', /* ... */ });
```

If SP5 sets `kit.paths.base`, `base` resolves to `/linkedin` automatically and every URL is correctly prefixed. If SP5's proxy strips the prefix before it reaches this app, `base` resolves to `''` and every URL is correctly unprefixed. SP3 code never hardcodes `/api/...` as a bare template literal anywhere. This is mandated, not optional — it's the one place a wrong guess would silently break every mutating action in production. Moot for now (see §9 Q3): hosting/gateway integration is deferred, so `base` simply resolves to `''` everywhere, and this pattern costs nothing to leave in place should that integration be picked back up later.

### 4.3 `+layout.svelte` — taking unassigned ownership

No PRD assigns `src/routes/+layout.svelte`. SP1's scaffold (§4.1 of its PRD) stops at `src/app.html`; SP2 is server-only; SP4 mounts *into* the page SP3 owns; SP5 is deploy. Since "one screen... top to bottom" needs a root shell and shared theme tokens to render at all, and the task brief explicitly asks that this app "look like it belongs to the same family" as cc-gateway, SP3 takes this file. It is deliberately minimal — no role branching (D25: no guest view, nothing to branch on), no login/logout link (auth is SP5's proxy, invisible to this app):

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { onMount } from 'svelte';
  let { children } = $props();
  let dark = $state(true);

  onMount(() => {
    try {
      const saved = localStorage.getItem('theme');
      dark = saved ? saved === 'dark' : true;
      document.documentElement.classList.toggle('light', !dark);
    } catch {}
  });

  function toggleTheme() {
    dark = !dark;
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
    document.documentElement.classList.toggle('light', !dark);
  }
</script>

<header>
  <span class="brand">LinkedIn Outreach</span>
  <button class="icon-link theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
    <!-- same two sun/moon paths as cc-gateway's +layout.svelte, verbatim -->
  </button>
</header>

{@render children()}

<style>
  /* Identical custom-property palette to /root/projects/cc-gateway/src/routes/+layout.svelte
     (--bg, --fg, --fg-secondary, --card-bg, --card-border, --muted, --input-bg, --input-border,
     --chip-bg/--chip-active-*, --modal-bg/--modal-border/--modal-inner-*, etc.), reused verbatim
     so the two apps are visually one family. See §4.3 rationale. */
</style>
```

The full `:root` / `:root.light` variable block is copied verbatim from `/root/projects/cc-gateway/src/routes/+layout.svelte` (lines defining `--bg` through `--section-border`) — not re-derived, not approximated. This is the single source of the app's palette; every other component below styles exclusively off these custom properties, matching the house convention of zero hardcoded hex values outside this one block (confirmed as cc-gateway's own pattern across `ideas/+page.svelte` and `links/+page.svelte`).

### 4.4 `+page.server.js` — load, config-error path, sparkline data source

```js
// src/routes/+page.server.js
import { loadConfig, ConfigError } from '$lib/config.js';
import { currentWeekKey, readWeek, writeWeek, projectWeekForConfig, listWeekKeys } from '$lib/weeks.js';

const SPARKLINE_WEEKS = 12; // last 12 ISO weeks including the current one — see §6.2 for rationale

export function load() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      return { configError: { message: e.message, field: e.field }, config: null, week: null };
    }
    throw e;
  }

  const weekKey = currentWeekKey(config.timezone);
  const rawWeek = readWeek(weekKey, config); // never throws for "missing" — SP1 returns emptyWeek()
  const week = projectWeekForConfig(rawWeek, config);

  const headlineMetric = config.metrics.find(m => m.headline);
  const allKeys = listWeekKeys(); // sorted ascending, cheap directory read
  const sparkKeys = allKeys.filter(k => k <= weekKey).slice(-SPARKLINE_WEEKS);
  if (!sparkKeys.includes(weekKey)) sparkKeys.push(weekKey); // current week may have no file yet
  const sparkline = sparkKeys.map(wk => {
    const w = wk === weekKey ? week : projectWeekForConfig(readWeek(wk, config), config);
    return { week: wk, value: w.metrics[headlineMetric.id] ?? null };
  });

  return {
    configError: null,
    config,
    week,
    weekKey,
    sparkline,
    headlineMetricId: headlineMetric.id
    // SP4 EXTENDS this return object (e.g. `historyWeeks`, calendar month data) — it must not
    // replace this load function. Every key above is part of the contract §6.6/§9 describes to SP4.
  };
}
```

**Config-error rendering** (BRAINSTORM §3.6: "readable error on the page naming the offending field. Data untouched"): `+page.svelte` checks `data.configError` first, before touching any of the week-view components, and renders a plain readable panel — no stack trace, no other slot mounted:

```svelte
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
  <!-- normal page -->
{/if}
```

Nothing downstream (`readWeek`, any component) is reached in this branch — matches SP1's own guarantee that a broken config never causes data access, let alone a write.

**Why the sparkline needs no new endpoint.** SP2 §9 flags the absence of a `GET /api/weeks` list route as an open item *for whoever needs client-side week enumeration*. SP3 doesn't: the sparkline is populated once, server-side, inside `load()`, using SP1's `listWeekKeys`/`readWeek` as direct module calls (same process, no HTTP). This resolves that ambiguity for SP3 specifically — noted so SP4 doesn't assume SP3 already built a `/api/weeks` route it can reuse; if SP4's calendar wants incremental client-side fetching, that's a fresh decision for SP4, not something SP3 leaves half-built.

**Keeping the sparkline's last point live without a reload.** When `MetricsRow` PATCHes the headline metric, the response is the full updated week object (SP2 §5: `PATCH /api/week/[week]` → "updated week object"). The client replaces the sparkline's last entry (`{ week: weekKey, value: <new value> }`) directly from that response — no refetch, no new endpoint.

### 4.5 `weekStore.svelte.js` — the shared reactive state and the SP4 seam

This is the one piece of client state every component below reads or writes, and the one export SP4's future components (mounted into the same page tree) are expected to consume via Svelte context rather than re-fetching independently.

```js
// src/lib/stores/weekStore.svelte.js
import { getContext, setContext } from 'svelte';

export const WEEK_STORE_KEY = 'linkedin-outreach:weekStore';

/**
 * @param {object} initialWeek   projected week object from +page.server.js load()
 * @param {object} config        validated config object
 */
export function createWeekStore(initialWeek, config) {
  let week = $state(initialWeek);
  let weekKey = $state(initialWeek.week);

  // Pure client-side mirror of SP1's bumpCount/setMetric semantics (see applyLocal.js) —
  // used ONLY for optimistic display; every mutating call still round-trips to SP2, and the
  // server's response value always wins on reconciliation (§6.3).
  function bumpLocalCount(taskId, delta) {
    week.counts[taskId] = Math.max(0, (week.counts[taskId] ?? 0) + delta);
  }
  function setLocalMetric(metricId, value) {
    week.metrics[metricId] = value;
  }
  function replaceWeek(nextWeek) {
    week = nextWeek;
  }

  return {
    get week() { return week; },
    get weekKey() { return weekKey; },
    get config() { return config; },
    bumpLocalCount,
    setLocalMetric,
    replaceWeek
  };
}

export function provideWeekStore(store) {
  setContext(WEEK_STORE_KEY, store);
}

export function getWeekStore() {
  return getContext(WEEK_STORE_KEY);
}
```

`+page.svelte` calls `provideWeekStore(createWeekStore(data.week, data.config))` once, near the top of its `<script>`. Every SP3 component below (`TaskBar`, `MetricsRow`, `DiaryBox`) calls `getWeekStore()` rather than receiving `week` as a prop chain — this is what lets a diary Apply and a counter tap update the *same* reactive object without prop-drilling through five levels. **SP4's contract:** any SP4 component mounted as a descendant inside `+page.svelte`'s tree (true for both the history/calendar slot and the log slot, since they render on the same page below the fold, per §4.6) can call `getWeekStore()` and read the live current-week state the same way — e.g., so a retro-logged diary entry that happens to land in the *current* ISO week (same-week backdating, not a prior week) is reflected in "This week" without a page reload. SP4 must not call `provideWeekStore` again — one store, one page, set once by SP3.

### 4.6 `+page.svelte` — layout slots and the SP4 mount points

```svelte
<script>
  import { setContext } from 'svelte';
  import { createWeekStore, provideWeekStore } from '$lib/stores/weekStore.svelte.js';
  import PinnedLinks from '$lib/components/PinnedLinks.svelte';
  import MetricsRow from '$lib/components/MetricsRow.svelte';
  import WeekLanes from '$lib/components/WeekLanes.svelte';
  import DiaryBox from '$lib/components/DiaryBox.svelte';
  import Confetti from '$lib/components/Confetti.svelte';
  import { selectNextTask } from '$lib/utils/selectNext.js';

  let { data } = $props();

  const store = data.configError ? null : createWeekStore(data.week, data.config);
  if (store) provideWeekStore(store);

  const nextTaskId = $derived(store ? selectNextTask(store.config, store.week.counts) : null);
  const leftCount = $derived(
    store ? store.config.tasks.filter(t => (store.week.counts[t.id] ?? 0) < t.min).length : 0
  );

  // Tab-title counter (D18) — the ONLY notification in the system. See §6.7.
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.title = leftCount > 0 ? `(${leftCount} left) LinkedIn` : 'LinkedIn';
  });
</script>

<svelte:head>
  <title>{leftCount > 0 ? `(${leftCount} left) LinkedIn` : 'LinkedIn'}</title>
</svelte:head>

{#if data.configError}
  <!-- config-error panel, §4.4 -->
{:else}
  <main class="week-view">
    <Confetti weekKey={store.weekKey} config={store.config} />

    <!-- SLOT 1 — pinned links -->
    <PinnedLinks links={store.config.links} />

    <!-- SLOT 2 — metrics row -->
    <MetricsRow sparkline={data.sparkline} headlineMetricId={data.headlineMetricId} />

    <!-- SLOT 3 — this week: two lanes (the core screen) -->
    <WeekLanes nextTaskId={nextTaskId} />

    <!-- SLOT 4 — diary box -->
    <DiaryBox weekKey={store.weekKey} initialEntries={store.week.entries} />

    <!-- SLOT 5 — SP4: history strip + month calendar + next-week view.
         SP4 mounts its component(s) here. getWeekStore() is available to anything rendered
         in this position (see §4.5). This section is expected to require scrolling — only
         slots 1–4 above are the "no scrolling to see the week" requirement (BRAINSTORM §3.5). -->
    <section class="sp4-slot" data-slot="history-calendar"></section>

    <!-- SLOT 6 — SP4: reverse-chronological diary log with links.
         Reuse EntryPreview.svelte (§4.9) for any entry still parseStatus:'pending' with a
         proposed preview that ISN'T the most-recent one (DiaryBox only surfaces the latest —
         see §6.4). Older unresolved previews live here, using the same component/props. -->
    <section class="sp4-slot" data-slot="diary-log"></section>
  </main>
{/if}

<style>
  .week-view { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1.75rem; }
  @media (max-width: 640px) {
    .week-view { padding: 1.25rem 1rem 3rem; gap: 1.25rem; }
  }
</style>
```

Slots 1–4 sit in a `max-width: 900px` centered column with generous vertical gap so the whole "this week" picture fits one viewport on a normal laptop screen without scrolling (BRAINSTORM §3.5's literal requirement); slots 5–6 extend below and are expected to require scroll, matching the brief's own framing that only *the week* needs to fit on screen.

### 4.7 `selectNext.js` — the "do this next" rule

```js
// src/lib/utils/selectNext.js

/**
 * Pure, deterministic. Same (config, counts) always returns the same task id or null —
 * no randomness, no "most recently touched," no dependency on render count or timing.
 *
 * Rule: walk tasks in a fixed order (lane order from config.lanes, then task order within
 * each lane, both as authored in config.json) and return the id of the first task whose
 * count is still below its min. Once every task has cleared its min, return null — no
 * pointer toward stretch targets (see rationale below).
 */
export function selectNextTask(config, counts) {
  const ordered = config.lanes.flatMap(lane =>
    config.tasks.filter(t => t.lane === lane.id)
  );
  for (const t of ordered) {
    if ((counts[t.id] ?? 0) < t.min) return t.id;
  }
  return null;
}
```

**Why lane order, not something "smarter":** config.lanes is authored `[outreach, presence]` specifically because D1 identifies outreach as the actual bottleneck ("put the actual bottleneck... on screen next to the slower credibility work"). Task order within a lane is the order Tejit wrote the quotas in (D5). Using exactly that order — rather than "whichever is furthest from its min," "whichever was least recently touched," or anything computed from timestamps — means the *same* week state always produces the *same* pointer, which is what "avoids thrashing between renders" actually requires: thrashing is a symptom of a rule that depends on something other than the visible data (recency, randomness, render order). This rule depends on nothing else.

**Why the pointer disappears once mins clear, rather than moving to stretch targets:** the pointer's job is to cut decision paralysis before the week is cleared. Once every min is hit, continuing to point at a stretch task re-introduces the exact "one more thing to do" pressure D19/D20 are trying to remove — the target marks stay visible on each bar (D4: both min and target always visible) for anyone who wants to keep going, but nothing tells them to. This is a design choice beyond what BRAINSTORM states outright; recorded as `[RESOLVED]` in §9 with this rationale rather than left implicit.

**Stability under correction taps:** if a manual `-1` correction drops a cleared task's count back under its min, `selectNextTask` naturally picks it back up on the next render — no special-casing needed, and this is correct: the bar un-greys (§4.8) and the pointer can legitimately return to it. This is a property of the function being pure, not an edge case handled separately.

### 4.8 `TaskBar.svelte` — the grey-out/shrink mechanic

```svelte
<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { debounce } from '$lib/utils/weekKeyFmt.js'; // small shared debounce helper

  let { task, isNext } = $props(); // task: config.tasks[i]; isNext: boolean

  const store = getWeekStore();
  const count = $derived(store.week.counts[task.id] ?? 0);
  const cleared = $derived(count >= task.min);
  const maxed = $derived(count >= task.target);

  // Only animate the grey/shrink transition on a LIVE transition witnessed this session —
  // not on initial mount of an already-cleared task (reload of an already-done week must not
  // replay the animation every time the page opens).
  let mounted = $state(false);
  let justCleared = $state(false);
  $effect(() => {
    if (!mounted) { mounted = true; return; } // first paint: snap to final state, no animation
    if (cleared) { justCleared = true; setTimeout(() => justCleared = false, 550); }
  });

  // --- optimistic counter taps, debounced+batched flush, reconcile-on-response ---
  let pendingDelta = 0;
  let syncFailed = $state(false);
  const flush = debounce(async () => {
    if (pendingDelta === 0) return;
    const delta = pendingDelta; pendingDelta = 0;
    try {
      const res = await fetchWeekPatch({ counts: { [task.id]: delta } });
      store.replaceWeek(res); // server truth wins — see §6.3
      syncFailed = false;
    } catch {
      syncFailed = true; // local optimistic value stands; quiet, non-alarming indicator only
    }
  }, 500);

  function tap(delta) {
    store.bumpLocalCount(task.id, delta); // instant, local-only
    pendingDelta += delta;
    flush();
  }
</script>

<div class="task-bar {cleared ? 'cleared' : ''} {justCleared ? 'just-cleared' : ''}">
  <div class="task-row">
    <span class="task-label">{task.label}</span>
    {#if isNext}<span class="next-flag">next</span>{/if}
    {#if syncFailed}<span class="sync-dot" title="Not saved yet — will retry">•</span>{/if}
  </div>

  <div class="bar-track">
    <div class="bar-fill" style="width: {Math.min(100, (count / task.target) * 100)}%"></div>
    <div class="min-mark" style="left: {(task.min / task.target) * 100}%" title="min {task.min}"></div>
    <!-- target mark is the track's own right edge; both marks always visible per D4 -->
  </div>

  <div class="bar-controls">
    <span class="count-label">{count} / {task.min}–{task.target}</span>
    <button class="tap-minus" onclick={() => tap(-1)} disabled={count === 0} aria-label="Correct: -1">−</button>
    <button class="tap-plus" onclick={() => tap(1)} aria-label="+1">+1</button>
  </div>
</div>

<style>
  .task-bar {
    display: flex; flex-direction: column; gap: 0.4rem;
    padding: 0.85rem 1rem;
    background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px;
    transition: background 0.5s ease, border-color 0.5s ease, padding 0.5s ease, opacity 0.5s ease;
  }
  .task-bar.cleared {
    background: transparent; border-color: var(--card-border);
    padding: 0.5rem 1rem; /* shrinks */
    opacity: 0.55;        /* greys out via opacity, not a separate grey palette — theme-safe */
  }
  .task-bar.just-cleared { animation: settle 0.55s ease; }
  @keyframes settle { 0% { transform: scale(1); } 30% { transform: scale(1.015); } 100% { transform: scale(1); } }
  .task-label { font-size: 0.88rem; color: var(--fg); font-weight: 500; }
  .cleared .task-label { color: var(--muted); font-weight: 400; }
  .next-flag { font-size: 0.68rem; padding: 0.1rem 0.45rem; border-radius: 20px; background: var(--chip-active-bg); border: 1px solid var(--chip-active-border); color: var(--fg); }
  .sync-dot { color: var(--muted); font-size: 0.9rem; opacity: 0.7; }
  .bar-track { position: relative; height: 8px; background: var(--input-bg); border: 1px solid var(--card-border); border-radius: 6px; overflow: visible; }
  .bar-fill { height: 100%; background: var(--fg); opacity: 0.7; border-radius: 6px; transition: width 0.3s ease; }
  .cleared .bar-fill { background: var(--muted); }
  .min-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--fg-secondary); opacity: 0.6; }
  .bar-controls { display: flex; align-items: center; gap: 0.5rem; }
  .count-label { font-size: 0.76rem; color: var(--muted); font-variant-numeric: tabular-nums; flex: 1; }
  .tap-plus, .tap-minus { min-width: 40px; min-height: 32px; border-radius: 7px; border: 1px solid var(--chip-border); background: var(--chip-bg); color: var(--fg); cursor: pointer; font-size: 0.85rem; transition: background 0.15s, border-color 0.15s; }
  .tap-plus:hover, .tap-minus:hover:not(:disabled) { border-color: var(--chip-active-border); background: var(--chip-active-bg); }
  .tap-minus:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
```

No red anywhere in this component — "cleared" reads as *quieter*, not as a pass/fail color. The `−` control is always visible (not hover-revealed), matching the mobile requirement in §6.9 that touch devices have no hover state to rely on.

## 5. API Change Summary

SP3 adds **zero** new endpoints. It consumes exactly this subset of SP2's §5 table:

| Method | Path | When SP3 calls it | Payload SP3 sends |
|---|---|---|---|
| GET | `/api/week/[week]` | Background reconciliation after Apply (§6.4); not used for initial load (that's server-side via SP1 directly, §4.4) | — |
| PATCH | `/api/week/[week]` | Counter taps (debounced, §4.8); inline metric edits (§6.2) | `{ counts?: {taskId: delta} }` or `{ metrics?: {metricId: value} }` |
| POST | `/api/entry` | Diary Save | `{ date, text }` |
| POST | `/api/week/[week]/entry/[id]/apply` | Preview Apply click | — |
| POST | `/api/week/[week]/entry/[id]/discard` | Preview Discard click | — |
| POST | `/api/week/[week]/entry/[id]/reparse` | Retry after a failed parse | — |
| GET | `/api/config` | Quota-edit popover open, to get the current full config before mutating one field | — |
| PUT | `/api/config` | Quota-edit commit | full config object with one task's `min`/`target` changed |
| POST | `/api/week/[week]/items` | "Log a post" action (§9, contingent on the item-creation contract change requested there) | `{ taskId: 'post', link: {url, label} \| null }` |

Every call is constructed with `${base}/...` per §4.2 — never a bare `/api/...` literal.

## 6. Frontend Change Summary

### 6.1 `PinnedLinks.svelte` — slot 1

```svelte
<script>
  let { links } = $props(); // config.links: [{label, url}]
</script>

<div class="links-strip">
  {#each links as link}
    {#if link.url}
      <a class="link-pill" href={link.url} target="_blank" rel="noopener">{link.label}</a>
    {:else}
      <span class="link-pill link-pill-empty" title="Not set yet">{link.label}</span>
    {/if}
  {/each}
</div>

<style>
  .links-strip { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.25rem; }
  .link-pill { flex-shrink: 0; font-size: 0.78rem; padding: 0.35rem 0.85rem; border-radius: 20px; background: var(--chip-bg); border: 1px solid var(--chip-border); color: var(--fg-secondary); text-decoration: none; white-space: nowrap; transition: border-color 0.15s, color 0.15s; }
  .link-pill:not(.link-pill-empty):hover { border-color: var(--chip-active-border); color: var(--fg); }
  .link-pill-empty { color: var(--muted); opacity: 0.45; cursor: default; }
</style>
```

Blank-URL links (three of the five seed entries per SP1 §4.3: Reachouts sheet, My profile, Strategy doc) render as inert pills, never as a `<a href="">` — no broken-link click, no `#` href, no console warning. `overflow-x: auto` on the strip itself is the mobile behavior (§6.9): a horizontal scroll strip rather than wrapping, since wrapping would push the metrics row down and threaten the "no scroll to see the week" budget.

### 6.2 `MetricsRow.svelte` + `Sparkline.svelte` — slot 2

**Never a bar, never a target, never "behind" (D2).** This component renders numbers and one line chart — nothing else. No color-coding by performance, no comparison-to-quota framing (metrics have no quota; only tasks do).

```svelte
<!-- MetricsRow.svelte -->
<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import Sparkline from './Sparkline.svelte';

  let { sparkline: initialSparkline, headlineMetricId } = $props();
  const store = getWeekStore();

  let sparkline = $state(initialSparkline);
  let editingId = $state(null);
  let draft = $state('');

  function startEdit(metric) {
    editingId = metric.id;
    draft = store.week.metrics[metric.id] ?? '';
  }

  async function commit(metric) {
    const value = draft === '' ? null : Number(draft);
    editingId = null;
    if (value !== null && !Number.isFinite(value)) return; // silently ignore garbage input, no error text
    const prev = store.week.metrics[metric.id];
    store.setLocalMetric(metric.id, value); // optimistic
    if (metric.id === headlineMetricId) {
      sparkline = [...sparkline.slice(0, -1), { week: store.weekKey, value }];
    }
    try {
      const updated = await fetchWeekPatch({ metrics: { [metric.id]: value } });
      store.replaceWeek(updated);
    } catch {
      store.setLocalMetric(metric.id, prev); // revert on failure — metrics are deliberate edits,
      if (metric.id === headlineMetricId) {  // not taps, so a silent revert (no retry queue) is correct
        sparkline = [...sparkline.slice(0, -1), { week: store.weekKey, value: prev }];
      }
    }
  }
</script>

<div class="metrics-row">
  {#each store.config.metrics as metric (metric.id)}
    <div class="metric-tile {metric.headline ? 'headline' : ''}">
      <span class="metric-label">{metric.label}</span>
      {#if editingId === metric.id}
        <input class="metric-input" type="number" bind:value={draft}
               onblur={() => commit(metric)} onkeydown={(e) => e.key === 'Enter' && commit(metric)} autofocus />
      {:else}
        <button class="metric-value" onclick={() => startEdit(metric)}>
          {store.week.metrics[metric.id] ?? '—'}
        </button>
      {/if}
      {#if metric.headline}
        <Sparkline points={sparkline} />
      {/if}
    </div>
  {/each}
</div>
```

**Sparkline null-state (§6.2 requirement: "a mostly-empty sparkline must look calm, not broken"):**

```svelte
<!-- Sparkline.svelte -->
<script>
  let { points } = $props(); // [{week, value}], value: number | null

  const known = $derived(points.filter(p => p.value !== null));
  const min = $derived(known.length ? Math.min(...known.map(p => p.value)) : 0);
  const max = $derived(known.length ? Math.max(...known.map(p => p.value)) : 0);
  const range = $derived(Math.max(1, max - min)); // avoid div-by-zero on a flat series

  function coord(i, total, value) {
    const x = (i / Math.max(1, total - 1)) * 100;
    const y = 24 - ((value - min) / range) * 20 - 2; // 24px viewBox height, 2px padding
    return `${x},${y}`;
  }
</script>

<svg viewBox="0 0 100 24" preserveAspectRatio="none" class="sparkline">
  {#if known.length < 2}
    <!-- calm null/near-null state: a flat muted baseline, no jagged single-point spike, no text -->
    <line x1="0" y1="20" x2="100" y2="20" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2,3" opacity="0.4" />
    {#if known.length === 1}
      <circle cx="50" cy="20" r="1.8" fill="var(--fg-secondary)" />
    {/if}
  {:else}
    <polyline
      points={known.map((p, i) => coord(points.indexOf(p), points.length, p.value)).join(' ')}
      fill="none" stroke="var(--fg)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"
    />
  {/if}
</svg>

<style>
  .sparkline { width: 100%; height: 28px; display: block; }
</style>
```

`preserveAspectRatio="none"` plus a `viewBox` (not fixed pixel width/height) is what makes this scale correctly under the mobile grid without a redraw — pure CSS/SVG, matching the "no library" constraint exactly (BRAINSTORM §3.5 for confetti applies here too: hand-rolled, restrained).

### 6.3 `WeekLanes.svelte` — slot 3, the core screen

```svelte
<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import TaskBar from './TaskBar.svelte';

  let { nextTaskId } = $props();
  const store = getWeekStore();
</script>

<div class="lanes">
  {#each store.config.lanes as lane (lane.id)}
    <div class="lane">
      <div class="lane-header">
        <span class="lane-label">{lane.label}</span>
        <span class="lane-blurb">{lane.blurb}</span>
      </div>
      {#each store.config.tasks.filter(t => t.lane === lane.id) as task (task.id)}
        <TaskBar {task} isNext={task.id === nextTaskId} />
      {/each}
    </div>
  {/each}
</div>

{#if nextTaskId === null}
  <p class="week-status">This week is done. Anything from here is extra.</p>
{/if}

<style>
  .lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 700px) { .lanes { grid-template-columns: 1fr; } }
  .lane { display: flex; flex-direction: column; gap: 0.6rem; }
  .lane-header { display: flex; flex-direction: column; gap: 0.1rem; margin-bottom: 0.2rem; }
  .lane-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .lane-blurb { font-size: 0.76rem; color: var(--muted); opacity: 0.75; }
  .week-status { text-align: center; font-size: 0.85rem; color: var(--muted); margin-top: 0.5rem; }
</style>
```

**Quota editing, one click (D5).** A small pencil affordance next to each `TaskBar`'s count label (added inside `TaskBar`, omitted from the snippet above for brevity) opens two inline number inputs for `min`/`target` on the same row — no modal, matching "editable in one click." Commit path:

```js
async function commitQuota(taskId, min, target) {
  if (min > target) { quotaError = 'min can\'t be above target'; return; } // client-side guard, quiet inline text
  const current = await (await fetch(`${base}/api/config`)).json();
  const nextConfig = {
    ...current,
    tasks: current.tasks.map(t => t.id === taskId ? { ...t, min, target } : t)
  };
  const res = await fetch(`${base}/api/config`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextConfig)
  });
  if (!res.ok) { const d = await res.json(); quotaError = d.error; return; }
  store.config.tasks.find(t => t.id === taskId).min = min;    // local reflects immediately
  store.config.tasks.find(t => t.id === taskId).target = target;
  quotaError = null;
}
```

`GET /api/config` immediately before `PUT` (rather than mutating a stale client-held config copy) matters because config is deliberately uncached server-side (SP1 §4.4: "read-per-request, always fresh") — SP3 mirrors that by never assuming its own in-memory `store.config` is the latest write target, only the latest *read* result, and always re-reads before a full-object `PUT`.

### 6.4 `DiaryBox.svelte` + `EntryPreview.svelte` — slot 4, the full state machine

**States:** `idle → saving → (preview | failed) → (applying → applied) | (discarding → discarded)`, with `failed → reparsing → (preview | failed)` as the retry loop. All local to this component except the counts/metrics it eventually contributes, which flow through `weekStore`.

```svelte
<!-- DiaryBox.svelte -->
<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import EntryPreview from './EntryPreview.svelte';

  let { weekKey, initialEntries } = $props();
  const store = getWeekStore();

  let text = $state('');
  let date = $state(new Date().toISOString().slice(0, 10)); // defaults today, D11
  let phase = $state('idle'); // idle | saving | preview | failed
  let activeEntry = $state(
    // Reload survival (SP2's persisted `proposed`/`ignored`, §9 of SP2's PRD): on mount, surface
    // the MOST RECENT entry that's still pending with an unapplied preview. Older unresolved
    // previews are NOT shown here — they appear in SP4's log via the same EntryPreview component.
    findLatestPendingPreview(initialEntries)
  );
  // entryWeekKey is the CURRENTLY-ACTIVE entry's own home week — NOT necessarily `weekKey`
  // (the displayed week). SP2's entry object carries no week field of its own (SP1 §4.9's
  // entries[] schema has no `week` key); the only place the entry's owning week is identified
  // is the top-level `week` field on `POST /api/entry`'s response (SP2 PRD §5: `{ week, entry }`).
  // On mount, `initialEntries` was read directly out of `store.week.entries` (the displayed
  // week's own entries, §4.4's load()), so the mount-time default of `weekKey` is correct;
  // it only diverges once a retro-dated Save lands in a different week (see save(), below).
  // Fix per SP4's PRD §4.2 requests R-B/R-C, pulled forward here so this file is self-consistent —
  // see §9's [RESOLVED] entry for the bug this closes.
  let entryWeekKey = $state(weekKey);
  if (activeEntry) phase = 'preview';

  function findLatestPendingPreview(entries) {
    const candidates = entries.filter(e => e.parseStatus === 'pending' && e.proposed);
    if (!candidates.length) return null;
    return candidates.reduce((a, b) => (a.at > b.at ? a : b));
  }

  async function save() {
    if (!text.trim()) return;
    phase = 'saving'; // local to this component ONLY — rest of the page stays fully interactive
    const res = await fetch(`${base}/api/entry`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, text })
    });
    const { week: landedWeek, entry } = await res.json();
    text = ''; // the box clears immediately once the text is durably saved — step 4 of SP2's
               // lifecycle already happened synchronously before this response even returns
    activeEntry = entry;
    entryWeekKey = landedWeek; // AUTHORITATIVE — the server, not the client, decided which week
                                // this entry belongs to (SP1's dateToWeekKey, per SP4's §4.10
                                // ISO-boundary argument). A retro-dated entry's landedWeek differs
                                // from the displayed `weekKey`; everything downstream (Apply/
                                // Discard/Reparse via EntryPreview, below) must route off THIS
                                // value, never off the outer `weekKey` prop.
    phase = entry.parseStatus === 'failed' ? 'failed' : 'preview';
  }

  async function reparse() {
    phase = 'saving';
    // Uses entryWeekKey (the entry's own home week), not weekKey (the displayed week) —
    // same fix as save()/EntryPreview below. A failed retro-logged entry must be re-parsed
    // against the week it actually landed in.
    const res = await fetch(`${base}/api/week/${entryWeekKey}/entry/${activeEntry.id}/reparse`, { method: 'POST' });
    const { entry } = await res.json();
    activeEntry = entry;
    phase = entry.parseStatus === 'failed' ? 'failed' : 'preview';
  }

  function onResolved() { // called by EntryPreview after Apply or Discard completes
    activeEntry = null;
    entryWeekKey = weekKey; // reset to the displayed week for the next new entry
    phase = 'idle';
  }
</script>

<div class="diary-box">
  {#if phase === 'idle' || phase === 'saving'}
    <textarea class="diary-textarea" bind:value={text} placeholder="What happened today?"
              rows="4" disabled={phase === 'saving'}></textarea>
    <div class="diary-controls">
      <input class="date-input" type="date" bind:value={date} max={new Date().toISOString().slice(0,10)} />
      <button class="save-btn" onclick={save} disabled={phase === 'saving' || !text.trim()}>
        {#if phase === 'saving'}<span class="spinner-sm"></span> Saving…{:else}Save{/if}
      </button>
    </div>
  {:else if phase === 'preview'}
    <EntryPreview entry={activeEntry} weekKey={entryWeekKey} onResolved={onResolved} onReparse={reparse} />
  {:else if phase === 'failed'}
    <div class="diary-failed">
      <p class="failed-note">Saved — couldn't read it automatically. The counters still work, or</p>
      <button class="retry-link" onclick={reparse}>try again</button>
    </div>
  {/if}
</div>

<style>
  .diary-box { display: flex; flex-direction: column; gap: 0.6rem; }
  .diary-textarea { width: 100%; box-sizing: border-box; padding: 0.75rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 8px; color: var(--fg); font-size: 0.88rem; font-family: inherit; resize: vertical; outline: none; }
  .diary-textarea:focus { border-color: var(--input-focus-border); }
  .diary-controls { display: flex; gap: 0.6rem; align-items: center; }
  .date-input { padding: 0.45rem 0.6rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 7px; color: var(--fg); font-size: 0.8rem; }
  .save-btn { padding: 0.5rem 1.1rem; background: var(--fg); color: var(--bg); border: none; border-radius: 7px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
  .save-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .spinner-sm { display: inline-block; width: 11px; height: 11px; border: 2px solid rgba(255,255,255,0.4); border-top-color: currentColor; border-radius: 50%; animation: spin 0.7s linear infinite; margin-right: 0.3rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .diary-failed { display: flex; gap: 0.4rem; align-items: baseline; font-size: 0.82rem; color: var(--muted); }
  .retry-link { background: none; border: none; color: var(--fg-secondary); text-decoration: underline; cursor: pointer; font-size: 0.82rem; padding: 0; }
  @media (max-width: 640px) { .diary-controls { flex-direction: column; align-items: stretch; } }
</style>
```

**Why "must not block the rest of the page" is structurally true, not just a promise:** `phase` is local `$state` inside `DiaryBox.svelte`. `TaskBar`'s tap handlers, `MetricsRow`'s inline edits, and `PinnedLinks` clicks read/write `weekStore` and their own local state — none of them read `DiaryBox`'s `phase`. There is no shared "page is busy" flag anywhere in this design. Even though `POST /api/entry` can take up to SP2's 20-second timeout when the LLM is slow, nothing else on the page is disabled, greyed, or blocked while that request is in flight — this is a property of the component boundary, not a runtime check that could be forgotten.

**`EntryPreview.svelte` — shared with SP4, the double-click guard:**

```svelte
<script>
  // `weekKey` here is the ENTRY'S OWN home week (SP2's `POST /api/entry` response's top-level
  // `week` field — see DiaryBox's `entryWeekKey`, above), NOT necessarily the currently-displayed
  // week (`store.weekKey`). This component is reused by SP4's log (§4.5 slot 6/§6.6) for OLDER
  // entries too, so this distinction is load-bearing for every caller, not just DiaryBox.
  // BUG FIXED HERE (found and specified by SP4, PRD §4.2 request R-B, during cross-sub-project
  // reconciliation — see §9's [RESOLVED] entry): every action below must act against THIS
  // weekKey — never assume it equals the displayed week. A back-dated (retro-logged) entry's
  // weekKey is a prior ISO week; applying/discarding it must hit that week's file, and must
  // never optimistically mutate the live weekStore's counts/metrics, which represent a
  // DIFFERENT week's data.
  let { entry, weekKey, onResolved, onReparse } = $props();
  const store = getWeekStore();
  let busy = $state(false); // client-side guard: Apply/Discard disabled instantly on click,
                             // in ADDITION to SP2's own server-side parseStatus guard (§B of
                             // SP2's PRD) — belt and suspenders, not a substitute for it.

  async function apply() {
    if (busy) return;
    busy = true;
    const isLiveWeek = weekKey === store.weekKey; // NEW — only the entry's own week is ever
                                                     // touched by the network call below; this
                                                     // guard controls whether that week ALSO
                                                     // happens to be the one weekStore represents
    if (isLiveWeek) {
      // Optimistic: apply the EXACT proposed deltas locally using the same additive/absolute
      // semantics SP1's applyEntryToWeek uses (applyLocal.js mirrors it — see §6.4 rationale).
      for (const [taskId, delta] of Object.entries(entry.proposed.counts)) store.bumpLocalCount(taskId, delta);
      for (const [metricId, value] of Object.entries(entry.proposed.metrics)) store.setLocalMetric(metricId, value);
    }
    try {
      await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/apply`, { method: 'POST' });
      if (isLiveWeek) {
        const truth = await (await fetch(`${base}/api/week/${weekKey}`)).json(); // reconcile, §6.4
        store.replaceWeek(truth);
      }
      onResolved(weekKey); // pass which week changed — needed by any caller (e.g. SP4's log)
                            // tracking more than one week's state; harmless extra arg for DiaryBox
    } finally { busy = false; }
  }

  async function discard() {
    if (busy) return;
    busy = true;
    // Discard never touches counts/metrics either way, so no isLiveWeek branch is needed here —
    // only the URL (already keyed off the entry's own weekKey) matters.
    await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/discard`, { method: 'POST' });
    busy = false;
    onResolved(weekKey);
  }
</script>

<div class="preview">
  <p class="preview-summary">
    {#each Object.entries(entry.proposed.counts) as [id, delta], i}
      {i > 0 ? ' · ' : ''}{taskLabel(store.config, id)} {(store.week.counts[id] ?? 0) - delta}→{store.week.counts[id] ?? delta}
    {/each}
    {#each Object.entries(entry.proposed.metrics) as [id, value], i}
      {' · '}{metricLabel(store.config, id)} →{value}
    {/each}
  </p>
  {#if entry.ignored?.counts?.length || entry.ignored?.metrics?.length}
    <p class="preview-ignored">
      not used: {[...entry.ignored.counts, ...entry.ignored.metrics].join(', ')}
    </p>
  {/if}
  <div class="preview-actions">
    <button class="btn-ghost" onclick={discard} disabled={busy}>Discard</button>
    <button class="btn-primary" onclick={apply} disabled={busy}>Apply</button>
  </div>
</div>
```

**Why Apply does an optimistic local merge *and* a background `GET` refetch, rather than either alone (resolving the SP2 contract gap named in §1):** SP2's apply response is `{ entry, alreadyApplied }` — it does not return the updated week (SP2 §5). Two options existed: (a) trust the client's own re-derivation of the arithmetic (fast, but duplicates SP1's `applyEntryToWeek` logic in a second place that could silently drift from it over time), or (b) always `GET /api/week/[week]` after Apply and render only once that resolves (correct by construction, but a visible delay on every Apply). SP3 does both **when the entry's own `weekKey` is the currently-displayed week** (the `isLiveWeek` guard above): the optimistic local merge makes the bar move the instant Apply is clicked (feels instant, matches BRAINSTORM's "logging costs nothing"), and the follow-up `GET` — invisible, no loading state shown for it — replaces `store.week` with server truth a moment later, silently correcting anything that drifted. For a retro-logged entry whose `weekKey` is a *different*, prior week, neither the optimistic merge nor the reconciling `GET` touch `weekStore` at all — only the plain `POST .../apply` fire against that week's own file, with nothing rendered on the current screen changing. Because Apply is a single deliberate click (not a rapid-fire tap sequence), the extra round trip's latency is invisible in practice; only the *arithmetic simplicity* of the optimistic step matters for feel, not its authority. `applyLocal.js`'s `bumpLocalCount`/`setLocalMetric` are the exact two-line mirrors of SP1's clamp-at-zero-additive / absolute-overwrite rules, kept in one small tested file specifically so the duplication is contained and verifiable (§7).

**Double-click:** `busy` is set synchronously on click, before any `await` — a second click while `busy` is true is a no-op at the client, and even if a click somehow raced past that (e.g. two rapid pointerdown events), SP2's own `parseStatus === 'ok'` guard makes the second server call a no-op too (§B of SP2's PRD). Both layers are real, not decorative — the client guard is about UI feel (buttons visibly disable), the server guard is about correctness.

**Multiple counters + a pending diary entry composing safely:** manual taps and an unresolved diary preview never conflict, because both eventually express themselves as *additive deltas* into the same `counts` object — there is no "lock the counters while a preview is pending" logic anywhere, and there doesn't need to be. This is called out explicitly because it would be easy to over-engineer a mutual-exclusion mechanism that the data model doesn't actually require.

### 6.5 `Confetti.svelte` — fires once, CSS-only

```svelte
<script>
  let { weekKey, config } = $props();
  const store = getWeekStore();

  const allCleared = $derived(config.tasks.every(t => (store.week.counts[t.id] ?? 0) >= t.min));
  let fired = $state(false);
  let mountedOnce = $state(false);

  function storageKey(wk) { return `linkedin-outreach:confetti:${wk}`; }
  function alreadyFired(wk) {
    try { return localStorage.getItem(storageKey(wk)) === '1'; } catch { return false; }
  }
  function markFired(wk) {
    try { localStorage.setItem(storageKey(wk), '1'); } catch {} // best-effort; private mode is fine to miss
  }

  $effect(() => {
    if (!mountedOnce) {
      mountedOnce = true;
      if (allCleared && !alreadyFired(weekKey)) markFired(weekKey); // already-true-at-load: mark, don't animate
      return;
    }
    if (allCleared && !alreadyFired(weekKey)) {
      fired = true;
      markFired(weekKey);
      setTimeout(() => fired = false, 1200);
    }
  });
</script>

{#if fired}
  <div class="confetti-burst" aria-hidden="true">
    {#each Array(14) as _, i}
      <span class="piece" style="--i:{i}; --hue:{(i * 47) % 360}"></span>
    {/each}
  </div>
{/if}

<style>
  .confetti-burst { position: fixed; top: 4rem; left: 50%; width: 0; height: 0; z-index: 50; pointer-events: none; }
  .piece {
    position: absolute; width: 6px; height: 10px;
    background: hsl(var(--hue), 65%, 55%);
    left: calc((var(--i) - 7) * 6px);
    animation: fall 1.1s ease-out forwards;
    animation-delay: calc(var(--i) * 0.02s);
  }
  @keyframes fall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(90px) rotate(200deg); opacity: 0; }
  }
</style>
```

**"Once" bookkeeping, precisely:** the flag lives in `localStorage`, keyed per ISO week (`linkedin-outreach:confetti:2026-W35`), never in the week's own JSON file. This was a deliberate choice against extending SP1's schema for a purely cosmetic, session-relevant flag (schema changes need SP1 sign-off per its own §9 convention; this doesn't need to be data at all — it has no meaning once the moment has passed). A mount-time check distinguishes "already cleared when the page loaded" (mark the flag, animate nothing — a reload of an already-done week must never re-burst) from "cleared *during this viewing*" (animate, then mark). If `localStorage` throws (private browsing), the effect silently no-ops on the write and the burst simply may replay once more in a future private session — judged acceptable per the inverted-U finding: the cost of an occasional extra burst is far lower than the cost of adding a server round trip or a schema field for a decoration.

### 6.6 Layout slots — final summary for SP4

| Slot | Owner | Position | What SP4 needs |
|---|---|---|---|
| 1. Pinned links | SP3 | Top | — |
| 2. Metrics row | SP3 | 2nd | — |
| 3. This week (two lanes) | SP3 | 3rd, the core | — |
| 4. Diary box | SP3 | 4th | — |
| 5. History strip + calendar | **SP4** | `<section data-slot="history-calendar">` in `+page.svelte`, §4.6 | `getWeekStore()` for current-week reactive state (if it displays "this week" inline in the strip); its own server data via extending `+page.server.js`'s `load()` (append-only, §4.4) |
| 6. Diary log | **SP4** | `<section data-slot="diary-log">` in `+page.svelte`, §4.6 | `EntryPreview.svelte` (§6.4) reused as-is for any older unresolved pending entries; `getWeekStore()` if a log-driven apply needs to affect the live current-week bars |

### 6.7 Tab title counter (D18)

`document.title` and `<svelte:head><title>` both derive from `leftCount` = count of tasks with `week.counts[id] < task.min` (BRAINSTORM's own recommendation, adopted as-is). Format: `(N left) LinkedIn` while `N > 0`; plain `LinkedIn` once `N === 0` — no "0 left," no punctuation, no emoji. This is computed in `+page.svelte` (§4.6) as a `$derived` off the same `weekStore` every other component reads, so a diary Apply or a counter tap updates the tab title within the same reactive tick, with no separate polling or event system.

### 6.8 Copy — every string, deliberately

| Context | Copy | Why |
|---|---|---|
| Diary placeholder | "What happened today?" | Plain, no prompt pressure, no example that implies a minimum length |
| Diary Save button (idle) | "Save" | — |
| Diary Save button (in flight) | "Saving…" + small spinner | No "Parsing with AI…" — the LLM step is invisible plumbing, not something to narrate as work happening *to* the user |
| Diary parse failed | "Saved — couldn't read it automatically. The counters still work, or **try again**." | Leads with "Saved" so the one fact that matters (nothing was lost) lands first; no "Error," no red, "try again" as a plain link not a button |
| Preview summary | `comments 0→4 · invites 0→6 · followers →1032` | BRAINSTORM's own worked phrasing, adopted verbatim — counts as `before→after`, metrics as `→absolute` |
| Preview ignored keys | "not used: invites, followers" | Neutral, not "error" or "rejected" — these are just facts the model didn't confidently extract |
| Preview actions | "Discard" / "Apply" | D9's exact two verbs, no synonyms |
| Task "do this next" flag | "next" | Lowercase, small, a label not a command ("Do this now!" was explicitly avoided) |
| Week fully cleared | "This week is done. Anything from here is extra." | States the fact once, offers stretch work as optional framing, no exclamation mark, no congratulations |
| Config error panel | "Config problem" / "\<field-naming message from SP1\>" / "Nothing was changed. Fix `config/config.json` and reload." | Names the exact fix path, reassures nothing was lost, no stack trace |
| Sync failure dot (tooltip) | "Not saved yet — will retry" | Present-tense, not alarming, states what's actually happening |
| Pinned link (unset) | *(label only, no extra copy)* | Absence of a link isn't narrated — it's just visually inert |
| Quota edit error | "min can't be above target" | States the rule, not "Invalid input" |

**What never appears anywhere in this UI:** "streak," "miss," "behind," any exclamation mark used for encouragement, red as a semantic color for anything (only ever used, if at all, matching cc-gateway's own existing `#f87171` "danger hover" convention for a genuinely destructive action like delete — SP3 has no destructive action of its own), a day-of-week or days-remaining countdown, any framing that compares this week to a previous one.

### 6.9 Responsiveness

Desktop-first (the primary use case is opening this at a desk), but every component above already carries its own mobile behavior rather than a single global breakpoint file:

- **Pinned links** (§6.1): horizontal scroll strip (`overflow-x: auto`), never wraps — wrapping would consume vertical budget the "no scroll to see the week" requirement can't spare.
- **Metrics row** (§6.2): CSS grid, `auto-fill`/`minmax` collapsing from 5-across to 2-across under ~600px; the sparkline SVG scales via `viewBox`, no fixed pixel dimensions to break.
- **Lanes** (§6.3): 2-column grid on desktop, single column under 700px — Outreach then Presence stacked, preserving the same fixed lane order the "do this next" rule relies on.
- **Diary controls** (§6.4): date picker + Save button stack vertically under 640px rather than being squeezed onto one row.
- **Touch targets**: every tap/decrement control is ≥40px in both dimensions (`TaskBar`'s `.tap-plus`/`.tap-minus`), and the decrement control is always visible rather than hover-revealed, since touch has no hover state — one code path serves both input types rather than a mobile-only variant.
- **Modals/popovers**: the quota-edit affordance (§6.3) is an inline expansion within the `TaskBar` row, not a modal — avoids the fixed-position modal sizing edge cases mobile browsers are prone to, and keeps the "one click" promise literal (no extra tap to open a dialog first).

### 6.10 Data export/import — closing SP4 §9 Q8

SP2 ships `GET /api/export`, `GET /api/export/all`, and `POST /api/import` (SP2 §4F/§5), but no PRD had claimed the UI for them — SP4 §9 Q8 flags this as unclaimed, and D14 requires actual UI buttons, not just disk-level access. SP3 claims it here, since it's a small, unobtrusive affordance that belongs near the other "quiet, always-there" chrome SP3 already owns (the pinned links strip), not a new page or route.

**Placement — deliberately small.** A single low-key "Data" affordance sits at the trailing end of the pinned-links strip (§6.1), styled with the same `.link-pill`-adjacent visual weight as an inert link pill — not a prominent button, not its own row, matching the "make the week look small" principle the rest of this PRD holds to. Clicking it opens a tiny inline popover (same interaction weight as the quota-edit popover, §6.3) with three plain actions:

```svelte
<!-- appended inside PinnedLinks.svelte, after the links-strip -->
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
// three calls total — no new route, no new page
// 1 & 2: plain <a href> downloads — the browser handles the file save via
//        GET /api/export?week=... and GET /api/export/all's Content-Disposition header.
// 3: file picker -> POST /api/import
async function onImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const body = await file.text();
  const res = await fetch(`${base}/api/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body
  });
  const result = await res.json();
  importResult = res.ok
    ? `Imported. Backup saved to ${result.backup}.`   // SP2's own confirmation fields, §4F/§5
    : `Import failed: ${result.error}`;
  open = false;
}
```

The import result line surfaces exactly what SP2's response already includes — the validation outcome or the `backup: "data/.backups/<ts>/"` path — before confirming anything to the user; no separate confirmation dialog is built, since the popover's own result line *is* the confirmation. Styling reuses `PinnedLinks`' existing `.link-pill`/`chip` custom properties, no new palette.



**Unit-testable pure functions** (vitest, per SP1's `src/lib/**/*.test.js` convention — no SvelteKit runtime needed for these):

- `selectNext.test.js`: given a fixed config, assert the pointer lands on the first outreach-lane task below min; assert it moves to presence-lane once all outreach tasks clear; assert it returns `null` once every task clears; assert calling it twice with identical input returns identical output (the "no thrashing" property, made explicit as a test rather than left as a claim); assert a correction that drops a cleared task back under min causes the pointer to return to it.
- `applyLocal.test.js`: `bumpLocalCount`-equivalent clamps at 0 exactly like SP1's `bumpCount`; `setLocalMetric`-equivalent overwrites (not adds) and accepts `null`; both match SP1's `weeks.js` fixtures byte-for-byte on the same inputs (copy SP1's own test cases where they exist) — this is the test that keeps the client-side arithmetic mirror (§6.4) from silently drifting from SP1's real implementation over time.
- `weekKeyFmt.test.js`: the debounce helper coalesces N calls within the window into 1 invocation; date-range formatting matches SP1's `weekKeyToRange` output shape.

**What is explicitly NOT unit-tested here:** anything requiring a rendered Svelte component tree (no component-testing framework is introduced — matches "no new runtime dependencies" and cc-gateway's own zero-test-file precedent noted in SP1 §4.1). Component behavior is covered by the manual smoke pass below, which is where BRAINSTORM §3.7 already places this responsibility for the UI layer.

**Manual smoke pass** (SP3's slice of BRAINSTORM §3.7's plan, run against a real dev server with SP1+SP2 in place):

1. Load the page with an empty current week — confirm all bars at 0, "do this next" on the first outreach task, no confetti, tab title shows the full left-count.
2. Tap a counter rapidly (5+ taps in under a second) — confirm the bar updates on every tap with no visible lag, confirm only one (or few, batched) network request fires, confirm the final server-reconciled count matches the number of taps.
3. Tap a counter with the dev server's network throttled/offline — confirm the optimistic value holds, the quiet sync-pending indicator appears, no alarming error; bring the network back and confirm it self-heals on the next tap or the auto-retry.
4. Clear every task's min one at a time — confirm the pointer moves task-to-task in the documented order, confirm the last one clearing fires confetti exactly once, confirm the "This week is done" copy appears and the pointer disappears.
5. Reload the now-cleared week — confirm confetti does NOT replay, confirm bars render already grey/shrunk with no animation flash.
6. Write a diary entry, Save, wait for the preview, click Apply once quickly-double-clicked (mouse chatter) — confirm counts move exactly once.
7. Write a diary entry, Save, click Discard — confirm counts don't move, confirm the entry text is still associated with the (now-discarded) record.
8. Unset `WORKER_API_KEY` in `.env` (per SP2 §8) and restart — confirm diary Save still returns quickly with the "couldn't read it automatically" note, confirm every other interaction (taps, metric edits, quota edits, links) still works with zero degradation.
9. Save a diary entry, then reload the page before clicking Apply/Discard — confirm the preview reappears exactly as it was, not lost, not re-parsed.
10. Edit a quota's min above its target — confirm the inline error appears and nothing is sent to the server.
11. Break `config/config.json` (e.g. duplicate a task id) and reload — confirm the readable config-error panel renders naming the field, confirm no data file was touched.
12. Resize to a phone viewport (or open on an actual phone per the brief's own expectation) — confirm all of slots 1–4 fit without horizontal scroll, confirm the pinned-links strip scrolls horizontally instead of wrapping, confirm tap targets are comfortably thumb-sized.
13. Click an empty-URL pinned link pill — confirm nothing happens (no navigation, no error).

## 8. Manual Intervention Required From You

None required to implement this PRD. Two items worth flagging for awareness rather than action:

1. **Confirm the `/linkedin` base-path decision once SP5's PRD exists** (§4.2, §9) — SP3's code is written to be correct either way, so this is a verification step, not a blocking dependency.
2. **Visual sanity check of the confetti burst and the grey/shrink transition timing** on a real device after first implementation — the exact durations chosen (0.55s settle, 1.1s confetti fall) are reasonable defaults, not measured against a human reaction, and are cheap to retune if they read as too slow/fast in practice.

## 9. Open Questions & Decisions

| # | Item | Status |
|---|---|---|
| Q1 | Svelte version and rune usage | `[RESOLVED]` cc-gateway's `package.json` pins `svelte: "^5.51.0"` and its own `+layout.svelte`/`ideas/+page.svelte`/`links/+page.svelte` all use `$props()`/`$state()`/`$derived()`/`$effect()` throughout — Svelte 5 runes mode, confirmed by direct inspection, not assumed. SP3 matches exactly, including using a `.svelte.js` module for `weekStore` (Svelte 5's supported pattern for reactive state outside a component). |
| Q2 | CSS framework / component library | `[RESOLVED: none]` — confirmed via direct inspection of cc-gateway's `+layout.svelte`, `ideas/+page.svelte`, `links/+page.svelte`: every style is a hand-written `<style>` block using CSS custom properties, no Tailwind, no UI kit import anywhere in `package.json`'s dependencies. SP3 follows identically; confetti is hand-rolled CSS keyframes (§6.5), the sparkline is hand-rolled inline SVG (§6.2) — both per the "no new runtime dependencies" constraint. |
| Q3 | `/linkedin` base-path handling | `[RESOLVED: moot for now — hosting/gateway integration is deferred, so there is no path prefix to handle. SP3's existing use of ${base} from $app/paths (§4.2) is harmless (base is simply empty string when kit.paths.base is unset) and costs nothing to leave in place, so no code change is needed if gateway integration is picked back up later.]` |
| Q4 | D15 vs. SP2 §4E — "must never block a tap" vs. server-side link-required-at-creation | `[RESOLVED: fix applied to SP2 §4E — link:null now accepted at creation for all tasks including post; SP3's single-tap "log a post" affordance as originally designed in §6.3 now matches SP2's actual contract, no fallback two-field capture needed.]` |
| Q5 | Apply's response shape not including the updated week | `[RESOLVED]` — SP2 §5 confirms `POST .../apply` returns only `{ entry, alreadyApplied }`. SP3 resolves this by optimistically merging the known `entry.proposed` deltas locally (using the same clamp/overwrite arithmetic SP1's `applyEntryToWeek` uses, duplicated in `applyLocal.js` and kept honest by tests mirroring SP1's own fixtures, §7) and following up with a silent `GET /api/week/[week]` to reconcile — §6.4. No new endpoint requested; this is a client-side design choice, not a contract gap that blocks anything. |
| Q6 | `GET /api/weeks` (list-all) endpoint, flagged as open in SP2 §9 | `[RESOLVED for SP3]` — not needed. The sparkline (§4.4) and the "do this next"/tab-title counters are all computed either server-side in `+page.server.js`'s `load()` (direct `listWeekKeys`/`readWeek` module calls, no HTTP) or from `weekStore`'s already-loaded state. SP4 may still need this if its calendar wants incremental client-side fetching without a full page reload — that determination is SP4's, not resolved here, and SP3 has not built any such route on SP4's behalf. |
| Q7 | Layout slot ownership for `+layout.svelte` | `[RESOLVED]` — unassigned by any other PRD (SP1's scaffold stops at `app.html`; see §4.3). SP3 takes it since the page shell needs a root/theme layer to render at all, copying cc-gateway's CSS custom-property palette verbatim rather than inventing a new one, per the task's explicit ask that the app "look like it belongs to the same family." |
| Q8 | `items[]` creation policy vs. plain counter taps (SP1's own Q9, SP2's own open item) | `[RESOLVED, contingent on Q4]` — plain "+1"/"−1" taps never create an `items[]` row (pure `counts` deltas via `PATCH /api/week/[week]`) for every task, "post" included in the corrected-contract version of Q4. Only the "post" task's dedicated "log a post" action calls `POST /api/week/[week]/items`, since that's the only task type BRAINSTORM's D15 specifically wants a link-bearing record for. This matches SP1's own non-binding recommendation in its §9 Q9. |
| Q9 | Number of weeks shown in the sparkline | `[RESOLVED: 12]` — not specified anywhere in BRAINSTORM; chosen as a reasonable trend window (roughly one quarter) that stays cheap to compute (12 `readWeek` calls per page load, negligible per SP1's own performance note in its §4.4) without overloading the "headline" tile visually. Easy to change; not treated as load-bearing. |
| Q10 | Confetti "once" bookkeeping location | `[RESOLVED: localStorage, not the week schema]` — deliberately kept out of SP1's data model since it's a purely cosmetic, session-relevant flag with no forensic value once the moment passes; extending the week schema for it would need SP1 sign-off for something that isn't really "data." See §6.5 for the private-browsing fallback behavior (best-effort, acceptable to occasionally replay). |
| Q11 | Whether "do this next" should point at stretch targets once all mins clear | `[RESOLVED: no — pointer disappears entirely]` — a design call beyond what BRAINSTORM states outright, made in §4.7 on the grounds that continuing to point at optional work after the week's real requirement is met re-introduces exactly the pressure D19/D20 remove; target marks remain visible on every bar regardless; nothing points at them. |
| Q12 | Orphaned `items[]`/`entries[]` rows referencing a removed task id (SP1's own Q10) | `[DEFERRED to SP4]` — SP3's own components never render `items[]` directly (that's the log, SP4's slot 6); SP3 only reads `counts`/`metrics` via `projectWeekForConfig`, which already filters orphaned ids out before SP3 ever sees them (SP1 §4.7). Not SP3's concern by construction. |
| Q13 | Retro-logged entries: `DiaryBox`/`EntryPreview`'s Apply/Discard/Reparse actions applying against the *currently-displayed* week instead of the *entry's own* week | `[RESOLVED: bug found and fully specified by SP4 during cross-sub-project reconciliation (SP4's PRD §4.2, requests R-B and R-C), pulled forward into this PRD so it's self-consistent without requiring SP4's PRD to be read first. Fix: `EntryPreview`'s `weekKey` prop is now documented as the entry's OWN home week — sourced from `POST /api/entry`'s response top-level `week` field (SP2 PRD §5), since the entry object itself carries no week identifier (SP1 §4.9's `entries[]` schema has no `week` key). `DiaryBox` tracks this separately as `entryWeekKey` state (§6.4), defaulting to the displayed `weekKey` on mount/reset and updated to the server's returned `landedWeek` after every `save()`; `reparse()` was fixed to route off `entryWeekKey` too (it previously used the outer, displayed `weekKey` unconditionally, same bug). `EntryPreview.apply()`/`discard()` compute `isLiveWeek = weekKey === store.weekKey` and only perform the optimistic local merge / reconciling `GET` / `weekStore` mutation when true — every apply/discard/reparse network call always targets the entry's own week via the URL regardless of `isLiveWeek`, but the live on-screen bars (`weekStore`) are only ever touched when the entry's week and the displayed week are the same. This closes the exact silent-corruption path SP4 identified: a back-dated entry (D11's retro-logging) could previously bump the wrong week's live counts and call apply/discard against the wrong week's file.] |
| Q14 | Export/import UI ownership (SP2 ships the endpoints; SP4 §9 Q8 flagged no PRD had claimed the UI) | `[RESOLVED: scope addition]` — SP3 now claims this, added as §6.10: a small "Data" affordance near the pinned-links strip with three actions (export this week, export everything, import via file picker), all three round-tripping to SP2's existing `GET /api/export`, `GET /api/export/all`, `POST /api/import` — no new route, no new page. This closes SP4 §9 Q8. |
