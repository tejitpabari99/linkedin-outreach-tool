<script>
  import { base } from '$app/paths';
  let { item, weekKey, onSaved } = $props();
  let editing = $state(!item.link);
  let url = $state(item.link?.url ?? '');
  let label = $state(item.link?.label ?? '');
  let error = $state(null);

  function isSafeUrl(u) {
    return typeof u === 'string' && (/^https?:\/\//i.test(u) || (u.startsWith('/') && !u.startsWith('//')));
  }

  function validUrl(u) {
    try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; }
  }

  async function save() {
    if (!validUrl(url)) { error = "needs to look like a web address"; return; }
    if (!label.trim()) { error = "give it a short label"; return; }
    error = null;
    const res = await fetch(`${base}/api/week/${weekKey}/items/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: { url: url.trim(), label: label.trim() } })
    });
    if (!res.ok) {
      error = 'could not save link';
      editing = true;
      return;
    }
    const { item: updated } = await res.json();
    editing = false;
    onSaved(updated);
  }
</script>

{#if editing}
  <div class="link-form">
    <input class="link-url" type="text" bind:value={url} placeholder="https://…" />
    <input class="link-label" type="text" bind:value={label} placeholder="Label" maxlength="80" />
    <button class="link-save" onclick={save}>Save</button>
    {#if item.link}<button class="link-cancel" onclick={() => editing = false}>Cancel</button>{/if}
    {#if error}<p class="link-error">{error}</p>{/if}
  </div>
{:else}
  <div class="link-attached">
    {#if item.link && isSafeUrl(item.link.url)}
      <a class="link-pill" href={item.link.url} target="_blank" rel="noopener">{item.link.label}</a>
    {:else}
      <span class="link-pill">{item.link?.label ?? 'link'}</span>
    {/if}
    <button class="link-edit" onclick={() => editing = true} aria-label="Edit link">edit</button>
  </div>
{/if}

<style>
  .link-form { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .link-form input { min-height: 40px; padding: 0.35rem 0.55rem; border: 1px solid var(--input-border); border-radius: 7px; background: var(--input-bg); color: var(--fg); font: inherit; font-size: 0.78rem; }
  .link-url { flex: 2 1 13rem; }
  .link-label { flex: 1 1 7rem; }
  .link-form input:focus { outline: none; border-color: var(--input-focus-border); }
  .link-save, .link-cancel, .link-edit { min-height: 40px; padding: 0.35rem 0.7rem; border: 1px solid var(--chip-border); border-radius: 7px; background: var(--chip-bg); color: var(--fg-secondary); font: inherit; font-size: 0.76rem; cursor: pointer; }
  .link-error { flex-basis: 100%; margin: 0; color: var(--muted); font-size: 0.72rem; }
  .link-attached { display: flex; align-items: center; gap: 0.4rem; }
  .link-pill { min-width: 40px; min-height: 40px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; padding: 0.35rem 0.85rem; border-radius: 20px; background: var(--chip-bg); border: 1px solid var(--chip-border); color: var(--fg-secondary); text-decoration: none; white-space: nowrap; transition: border-color 0.15s, color 0.15s; }
  .link-pill:hover { border-color: var(--chip-active-border); color: var(--fg); }

  @media (max-width: 480px) {
    .link-form { align-items: stretch; }
    .link-url, .link-label { flex-basis: 100%; }
  }
</style>
