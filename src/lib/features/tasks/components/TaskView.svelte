<script lang="ts">
  import TaskCard from "./TaskCard.svelte";
  import TaskForm from "./TaskForm.svelte";
  import { tasks, taskActions } from "$lib/features/tasks/state/taskActions.ts";

  // Filter options
  type FilterType = "all" | "active" | "completed";
  let filter = $state<FilterType>("active");

  // Filtered tasks
  let filteredTasks = $derived(() => {
    const allTasks = $tasks;
    switch (filter) {
      case "active":
        return allTasks.filter((t) => t.status.completionState !== "completed");
      case "completed":
        return allTasks.filter((t) => t.status.completionState === "completed");
      default:
        return allTasks;
    }
  });

  // Stats
  let stats = $derived(() => {
    const all = $tasks;
    const active = all.filter(
      (t) => t.status.completionState !== "completed",
    ).length;
    const completed = all.filter(
      (t) => t.status.completionState === "completed",
    ).length;
    return { total: all.length, active, completed };
  });

  function handleAddTask() {
    taskActions.startCreate();
  }
</script>

<div class="flex h-full flex-col bg-base-200/60 backdrop-blur-sm">
  <!-- Header -->
  <div class="navbar sticky top-0 z-10 min-h-14 border-b border-base-300 bg-base-100/90 px-3 backdrop-blur-md md:min-h-20 md:px-5">
    <div class="flex-1">
      <h1 class="text-base font-normal tracking-tight md:text-xl">Tasks</h1>
    </div>
    <div class="flex-none">
      <button
        class="btn btn-primary btn-circle btn-sm md:btn-md shadow-sm"
        onclick={handleAddTask}
        aria-label="Add new task"
      >
        +
      </button>
    </div>
  </div>

  <!-- Filter Tabs -->
  <div role="tablist" class="tabs tabs-box border-b border-base-300 bg-base-200/40 p-2">
    <button
      role="tab"
      class="tab flex-1 {filter === 'active' ? 'tab-active' : ''}"
      onclick={() => (filter = "active")}
    >
      Active
      <span class="badge badge-sm ml-1">{stats().active}</span>
    </button>
    <button
      role="tab"
      class="tab flex-1 {filter === 'all' ? 'tab-active' : ''}"
      onclick={() => (filter = "all")}
    >
      All
      <span class="badge badge-sm ml-1">{stats().total}</span>
    </button>
    <button
      role="tab"
      class="tab flex-1 {filter === 'completed' ? 'tab-active' : ''}"
      onclick={() => (filter = "completed")}
    >
      Done
      <span class="badge badge-sm ml-1">{stats().completed}</span>
    </button>
  </div>

  <!-- Task List -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if filteredTasks().length === 0}
      <div class="flex flex-col items-center justify-center px-4 py-16 text-center">
        {#if filter === "active"}
          <div class="mb-4 text-6xl opacity-40">🎯</div>
          <p class="text-lg font-medium text-base-content/70">No active tasks</p>
          <p class="mt-2 text-sm text-base-content/50">Tap + to create your first task</p>
        {:else if filter === "completed"}
          <div class="mb-4 text-6xl opacity-40">✓</div>
          <p class="text-lg font-medium text-base-content/70">No completed tasks yet</p>
        {:else}
          <div class="mb-4 text-6xl opacity-40">📋</div>
          <p class="text-lg font-medium text-base-content/70">No tasks</p>
          <p class="mt-2 text-sm text-base-content/50">Tap + to create your first task</p>
        {/if}
      </div>
    {:else}
      {#each filteredTasks() as task (task.id)}
        <TaskCard {task} />
      {/each}
    {/if}
  </div>
</div>

<TaskForm />
