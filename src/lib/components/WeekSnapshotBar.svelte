<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';

  let { task, weekKey, counts } = $props();
  let count = $state(untrack(() => counts[task.id] ?? 0));

  $effect(() => {
    count = counts[task.id] ?? 0;
  });

  async function correct(delta) {
    const res = await fetch(`${base}/api/week/${weekKey}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counts: { [task.id]: delta } })
    });
    if (!res.ok) return;
    const updated = await res.json();
    count = updated.counts[task.id] ?? 0;
  }
</script>

<div class="flex items-center gap-2 border-b border-base-300 py-2.5 last:border-b-0">
  <span class="min-w-0 flex-1 text-sm text-base-content">{task.label}</span>
  <span class="shrink-0 text-xs tabular-nums text-base-content/60">{count} / {task.min}–{task.target}</span>
  <button class="btn btn-square btn-sm h-10 min-h-10 w-10 min-w-10" onclick={() => correct(-1)} disabled={count === 0} aria-label="Correct: -1">−</button>
  <button class="btn btn-primary btn-sm h-10 min-h-10 min-w-10 px-2" onclick={() => correct(1)} aria-label="+1">+1</button>
</div>
