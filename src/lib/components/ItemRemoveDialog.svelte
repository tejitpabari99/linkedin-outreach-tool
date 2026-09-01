<script module>
  let dialogSequence = 0;
</script>

<script>
  import { base } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import { isAllowedUrl } from '$lib/utils/safeUrl.js';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import { dateToWeekKey } from '$lib/utils/isoWeek.js';
  import {
    focusFirstInPopup,
    getPopupStore,
    trapPopupFocus,
    usePopupEscapeHandler
  } from '$lib/utils/popupStore.svelte.js';

  let { taskId } = $props();

  const store = getWeekStore();
  const popupStore = getPopupStore();
  const popupId = `item-remove-dialog-${++dialogSequence}`;

  let dialog = $state();
  let selected = $state(new Set());
  let removing = $state(false);
  let error = $state('');
  let visible = $state(true);

  const items = $derived(
    (store.week.items ?? [])
      .filter((item) => item.taskId === taskId)
      .toSorted((left, right) => Date.parse(right.at) - Date.parse(left.at))
  );

  usePopupEscapeHandler(popupStore);

  function displayText(item) {
    if (typeof item.note === 'string' && item.note.length > 0) return item.note;
    if (typeof item.link?.label === 'string' && item.link.label.length > 0) return item.link.label;
    if (typeof item.link?.url === 'string' && item.link.url.length > 0) return item.link.url;
    return 'Manual activity';
  }

  function safeHref(item) {
    if (typeof item.note === 'string' && item.note.length > 0) {
      return isAllowedUrl(item.note) ? item.note : null;
    }
    return typeof item.link?.url === 'string' && item.link.url.length > 0 && isAllowedUrl(item.link.url)
      ? item.link.url
      : null;
  }

  function localTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
  }

  function toggleItem(itemId, checked) {
    const next = new Set(selected);
    if (checked) next.add(itemId);
    else next.delete(itemId);
    selected = next;
  }

  function discard() {
    if (!removing) popupStore.discardCurrent();
  }

  async function removeSelected() {
    if (removing || selected.size === 0) return;

    removing = true;
    error = '';
    const targetWeekKey = dateToWeekKey(
      `${store.activeDate}T12:00:00`,
      store.config.timezone
    );
    const itemIds = items.filter((item) => selected.has(item.id)).map((item) => item.id);
    if (itemIds.length === 0) {
      selected = new Set();
      removing = false;
      return;
    }

    try {
      const response = await fetch(`${base}/api/week/${targetWeekKey}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, itemIds })
      });
      if (!response.ok) throw new Error('Item removal failed');

      const result = await response.json();
      const currentActiveWeekKey = dateToWeekKey(
        `${store.activeDate}T12:00:00`,
        store.config.timezone
      );
      if (result.week?.week === targetWeekKey && targetWeekKey === currentActiveWeekKey) {
        store.replaceWeek(result.week);
      }
      store.adjustAllTimeTotal(taskId, -result.removedIds.length);
      store.markWeekDirty(targetWeekKey);
      selected = new Set();
      visible = false;
      popupStore.close(popupId);
    } catch {
      error = 'Could not remove yet. Please try again.';
    } finally {
      removing = false;
    }
  }

  function handleBackdrop(event) {
    if (event.target === event.currentTarget) discard();
  }

  onMount(() => {
    const trigger = document.activeElement;
    popupStore.open(popupId, () => {
      selected = new Set();
      error = '';
      visible = false;
    }, trigger);

    tick().then(() => focusFirstInPopup(dialog));
    return () => popupStore.close(popupId);
  });
</script>

{#if visible}
  <dialog
    bind:this={dialog}
    class="modal modal-open p-4"
    open
    aria-labelledby={`${popupId}-title`}
    oncancel={(event) => {
      event.preventDefault();
      discard();
    }}
    onclick={handleBackdrop}
    onkeydown={(event) => trapPopupFocus(event, dialog)}
  >
    <div class="modal-box flex max-h-[calc(100dvh-2rem)] max-w-xl flex-col gap-4 overflow-hidden bg-base-100 text-base-content">
      <h2 id={`${popupId}-title`} class="text-lg font-semibold">Remove activity</h2>

      {#if items.length === 0}
        <p class="alert text-sm">
          No manually logged items to remove. Diary and older count-only activity stays with its record.
        </p>
      {:else}
        <div class="flex flex-1 flex-col gap-2 overflow-y-auto py-1">
          {#each items as item (item.id)}
            <label class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3 hover:bg-base-200">
              <input
                class="checkbox checkbox-sm mt-1"
                type="checkbox"
                checked={selected.has(item.id)}
                onchange={(event) => toggleItem(item.id, event.currentTarget.checked)}
              />
              <span class="min-w-0 flex-1">
                {#if safeHref(item)}
                  <a
                    class="link link-primary break-words"
                    href={safeHref(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick={(event) => event.stopPropagation()}
                  >{displayText(item)}</a>
                {:else}
                  <span class="whitespace-pre-wrap break-words">{displayText(item)}</span>
                {/if}
                <span class="mt-1 block text-xs text-base-content/60">{localTime(item.at)}</span>
              </span>
            </label>
          {/each}
        </div>
      {/if}

      {#if error}
        <p class="alert py-2 text-sm" role="status">{error}</p>
      {/if}

      <div class="modal-action mt-0">
        <button class="btn btn-ghost" type="button" onclick={discard} disabled={removing}>Discard</button>
        <button
          class="btn btn-error"
          type="button"
          onclick={removeSelected}
          disabled={removing || selected.size === 0 || items.length === 0}
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  </dialog>
{/if}
