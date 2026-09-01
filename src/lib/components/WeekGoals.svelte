<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { formatRange } from '$lib/utils/formatRange.js';
  import { selectNextTask } from '$lib/utils/selectNext.js';
  import { PRODUCT_TASK_IDS, taskColorClass, taskVisual } from '$lib/utils/taskVisuals.js';
  import WeekFourCheck from './WeekFourCheck.svelte';

  let { weekFourResult = null } = $props();
  const store = getWeekStore();

  let nextTaskId = $derived(selectNextTask(store.config, store.week.counts));
  let nextTask = $derived(store.config.tasks.find((task) => task.id === nextTaskId));

  function goalText(min, target) {
    return min === target ? `${target}` : `${min}–${target}`;
  }
</script>

<section class="rounded-box border border-base-300 bg-base-100 p-3" aria-labelledby="week-goals-heading">
  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
    <h2 id="week-goals-heading" class="text-sm font-semibold text-base-content">This week’s goals</h2>
    <p class="text-xs text-base-content/60">Mon–Sun · {formatRange(store.week.start, store.week.end)}</p>
  </div>

  <ul class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-5">
    {#each PRODUCT_TASK_IDS as taskId (taskId)}
      {@const task = store.config.tasks.find((candidate) => candidate.id === taskId)}
      {@const visual = taskVisual(taskId, store.config)}
      {@const count = store.week.counts[taskId] ?? 0}
      {@const min = task?.min ?? 0}
      {@const target = task?.target ?? min}
      <li class="flex min-w-0 items-baseline justify-between gap-2 border-b border-base-300 px-1 py-1 text-xs">
        <span class="flex min-w-0 items-baseline gap-1.5 text-base-content">
          <span class={`shrink-0 font-semibold ${taskColorClass(taskId)}`}>{visual.symbol}</span>
          <span class="truncate">{visual.short}</span>
        </span>
        <span class="shrink-0 tabular-nums text-base-content/70">{count} / {goalText(min, target)}</span>
      </li>
    {/each}
  </ul>

  <p class="mt-2 text-xs text-base-content/70">
    {#if nextTaskId !== null && nextTask}
      {@const visual = taskVisual(nextTaskId, store.config)}
      Next: <span class={`font-semibold ${taskColorClass(nextTaskId)}`}>{visual.symbol}</span>
      {visual.short} · {(nextTask.min ?? 0) - (store.week.counts[nextTaskId] ?? 0)} to the minimum
    {:else}
      This week is done. Anything from here is extra.
    {/if}
  </p>

  {#if weekFourResult?.due}
    <div class="mt-2">
      <WeekFourCheck result={weekFourResult} />
    </div>
  {/if}
</section>
