<script>
  import { base } from '$app/paths';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { bumpLocalCount } from '$lib/utils/applyLocal.js';

  let { entry, weekKey, onResolved, onReparse } = $props();
  const store = getWeekStore();
  let busy = $state(false);

  function taskLabel(id) {
    return store.config.tasks.find((task) => task.id === id)?.label ?? id;
  }

  function metricLabel(id) {
    return store.config.metrics.find((metric) => metric.id === id)?.label ?? id;
  }

  function countSummary(id, delta) {
    if (weekKey !== store.weekKey) {
      return `${taskLabel(id)} ${delta >= 0 ? `+${delta}` : delta}`;
    }

    const before = store.week.counts[id] ?? 0;
    const after = bumpLocalCount({ ...store.week.counts }, id, delta)[id];
    return `${taskLabel(id)} ${before}→${after}`;
  }

  async function apply() {
    if (busy) return;
    busy = true;
    const isLiveWeek = weekKey === store.weekKey;
    const snapshot = isLiveWeek ? $state.snapshot(store.week) : null;
    if (isLiveWeek) {
      for (const [taskId, delta] of Object.entries(entry.proposed.counts)) {
        store.bumpLocalCount(taskId, delta);
      }
      for (const [metricId, value] of Object.entries(entry.proposed.metrics)) {
        store.setLocalMetric(metricId, value);
      }
    }
    try {
      const response = await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/apply`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(`Apply failed: ${response.status}`);
      if (isLiveWeek) {
        const truth = await (await fetch(`${base}/api/week/${weekKey}`)).json();
        store.replaceWeek(truth);
      }
      store.markWeekDirty(weekKey);
      onResolved(weekKey);
    } catch {
      if (isLiveWeek) store.replaceWeek(snapshot);
    } finally {
      busy = false;
    }
  }

  async function discard() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch(`${base}/api/week/${weekKey}/entry/${entry.id}/discard`, {
        method: 'POST'
      });
      if (!response.ok) return;
      store.markWeekDirty(weekKey);
      onResolved(weekKey);
    } catch {
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col gap-2.5 rounded-box border border-base-300 bg-base-100 px-4 py-3 text-base-content">
  <p class="text-sm tabular-nums text-base-content">
    {#each Object.entries(entry.proposed.counts) as [id, delta], i}
      {i > 0 ? ' · ' : ''}{countSummary(id, delta)}
    {/each}
    {#each Object.entries(entry.proposed.metrics) as [id, value], i}
      {Object.keys(entry.proposed.counts).length > 0 || i > 0 ? ' · ' : ''}{metricLabel(id)} →{value}
    {/each}
  </p>
  {#if entry.ignored?.counts?.length || entry.ignored?.metrics?.length}
    <p class="text-xs text-base-content/60">
      not used: {[...(entry.ignored?.counts ?? []), ...(entry.ignored?.metrics ?? [])].join(', ')}
    </p>
  {/if}
  <div class="flex justify-end gap-2">
    <button class="btn btn-ghost min-h-10" onclick={discard} disabled={busy}>Discard</button>
    <button class="btn btn-primary min-h-10" onclick={apply} disabled={busy}>Apply</button>
  </div>
</div>
