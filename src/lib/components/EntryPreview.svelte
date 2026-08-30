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

<div class="preview">
  <p class="preview-summary">
    {#each Object.entries(entry.proposed.counts) as [id, delta], i}
      {i > 0 ? ' · ' : ''}{countSummary(id, delta)}
    {/each}
    {#each Object.entries(entry.proposed.metrics) as [id, value], i}
      {Object.keys(entry.proposed.counts).length > 0 || i > 0 ? ' · ' : ''}{metricLabel(id)} →{value}
    {/each}
  </p>
  {#if entry.ignored?.counts?.length || entry.ignored?.metrics?.length}
    <p class="preview-ignored">
      not used: {[...(entry.ignored?.counts ?? []), ...(entry.ignored?.metrics ?? [])].join(', ')}
    </p>
  {/if}
  <div class="preview-actions">
    <button class="btn-ghost" onclick={discard} disabled={busy}>Discard</button>
    <button class="btn-primary" onclick={apply} disabled={busy}>Apply</button>
  </div>
</div>

<style>
  .preview { display: flex; flex-direction: column; gap: 0.65rem; padding: 0.85rem 1rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; }
  .preview-summary { color: var(--fg); font-size: 0.88rem; font-variant-numeric: tabular-nums; }
  .preview-ignored { color: var(--muted); font-size: 0.76rem; }
  .preview-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .preview-actions button { min-width: 40px; min-height: 40px; padding: 0.45rem 0.9rem; border-radius: 7px; font: inherit; font-size: 0.82rem; cursor: pointer; }
  .preview-actions button:disabled { opacity: 0.4; cursor: wait; }
  .btn-ghost { background: var(--chip-bg); border: 1px solid var(--chip-border); color: var(--fg-secondary); }
  .btn-primary { background: var(--fg); border: 1px solid var(--fg); color: var(--bg); font-weight: 600; }
</style>
