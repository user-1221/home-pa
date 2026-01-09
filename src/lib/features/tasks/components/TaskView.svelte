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

<div
  class="flex h-full flex-col bg-gradient-to-b from-base-200/80 to-base-200/40"
>
  <!-- Header -->
  <div
    class="sticky top-0 z-10 flex min-h-14 flex-shrink-0 items-center justify-between border-b border-base-300/50 bg-base-100/90 px-4 backdrop-blur-md md:min-h-16 md:px-6"
  >
    <h1 class="text-lg font-medium tracking-tight md:text-xl">Tasks</h1>
    <button
      class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-lg text-white shadow-md transition-all duration-200 hover:bg-[var(--color-primary-800)] hover:shadow-lg active:scale-95"
      onclick={handleAddTask}
      aria-label="Add new task"
    >
      <svg
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4v16m8-8H4"
        />
      </svg>
    </button>
  </div>

  <!-- Filter Tabs -->
  <div
    role="tablist"
    class="flex flex-shrink-0 gap-1 border-b border-base-300/30 bg-base-100/60 p-2 backdrop-blur-sm"
  >
    <button
      role="tab"
      class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200
        {filter === 'active'
        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
        : 'text-base-content/60 hover:bg-base-200/80 hover:text-base-content'}"
      onclick={() => (filter = "active")}
      aria-selected={filter === "active"}
    >
      Active
      <span class="rounded-full bg-base-200 px-2 py-0.5 text-xs font-medium"
        >{stats().active}</span
      >
    </button>
    <button
      role="tab"
      class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200
        {filter === 'all'
        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
        : 'text-base-content/60 hover:bg-base-200/80 hover:text-base-content'}"
      onclick={() => (filter = "all")}
      aria-selected={filter === "all"}
    >
      All
      <span class="rounded-full bg-base-200 px-2 py-0.5 text-xs font-medium"
        >{stats().total}</span
      >
    </button>
    <button
      role="tab"
      class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200
        {filter === 'completed'
        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
        : 'text-base-content/60 hover:bg-base-200/80 hover:text-base-content'}"
      onclick={() => (filter = "completed")}
      aria-selected={filter === "completed"}
    >
      Done
      <span class="rounded-full bg-base-200 px-2 py-0.5 text-xs font-medium"
        >{stats().completed}</span
      >
    </button>
  </div>

  <!-- Task List -->
  <div class="flex-1 overflow-y-auto p-4 md:p-6">
    <div class="mx-auto max-w-4xl">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {#if filteredTasks().length === 0}
          <div
            class="col-span-full flex flex-col items-center justify-center px-4 py-20 text-center"
          >
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200/80"
            >
              {#if filter === "active"}
                <svg
                  class="h-8 w-8 text-base-content/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              {:else if filter === "completed"}
                <svg
                  class="h-8 w-8 text-base-content/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              {:else}
                <svg
                  class="h-8 w-8 text-base-content/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
              {/if}
            </div>
            {#if filter === "active"}
              <p class="text-base font-medium text-base-content/70">
                No active tasks
              </p>
              <p class="mt-1 text-sm text-base-content/50">
                Tap + to create your first task
              </p>
            {:else if filter === "completed"}
              <p class="text-base font-medium text-base-content/70">
                No completed tasks yet
              </p>
            {:else}
              <p class="text-base font-medium text-base-content/70">No tasks</p>
              <p class="mt-1 text-sm text-base-content/50">
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
</div>

<TaskForm />
