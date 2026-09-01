<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { formatRange } from '$lib/utils/formatRange.js';
  import { dateToWeekKey, weekKeyToRange } from '$lib/utils/isoWeek.js';
  import EntryPreview from './EntryPreview.svelte';

  let { weekKey, initialEntries } = $props();
  const store = getWeekStore();
  const todayLocal = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: store.config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  const initialEntry = untrack(() => findLatestPendingPreview(initialEntries));

  let text = $state('');
  let date = $state(todayLocal());
  let phase = $state(initialEntry ? 'preview' : 'idle');
  let activeEntry = $state(initialEntry);
  let entryWeekKey = $state(untrack(() => weekKey));
  const targetWeekLabel = $derived.by(() => {
    const targetKey = dateToWeekKey(date, store.config.timezone);
    if (targetKey === weekKey) return null;
    const { start, end } = weekKeyToRange(targetKey);
    return `Logging into ${formatRange(start, end)} (${targetKey})`;
  });

  function findLatestPendingPreview(entries) {
    const candidates = entries.filter((entry) => entry.parseStatus === 'pending' && entry.proposed);
    if (!candidates.length) return null;
    return candidates.reduce((latest, entry) => (latest.at > entry.at ? latest : entry));
  }

  async function save() {
    if (!date || !text.trim()) return;
    phase = 'saving';
    try {
      const response = await fetch(`${base}/api/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, text })
      });
      if (!response.ok) throw new Error('Entry save failed');
      const { week: landedWeek, entry } = await response.json();
      if (!entry || typeof entry.parseStatus !== 'string') throw new Error('Invalid entry response');
      text = '';
      activeEntry = entry;
      entryWeekKey = landedWeek;
      phase = entry.parseStatus === 'failed' ? 'failed' : 'preview';
    } catch {
      phase = 'idle';
    }
  }

  async function reparse() {
    phase = 'saving';
    try {
      const response = await fetch(
        `${base}/api/week/${entryWeekKey}/entry/${activeEntry.id}/reparse`,
        { method: 'POST' }
      );
      if (!response.ok) throw new Error('Entry reparse failed');
      const { entry } = await response.json();
      if (!entry || typeof entry.parseStatus !== 'string') throw new Error('Invalid entry response');
      activeEntry = entry;
      phase = entry.parseStatus === 'failed' ? 'failed' : 'preview';
    } catch {
      phase = 'failed';
    }
  }

  function onResolved() {
    activeEntry = null;
    entryWeekKey = weekKey;
    phase = 'idle';
  }

  function retry(event) {
    event.preventDefault();
    reparse();
  }
</script>

<div class="flex flex-col gap-2 text-base-content">
  {#if phase === 'idle' || phase === 'saving'}
    <textarea
      class="textarea textarea-bordered min-h-24 w-full resize-y bg-base-100 text-sm text-base-content focus:outline-primary"
      bind:value={text}
      placeholder="What happened today?"
      rows="4"
      disabled={phase === 'saving'}
    ></textarea>
    <div class="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <div class="flex flex-col">
        <input
          class="input input-bordered min-h-10 bg-base-100 text-sm text-base-content"
          type="date"
          bind:value={date}
          max={todayLocal()}
          disabled={phase === 'saving'}
        />
        {#if targetWeekLabel}<p class="mt-1 text-xs text-base-content/60">{targetWeekLabel}</p>{/if}
      </div>
      <button class="btn btn-primary min-h-10 sm:ml-auto" onclick={save} disabled={phase === 'saving' || !date || !text.trim()}>
        {#if phase === 'saving'}<span class="loading loading-spinner loading-xs motion-reduce:animate-none"></span> Saving…{:else}Save{/if}
      </button>
    </div>
  {:else if phase === 'preview'}
    <EntryPreview
      entry={activeEntry}
      weekKey={entryWeekKey}
      onResolved={onResolved}
      onReparse={reparse}
    />
  {:else if phase === 'failed'}
    <div class="rounded-box border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-base-content/70">
      <p>
        Saved — couldn't read it automatically. The counters still work, or
        <a class="link link-hover inline-flex min-h-10 items-center text-primary" href="#retry" onclick={retry}>try again</a>.
      </p>
    </div>
  {/if}
</div>
