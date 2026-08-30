<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { buildCalendarMonth } from '$lib/utils/calendarMonth.js';

  let { month, nextWeek, config } = $props();
  const store = getWeekStore();

  function weekKeysFor(year, monthNumber) {
    return [...new Set(buildCalendarMonth(year, monthNumber, {}, store.weekKey, todayStr).days.map(day => day.weekKey))];
  }

  function seedWeeks(calendarMonth) {
    const seeded = {};
    for (const day of calendarMonth.days) {
      seeded[day.weekKey] ??= { week: day.weekKey, entries: [], items: [] };
      for (let i = 0; i < day.entryCount; i++) seeded[day.weekKey].entries.push({ date: day.date });
      for (let i = 0; i < day.itemCount; i++) seeded[day.weekKey].items.push({ at: `${day.date}T00:00:00.000Z` });
    }
    return seeded;
  }

  const todayStr = month.days.find(day => day.isToday)?.date ?? new Date().toISOString().slice(0, 10);
  let localMonth = $state(month);
  let weeksByKey = $state(seedWeeks(month));
  let loading = $state(false);
  let navigationVersion = 0;

  const monthLabel = $derived(new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(localMonth.year, localMonth.month - 1, 1))));

  async function showMonth(offset) {
    const date = new Date(Date.UTC(localMonth.year, localMonth.month - 1 + offset, 1));
    const year = date.getUTCFullYear();
    const monthNumber = date.getUTCMonth() + 1;
    const keys = weekKeysFor(year, monthNumber);
    const version = ++navigationVersion;
    loading = true;

    const missing = keys.filter(weekKey => !weeksByKey[weekKey]);
    const fetched = await Promise.all(
      missing.map(weekKey => fetch(`${base}/api/week/${weekKey}`).then(response => response.json()))
    );
    if (version !== navigationVersion) return;

    weeksByKey = { ...weeksByKey, ...Object.fromEntries(fetched.map(week => [week.week, week])) };
    localMonth = buildCalendarMonth(year, monthNumber, weeksByKey, store.weekKey, todayStr);
    loading = false;
  }

  $effect(() => {
    const dirty = store.historyVersion > 0 ? store.lastDirtyWeek : null;
    if (!dirty || !untrack(() => localMonth.days.some(day => day.weekKey === dirty))) return;
    fetch(`${base}/api/week/${dirty}`).then(response => response.json()).then(fresh => {
      weeksByKey = { ...weeksByKey, [dirty]: fresh };
      localMonth = buildCalendarMonth(localMonth.year, localMonth.month, weeksByKey, store.weekKey, todayStr);
    });
  });
</script>

<div class="month-calendar">
  <div class="cal-heading">
    <button onclick={() => showMonth(-1)} disabled={loading} aria-label="Previous month">←</button>
    <p>{monthLabel}</p>
    <button onclick={() => showMonth(1)} disabled={loading} aria-label="Next month">→</button>
  </div>
  <div class="cal-weekdays" aria-hidden="true">
    <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
  </div>
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
</div>

<style>
  .month-calendar { display: flex; flex-direction: column; gap: 0.5rem; color: var(--fg); }
  .cal-heading { display: flex; align-items: center; justify-content: space-between; }
  .cal-heading p { margin: 0; font-size: 0.9rem; font-weight: 500; }
  .cal-heading button { width: 40px; height: 40px; border: 1px solid var(--chip-border); border-radius: 7px; background: var(--chip-bg); color: var(--fg-secondary); cursor: pointer; }
  .cal-heading button:disabled { opacity: 0.4; cursor: wait; }
  .cal-weekdays, .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
  .cal-weekdays span { padding: 0.2rem; color: var(--muted); font-size: 0.66rem; text-align: center; }
  .cal-day { min-height: 42px; display: flex; flex-direction: column; align-items: center; gap: 0.3rem; padding: 0.35rem 0.15rem; border-top: 1px solid var(--card-border); }
  .cal-day.current-week-row { background: var(--card-bg); }
  .cal-day.out-of-month { opacity: 0.35; }
  .cal-date-num { width: 1.5rem; height: 1.5rem; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-secondary); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .cal-date-num.today { border: 1px solid var(--fg-secondary); border-radius: 50%; color: var(--fg); }
  .cal-dot { display: block; border-radius: 50%; background: var(--fg-secondary); }
  .cal-dot.small { width: 4px; height: 4px; }
  .cal-dot.medium { width: 6px; height: 6px; }
  .cal-dot.large { width: 8px; height: 8px; }
  .next-week { padding-top: 0.5rem; border-top: 1px solid var(--card-border); }
  .next-week-label { margin: 0 0 0.25rem; color: var(--fg); font-size: 0.78rem; font-weight: 500; }
  .next-week-line { margin: 0; color: var(--muted); font-size: 0.74rem; line-height: 1.5; }
</style>
