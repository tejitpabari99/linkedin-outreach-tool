<script>
  import { untrack } from 'svelte';
  import { activityRange, buildActivityIndex } from '$lib/utils/activityTally.js';
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
  const isSingleDay = $derived(selectedRange.start === selectedRange.end);

  function tallies(day) {
    return PRODUCT_TASK_IDS
      .map(taskId => ({ taskId, count: day.counts[taskId] ?? 0, visual: taskVisual(taskId, config) }))
      .filter(tally => tally.count !== 0);
  }

  function uniquePostItems(items) {
    const seenIds = new Set();
    return items.filter(item => {
      if (!item.text) return false;
      if (typeof item.id !== 'string') return true;
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });
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
  <ul class="mt-2 divide-y divide-base-300">
    {#each days as day (day.date)}
      {@const dayTallies = tallies(day)}
      {@const postItems = uniquePostItems(day.postItems)}
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
        {#if postItems.length > 0}
          <div class="mt-1.5 flex flex-wrap gap-1.5 pl-0 sm:pl-27">
            {#each postItems as item, i (item.id ?? `${day.date}:${i}`)}
              {#if item.href && isAllowedUrl(item.href)}
                <a
                  class="link link-hover max-w-full break-words rounded-md bg-base-200 px-2 py-1 text-xs text-primary"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >{item.text}</a>
              {:else}
                <span class="max-w-full break-words rounded-md bg-base-200 px-2 py-1 text-xs text-base-content/70">{item.text}</span>
              {/if}
            {/each}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</section>
