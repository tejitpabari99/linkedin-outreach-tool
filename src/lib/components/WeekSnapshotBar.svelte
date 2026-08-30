<script>
  import { base } from '$app/paths';

  let { task, weekKey, counts } = $props();
  let count = $state(counts[task.id] ?? 0);

  $effect(() => {
    count = counts[task.id] ?? 0;
  });

  async function correct(delta) {
    const res = await fetch(`${base}/api/week/${weekKey}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counts: { [task.id]: delta } })
    });
    const updated = await res.json();
    count = updated.counts[task.id] ?? 0;
  }
</script>

<div class="snapshot-bar">
  <span class="task-label">{task.label}</span>
  <span class="count-label">{count} / {task.min}–{task.target}</span>
  <button onclick={() => correct(-1)} disabled={count === 0} aria-label="Correct: -1">−</button>
  <button onclick={() => correct(1)} aria-label="+1">+1</button>
</div>

<style>
  .snapshot-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0; border-bottom: 1px solid var(--card-border); }
  .task-label { flex: 1; color: var(--fg); font-size: 0.88rem; }
  .count-label { color: var(--muted); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
  button { min-width: 40px; min-height: 40px; border: 1px solid var(--chip-border); border-radius: 7px; background: var(--chip-bg); color: var(--fg); cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--chip-active-border); background: var(--chip-active-bg); }
  button:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
