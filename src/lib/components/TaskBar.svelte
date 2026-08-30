<script>
  import { base } from '$app/paths';
  import { onDestroy } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { debounce } from '$lib/utils/weekKeyFmt.js';

  let { task, isNext } = $props();
  const store = getWeekStore();

  const count = $derived(store.week.counts[task.id] ?? 0);
  const cleared = $derived(count >= task.min);
  const maxed = $derived(count >= task.target);
  const progress = $derived(task.target > 0 ? Math.min(100, (count / task.target) * 100) : 100);
  const minimumPosition = $derived(task.target > 0 ? Math.min(100, (task.min / task.target) * 100) : 100);

  let mounted = false;
  let wasCleared = false;
  let justCleared = $state(false);
  let settleTimer;

  $effect(() => {
    const isCleared = cleared;
    if (!mounted) {
      mounted = true;
      wasCleared = isCleared;
      return;
    }

    if (isCleared && !wasCleared) {
      justCleared = true;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        justCleared = false;
      }, 550);
    }
    wasCleared = isCleared;
  });

  onDestroy(() => clearTimeout(settleTimer));

  let pendingDelta = 0;
  let flushing = false;
  let syncFailed = $state(false);

  async function flushPending() {
    if (flushing || pendingDelta === 0) return;

    const delta = pendingDelta;
    pendingDelta = 0;
    flushing = true;

    try {
      const response = await fetch(`${base}/api/week/${store.weekKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts: { [task.id]: delta } })
      });
      if (!response.ok) throw new Error('Count update failed');

      const updated = await response.json();
      store.replaceWeek(updated);
      if (pendingDelta !== 0) store.bumpLocalCount(task.id, pendingDelta);
      syncFailed = false;
    } catch {
      pendingDelta += delta;
      syncFailed = true;
    } finally {
      flushing = false;
      if (pendingDelta !== 0 && !syncFailed) flush();
    }
  }

  const flush = debounce(flushPending, 500);

  async function tap(delta) {
    if (task.link === 'required' && delta > 0) {
      const res = await fetch(`${base}/api/week/${store.weekKey}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, link: null })
      });
      if (!res.ok) return;
      const { counts } = await res.json();
      store.replaceWeek({ ...store.week, counts });
      store.markWeekDirty(store.weekKey);
      return;
    }
    store.bumpLocalCount(task.id, delta);
    pendingDelta += delta;
    flush();
  }

  let editingQuota = $state(false);
  let draftMin = $state(0);
  let draftTarget = $state(0);
  let quotaError = $state(null);
  let savingQuota = $state(false);

  function startQuotaEdit() {
    draftMin = task.min;
    draftTarget = task.target;
    quotaError = null;
    editingQuota = true;
  }

  function cancelQuotaEdit() {
    editingQuota = false;
    quotaError = null;
  }

  async function commitQuota() {
    const min = Number(draftMin);
    const target = Number(draftTarget);
    if (min > target) {
      quotaError = "min can't be above target";
      return;
    }

    savingQuota = true;
    quotaError = null;
    try {
      const currentResponse = await fetch(`${base}/api/config`);
      if (!currentResponse.ok) throw new Error('Config read failed');
      const current = await currentResponse.json();
      const nextConfig = {
        ...current,
        tasks: current.tasks.map((currentTask) =>
          currentTask.id === task.id ? { ...currentTask, min, target } : currentTask
        )
      };
      const saveResponse = await fetch(`${base}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig)
      });
      if (!saveResponse.ok) {
        const detail = await saveResponse.json();
        quotaError = detail.error;
        return;
      }

      const localTask = store.config.tasks.find((candidate) => candidate.id === task.id);
      localTask.min = min;
      localTask.target = target;
      editingQuota = false;
    } catch {
      quotaError = 'Not saved yet — will retry';
    } finally {
      savingQuota = false;
    }
  }
</script>

<div class="task-bar" class:cleared class:maxed class:just-cleared={justCleared}>
  <div class="task-row">
    <span class="task-label">{task.label}</span>
    {#if isNext}<span class="next-flag">next</span>{/if}
    {#if syncFailed}<span class="sync-dot" title="Not saved yet — will retry">•</span>{/if}
  </div>

  <div class="bar-track">
    <div class="bar-fill" style:width={`${progress}%`}></div>
    <div class="min-mark" style:left={`${minimumPosition}%`} title={`min ${task.min}`}></div>
    <div class="target-mark" title={`target ${task.target}`}></div>
  </div>

  <div class="bar-controls">
    <span class="count-label">{count} / {task.min}–{task.target}</span>
    <button class="quota-toggle" onclick={startQuotaEdit} aria-label={`Edit quota for ${task.label}`}>✎</button>
    <button class="tap-minus" onclick={() => tap(-1)} disabled={count === 0} aria-label="Correct: -1">−</button>
    <button class="tap-plus" onclick={() => tap(1)} aria-label="+1">+1</button>
  </div>

  {#if editingQuota}
    <div class="quota-editor">
      <label>
        <span>min</span>
        <input type="number" min="0" step="1" bind:value={draftMin} />
      </label>
      <label>
        <span>target</span>
        <input type="number" min="0" step="1" bind:value={draftTarget} />
      </label>
      <button onclick={commitQuota} disabled={savingQuota} aria-label="Save quota">✓</button>
      <button onclick={cancelQuotaEdit} disabled={savingQuota} aria-label="Cancel quota edit">×</button>
    </div>
    {#if quotaError}<p class="quota-error">{quotaError}</p>{/if}
  {/if}
</div>

<style>
  .task-bar {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.85rem 1rem;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    transition: background 0.5s ease, border-color 0.5s ease, padding 0.5s ease, opacity 0.5s ease;
  }

  .task-bar.cleared {
    background: transparent;
    border-color: var(--card-border);
    padding: 0.5rem 1rem;
    opacity: 0.55;
  }

  .task-bar.just-cleared { animation: settle 0.55s ease; }

  @keyframes settle {
    0% { transform: scale(1); }
    30% { transform: scale(1.015); }
    100% { transform: scale(1); }
  }

  .task-row { display: flex; align-items: center; gap: 0.4rem; }
  .task-label { flex: 1; font-size: 0.88rem; color: var(--fg); font-weight: 500; }
  .cleared .task-label { color: var(--muted); font-weight: 400; }
  .next-flag { font-size: 0.68rem; padding: 0.1rem 0.45rem; border-radius: 20px; background: var(--chip-active-bg); border: 1px solid var(--chip-active-border); color: var(--fg); }
  .sync-dot { color: var(--muted); font-size: 0.9rem; opacity: 0.7; }
  .bar-track { position: relative; height: 8px; background: var(--input-bg); border: 1px solid var(--card-border); border-radius: 6px; overflow: visible; }
  .bar-fill { height: 100%; background: var(--fg); opacity: 0.7; border-radius: 6px; transition: width 0.3s ease; }
  .cleared .bar-fill { background: var(--muted); }
  .min-mark, .target-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--fg-secondary); opacity: 0.6; }
  .min-mark { transform: translateX(-1px); }
  .target-mark { right: -1px; }
  .bar-controls { display: flex; align-items: center; gap: 0.5rem; }
  .count-label { font-size: 0.76rem; color: var(--muted); font-variant-numeric: tabular-nums; flex: 1; }

  .tap-plus, .tap-minus {
    min-width: 40px;
    min-height: 40px;
    border-radius: 7px;
    border: 1px solid var(--chip-border);
    background: var(--chip-bg);
    color: var(--fg);
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.15s, border-color 0.15s;
  }

  .tap-plus:hover, .tap-minus:hover:not(:disabled) { border-color: var(--chip-active-border); background: var(--chip-active-bg); }
  .tap-minus:disabled { opacity: 0.3; cursor: not-allowed; }

  .quota-toggle, .quota-editor button {
    border: 1px solid var(--chip-border);
    border-radius: 6px;
    background: var(--chip-bg);
    color: var(--fg-secondary);
    cursor: pointer;
  }

  .quota-toggle { width: 40px; height: 40px; }
  .quota-editor { display: flex; align-items: end; gap: 0.4rem; flex-wrap: wrap; }
  .quota-editor label { display: flex; flex-direction: column; gap: 0.15rem; color: var(--muted); font-size: 0.68rem; }
  .quota-editor input { width: 4.5rem; min-height: 40px; padding: 0.3rem; border: 1px solid var(--input-border); border-radius: 6px; background: var(--input-bg); color: var(--fg); font: inherit; }
  .quota-editor input:focus { outline: none; border-color: var(--input-focus-border); }
  .quota-editor button { width: 40px; height: 40px; }
  .quota-editor button:disabled { opacity: 0.4; cursor: wait; }
  .quota-error { color: var(--muted); font-size: 0.72rem; }
</style>
