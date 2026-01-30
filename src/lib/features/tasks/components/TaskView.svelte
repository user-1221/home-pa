<script lang="ts">
  import TaskCard from "./TaskCard.svelte";
  import Skeleton from "$lib/features/shared/components/Skeleton.svelte";
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import ModalContainer from "$lib/features/shared/components/ModalContainer.svelte";
  import ModalSkeletonContent from "$lib/features/shared/components/skeletons/ModalSkeletonContent.svelte";
  import { taskState } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import { taskFormState } from "$lib/features/tasks/state/taskForm.svelte.ts";
  import type { Memo, MemoType } from "$lib/types.ts";

  // Filter options
  type FilterType = "active" | "report";
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

  // Filtered and sorted tasks (only for "active" filter now)
  let filteredTasks = $derived(() => {
    const allTasks = taskState.items;
    // Active tab: show non-completed tasks
    const result = allTasks.filter(
      (t) => t.status.completionState !== "completed",
    );
    return sortTasks(result);
  });

  // Stats
  let stats = $derived(() => {
    const all = taskState.items;
    const active = all.filter(
      (t) => t.status.completionState !== "completed",
    ).length;
    const completed = all.filter(
      (t) => t.status.completionState === "completed",
    ).length;
    return { total: all.length, active, completed };
  });

  function handleAddTask() {
    taskState.startCreate();
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
        aria-hidden="true"
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
      class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200
        {filter === 'active'
        ? 'bg-[var(--color-primary)] text-white shadow-md'
        : 'text-base-content/60 hover:bg-base-200/80 hover:text-base-content'}"
      onclick={() => (filter = "active")}
      aria-selected={filter === "active"}
    >
      Active
      <span
        class="rounded-full px-2 py-0.5 text-xs font-medium
        {filter === 'active'
          ? 'bg-white/20 text-white'
          : 'bg-base-200 text-base-content'}">{stats().active}</span
      >
    </button>
    <button
      role="tab"
      class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200
        {filter === 'report'
        ? 'bg-[var(--color-primary)] text-white shadow-md'
        : 'text-base-content/60 hover:bg-base-200/80 hover:text-base-content'}"
      onclick={() => (filter = "report")}
      aria-selected={filter === "report"}
    >
      Report
      <svg
        class="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    </button>
  </div>

  <!-- Task List or Report View -->
  <div class="flex-1 overflow-y-auto p-4 md:p-6">
    {#if filter === "report"}
      <!-- Report View Placeholder -->
      <div class="mx-auto max-w-4xl">
        <div
          class="flex flex-col items-center justify-center px-4 py-20 text-center"
        >
          <div
            class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200/80"
          >
            <svg
              class="h-8 w-8 text-base-content/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p class="text-base font-medium text-base-content/70">
            Report Coming Soon
          </p>
          <p class="mt-1 text-sm text-base-content/50">
            完了したタスクの履歴と統計がここに表示されます
          </p>
        </div>
      </div>
    {:else}
      <!-- Active Tasks List -->
      <div class="mx-auto max-w-4xl">
        <div class="grid grid-cols-1 gap-0 md:grid-cols-2">
          {#if taskState.isLoading}
            <!-- Loading state: show skeleton cards -->
            {#each Array(4) as _, i (i)}
              <Skeleton variant="card" />
            {/each}
          {:else if filteredTasks().length === 0}
            <div
              class="col-span-full flex flex-col items-center justify-center px-4 py-20 text-center"
            >
              <div
                class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200/80"
              >
                <svg
                  class="h-8 w-8 text-base-content/50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p class="text-base font-medium text-base-content/70">
                No active tasks
              </p>
              <p class="mt-1 text-sm text-base-content/50">
                Tap + to create your first task
              </p>
            </div>
          {:else}
            {#each filteredTasks() as task (task.id)}
              <TaskCard {task} />
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Task Form Modal (lazy-loaded with stable container to prevent re-animation) -->
{#if taskFormState.isOpen}
  <ModalContainer fullscreenMobile onClose={() => taskFormState.closeForm()}>
    <LazyLoad
      loader={() => import("./TaskForm.svelte")}
      props={{ contentOnly: true }}
    >
      <ModalSkeletonContent rows={5} />
    </LazyLoad>
  </ModalContainer>
{/if}
