<script>
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import JsonListEditor from '$lib/components/JsonListEditor.svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { isAllowedUrl } from '$lib/utils/safeUrl.js';
  import {
    focusFirstInPopup,
    getPopupStore,
    trapPopupFocus,
    usePopupEscapeHandler
  } from '$lib/utils/popupStore.svelte.js';
  import { PRODUCT_TASK_IDS, taskColorClass, taskVisual } from '$lib/utils/taskVisuals.js';

  const LINKS_POPUP = 'app-header-links';
  const DATA_POPUP = 'app-header-data';
  const KEYBOARD_POPUP = 'app-header-keyboard';

  const store = getWeekStore();
  const popupStore = getPopupStore();
  const taskVisuals = PRODUCT_TASK_IDS.map((taskId) => ({ taskId, ...taskVisual(taskId) }));

  let linksOpen = $state(false);
  let dataOpen = $state(false);
  let keyboardOpen = $state(false);
  let linksEditorOpen = $state(false);
  let importResult = $state('');
  let importing = $state(false);
  let dark = $state(true);

  let linksButton;
  let dataButton;
  let keyboardButton;
  let linksDropdown;
  let dataDropdown;
  let keyboardDialog = $state();

  usePopupEscapeHandler(popupStore);

  function popupIs(id) {
    return popupStore.current?.id === id;
  }

  function toggleDropdown(id, trigger) {
    if (popupIs(id)) {
      popupStore.discardCurrent();
      return;
    }

    popupStore.open(id, () => {
      if (id === LINKS_POPUP) linksOpen = false;
      if (id === DATA_POPUP) dataOpen = false;
    }, trigger);

    if (id === LINKS_POPUP) linksOpen = true;
    if (id === DATA_POPUP) dataOpen = true;
  }

  function handleOutsideClick(event) {
    if (popupIs(LINKS_POPUP) && !linksDropdown?.contains(event.target)) {
      popupStore.discardCurrent();
    } else if (popupIs(DATA_POPUP) && !dataDropdown?.contains(event.target)) {
      popupStore.discardCurrent();
    }
  }

  function openLinksEditor() {
    linksEditorOpen = true;
  }

  function closeLinksEditor() {
    linksEditorOpen = false;
    tick().then(() => linksButton?.focus());
  }

  function parseLinks(value) {
    return value.map((link, index) => {
      if (!link || typeof link !== 'object' || Array.isArray(link)) {
        throw new Error(`Link at array index ${index} must be an object.`);
      }
      if (typeof link.name !== 'string') {
        throw new Error(`Link at array index ${index} must have a string "name".`);
      }
      if (typeof link.link !== 'string') {
        throw new Error(`Link at array index ${index} must have a string "link".`);
      }
      if (!isAllowedUrl(link.link)) {
        throw new Error(`Link at array index ${index} must be empty or use http/https.`);
      }
      return { name: link.name, link: link.link };
    });
  }

  async function errorMessage(response, fallback) {
    try {
      const body = await response.json();
      const details = Array.isArray(body.details) && body.details.length > 0
        ? `: ${body.details.map((detail) => detail.message ?? detail).join('; ')}`
        : '';
      return `${body.error ?? fallback}${details}`;
    } catch {
      return fallback;
    }
  }

  async function saveLinks(links) {
    const currentResponse = await fetch(`${base}/api/config`);
    if (!currentResponse.ok) {
      throw new Error(await errorMessage(currentResponse, 'Could not read the latest config.'));
    }

    const latestConfig = await currentResponse.json();
    const nextConfig = {
      ...latestConfig,
      links: links.map((link) => ({ label: link.name, url: link.link }))
    };

    const saveResponse = await fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig)
    });
    if (!saveResponse.ok) {
      throw new Error(await errorMessage(saveResponse, 'Could not save links.'));
    }

    store.replaceConfig(nextConfig);
    closeLinksEditor();
    await tick();
  }

  async function importFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    importing = true;
    importResult = 'Importing…';
    try {
      const response = await fetch(`${base}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await file.text()
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, 'Import failed.'));
      }

      const result = await response.json();
      importResult = result.backup
        ? `Imported. Backup saved to ${result.backup}.`
        : 'Imported successfully.';
      await invalidateAll();
    } catch (cause) {
      importResult = `Import failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    } finally {
      importing = false;
      input.value = '';
    }
  }

  async function openKeyboard() {
    if (popupIs(KEYBOARD_POPUP)) {
      popupStore.discardCurrent();
      return;
    }

    popupStore.open(KEYBOARD_POPUP, () => keyboardOpen = false, keyboardButton);
    keyboardOpen = true;
    await tick();
    focusFirstInPopup(keyboardDialog);
  }

  function closeKeyboard() {
    if (popupIs(KEYBOARD_POPUP)) popupStore.discardCurrent();
  }

  function handleKeyboardBackdrop(event) {
    if (event.target === event.currentTarget) closeKeyboard();
  }

  function toggleTheme() {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? 'synthwave' : 'cupcake';
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  }

  onMount(() => {
    try {
      dark = localStorage.getItem('theme') !== 'light';
    } catch {
      dark = true;
    }
    document.documentElement.dataset.theme = dark ? 'synthwave' : 'cupcake';
  });
</script>

<svelte:window onclick={handleOutsideClick} />

<header class="navbar min-h-14 flex-nowrap border-b border-base-300 bg-base-200 px-2 text-base-content sm:px-6">
  <span class="flex-none text-sm font-semibold tracking-wide">
    LinkedIn<span class="hidden sm:inline"> Outreach</span>
  </span>

  <div class="ml-auto flex min-w-0 flex-nowrap items-center gap-0.5">
    <div bind:this={linksDropdown} class="dropdown dropdown-bottom relative flex-none">
      <button
        bind:this={linksButton}
        class="btn btn-ghost btn-sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={linksOpen}
        onclick={() => toggleDropdown(LINKS_POPUP, linksButton)}
      >Links</button>

      {#if linksOpen}
        <ul class="dropdown-content menu absolute top-full -left-16 z-50 mt-2 max-h-[min(28rem,calc(100dvh-5rem))] w-64 max-w-[calc(100vw-1rem)] flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 shadow-xl sm:left-0" role="menu">
          {#each store.config.links as link}
            <li>
              {#if link.url !== '' && isAllowedUrl(link.url)}
                <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
              {:else}
                <span class="cursor-default opacity-60" aria-disabled="true">{link.label}</span>
              {/if}
            </li>
          {/each}
          <li class="mt-1 border-t border-base-300 pt-1">
            <button type="button" onclick={openLinksEditor}>Edit</button>
          </li>
        </ul>
      {/if}
    </div>

    <div bind:this={dataDropdown} class="dropdown dropdown-bottom relative flex-none">
      <button
        bind:this={dataButton}
        class="btn btn-ghost btn-sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={dataOpen}
        onclick={() => toggleDropdown(DATA_POPUP, dataButton)}
      >Data</button>

      {#if dataOpen}
        <div class="dropdown-content absolute top-full -right-20 z-50 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-box border border-base-300 bg-base-100 p-2 shadow-xl sm:right-0">
          <ul class="menu w-full p-0" role="menu">
            <li><a href="{base}/api/export?week={store.weekKey}">Export this week</a></li>
            <li><a href="{base}/api/export/all">Export everything</a></li>
            <li>
              <label class={importing ? 'pointer-events-none opacity-60' : ''}>
                Import
                <input
                  class="hidden"
                  type="file"
                  accept="application/json,.json"
                  disabled={importing}
                  onchange={importFile}
                />
              </label>
            </li>
          </ul>
          {#if importResult}
            <p class="mt-2 break-words border-t border-base-300 px-3 pt-2 text-xs" role="status">{importResult}</p>
          {/if}
        </div>
      {/if}
    </div>

    <button
      bind:this={keyboardButton}
      class="btn btn-ghost btn-sm flex-none"
      type="button"
      aria-haspopup="dialog"
      onclick={openKeyboard}
    >Keyboard</button>

    <button class="btn btn-ghost btn-square btn-sm flex-none" type="button" onclick={toggleTheme} aria-label="Toggle theme">
      {#if dark}
        <svg class="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 2V1m0 22v-1M4.22 4.22l-.71-.71m16.98 16.98-.71-.71M2 12H1m22 0h-1M4.22 19.78l-.71.71M20.49 3.51l-.71.71" />
        </svg>
      {:else}
        <svg class="size-5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      {/if}
    </button>
  </div>
</header>

{#if linksEditorOpen}
  <JsonListEditor
    title="Edit links"
    initial={store.config.links.map((link) => ({ name: link.label, link: link.url }))}
    parse={parseLinks}
    onSave={saveLinks}
    onDiscard={closeLinksEditor}
  />
{/if}

{#if keyboardOpen}
  <dialog
    bind:this={keyboardDialog}
    class="modal modal-open p-4"
    open
    aria-labelledby="keyboard-shortcuts-title"
    oncancel={(event) => {
      event.preventDefault();
      closeKeyboard();
    }}
    onclick={handleKeyboardBackdrop}
    onkeydown={(event) => trapPopupFocus(event, keyboardDialog)}
  >
    <div class="modal-box max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto bg-base-100 text-base-content">
      <div class="flex items-center justify-between gap-4">
        <h2 id="keyboard-shortcuts-title" class="text-lg font-semibold">Keyboard shortcuts</h2>
        <button class="btn btn-ghost btn-sm" type="button" onclick={closeKeyboard}>Close</button>
      </div>

      <div class="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 text-sm">
        {#each taskVisuals as visual}
          <span class="text-lg" aria-hidden="true">{visual.symbol}</span>
          <span>{visual.short}</span>
          <span class="inline-flex items-center gap-2">
            <span class={`size-3 rounded-full ${taskColorClass(visual.taskId, 'background')}`} aria-hidden="true"></span>
            <span class="text-xs opacity-70">{visual.colorRole}</span>
          </span>
        {/each}
        <kbd class="kbd kbd-sm">Escape</kbd>
        <span class="col-span-2">discard / close any popup</span>
      </div>
    </div>
  </dialog>
{/if}
