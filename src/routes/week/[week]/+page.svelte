<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import LogRow from '$lib/components/LogRow.svelte';
  import WeekSnapshotBar from '$lib/components/WeekSnapshotBar.svelte';
  import WeekSnapshotMetrics from '$lib/components/WeekSnapshotMetrics.svelte';
  import { createWeekStore, provideWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { formatRange } from '$lib/utils/formatRange.js';
  import { mergeLogRows } from '$lib/utils/mergeLogRows.js';

  let { data } = $props();

  const store = untrack(() => data.configError ? null : createWeekStore(data.week, data.config));
  if (store) provideWeekStore(store);

  let rows = $state(untrack(() => data.week ? mergeLogRows([], [data.week]) : []));
  $effect(() => {
    rows = data.week ? mergeLogRows([], [data.week]) : [];
  });

  $effect(() => {
    if (store && store.historyVersion > 0) {
      const key = store.lastDirtyWeek ?? data.weekKey;
      fetch(`${base}/api/week/${key}`)
        .then((r) => r.json())
        .then((fresh) => {
          store.replaceWeek(fresh);
          rows = mergeLogRows([], [fresh]);
        });
    }
  });
</script>

{#if data.configError}
  <main class="mx-auto mt-16 max-w-lg px-4 text-center text-base-content">
    <div class="alert alert-error flex-col items-center gap-2" role="alert">
      <h1 class="font-semibold">Config problem</h1>
      <p>{data.configError.message}</p>
      <p class="text-sm opacity-75">Nothing was changed. Fix <code class="rounded bg-base-300 px-1 py-0.5">config/config.json</code> and reload.</p>
    </div>
  </main>
{:else}
  <main class="mx-auto flex max-w-[900px] flex-col gap-6 px-4 pb-16 pt-6 text-base-content sm:px-6 sm:pt-8">
    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-base font-semibold">{formatRange(data.week.start, data.week.end)} · {data.weekKey}</h1>
      {#if data.isCurrentWeek}
        <a class="link link-hover text-sm text-primary" href="{base}/">This is the current week — go there</a>
      {/if}
    </header>

    <WeekSnapshotMetrics week={store.week} config={data.config} />

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {#each data.config.lanes as lane (lane.id)}
        <section class="rounded-box border border-base-300 bg-base-100 px-4 py-3" aria-labelledby={`snapshot-lane-${lane.id}`}>
          <h2 id={`snapshot-lane-${lane.id}`} class="mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/70">{lane.label}</h2>
          {#each data.config.tasks.filter(t => t.lane === lane.id) as task (task.id)}
            <WeekSnapshotBar {task} weekKey={data.weekKey} counts={store.week.counts} />
          {/each}
        </section>
      {/each}
    </div>

    <section class="rounded-box border border-base-300 bg-base-100 px-4" aria-label="Week activity log">
      {#each rows as row (row.id)}
        <LogRow {row} config={data.config} />
      {/each}
    </section>
  </main>
{/if}
