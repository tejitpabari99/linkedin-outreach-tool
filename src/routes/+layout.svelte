<script>
  import { onMount } from 'svelte';

  let { children } = $props();
  let dark = $state(true);

  onMount(() => {
    try {
      const saved = localStorage.getItem('theme');
      dark = saved ? saved === 'dark' : true;
      document.documentElement.classList.toggle('light', !dark);
    } catch {}
  });

  function toggleTheme() {
    dark = !dark;
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
    document.documentElement.classList.toggle('light', !dark);
  }
</script>

<header>
  <span class="brand">LinkedIn Outreach</span>
  <button class="icon-link theme-toggle" onclick={toggleTheme} aria-label="Toggle theme">
    {#if dark}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 2V1m0 22v-1M4.22 4.22l-.71-.71m16.98 16.98-.71-.71M2 12H1m22 0h-1M4.22 19.78l-.71.71M20.49 3.51l-.71.71" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    {/if}
  </button>
</header>

{@render children()}

<style>
  :global(:root) {
    --bg: #0d0f12;
    --fg: #f3f4f6;
    --fg-secondary: #c4c8cf;
    --card-bg: #15181d;
    --card-border: #2a2f37;
    --card-hover-bg: #1b1f25;
    --card-hover-border: #3b424d;
    --muted: #8d949f;
    --header-border: #252a31;
    --icon-bg: #1d2128;
    --input-bg: #111419;
    --input-border: #343a44;
    --input-focus-border: #7d8795;
    --input-placeholder: #707782;
    --chip-bg: #1a1e24;
    --chip-border: #303641;
    --chip-active-bg: #2b313a;
    --chip-active-border: #626d7b;
    --chip-active-color: #f8f9fa;
    --row-hover: #191d23;
    --row-divider: #252a31;
    --tag-bg: #20252c;
    --tag-border: #373e49;
    --tag-color: #d4d8de;
    --table-header-color: #aeb4bd;
    --table-header-border: #303641;
    --modal-bg: #15181d;
    --modal-border: #343a44;
    --modal-inner-bg: #101318;
    --modal-inner-border: #292f38;
    --prose-fg: #d8dbe0;
    --prose-heading: #f5f6f7;
    --prose-hr: #303641;
    --prose-code-bg: #22272e;
    --prose-pre-bg: #101318;
    --prose-pre-border: #2f3540;
    --section-border: #292f37;
  }

  :global(:root.light) {
    --bg: #f7f8fa;
    --fg: #17191d;
    --fg-secondary: #4f5661;
    --card-bg: #ffffff;
    --card-border: #dfe3e8;
    --card-hover-bg: #f3f5f7;
    --card-hover-border: #c5cbd3;
    --muted: #747c87;
    --header-border: #dde1e6;
    --icon-bg: #eceff3;
    --input-bg: #ffffff;
    --input-border: #cfd5dc;
    --input-focus-border: #687383;
    --input-placeholder: #939aa4;
    --chip-bg: #f0f2f5;
    --chip-border: #d6dbe1;
    --chip-active-bg: #e2e6eb;
    --chip-active-border: #87909d;
    --chip-active-color: #181b20;
    --row-hover: #f1f3f6;
    --row-divider: #e1e5e9;
    --tag-bg: #edf0f3;
    --tag-border: #d4d9df;
    --tag-color: #424952;
    --table-header-color: #5d6570;
    --table-header-border: #d7dce2;
    --modal-bg: #ffffff;
    --modal-border: #d4d9df;
    --modal-inner-bg: #f5f6f8;
    --modal-inner-border: #dfe3e8;
    --prose-fg: #353a42;
    --prose-heading: #17191d;
    --prose-hr: #d9dee4;
    --prose-code-bg: #e9edf1;
    --prose-pre-bg: #f2f4f6;
    --prose-pre-border: #d7dce2;
    --section-border: #dce1e6;
  }

  :global(*),
  :global(*::before),
  :global(*::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html) {
    font-size: 110%;
  }

  :global(body) {
    min-height: 100vh;
    background: var(--bg);
    color: var(--fg);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    transition: background 0.2s ease, color 0.2s ease;
  }

  header {
    min-height: 3.5rem;
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--header-border);
  }

  .brand {
    color: var(--fg);
    font-size: 0.95rem;
    font-weight: 650;
    letter-spacing: 0.01em;
  }

  .icon-link {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--icon-bg);
    border: 1px solid var(--card-border);
    border-radius: 0.5rem;
    color: var(--fg-secondary);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .icon-link:hover {
    color: var(--fg);
    border-color: var(--card-hover-border);
    background: var(--card-hover-bg);
  }

  .theme-toggle svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
