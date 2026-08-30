<!-- HistoryStrip.svelte -->
<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { formatRange } from '$lib/utils/formatRange.js';
  import { summarizeWeekStatus } from '$lib/utils/historyStatus.js';
  import { base } from '$app/paths';

  let { weeks, weeksCompletedCount, currentWeekKey } = $props();
  const store = getWeekStore();

  let localWeeks = $state(weeks);
  let localCount = $state(weeksCompletedCount);

  $effect(() => {
    const dirty = store.historyVersion > 0 ? store.lastDirtyWeek : null;
    if (!dirty) return;
    fetch(`${base}/api/week/${dirty}`).then(r => r.json()).then(fresh => {
      const summary = summarizeWeekStatus(fresh, store.config);
      localWeeks = localWeeks.map(w => (w.week === dirty ? summary : w));
      localCount = localWeeks.filter(w => w.status === 'filled').length;
    });
  });
</script>

<div class="history-strip-wrap">
  {#if localCount === 0 && localWeeks.length <= 1}
    <p class="history-empty-note">Your history starts this week.</p>
  {:else}
    <p class="history-count">{localCount} week{localCount === 1 ? '' : 's'} completed</p>
  {/if}
  <div class="history-strip">
    {#each localWeeks as w (w.week)}
      <a
        class="history-square {w.status} {w.week === currentWeekKey ? 'current' : ''}"
        href="{base}/week/{w.week}"
        title="{formatRange(w.start, w.end)} · {w.status === 'empty' ? 'not logged' : `${w.clearedCount}/${w.total} cleared`}"
      ></a>
    {/each}
  </div>
</div>

<style>
  .history-strip { display: flex; gap: 4px; overflow-x: auto; padding: 0.25rem 0; }
  .history-square { flex-shrink: 0; width: 14px; height: 14px; border-radius: 3px; display: block; transition: transform 0.1s; }
  .history-square:hover { transform: scale(1.25); }
  .history-square.filled { background: var(--fg); opacity: 0.85; }
  .history-square.partial { background: var(--muted); opacity: 0.5; }
  .history-square.empty { background: transparent; border: 1px dashed var(--card-border); opacity: 0.55; }
  .history-square.current { outline: 1px solid var(--fg-secondary); outline-offset: 2px; }
  .history-count, .history-empty-note { font-size: 0.78rem; color: var(--muted); margin: 0 0 0.4rem; }
</style>
