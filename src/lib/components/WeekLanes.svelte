<script>
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';
  import TaskBar from './TaskBar.svelte';

  let { nextTaskId } = $props();
  const store = getWeekStore();
</script>

<div class="lanes">
  {#each store.config.lanes as lane (lane.id)}
    <div class="lane">
      <div class="lane-header">
        <span class="lane-label">{lane.label}</span>
        <span class="lane-blurb">{lane.blurb}</span>
      </div>
      {#each store.config.tasks.filter((task) => task.lane === lane.id) as task (task.id)}
        <TaskBar {task} isNext={task.id === nextTaskId} />
      {/each}
    </div>
  {/each}
</div>

{#if nextTaskId === null}
  <p class="week-status">This week is done. Anything from here is extra.</p>
{/if}

<style>
  .lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .lane { display: flex; flex-direction: column; gap: 0.6rem; }
  .lane-header { display: flex; flex-direction: column; gap: 0.1rem; margin-bottom: 0.2rem; }
  .lane-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .lane-blurb { font-size: 0.76rem; color: var(--muted); opacity: 0.75; }
  .week-status { text-align: center; font-size: 0.85rem; color: var(--muted); margin-top: 0.5rem; }

  @media (max-width: 700px) {
    .lanes { grid-template-columns: 1fr; }
  }
</style>
