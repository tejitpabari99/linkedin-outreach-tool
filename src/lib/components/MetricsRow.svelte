<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import Sparkline from './Sparkline.svelte';

  let { sparkline: initialSparkline, headlineMetricId } = $props();
  const store = getWeekStore();

  let sparkline = $state(untrack(() => initialSparkline));
  let editingId = $state(null);
  let draft = $state('');

  function focusInput(node) {
    node.focus();
  }

  function startEdit(metric) {
    editingId = metric.id;
    draft = store.week.metrics[metric.id] ?? '';
  }

  function updateHeadlinePoint(value) {
    sparkline = [...sparkline.slice(0, -1), { week: store.weekKey, value }];
  }

  async function commit(metric) {
    if (editingId !== metric.id) return;

    const value = draft === '' || draft == null ? null : Number(draft);
    editingId = null;
    if (value !== null && !Number.isFinite(value)) return;

    const previous = store.week.metrics[metric.id];
    store.setLocalMetric(metric.id, value);
    if (metric.id === headlineMetricId) updateHeadlinePoint(value);

    try {
      const response = await fetch(`${base}/api/week/${store.weekKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics: { [metric.id]: value } })
      });
      if (!response.ok) throw new Error('Metric update failed');
      const updated = await response.json();
      store.replaceWeek(updated);
      if (metric.id === headlineMetricId) {
        updateHeadlinePoint(updated.metrics[metric.id] ?? null);
      }
    } catch {
      store.setLocalMetric(metric.id, previous);
      if (metric.id === headlineMetricId) updateHeadlinePoint(previous);
    }
  }
</script>

<div class="metrics-row">
  {#each store.config.metrics as metric (metric.id)}
    <div class:headline={metric.headline} class="metric-tile">
      <span class="metric-label">{metric.label}</span>
      {#if editingId === metric.id}
        <input
          class="metric-input"
          type="number"
          bind:value={draft}
          onblur={() => commit(metric)}
          onkeydown={(event) => event.key === 'Enter' && commit(metric)}
          use:focusInput
        />
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

<style>
  .metrics-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.65rem;
  }

  .metric-tile {
    min-width: 0;
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 10px;
  }

  .metric-tile.headline { grid-column: span 2; }
  .metric-label { color: var(--muted); font-size: 0.72rem; }

  .metric-value {
    min-width: 40px;
    min-height: 40px;
    width: fit-content;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--fg);
    font: inherit;
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .metric-input {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 0.2rem 0.35rem;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 6px;
    color: var(--fg);
    font: inherit;
    font-size: 1.05rem;
  }

  .metric-input:focus { border-color: var(--input-focus-border); outline: none; }

  @media (max-width: 600px) {
    .metrics-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .metric-tile.headline { grid-column: span 2; }
  }
</style>
