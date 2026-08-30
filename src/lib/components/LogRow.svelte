<script>
  import EntryPreview from '$lib/components/EntryPreview.svelte';
  import LinkAttachForm from './LinkAttachForm.svelte';
  import { base } from '$app/paths';

  let { row, config } = $props();
  const task = $derived(row.kind === 'item' ? config.tasks.find(t => t.id === row.taskId) : null);

  async function reparse(weekKey, entryId) {
    const res = await fetch(`${base}/api/week/${weekKey}/entry/${entryId}/reparse`, { method: 'POST' });
    if (!res.ok) return;
    const { entry } = await res.json();
    row.entry = entry;
  }

  function summarizeApplied(applied, cfg) {
    const parts = [];
    for (const [id, v] of Object.entries(applied?.counts ?? {})) parts.push(`${taskLabel(cfg, id)} ${v}`);
    for (const [id, v] of Object.entries(applied?.metrics ?? {})) parts.push(`${metricLabel(cfg, id)} →${v}`);
    return parts.join(' · ');
  }
  function taskLabel(cfg, id) { return cfg.tasks.find(t => t.id === id)?.label ?? id; }
  function metricLabel(cfg, id) { return cfg.metrics.find(m => m.id === id)?.label ?? id; }
</script>

{#if row.kind === 'entry'}
  {@const entry = row.entry}
  <div class="log-row log-entry">
    <p class="log-date">{entry.date}</p>
    <p class="log-text">{entry.text}</p>
    {#if entry.parseStatus === 'pending' && entry.proposed}
      <EntryPreview {entry} weekKey={row.weekKey} onResolved={() => {}} onReparse={() => reparse(row.weekKey, entry.id)} />
    {:else if entry.parseStatus === 'ok'}
      <p class="log-applied">applied: {summarizeApplied(entry.applied, config)}</p>
    {:else if entry.parseStatus === 'discarded'}
      <p class="log-discarded">not applied</p>
    {:else if entry.parseStatus === 'failed'}
      <p class="log-failed">couldn't read it automatically —
        <button class="retry-link" onclick={() => reparse(row.weekKey, entry.id)}>try again</button>
      </p>
    {/if}
  </div>
{:else}
  <div class="log-row log-item">
    <p class="log-date">{row.item.at.slice(0, 10)}</p>
    <p class="log-text">{task?.label ?? row.taskId}</p>
    <LinkAttachForm item={row.item} weekKey={row.weekKey} onSaved={(updated) => { row.item = updated; }} />
  </div>
{/if}

<style>
  .log-row { padding: 0.65rem 0; border-bottom: 1px solid var(--card-border); }
  .log-date { font-size: 0.72rem; color: var(--muted); margin: 0 0 0.2rem; }
  .log-text { font-size: 0.85rem; color: var(--fg); margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .log-applied, .log-discarded { font-size: 0.76rem; color: var(--muted); margin: 0.3rem 0 0; }
  .log-failed { font-size: 0.76rem; color: var(--muted); margin: 0.3rem 0 0; }
</style>
