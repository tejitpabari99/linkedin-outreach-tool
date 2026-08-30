<script>
  import { onDestroy } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';

  let { weekKey, config } = $props();
  const store = getWeekStore();

  const allCleared = $derived(
    config.tasks.every((task) => (store.week.counts[task.id] ?? 0) >= task.min)
  );
  let fired = $state(false);
  let mountedOnce = false;
  let clearTimer;

  function storageKey(wk) {
    return `linkedin-outreach:confetti:${wk}`;
  }

  function alreadyFired(wk) {
    try {
      return localStorage.getItem(storageKey(wk)) === '1';
    } catch {
      return false;
    }
  }

  function markFired(wk) {
    try {
      localStorage.setItem(storageKey(wk), '1');
    } catch {
      // Best-effort cosmetic bookkeeping; storage can be unavailable in private browsing.
    }
  }

  $effect(() => {
    if (!mountedOnce) {
      mountedOnce = true;
      if (allCleared && !alreadyFired(weekKey)) markFired(weekKey);
      return;
    }

    if (allCleared && !alreadyFired(weekKey)) {
      fired = true;
      markFired(weekKey);
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        fired = false;
      }, 1200);
    }
  });

  onDestroy(() => clearTimeout(clearTimer));
</script>

{#if fired}
  <div class="confetti-burst" aria-hidden="true">
    {#each Array(14) as _, i}
      <span class="piece" style="--i:{i}; --hue:{(i * 47) % 360}"></span>
    {/each}
  </div>
{/if}

<style>
  .confetti-burst { position: fixed; top: 4rem; left: 50%; width: 0; height: 0; z-index: 50; pointer-events: none; }
  .piece {
    position: absolute;
    width: 6px;
    height: 10px;
    background: hsl(var(--hue), 65%, 55%);
    left: calc((var(--i) - 7) * 6px);
    animation: fall 1.1s ease-out forwards;
    animation-delay: calc(var(--i) * 0.02s);
  }
  @keyframes fall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(90px) rotate(200deg); opacity: 0; }
  }
</style>
