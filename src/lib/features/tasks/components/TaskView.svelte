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
  <div
    class="sticky top-0 z-10 navbar min-h-14 border-b border-base-300 bg-base-100/90 px-3 backdrop-blur-md md:min-h-20 md:px-5"
  >
    <div class="flex-1">
      <h1 class="text-base font-normal tracking-tight md:text-xl">Tasks</h1>
    </div>
    <div class="flex-none">
      <button
        class="btn btn-circle border-none bg-[var(--color-primary-600)] text-white shadow-sm btn-sm hover:bg-[var(--color-primary-800)] md:btn-md"
        onclick={handleAddTask}
        aria-label="Add new task"
      >
        +
      </button>
    </div>
  </div>

  <!-- Filter Tabs -->
  <div
    role="tablist"
    class="tabs tabs-box border-b border-base-300 bg-base-200/40 p-2"
  >
    <button
      role="tab"
      class="tab flex-1 {filter === 'active' ? 'tab-active' : ''}"
      onclick={() => (filter = "active")}
    >
      Active
      <span class="ml-1 badge badge-sm">{stats().active}</span>
    </button>
    <button
      role="tab"
      class="tab flex-1 {filter === 'all' ? 'tab-active' : ''}"
      onclick={() => (filter = "all")}
    >
      All
      <span class="ml-1 badge badge-sm">{stats().total}</span>
    </button>
    <button
      role="tab"
      class="tab flex-1 {filter === 'completed' ? 'tab-active' : ''}"
      onclick={() => (filter = "completed")}
    >
      Done
      <span class="ml-1 badge badge-sm">{stats().completed}</span>
    </button>
  </div>

  <!-- Task List -->
  <div class="flex-1 overflow-y-auto p-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    {#if filteredTasks().length === 0}
      <div
        class="col-span-2 flex flex-col items-center justify-center px-4 py-16 text-center"
      >
        {#if filter === "active"}
          <div class="mb-4 text-6xl opacity-50">🎯</div>
          <p class="text-lg font-medium text-[var(--color-text-secondary)]">
            No active tasks
          </p>
          <p class="mt-2 text-sm text-[var(--color-text-muted)]">
            Tap + to create your first task
          </p>
        {:else if filter === "completed"}
          <div class="mb-4 text-6xl opacity-50">✓</div>
          <p class="text-lg font-medium text-[var(--color-text-secondary)]">
            No completed tasks yet
          </p>
        {:else}
          <div class="mb-4 text-6xl opacity-50">📋</div>
          <p class="text-lg font-medium text-[var(--color-text-secondary)]">
            No tasks
          </p>
          <p class="mt-2 text-sm text-[var(--color-text-muted)]">
            Tap + to create your first task
          </p>
        {/if}
      </div>
    {:else}
      {#each filteredTasks() as task (task.id)}
        <TaskCard {task} />
      {/each}
    {/if}
    </div>
  </div>
</div>

<TaskForm />
