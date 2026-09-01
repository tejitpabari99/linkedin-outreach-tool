<script>
  import { base } from '$app/paths';
  import ItemAddDialog from './ItemAddDialog.svelte';
  import ItemRemoveDialog from './ItemRemoveDialog.svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { gradientStops, middleStopPosition, progressPct } from '$lib/utils/progress.js';
  import { taskColorClass, taskVisual } from '$lib/utils/taskVisuals.js';

  let { task } = $props();
  const store = getWeekStore();

  const count = $derived(store.week.counts[task.id] ?? 0);
  const removableItems = $derived(
    (store.week.items ?? []).filter((item) => item.taskId === task.id)
  );
  const progress = $derived(progressPct(count, task.target));
  const guide = $derived(middleStopPosition(task.linePct));
  const stops = $derived(gradientStops(task.linePct));
  const visual = $derived(taskVisual(task.id, task));
  const quota = $derived(task.min === task.target ? `${count} / ${task.target}` : `${count} / ${task.min}–${task.target}`);
  const barLabel = $derived(
    `${visual.short}: ${count} completed, minimum ${task.min}, target ${task.target}, getting-warmer guide at ${guide} percent`
  );
  const fillStyle = $derived(
    `clip-path: inset(0 ${100 - progress}% 0 0); background: linear-gradient(90deg, ${stops.low.colorToken} 0%, ${stops.guide.colorToken} ${stops.guide.position}%, ${stops.complete.colorToken} 100%)`
  );

  let addOpen = $state(false);
  let removeOpen = $state(false);
  let addVersion = $state(0);
  let removeVersion = $state(0);
  let addItemId = $state(null);
  let addWeekKey = $state('');
  let adding = $state(false);
  let pendingAdds = 0;
  let burstTapCount = 0;

  async function processAddQueue() {
    if (adding) return;

    adding = true;
    try {
      while (pendingAdds > 0) {
        const batchSize = Math.min(pendingAdds, 50);
        const weekKey = store.weekKey;
        pendingAdds -= batchSize;

        try {
          const response = await fetch(`${base}/api/week/${weekKey}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: task.id, notes: Array(batchSize).fill(null) })
          });
          if (!response.ok) throw new Error('Item add failed');

          const result = await response.json();
          const createdItems = Array.isArray(result.items) ? result.items : [];
          store.replaceWeek(result.week);
          store.adjustAllTimeTotal(task.id, createdItems.length);
          store.markWeekDirty(weekKey);

          if (pendingAdds > 0) store.bumpLocalCount(task.id, pendingAdds);

          const createdItemId = createdItems[0]?.id;
          const configTask = store.config.tasks.find((candidate) => candidate.id === task.id);
          if (
            burstTapCount === 1 &&
            pendingAdds === 0 &&
            configTask?.showPopup === true &&
            typeof createdItemId === 'string'
          ) {
            removeOpen = false;
            addItemId = createdItemId;
            addWeekKey = weekKey;
            addVersion += 1;
            addOpen = true;
          }
        } catch {
          store.bumpLocalCount(task.id, -batchSize);
        }
      }
    } finally {
      adding = false;
      burstTapCount = 0;
    }
  }

  function tapAdd() {
    pendingAdds += 1;
    burstTapCount += 1;
    store.bumpLocalCount(task.id, 1);
    if (!adding) void processAddQueue();
  }

  function tapRemove() {
    if (removableItems.length === 0) return;

    addOpen = false;
    removeVersion += 1;
    removeOpen = true;
  }
</script>

<article class="card gap-2 border border-base-300 bg-base-100 p-3 text-base-content shadow-sm">
  <h3 class="flex items-center gap-2 text-sm font-semibold">
    <span class={taskColorClass(task.id)} aria-hidden="true">{visual.symbol}</span>
    <span>{visual.short}</span>
  </h3>

  <div class="flex flex-nowrap items-center gap-2">
    <button
      class="btn btn-square btn-sm h-10 min-h-10 w-10 min-w-10 shrink-0 text-lg"
      type="button"
      onclick={tapRemove}
      disabled={count === 0 || removableItems.length === 0}
      aria-label={`Remove logged ${visual.short}`}
    >−</button>

    <div
      class="relative h-10 min-w-0 flex-1 overflow-hidden rounded-box border border-base-300 bg-base-200"
      role="progressbar"
      aria-label={barLabel}
      aria-valuemin="0"
      aria-valuemax={task.target}
      aria-valuenow={Math.min(count, task.target)}
    >
      <div
        class="absolute inset-0 motion-safe:transition-[clip-path] motion-safe:duration-300 motion-reduce:transition-none"
        style={fillStyle}
        aria-hidden="true"
      ></div>
      <div
        class="absolute inset-y-0 z-10 border-l-2 border-dashed border-base-content/70"
        style:left={`${guide}%`}
        aria-hidden="true"
      ></div>
      <div class="absolute inset-y-0 right-0 z-10 w-1 bg-base-content/80" aria-hidden="true"></div>
      <span class="absolute inset-0 z-20 flex items-center justify-center text-xs font-semibold tabular-nums text-base-content drop-shadow-sm">
        {quota}
      </span>
    </div>

    <button
      class="btn btn-square btn-primary btn-sm h-10 min-h-10 w-10 min-w-10 shrink-0 text-lg"
      type="button"
      onclick={tapAdd}
      aria-busy={adding}
      aria-label={`Add logged ${visual.short}`}
    >+</button>
  </div>
</article>

{#if addOpen && addItemId}
  {#key addVersion}
    <ItemAddDialog weekKey={addWeekKey} itemId={addItemId} />
  {/key}
{/if}

{#if removeOpen}
  {#key removeVersion}
    <ItemRemoveDialog taskId={task.id} weekKey={store.weekKey} />
  {/key}
{/if}