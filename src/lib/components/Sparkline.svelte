<script>
  let { points } = $props();

  const known = $derived(
    points
      .map((point, index) => ({ ...point, index }))
      .filter((point) => Number.isFinite(point.value))
  );
  const min = $derived(known.length ? Math.min(...known.map((point) => point.value)) : 0);
  const max = $derived(known.length ? Math.max(...known.map((point) => point.value)) : 0);
  const range = $derived(Math.max(1, max - min));

  function coord(index, total, value) {
    const x = (index / Math.max(1, total - 1)) * 100;
    const y = 24 - ((value - min) / range) * 20 - 2;
    return `${x},${y}`;
  }
</script>

<svg viewBox="0 0 100 24" preserveAspectRatio="none" class="sparkline" aria-hidden="true">
  {#if known.length < 2}
    <line x1="0" y1="20" x2="100" y2="20" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2,3" opacity="0.4" />
    {#if known.length === 1}
      <circle cx="50" cy="20" r="1.8" fill="var(--fg-secondary)" />
    {/if}
  {:else}
    <polyline
      points={known.map((point) => coord(point.index, points.length, point.value)).join(' ')}
      fill="none"
      stroke="var(--fg)"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  {/if}
</svg>

<style>
  .sparkline { width: 100%; height: 28px; display: block; }
</style>
