<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import Confetti from '$lib/components/Confetti.svelte';
  import DiaryBox from '$lib/components/DiaryBox.svelte';
  import MonthCalendar from '$lib/components/MonthCalendar.svelte';
  import TotalsRow from '$lib/components/TotalsRow.svelte';
  import WeekGoals from '$lib/components/WeekGoals.svelte';
  import WeekLanes from '$lib/components/WeekLanes.svelte';
  import WhatHappened from '$lib/components/WhatHappened.svelte';
  import { createWeekStore, provideWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { buildCalendarMonth } from '$lib/utils/calendarMonth.js';
  import { dateToWeekKey } from '$lib/utils/isoWeek.js';
  import { createPopupStore, providePopupStore } from '$lib/utils/popupStore.svelte.js';

  let { data } = $props();

  function todayInTimezone(timezone) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  const initialActiveDate = untrack(() => data.configError ? '' : todayInTimezone(data.config.timezone));
  const store = untrack(() => data.configError
    ? null
    : createWeekStore(data.week, data.config, data.allTimeTotals, initialActiveDate));
  if (store) {
    provideWeekStore(store);
    providePopupStore(createPopupStore());
  }

  function calendarSeedFor(loadData) {
    if (loadData.configError) return null;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: loadData.config.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const [year, month] = today.split('-').map(Number);
    return {
      month: buildCalendarMonth(year, month, loadData.activityWeeks, loadData.weekKey, today),
      range: { start: today, end: today }
    };
  }

  const initialCalendar = untrack(() => calendarSeedFor(data));
  const calendarMonth = $derived(calendarSeedFor(data)?.month ?? null);
  let selectedRange = $state(initialCalendar?.range ?? null);
  let activityWeeks = $state(untrack(() => data.activityWeeks ?? {}));
  let activeDate = $state(initialActiveDate);
  let activeWeekRequestId = 0;
  let requestedWeekKey = '';
  let activeWeekAbortController;

  $effect(() => {
    const reloaded = data;
    if (!store || reloaded.configError) return;
    activeWeekRequestId += 1;
    activeWeekAbortController?.abort();
    activeWeekAbortController = undefined;
    requestedWeekKey = '';
    store.replaceWeek(reloaded.week);
    store.replaceConfig(reloaded.config);
    store.replaceAllTimeTotals(reloaded.allTimeTotals);
    activityWeeks = reloaded.activityWeeks;
  });

  $effect(() => {
    const selectedDate = activeDate;
    if (!store || !selectedDate) return;

    store.setActiveDate(selectedDate);
    const timezone = untrack(() => store.config.timezone);
    const activeWeekKey = dateToWeekKey(`${selectedDate}T12:00:00`, timezone);
    const displayedWeekKey = untrack(() => store.weekKey);
    if (activeWeekKey === displayedWeekKey || activeWeekKey === requestedWeekKey) return;

    requestedWeekKey = activeWeekKey;
    const requestId = ++activeWeekRequestId;
    const controller = new AbortController();
    activeWeekAbortController?.abort();
    activeWeekAbortController = controller;

    void (async () => {
      try {
        const response = await fetch(`${base}/api/week/${activeWeekKey}`, {
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Could not load week ${activeWeekKey}`);
        const fresh = await response.json();
        if (requestId === activeWeekRequestId) store.replaceWeek(fresh);
      } catch (error) {
        if (error?.name !== 'AbortError') console.error(error);
      } finally {
        if (requestId === activeWeekRequestId) {
          requestedWeekKey = '';
          activeWeekAbortController = undefined;
        }
      }
    })();

    return () => {
      if (requestId === activeWeekRequestId) {
        activeWeekRequestId += 1;
        requestedWeekKey = '';
        activeWeekAbortController = undefined;
      }
      controller.abort();
    };
  });

  const leftCount = $derived(
    store ? store.config.tasks.filter((task) => (store.week.counts[task.id] ?? 0) < task.min).length : 0
  );

  $effect(() => {
    if (typeof document === 'undefined') return;
    document.title = leftCount > 0 ? `(${leftCount} left) LinkedIn` : 'LinkedIn';
  });
</script>

<svelte:head>
  <title>{leftCount > 0 ? `(${leftCount} left) LinkedIn` : 'LinkedIn'}</title>
</svelte:head>

{#if data.configError}
  <main class="mx-auto mt-16 max-w-lg px-4 text-center text-base-content">
    <div class="alert alert-error flex-col items-center gap-2" role="alert">
      <h1 class="font-semibold">Config problem</h1>
      <p>{data.configError.message}</p>
      <p class="text-sm opacity-75">Nothing was changed. Fix <code class="rounded bg-base-300 px-1 py-0.5">config/config.json</code> and reload.</p>
    </div>
  </main>
{:else}
  <main class="mx-auto flex max-w-[900px] flex-col gap-5 px-4 pb-16 pt-4 sm:gap-7 sm:px-6 sm:pt-6">
    <AppHeader />
    <Confetti weekKey={store.weekKey} config={store.config} />
    <TotalsRow />
    <WeekGoals weekFourResult={data.weekFourCheck} />
    <div class="flex flex-wrap items-end gap-2" data-slot="active-logging-date">
      <label class="form-control gap-1">
        <span class="label-text text-sm font-semibold text-base-content/70">Logging into</span>
        <input
          class="input input-bordered min-h-10 bg-base-100 text-sm text-base-content"
          type="date"
          bind:value={activeDate}
        />
      </label>
    </div>
    <WeekLanes />
    <DiaryBox weekKey={store.weekKey} initialEntries={store.week.entries} />

    <section data-slot="activity-calendar">
      {#key data}
        <MonthCalendar
          month={calendarMonth}
          config={store.config}
          activityWeeks={data.activityWeeks}
          onRangeChange={(range) => selectedRange = range}
          onWeeksChange={(weeks) => activityWeeks = weeks}
          onActiveDateChange={(date) => activeDate = date}
        />
      {/key}
    </section>

    <section data-slot="what-happened">
      <WhatHappened range={selectedRange} weeksByKey={activityWeeks} config={store.config} />
    </section>
  </main>
{/if}
