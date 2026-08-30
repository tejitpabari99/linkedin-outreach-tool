<script>
  import { untrack } from 'svelte';
  import Confetti from '$lib/components/Confetti.svelte';
  import DiaryBox from '$lib/components/DiaryBox.svelte';
  import MetricsRow from '$lib/components/MetricsRow.svelte';
  import PinnedLinks from '$lib/components/PinnedLinks.svelte';
  import WeekLanes from '$lib/components/WeekLanes.svelte';
  import { createWeekStore, provideWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { selectNextTask } from '$lib/utils/selectNext.js';

  let { data } = $props();

  const store = untrack(() => data.configError ? null : createWeekStore(data.week, data.config));
  if (store) provideWeekStore(store);

  const nextTaskId = $derived(store ? selectNextTask(store.config, store.week.counts) : null);
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
  <main class="config-error">
    <p class="config-error-title">Config problem</p>
    <p class="config-error-msg">{data.configError.message}</p>
    <p class="config-error-hint">Nothing was changed. Fix <code>config/config.json</code> and reload.</p>
  </main>
{:else}
  <main class="week-view">
    <Confetti weekKey={store.weekKey} config={store.config} />
    <PinnedLinks links={store.config.links} weekKey={store.weekKey} />
    <MetricsRow sparkline={data.sparkline} headlineMetricId={data.headlineMetricId} />
    <WeekLanes {nextTaskId} />
    <DiaryBox weekKey={store.weekKey} initialEntries={store.week.entries} />

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
  .config-error-msg { color: var(--fg-secondary); margin-bottom: 1rem; }
  .config-error-hint { color: var(--muted); font-size: 0.85rem; }
</style>
