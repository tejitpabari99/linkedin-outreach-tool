<script>
  import { base } from '$app/paths';
  import JsonListEditor from './JsonListEditor.svelte';
  import TaskBar from './TaskBar.svelte';
  import { getWeekStore } from '$lib/stores/weekStore.svelte.js';

  let { nextTaskId: _nextTaskId = null } = $props();
  const store = getWeekStore();

  const lanes = $derived(
    store.config.lanes.filter((lane) => lane.id === 'outreach' || lane.id === 'presence')
  );
  const activeLane = $derived(
    store.config.lanes.find((lane) => lane.id === activeLaneId)
  );

  let activeLaneId = $state(null);
  let editorInitial = $state([]);
  let editorOpen = $state(false);
  let editorVersion = $state(0);

  function laneTasks(config, laneId) {
    return config.tasks.filter((task) => task.lane === laneId);
  }

  function editableRows(config, laneId) {
    return laneTasks(config, laneId).map((task) => ({
      task: task.id,
      min: task.min,
      target: task.target,
      linePct: task.linePct ?? 75,
      showPopup: task.showPopup ?? true
    }));
  }

  function validateLaneRows(value, laneId, config) {
    const expected = laneTasks(config, laneId);
    const seen = new Set();

    const rows = value.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`Task at array index ${index} must be an object.`);
      }
      if (typeof row.task !== 'string' || row.task.length === 0) {
        throw new Error(`Task at array index ${index} must have a non-empty string "task" id.`);
      }
      if (seen.has(row.task)) {
        throw new Error(`Task at array index ${index} duplicates id "${row.task}".`);
      }
      seen.add(row.task);

      const configuredTask = config.tasks.find((task) => task.id === row.task);
      if (!configuredTask) {
        throw new Error(`Task at array index ${index} has unknown id "${row.task}".`);
      }
      if (configuredTask.lane !== laneId) {
        throw new Error(`Task at array index ${index} belongs to another lane.`);
      }
      if (!Number.isInteger(row.min) || row.min < 0) {
        throw new Error(`Task at array index ${index} must have a non-negative integer "min".`);
      }
      if (!Number.isInteger(row.target) || row.target < 0) {
        throw new Error(`Task at array index ${index} must have a non-negative integer "target".`);
      }
      if (row.min > row.target) {
        throw new Error(`Task at array index ${index} must have min less than or equal to target.`);
      }
      if (!Number.isInteger(row.linePct) || row.linePct < 1 || row.linePct > 100) {
        throw new Error(`Task at array index ${index} must have an integer "linePct" from 1 to 100.`);
      }
      if (typeof row.showPopup !== 'boolean') {
        throw new Error(`Task at array index ${index} must have a boolean "showPopup".`);
      }

      return {
        task: row.task,
        min: row.min,
        target: row.target,
        linePct: row.linePct,
        showPopup: row.showPopup
      };
    });

    if (rows.length !== expected.length) {
      throw new Error(`Lane must keep all ${expected.length} task rows; tasks cannot be added or removed.`);
    }

    const missing = expected.find((task) => !seen.has(task.id));
    if (missing) throw new Error(`Lane is missing task id "${missing.id}".`);

    const moved = rows.findIndex((row, index) => row.task !== expected[index].id);
    if (moved !== -1) {
      throw new Error(`Task at array index ${moved} must remain "${expected[moved].id}" and in lane order.`);
    }

    return rows;
  }

  function openEditor(laneId) {
    activeLaneId = laneId;
    editorInitial = editableRows(store.config, laneId);
    editorVersion += 1;
    editorOpen = true;
  }

  function closeEditor() {
    editorOpen = false;
    activeLaneId = null;
  }

  function parseRows(value) {
    return validateLaneRows(value, activeLaneId, store.config);
  }

  async function responseError(response, fallback) {
    try {
      const body = await response.json();
      return body.error ?? fallback;
    } catch {
      return fallback;
    }
  }

  async function saveLane(rows) {
    const laneId = activeLaneId;
    const currentResponse = await fetch(`${base}/api/config`);
    if (!currentResponse.ok) {
      throw new Error(await responseError(currentResponse, 'Could not read the latest config.'));
    }

    const latestConfig = await currentResponse.json();
    const validatedRows = validateLaneRows(rows, laneId, latestConfig);
    const edits = new Map(validatedRows.map((row) => [row.task, row]));
    const nextConfig = {
      ...latestConfig,
      tasks: latestConfig.tasks.map((task) => {
        if (task.lane !== laneId) return task;
        const edit = edits.get(task.id);
        return {
          ...task,
          min: edit.min,
          target: edit.target,
          linePct: edit.linePct,
          showPopup: edit.showPopup
        };
      })
    };

    const saveResponse = await fetch(`${base}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig)
    });
    if (!saveResponse.ok) {
      throw new Error(await responseError(saveResponse, 'Could not save lane settings.'));
    }

    store.replaceConfig(nextConfig);
    closeEditor();
  }
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
  {#each lanes as lane (lane.id)}
    <section class="flex min-w-0 flex-col gap-3" aria-labelledby={`lane-${lane.id}`}>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 id={`lane-${lane.id}`} class="text-sm font-bold uppercase tracking-wide text-base-content/70">
            {lane.label}
          </h2>
          {#if lane.blurb}
            <p class="text-xs text-base-content/60">{lane.blurb}</p>
          {/if}
        </div>
        <button
          class="btn btn-ghost btn-square btn-sm h-10 min-h-10 w-10 min-w-10 shrink-0"
          type="button"
          onclick={() => openEditor(lane.id)}
          aria-label={`Edit ${lane.label} lane settings`}
        >✎</button>
      </div>

      <div class="flex min-w-0 flex-col gap-3">
        {#each laneTasks(store.config, lane.id) as task (task.id)}
          <TaskBar {task} />
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if editorOpen && activeLane}
  {#key editorVersion}
    <JsonListEditor
      title={`Edit ${activeLane.label} lane`}
      help="min and target are weekly quotas. linePct is an independent getting-warmer guide on the progress bar. showPopup controls whether + opens the optional note popup. Task ids and order cannot be changed."
      initial={editorInitial}
      parse={parseRows}
      onSave={saveLane}
      onDiscard={closeEditor}
    />
  {/key}
{/if}