<script>
  let { week, config } = $props();
</script>

<div class="snapshot-metrics">
  {#each config.metrics as metric (metric.id)}
    <div class="metric-tile">
      <span class="metric-label">{metric.label}</span>
      <span class="metric-value">{week.metrics[metric.id] ?? '—'}</span>
    </div>
  {/each}
</div>

<style>
  .snapshot-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.65rem; }
  .metric-tile { min-width: 0; padding: 0.75rem 0.85rem; display: flex; flex-direction: column; gap: 0.25rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; }
  .metric-label { color: var(--muted); font-size: 0.72rem; }
  .metric-value { color: var(--fg); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
</style>
