<script>
  import '../app.css';
  import { onMount } from 'svelte';

  let { children } = $props();
  let dark = $state(true);

  onMount(() => {
    try {
      dark = localStorage.getItem('theme') !== 'light';
    } catch {
      dark = true;
    }
    document.documentElement.dataset.theme = dark ? 'synthwave' : 'cupcake';
  });

  function toggleTheme() {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? 'synthwave' : 'cupcake';
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  }
</script>

<header class="navbar min-h-14 border-b border-base-300 bg-base-200 px-6 text-base-content">
  <span class="text-sm font-semibold tracking-wide">LinkedIn Outreach</span>
  <button class="btn btn-ghost btn-square ml-auto" onclick={toggleTheme} aria-label="Toggle theme">
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
</header>

{@render children()}
