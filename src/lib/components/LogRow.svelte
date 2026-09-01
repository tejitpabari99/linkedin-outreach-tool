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
  <article class="border-b border-base-300 py-3 text-base-content last:border-b-0">
    <p class="mb-1 text-xs text-base-content/55">{entry.date}</p>
    <p class="whitespace-pre-wrap break-words text-sm">{entry.text}</p>
    {#if entry.parseStatus === 'pending' && entry.proposed}
      <div class="mt-2">
        <EntryPreview {entry} weekKey={row.weekKey} onResolved={() => {}} onReparse={() => reparse(row.weekKey, entry.id)} />
      </div>
    {:else if entry.parseStatus === 'ok'}
      <p class="mt-1.5 text-xs text-base-content/60">applied: {summarizeApplied(entry.applied, config)}</p>
    {:else if entry.parseStatus === 'discarded'}
      <p class="mt-1.5 text-xs text-base-content/60">not applied</p>
    {:else if entry.parseStatus === 'failed'}
      <p class="mt-1.5 text-xs text-base-content/60">couldn't read it automatically —
        <button class="btn btn-link btn-xs min-h-10 px-1 text-primary" onclick={() => reparse(row.weekKey, entry.id)}>try again</button>
      </p>
    {/if}
  </article>
{:else}
  <article class="border-b border-base-300 py-3 text-base-content last:border-b-0">
    <p class="mb-1 text-xs text-base-content/55">{row.item.at.slice(0, 10)}</p>
    <p class="mb-1 whitespace-pre-wrap break-words text-sm">{task?.label ?? row.taskId}</p>
    <LinkAttachForm item={row.item} weekKey={row.weekKey} onSaved={(updated) => { row.item = updated; }} />
  </article>
{/if}
