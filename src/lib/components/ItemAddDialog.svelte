<script module>
  let dialogSequence = 0;
</script>

<script>
  import { base } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import {
    focusFirstInPopup,
    getPopupStore,
    trapPopupFocus,
    usePopupEscapeHandler
  } from '$lib/utils/popupStore.svelte.js';

  let { taskId, weekKey } = $props();

  const store = getWeekStore();
  const popupStore = getPopupStore();
  const popupId = `item-add-dialog-${++dialogSequence}`;

  let dialog = $state();
  let values = $state(['']);
  let saving = $state(false);
  let error = $state('');
  let visible = $state(true);

  const notes = $derived(values.map((value) => value.trim()).filter(Boolean));

  usePopupEscapeHandler(popupStore);

  function updateValue(index, value) {
    values[index] = value;
    if (index === values.length - 1 && value.trim() && values.length < 50) {
      values.push('');
    }
  }

  function discard() {
    if (!saving) popupStore.discardCurrent();
  }

  async function save() {
    if (saving || notes.length === 0) return;

    saving = true;
    error = '';
    const submittedNotes = [...notes];

    try {
      const response = await fetch(`${base}/api/week/${weekKey}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, notes: submittedNotes })
      });
      if (!response.ok) throw new Error('Item add failed');

      const result = await response.json();
      store.replaceWeek(result.week);
      store.adjustAllTimeTotal(taskId, submittedNotes.length);
      store.markWeekDirty(weekKey);
      values = [''];
      visible = false;
      popupStore.close(popupId);
    } catch {
      error = 'Could not save yet. Please try again.';
    } finally {
      saving = false;
    }
  }

  function handleBackdrop(event) {
    if (event.target === event.currentTarget) discard();
  }

  onMount(() => {
    const trigger = document.activeElement;
    popupStore.open(popupId, () => {
      values = [''];
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
    <div class="modal-box flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-4 overflow-hidden bg-base-100 text-base-content">
      <h2 id={`${popupId}-title`} class="text-lg font-semibold">Add activity</h2>

      <div class="flex flex-1 flex-col gap-3 overflow-y-auto py-1">
        {#each values as value, index (index)}
          <input
            class="input input-bordered w-full"
            type="text"
            value={value}
            maxlength="4000"
            placeholder={index === 0 ? 'URL or note' : 'Another URL or note'}
            aria-label={`Activity note ${index + 1}`}
            oninput={(event) => updateValue(index, event.currentTarget.value)}
          />
        {/each}
      </div>

      {#if error}
        <p class="alert py-2 text-sm" role="status">{error}</p>
      {/if}

      <div class="modal-action mt-0">
        <button class="btn btn-ghost" type="button" onclick={discard} disabled={saving}>Discard</button>
        <button class="btn btn-primary" type="button" onclick={save} disabled={saving || notes.length === 0}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </dialog>
{/if}
