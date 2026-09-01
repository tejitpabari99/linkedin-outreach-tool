<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { buildActivityIndex, activityDay } from '$lib/utils/activityTally.js';
  import { buildCalendarMonth } from '$lib/utils/calendarMonth.js';
  import { isoWeekKeyFromUTCDate } from '$lib/utils/isoWeek.js';

  let {
    month,
    config,
    activityWeeks = {},
    onRangeChange = () => {},
    onWeeksChange = () => {},
    onActiveDateChange = () => {}
  } = $props();
  const store = getWeekStore();

  function normalizeWeeks(source) {
    if (Array.isArray(source)) return Object.fromEntries(source.map(week => [week.week, week]));
    return { ...(source ?? {}) };
  }

  const todayStr = untrack(() => month.days.find(day => day.isToday)?.date ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()));
  let localMonth = $state(untrack(() => month));
  let weeksByKey = $state(untrack(() => normalizeWeeks(activityWeeks)));
  let range = $state({ start: todayStr, end: todayStr });
  let anchor = $state(todayStr);
  let loading = $state(false);
  let navigationVersion = 0;

  const activityIndex = $derived(buildActivityIndex(Object.values(weeksByKey), config));
  const monthLabel = $derived(new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(localMonth.year, localMonth.month - 1, 1))));

  function weekKeysForMonth(year, monthNumber) {
    return [...new Set(
      buildCalendarMonth(year, monthNumber, {}, store.weekKey, todayStr).days.map(day => day.weekKey)
    )];
  }

  function weekKeysForRange(start, end) {
    const keys = new Set();
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor <= last) {
      keys.add(isoWeekKeyFromUTCDate(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return [...keys];
  }

  async function fetchWeeks(keys) {
    const missing = keys.filter(weekKey => !weeksByKey[weekKey]);
    if (!missing.length) return;
    const fetched = await Promise.all(
      missing.map(async weekKey => {
        const response = await fetch(`${base}/api/week/${weekKey}`);
        if (!response.ok) throw new Error(`Week load failed: ${response.status}`);
        return response.json();
      })
    );
    weeksByKey = {
      ...weeksByKey,
      ...Object.fromEntries(fetched.map(week => [week.week, week]))
    };
  }

  async function showMonth(offset) {
    const date = new Date(Date.UTC(localMonth.year, localMonth.month - 1 + offset, 1));
    const year = date.getUTCFullYear();
    const monthNumber = date.getUTCMonth() + 1;
    const version = ++navigationVersion;
    loading = true;

    try {
      await fetchWeeks(weekKeysForMonth(year, monthNumber));
      if (version !== navigationVersion) return;
      localMonth = buildCalendarMonth(year, monthNumber, weeksByKey, store.weekKey, todayStr);
    } catch {
      // Keep the currently complete month visible when navigation cannot be loaded.
    } finally {
      if (version === navigationVersion) loading = false;
    }
  }

  async function showToday() {
    const [year, monthNumber] = todayStr.split('-').map(Number);
    const version = ++navigationVersion;
    anchor = todayStr;
    range = { start: todayStr, end: todayStr };
    onActiveDateChange(todayStr);
    localMonth = buildCalendarMonth(year, monthNumber, weeksByKey, store.weekKey, todayStr);
    loading = true;

    try {
      await fetchWeeks(weekKeysForMonth(year, monthNumber));
      if (version !== navigationVersion) return;
      localMonth = buildCalendarMonth(year, monthNumber, weeksByKey, store.weekKey, todayStr);
    } catch {
      // The current month and selection remain visible with any activity already cached.
    } finally {
      if (version === navigationVersion) loading = false;
    }
  }

  function selectDay(event, date) {
    if (event.shiftKey && anchor) {
      range = date < anchor
        ? { start: date, end: anchor }
        : { start: anchor, end: date };
      fetchWeeks(weekKeysForRange(range.start, range.end)).catch(() => {});
      return;
    }
    anchor = date;
    range = { start: date, end: date };
    onActiveDateChange(date);
  }

  function totalFor(date) {
    return Object.values(activityDay(activityIndex, date).counts)
      .reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0);
  }

  function heatClass(total) {
    if (total >= 10) return 'bg-success/40';
    if (total >= 5) return 'bg-success/30';
    if (total >= 2) return 'bg-success/20';
    if (total >= 1) return 'bg-success/12';
    return 'bg-base-100';
  }

  function isEndpoint(date) {
    return date === range.start || date === range.end;
  }

  function isInRange(date) {
    return date >= range.start && date <= range.end;
  }

  function selectionLabel(date) {
    if (range.start === range.end && date === range.start) return ', selected day';
    if (date === range.start) return ', range start';
    if (date === range.end) return ', range end';
    if (isInRange(date)) return ', in selected range';
    return '';
  }

  function dayLabel(day) {
    const date = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${day.date}T00:00:00Z`));
    const total = totalFor(day.date);
    return `${date}, ${total} total activity${selectionLabel(day.date)}`;
  }

  function dayClass(day) {
    const total = totalFor(day.date);
    const classes = [
      'relative flex min-h-9 min-w-0 flex-col items-center justify-center rounded-md px-0.5 py-0.5',
      'text-xs tabular-nums transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'
    ];
    if (!day.inMonth) classes.push('text-base-content/45');
    else classes.push('text-base-content');

    if (isEndpoint(day.date)) {
      classes.push('bg-primary text-primary-content ring-2 ring-primary ring-offset-1 ring-offset-base-100 font-semibold');
    } else if (isInRange(day.date)) {
      classes.push('bg-secondary/10 ring-1 ring-inset ring-secondary');
    } else {
      classes.push(heatClass(total), 'border border-base-300');
    }

    if (day.isToday) classes.push('border-2 border-dashed border-accent');
    return classes.join(' ');
  }

  async function refreshDirtyWeek(weekKey) {
    try {
      const response = await fetch(`${base}/api/week/${weekKey}`);
      if (!response.ok) return;
      const fresh = await response.json();
      weeksByKey = { ...weeksByKey, [weekKey]: fresh };
      localMonth = buildCalendarMonth(localMonth.year, localMonth.month, weeksByKey, store.weekKey, todayStr);
    } catch {
      // Existing cached activity remains visible until a later successful refresh.
    }
  }

  $effect(() => {
    onRangeChange({ start: range.start, end: range.end });
  });

  $effect(() => {
    onWeeksChange(weeksByKey);
  });

  $effect(() => {
    const dirty = store.historyVersion > 0 ? store.lastDirtyWeek : null;
    if (!dirty || !untrack(() => Boolean(weeksByKey[dirty]))) return;
    refreshDirtyWeek(dirty);
  });
</script>

<section class="flex flex-col gap-1.5 rounded-box border border-base-300 bg-base-100 p-2 text-base-content" aria-label="Activity calendar">
  <div class="flex items-center justify-between">
    <button class="btn btn-ghost btn-square btn-sm" type="button" onclick={() => showMonth(-1)} disabled={loading} aria-label="Previous month">←</button>
    <div class="flex items-center gap-2">
      <p class="text-sm font-semibold" aria-live="polite">{monthLabel}</p>
      <button class="btn btn-ghost btn-xs" type="button" onclick={showToday} disabled={loading}>Today</button>
    </div>
    <button class="btn btn-ghost btn-square btn-sm" type="button" onclick={() => showMonth(1)} disabled={loading} aria-label="Next month">→</button>
  </div>
  <div class="grid grid-cols-7" aria-hidden="true">
    <span class="py-0.5 text-center text-[0.625rem] text-base-content/55">Mon</span>
    <span class="py-0.5 text-center text-[0.625rem] text-base-content/55">Tue</span>
    <span class="py-0.5 text-center text-[0.625rem] text-base-content/55">Wed</span>
    <span class="py-0.5 text-center text-[0.625rem] text-base-content/55">Thu</span>
    <span class="py-0.5 text-center text-[0.625rem] text-base-content/55">Fri</span>
    <span class="py-0.5 text-center text-[0.625rem] text-base-content/55">Sat</span>
    <span class="py-0.5 text-center text-[0.625rem] text-base-content/55">Sun</span>
  </div>
  <div class="grid grid-cols-7 gap-0.5">
    {#each localMonth.days as day (day.date)}
      {@const total = totalFor(day.date)}
      <button
        type="button"
        class={dayClass(day)}
        onclick={(event) => selectDay(event, day.date)}
        aria-label={dayLabel(day)}
        aria-pressed={isInRange(day.date)}
      >
        <span>{Number(day.date.slice(8, 10))}</span>
        {#if total > 0}<span class="text-[0.55rem] leading-none opacity-75">{total}</span>{/if}
      </button>
    {/each}
  </div>
</section>
