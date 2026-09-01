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
  <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-200 px-4 py-3 {result.outcome === 'zero' ? 'border-l-4 border-l-secondary' : ''}">
    <p class="m-0 text-sm text-base-content">{result.line}</p>
    <button class="btn btn-outline btn-sm shrink-0" onclick={dismiss}>Got it</button>
  </div>
{/if}
