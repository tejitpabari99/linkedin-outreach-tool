<script>
  import { untrack } from 'svelte';
  import {
    activityRange,
    activityRangeAggregate,
    buildActivityIndex
  } from '$lib/utils/activityTally.js';
  import { isAllowedUrl } from '$lib/utils/safeUrl.js';
  import { PRODUCT_TASK_IDS, taskColorClass, taskVisual } from '$lib/utils/taskVisuals.js';

  let { range = null, weeksByKey = {}, config } = $props();

  const today = untrack(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()));
  const selectedRange = $derived(
    range?.start && range?.end ? range : { start: today, end: today }
  );
  const activityIndex = $derived(buildActivityIndex(Object.values(weeksByKey ?? {}), config));
  const days = $derived(activityRange(activityIndex, selectedRange.start, selectedRange.end));
  const aggregate = $derived(activityRangeAggregate(
    activityIndex,
    selectedRange.start,
    selectedRange.end
  ));
  const isSingleDay = $derived(selectedRange.start === selectedRange.end);

  function tallies({ counts }) {
    return PRODUCT_TASK_IDS
      .map(taskId => ({ taskId, count: counts[taskId] ?? 0, visual: taskVisual(taskId, config) }))
      .filter(tally => tally.count !== 0);
  }

  function noteText(item) {
    return item.note ?? item.link?.label ?? item.link?.url ?? '';
  }

  function noteHref(item) {
    if (item.note) return isAllowedUrl(item.note) ? item.note : null;
    return isAllowedUrl(item.link?.url) ? item.link.url : null;
  }

  function dateLabel(date) {
    return new Intl.DateTimeFormat('en-US', {
      weekday: isSingleDay ? 'long' : 'short',
      month: 'short',
      day: 'numeric',
      year: isSingleDay ? 'numeric' : undefined,
      timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
  }
</script>

<section class="rounded-box border border-base-300 bg-base-100 p-3 text-base-content" aria-labelledby="what-happened-heading">
  <h2 id="what-happened-heading" class="text-sm font-semibold">What happened</h2>
  {#if !isSingleDay}
    {@const rangeTallies = tallies(aggregate)}
    <div class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md bg-base-200 px-2.5 py-2 text-xs tabular-nums" aria-label="Selected range activity total">
      <span class="font-semibold">Range total:</span>
      {#if rangeTallies.length > 0}
        {#each rangeTallies as tally, i (tally.taskId)}
          {#if i > 0}<span class="text-base-content/35" aria-hidden="true">·</span>{/if}
          <span>
            <span class={taskColorClass(tally.taskId)} aria-hidden="true">{tally.visual.symbol}</span>
            {tally.count} {tally.visual.short.toLowerCase()}
          </span>
        {/each}
      {:else}
        <span class="text-base-content/50">Nothing recorded</span>
      {/if}
    </div>
  {/if}
  <ul class="mt-2 divide-y divide-base-300">
    {#each days as day (day.date)}
      {@const dayTallies = tallies(day)}
      <li class="py-2 first:pt-0 last:pb-0">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <time class="min-w-24 text-xs font-medium text-base-content/60" datetime={day.date}>{dateLabel(day.date)}</time>
          {#if dayTallies.length > 0}
            <p class="flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs tabular-nums" aria-label={`${day.date} activity tally`}>
              {#each dayTallies as tally, i (tally.taskId)}
                {#if i > 0}<span class="text-base-content/35" aria-hidden="true">·</span>{/if}
                <span>
                  <span class={taskColorClass(tally.taskId)} aria-hidden="true">{tally.visual.symbol}</span>
                  {tally.count} {tally.visual.short.toLowerCase()}
                </span>
              {/each}
            </p>
          {:else}
            <p class="text-xs text-base-content/50">Nothing recorded</p>
          {/if}
        </div>
        {#if day.noteItems.length > 0}
          <ul class="mt-1.5 space-y-1 pl-0 sm:pl-27">
            {#each day.noteItems as item, i (item.id ?? `${day.date}:${i}`)}
              {@const visual = taskVisual(item.taskId, config)}
              {@const href = noteHref(item)}
              <li class="flex min-w-0 items-start gap-1.5 text-xs">
                <span class={taskColorClass(item.taskId)} aria-hidden="true">{visual.symbol}</span>
                {#if href}
                  <a
                    class="link link-hover min-w-0 break-words text-primary"
                    {href}
                    target="_blank"
                    rel="noopener"
                  >{noteText(item)}</a>
                {:else}
                  <span class="min-w-0 break-words text-base-content/70">{noteText(item)}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>
</section>
