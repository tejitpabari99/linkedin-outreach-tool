<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { PRODUCT_TASK_IDS, taskVisual } from '$lib/utils/taskVisuals.js';

  const store = getWeekStore();

  function symbolClass(colorRole) {
    return {
      secondary: 'text-secondary',
      accent: 'text-accent',
      info: 'text-info',
      primary: 'text-primary',
      call: 'text-warning'
    }[colorRole] ?? 'text-base-content';
  }
</script>

<ul class="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="All-time totals">
  {#each PRODUCT_TASK_IDS as taskId (taskId)}
    {@const visual = taskVisual(taskId, store.config)}
    <li class="flex min-w-0 items-baseline justify-between gap-1.5 rounded-box border border-base-300 bg-base-100 px-2 py-1.5 shadow-xs">
      <span class="flex min-w-0 items-baseline gap-1.5 text-xs text-base-content">
        <span class={`shrink-0 font-semibold ${symbolClass(visual.colorRole)}`}>{visual.symbol}</span>
        <span class="truncate">{visual.short}</span>
      </span>
      <span class="shrink-0 text-sm font-semibold tabular-nums text-base-content">
        {store.allTimeTotals[taskId] ?? 0}
      </span>
    </li>
  {/each}
</ul>
