<script module>
  let editorSequence = 0;
</script>

<script>
  import { onMount, tick, untrack } from 'svelte';
  import {
    focusFirstInPopup,
    getPopupStore,
    trapPopupFocus,
    usePopupEscapeHandler
  } from '$lib/utils/popupStore.svelte.js';

  let {
    title,
    initial = [],
    parse = null,
    validate = null,
    onSave = () => {},
    onDiscard = () => {}
  } = $props();

  const popupStore = getPopupStore();
  const popupId = `json-list-editor-${++editorSequence}`;
  let dialog = $state();
  let draft = $state(untrack(() => JSON.stringify(initial, null, 2)));
  let error = $state('');
  let saving = $state(false);
  let visible = $state(true);

  usePopupEscapeHandler(popupStore);

  function validationError(cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return /(?:array\s+)?index\s*\d+/i.test(message)
      ? message
      : `Array index unavailable: ${message}`;
  }

  function parseDraft() {
    let parsed;
    try {
      parsed = JSON.parse(draft);
    } catch (cause) {
      throw new Error(`Array index unavailable: Invalid JSON — ${cause.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Array index unavailable: The value must be a JSON array.');
    }

    const parser = parse ?? validate;
    if (!parser) return parsed;

    try {
      const result = parser(parsed);
      if (result === false) throw new Error('The array is invalid.');
      return result === undefined || result === true ? parsed : result;
    } catch (cause) {
      throw new Error(validationError(cause));
    }
  }

  function discard() {
    if (saving) return;
    popupStore.discardCurrent();
  }

  async function save() {
    error = '';

    let parsed;
    try {
      parsed = parseDraft();
    } catch (cause) {
      error = validationError(cause);
      return;
    }

    saving = true;
    try {
      await onSave(parsed);
      visible = false;
      popupStore.close(popupId);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
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
      visible = false;
      onDiscard();
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
    <div class="modal-box flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-4 overflow-hidden bg-base-100 text-base-content">
      <h2 id={`${popupId}-title`} class="text-lg font-semibold">{title}</h2>

      <textarea
        class="textarea textarea-bordered min-h-64 w-full flex-1 resize-y overflow-auto font-mono text-sm"
        bind:value={draft}
        aria-label={`${title} JSON`}
        aria-describedby={error ? `${popupId}-error` : undefined}
        aria-invalid={error ? 'true' : undefined}
        spellcheck="false"
      ></textarea>

      {#if error}
        <p id={`${popupId}-error`} class="alert alert-error py-2 text-sm" role="alert">{error}</p>
      {/if}

      <div class="modal-action mt-0">
        <button class="btn btn-ghost" type="button" onclick={discard} disabled={saving}>Discard</button>
        <button class="btn btn-primary" type="button" onclick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  </dialog>
{/if}
