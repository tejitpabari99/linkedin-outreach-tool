<script>
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';

  let { links, weekKey } = $props();
  let open = $state(false);
  let importResult = $state(null);

  function isSafeUrl(u) {
    if (typeof u !== 'string' || u === '') return false;
    if (/[\u0000-\u001F]/.test(u)) return false;
    if (u.startsWith('/')) return !/^[/\\]{2}/.test(u.slice(0, 2)) && !u.slice(0, 2).includes('\\');
    try {
      const protocol = new URL(u).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function onImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const body = await file.text();
    const response = await fetch(`${base}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const result = await response.json();
    importResult = response.ok
      ? `Imported. Backup saved to ${result.backup}.`
      : `Import failed: ${result.error}`;
    if (response.ok) await invalidateAll();
    open = false;
  }
</script>

<div class="links-strip">
  {#each links as link}
    {#if isSafeUrl(link.url)}
      <a class="link-pill" href={link.url} target="_blank" rel="noopener">{link.label}</a>
    {:else}
      <span class="link-pill link-pill-empty">{link.label}</span>
    {/if}
  {/each}
  <div class="data-affordance">
    <button
      class="link-pill data-toggle"
      onclick={() => open = !open}
      aria-label="Export or import data"
    >Data</button>
    {#if open}
      <div class="data-menu">
        <a class="data-action" href="{base}/api/export?week={weekKey}">Export this week</a>
        <a class="data-action" href="{base}/api/export/all">Export everything</a>
        <label class="data-action data-import">
          Import…
          <input type="file" accept="application/json" hidden onchange={onImportFile} />
        </label>
      </div>
    {/if}
    {#if importResult}<p class="data-import-result">{importResult}</p>{/if}
  </div>
</div>

<style>
  .links-strip { display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.25rem; }
  .link-pill { min-width: 40px; min-height: 40px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; padding: 0.35rem 0.85rem; border-radius: 20px; background: var(--chip-bg); border: 1px solid var(--chip-border); color: var(--fg-secondary); text-decoration: none; white-space: nowrap; transition: border-color 0.15s, color 0.15s; }
  .link-pill:not(.link-pill-empty):hover { border-color: var(--chip-active-border); color: var(--fg); }
  .link-pill-empty { color: var(--muted); opacity: 0.45; cursor: default; }
  .data-affordance { position: relative; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; }
  .data-toggle { font-family: inherit; cursor: pointer; }
  .data-menu { display: flex; flex-direction: column; min-width: 10.5rem; padding: 0.35rem; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; box-shadow: 0 0.4rem 1rem var(--card-border); }
  .data-action { min-height: 40px; padding: 0.4rem 0.5rem; display: flex; align-items: center; color: var(--fg-secondary); font-size: 0.76rem; text-decoration: none; white-space: nowrap; border-radius: 5px; cursor: pointer; }
  .data-action:hover { background: var(--row-hover); color: var(--fg); }
  .data-import-result { max-width: 16rem; color: var(--muted); font-size: 0.7rem; text-align: right; }
</style>
