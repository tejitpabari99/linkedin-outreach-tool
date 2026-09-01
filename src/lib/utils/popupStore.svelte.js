import { getContext, setContext } from 'svelte';

export const POPUP_STORE_KEY = 'linkedin-outreach:popupStore';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function returnFocus(trigger) {
  if (typeof trigger?.focus !== 'function') return;
  queueMicrotask(() => trigger.focus());
}

export function createPopupStore() {
  let current = $state(null);

  function deactivate(popup, discard) {
    if (!popup || current?.id !== popup.id) return false;
    current = null;
    try {
      if (discard) popup.discard();
    } finally {
      returnFocus(popup.trigger);
    }
    return true;
  }

  function open(id, onDiscard = () => {}, trigger = null) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('Popup id must be a non-empty string');
    }
    if (typeof onDiscard !== 'function') {
      throw new TypeError('Popup discard callback must be a function');
    }

    if (current && current.id !== id) deactivate(current, true);
    current = { id, discard: onDiscard, trigger };
  }

  function close(id) {
    if (current?.id !== id) return false;
    return deactivate(current, false);
  }

  function discardCurrent() {
    return deactivate(current, true);
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !current) return;
    event.preventDefault();
    event.stopPropagation();
    discardCurrent();
  }

  return {
    get current() {
      return current;
    },
    open,
    close,
    discardCurrent,
    handleKeydown
  };
}

export function installPopupEscapeHandler(store, target = globalThis.document) {
  if (!target?.addEventListener) return () => {};
  target.addEventListener('keydown', store.handleKeydown);
  return () => target.removeEventListener('keydown', store.handleKeydown);
}

export function usePopupEscapeHandler(store) {
  $effect(() => installPopupEscapeHandler(store));
}

export function focusFirstInPopup(container) {
  const first = container?.querySelector?.(FOCUSABLE_SELECTOR);
  first?.focus();
  return first ?? null;
}

export function trapPopupFocus(event, container) {
  if (event.key !== 'Tab' || !container?.querySelectorAll) return false;
  const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus?.();
    return true;
  }

  const first = focusable[0];
  const last = focusable.at(-1);
  const active = container.ownerDocument?.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

export function providePopupStore(store) {
  setContext(POPUP_STORE_KEY, store);
}

export function getPopupStore() {
  return getContext(POPUP_STORE_KEY);
}
