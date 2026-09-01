<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { PRODUCT_TASK_IDS, taskColorClass, taskVisual } from '$lib/utils/taskVisuals.js';

  const store = getWeekStore();
</script>

<ul class="grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3" aria-label="All-time totals">
  {#each PRODUCT_TASK_IDS as taskId (taskId)}
    {@const visual = taskVisual(taskId, store.config)}
    <li class="flex min-h-24 min-w-0 flex-col justify-between gap-2 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm sm:min-h-28 sm:p-4">
      <span class="flex min-w-0 items-center gap-2 text-sm font-medium text-base-content/80">
        <span class={`shrink-0 text-lg font-bold leading-none sm:text-xl ${taskColorClass(taskId)}`}>{visual.symbol}</span>
        <span class="truncate">{visual.short}</span>
      </span>
      <span class="shrink-0 text-2xl font-bold leading-none tabular-nums text-base-content sm:text-3xl">
        {store.allTimeTotals[taskId] ?? 0}
      </span>
    </li>
  {/each}
</ul>
