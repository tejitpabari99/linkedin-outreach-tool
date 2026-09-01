<script>
  let { week, config } = $props();
</script>

<div class="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
  {#each config.metrics as metric (metric.id)}
    <div class="flex min-w-0 flex-col gap-1 rounded-box border border-base-300 bg-base-100 px-3.5 py-3">
      <span class="text-xs text-base-content/60">{metric.label}</span>
      <span class="text-lg font-semibold tabular-nums text-base-content">{week.metrics[metric.id] ?? '—'}</span>
    </div>
  {/each}
</div>
