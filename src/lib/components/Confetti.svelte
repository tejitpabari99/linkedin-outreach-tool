<script>
  import { onDestroy } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';

  let { weekKey, config } = $props();
  const store = getWeekStore();

  const allCleared = $derived(
    config.tasks.every((task) => (store.week.counts[task.id] ?? 0) >= task.min)
  );
  let fired = $state(false);
  const pieceColors = ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-info', 'bg-warning'];
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
      <span
        class="piece {pieceColors[i % pieceColors.length]}"
        style={`left: ${(i - 7) * 6}px; animation-delay: ${i * 0.02}s`}
      ></span>
    {/each}
  </div>
{/if}

<style>
  .confetti-burst { position: fixed; top: 4rem; left: 50%; width: 0; height: 0; z-index: 50; pointer-events: none; }
  .piece {
    position: absolute;
    width: 6px;
    height: 10px;
    animation: fall 1.1s ease-out forwards;
  }
  @keyframes fall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(90px) rotate(200deg); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .piece { animation: none; transform: none; opacity: 0.85; }
  }
</style>
