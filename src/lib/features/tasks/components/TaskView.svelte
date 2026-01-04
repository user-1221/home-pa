<script lang="ts">
  import TaskCard from "./TaskCard.svelte";
  import TaskForm from "./TaskForm.svelte";
  import { tasks, taskActions } from "$lib/features/tasks/state/taskActions.ts";
  import type { Memo, MemoType } from "$lib/types.ts";

  // Filter options
  type FilterType = "all" | "active" | "completed";
  let filter = $state<FilterType>("active");

  // Task type priority order: 期限付き (Deadline) → ルーティン (Routine) → バックログ (Backlog)
  const TYPE_ORDER: Record<MemoType, number> = {
    期限付き: 0,
    ルーティン: 1,
    バックログ: 2,
  };

  // Calculate progress percentage for a task
  function getProgress(task: Memo): number {
    const spent = task.status.timeSpentMinutes ?? 0;
    const total = task.totalDurationExpected ?? 60;
    return total > 0 ? spent / total : 0;
  }

  // Sort tasks by type, then by progress (descending - more progress = higher priority)
  function sortTasks(taskList: Memo[]): Memo[] {
    return [...taskList].sort((a, b) => {
      // First sort by type priority
      const typeA = TYPE_ORDER[a.type] ?? 2;
      const typeB = TYPE_ORDER[b.type] ?? 2;
      if (typeA !== typeB) return typeA - typeB;

      // Then sort by progress (more progress = closer to completion = higher)
      const progressA = getProgress(a);
      const progressB = getProgress(b);
      return progressB - progressA; // Descending order
    });
  }

  // Filtered and sorted tasks
  let filteredTasks = $derived(() => {
    const allTasks = $tasks;
    let result: Memo[];
    switch (filter) {
      case "active":
        result = allTasks.filter(
          (t) => t.status.completionState !== "completed",
        );
        break;
      case "completed":
        result = allTasks.filter(
          (t) => t.status.completionState === "completed",
        );
        break;
      default:
        result = allTasks;
    }
    return sortTasks(result);
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
