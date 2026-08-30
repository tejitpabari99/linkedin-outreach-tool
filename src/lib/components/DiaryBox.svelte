<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import EntryPreview from './EntryPreview.svelte';

  let { weekKey, initialEntries } = $props();
  const initialEntry = untrack(() => findLatestPendingPreview(initialEntries));

  let text = $state('');
  let date = $state(new Date().toISOString().slice(0, 10));
  let phase = $state(initialEntry ? 'preview' : 'idle');
  let activeEntry = $state(initialEntry);
  let entryWeekKey = $state(untrack(() => weekKey));

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

<div class="diary-box">
  {#if phase === 'idle' || phase === 'saving'}
    <textarea
      class="diary-textarea"
      bind:value={text}
      placeholder="What happened today?"
      rows="4"
      disabled={phase === 'saving'}
    ></textarea>
    <div class="diary-controls">
      <input
        class="date-input"
        type="date"
        bind:value={date}
        max={new Date().toISOString().slice(0, 10)}
        disabled={phase === 'saving'}
      />
      <button class="save-btn" onclick={save} disabled={phase === 'saving' || !date || !text.trim()}>
        {#if phase === 'saving'}<span class="spinner-sm"></span> Saving…{:else}Save{/if}
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
    <div class="diary-failed">
      <p class="failed-note">
        Saved — couldn't read it automatically. The counters still work, or
        <a class="retry-link" href="#retry" onclick={retry}>try again</a>.
      </p>
    </div>
  {/if}
</div>

<style>
  .diary-box { display: flex; flex-direction: column; gap: 0.6rem; }
  .diary-textarea { width: 100%; box-sizing: border-box; padding: 0.75rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 8px; color: var(--fg); font-size: 0.88rem; font-family: inherit; resize: vertical; outline: none; }
  .diary-textarea:focus { border-color: var(--input-focus-border); }
  .diary-controls { display: flex; gap: 0.6rem; align-items: center; }
  .date-input { min-height: 40px; padding: 0.45rem 0.6rem; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 7px; color: var(--fg); font-size: 0.8rem; }
  .save-btn { min-width: 40px; min-height: 40px; padding: 0.5rem 1.1rem; background: var(--fg); color: var(--bg); border: none; border-radius: 7px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
  .save-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .spinner-sm { display: inline-block; width: 11px; height: 11px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; margin-right: 0.3rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .diary-failed { font-size: 0.82rem; color: var(--muted); }
  .retry-link { min-height: 40px; display: inline-flex; align-items: center; color: var(--fg-secondary); text-decoration: underline; cursor: pointer; }
  @media (max-width: 640px) { .diary-controls { flex-direction: column; align-items: stretch; } }
</style>
