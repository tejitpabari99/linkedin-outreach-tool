<script>
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
  import { createPopupStore, providePopupStore } from '$lib/utils/popupStore.svelte.js';

  let { data } = $props();

  const store = untrack(() => data.configError
    ? null
    : createWeekStore(data.week, data.config, data.allTimeTotals));
  if (store) {
    provideWeekStore(store);
    providePopupStore(createPopupStore());
  }

  const initialCalendar = untrack(() => {
    if (data.configError) return null;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: data.config.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const [year, month] = today.split('-').map(Number);
    return {
      month: buildCalendarMonth(year, month, data.activityWeeks, data.weekKey, today),
      range: { start: today, end: today }
    };
  });

  let selectedRange = $state(initialCalendar?.range ?? null);
  let activityWeeks = $state(untrack(() => data.activityWeeks ?? {}));
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
    <WeekLanes />
    <DiaryBox weekKey={store.weekKey} initialEntries={store.week.entries} />

    <section data-slot="activity-calendar">
      <MonthCalendar
        month={initialCalendar.month}
        config={store.config}
        {activityWeeks}
        onRangeChange={(range) => selectedRange = range}
        onWeeksChange={(weeks) => activityWeeks = weeks}
      />
    </section>

    <section data-slot="what-happened">
      <WhatHappened range={selectedRange} weeksByKey={activityWeeks} config={store.config} />
    </section>
  </main>
{/if}
