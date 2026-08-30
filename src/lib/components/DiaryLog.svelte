<script>
  import LogRow from './LogRow.svelte';
  import { mergeLogRows } from '$lib/utils/mergeLogRows.js';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { base } from '$app/paths';

  let { initial, oldestLoadedWeek: initialOldest, config } = $props();
  const store = getWeekStore();

  let rows = $state(initial);
  let oldestLoaded = $state(initialOldest);
  let loading = $state(false);
  let exhausted = $state(false);

  async function loadEarlier() {
    loading = true;
    const listRes = await fetch(`${base}/api/weeks?before=${oldestLoaded}&limit=4`);
    const { weeks: olderKeys } = await listRes.json();
    if (olderKeys.length === 0) { exhausted = true; loading = false; return; }
    const fetched = await Promise.all(olderKeys.map(wk => fetch(`${base}/api/week/${wk}`).then(r => r.json())));
    rows = mergeLogRows(rows, fetched);
    oldestLoaded = olderKeys[olderKeys.length - 1];
    loading = false;
  }

  $effect(() => {
    const dirty = store.historyVersion > 0 ? store.lastDirtyWeek : null;
    if (!dirty) return;
    fetch(`${base}/api/week/${dirty}`).then(r => r.json()).then(fresh => {
      rows = mergeLogRows(rows.filter(r => r.weekKey !== dirty), [fresh]);
    });
  });
</script>

<div class="diary-log">
  {#each rows as row (row.id)}
    <LogRow {row} {config} />
  {/each}
  {#if !exhausted}
    <button class="load-earlier" onclick={loadEarlier} disabled={loading}>
      {loading ? 'Loading…' : 'Load earlier'}
    </button>
  {/if}
</div>
