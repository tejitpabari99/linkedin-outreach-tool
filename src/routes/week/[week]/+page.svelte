<script>
  import WeekSnapshotMetrics from '$lib/components/WeekSnapshotMetrics.svelte';
  import WeekSnapshotBar from '$lib/components/WeekSnapshotBar.svelte';
  import LogRow from '$lib/components/LogRow.svelte';
  import { createWeekStore, provideWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { formatRange } from '$lib/utils/formatRange.js';
  import { mergeLogRows } from '$lib/utils/mergeLogRows.js';
  import { base } from '$app/paths';

  let { data } = $props();

  const store = data.configError ? null : createWeekStore(data.week, data.config);
  if (store) provideWeekStore(store);

  let rows = $state(data.week ? mergeLogRows([], [data.week]) : []);
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
  <main class="config-error">
    <p class="config-error-title">Config problem</p>
    <p class="config-error-msg">{data.configError.message}</p>
    <p class="config-error-hint">Nothing was changed. Fix <code>config/config.json</code> and reload.</p>
  </main>
{:else}
  <main class="week-snapshot">
    <p class="week-range">{formatRange(data.week.start, data.week.end)} · {data.weekKey}</p>
    {#if data.isCurrentWeek}<a class="back-link" href="{base}/">This is the current week — go there</a>{/if}

    <WeekSnapshotMetrics week={store.week} config={data.config} />

    <div class="lanes">
      {#each data.config.lanes as lane (lane.id)}
        <div class="lane">
          <span class="lane-label">{lane.label}</span>
          {#each data.config.tasks.filter(t => t.lane === lane.id) as task (task.id)}
            <WeekSnapshotBar {task} weekKey={data.weekKey} counts={store.week.counts} />
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

<style>
  .week-snapshot { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1.5rem; }
  .week-range { color: var(--fg); font-size: 1rem; margin: 0; }
  .back-link { color: var(--fg-secondary); font-size: 0.82rem; }
  .lanes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .lane { padding: 0.85rem 1rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; }
  .lane-label { display: block; margin-bottom: 0.25rem; color: var(--fg-secondary); font-size: 0.78rem; font-weight: 600; }
  .config-error { max-width: 500px; margin: 4rem auto; padding: 1.5rem; text-align: center; }
  .config-error-title { font-size: 1.1rem; font-weight: 600; color: var(--fg); margin-bottom: 0.75rem; }
  .config-error-msg { color: var(--fg-secondary); margin-bottom: 1rem; }
  .config-error-hint { color: var(--muted); font-size: 0.85rem; }
  @media (max-width: 640px) {
    .week-snapshot { padding: 1.25rem 1rem 3rem; }
    .lanes { grid-template-columns: 1fr; }
  }
</style>
