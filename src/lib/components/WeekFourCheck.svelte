<!-- WeekFourCheck.svelte -->
<script>
  let { result } = $props(); // WeekFourCheckResult from +page.server.js

  function dismissKey(checkNumber) { return `linkedin-outreach:week4check:dismissed:${checkNumber}`; }

  let dismissed = $state(false);
  $effect(() => {
    if (!result?.due) return;
    try { dismissed = localStorage.getItem(dismissKey(result.checkNumber)) === '1'; } catch { dismissed = false; }
  });
  function dismiss() {
    dismissed = true;
    try { localStorage.setItem(dismissKey(result.checkNumber), '1'); } catch {}
  }
</script>

{#if result?.due && !dismissed}
  <div class="week4-card {result.outcome === 'zero' ? 'week4-notable' : ''}">
    <p class="week4-line">{result.line}</p>
    <button class="week4-dismiss" onclick={dismiss}>Got it</button>
  </div>
{/if}

<style>
  .week4-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: 0.7rem 1rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 9px; }
  .week4-notable { border-left: 3px solid var(--fg-secondary); }
  .week4-line { font-size: 0.85rem; color: var(--fg); margin: 0; }
  .week4-dismiss { flex-shrink: 0; background: none; border: 1px solid var(--chip-border); border-radius: 7px;
    padding: 0.3rem 0.7rem; font-size: 0.76rem; color: var(--fg-secondary); cursor: pointer; }
</style>
