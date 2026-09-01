<script>
  import { base } from '$app/paths';
  import { untrack } from 'svelte';
  import { isAllowedUrl } from '$lib/utils/safeUrl.js';
  let { item, weekKey, onSaved } = $props();
  let editing = $state(untrack(() => !item.note && !item.link));
  let url = $state(untrack(() => item.link?.url ?? ''));
  let label = $state(untrack(() => item.link?.label ?? ''));
  let error = $state(null);

  async function save() {
    if (url === '' || !isAllowedUrl(url)) { error = "needs to look like a web address"; return; }
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

{#if item.note}
  <div class="flex min-w-0 items-center">
    {#if isAllowedUrl(item.note, { allowRelative: true })}
      <a class="link link-hover max-w-full break-words text-sm text-primary" href={item.note} target="_blank" rel="noopener noreferrer">{item.note}</a>
    {:else}
      <span class="max-w-full whitespace-pre-wrap break-words text-sm text-base-content/75">{item.note}</span>
    {/if}
  </div>
{:else if editing}
  <div class="flex flex-wrap items-center gap-2">
    <input class="input input-bordered min-h-10 min-w-0 flex-[2_1_13rem] bg-base-100 text-sm text-base-content focus:outline-primary max-[480px]:basis-full" type="text" bind:value={url} placeholder="https://…" />
    <input class="input input-bordered min-h-10 min-w-0 flex-[1_1_7rem] bg-base-100 text-sm text-base-content focus:outline-primary max-[480px]:basis-full" type="text" bind:value={label} placeholder="Label" maxlength="80" />
    <button class="btn btn-primary min-h-10" onclick={save}>Save</button>
    {#if item.link}<button class="btn btn-ghost min-h-10" onclick={() => editing = false}>Cancel</button>{/if}
    {#if error}<p class="basis-full text-xs text-error" role="alert">{error}</p>{/if}
  </div>
{:else}
  <div class="flex flex-wrap items-center gap-2">
    {#if item.link && isAllowedUrl(item.link.url, { allowRelative: true })}
      <a class="btn btn-ghost min-h-10 max-w-full normal-case" href={item.link.url} target="_blank" rel="noopener noreferrer">{item.link.label}</a>
    {:else}
      <span class="inline-flex min-h-10 max-w-full items-center rounded-box border border-base-300 bg-base-200 px-3 text-sm text-base-content/60">{item.link?.label ?? 'link'}</span>
    {/if}
    <button class="btn btn-ghost min-h-10" onclick={() => editing = true} aria-label="Edit link">edit</button>
  </div>
{/if}
