<script lang="ts">
  import type { Memo } from "$lib/types.ts";
  import {
    taskActions,
    enrichingTaskIds,
  } from "$lib/features/tasks/state/taskActions.ts";

  interface Props {
    task: Memo;
  }

  let { task }: Props = $props();

  // Check if this task is being enriched
  let isEnriching = $derived($enrichingTaskIds.has(task.id));

  // Computed values
  let typeLabel = $derived(
    task.type === "期限付き"
      ? "Deadline"
      : task.type === "ルーティン"
        ? "Routine"
        : "Backlog",
  );

  // Deadline info
  let daysUntilDeadline = $derived(() => {
    if (!task.deadline) return null;
    const now = new Date();
    const deadline = new Date(task.deadline);
    const diff = deadline.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  });

  let deadlineText = $derived(() => {
    const days = daysUntilDeadline();
    if (days === null) return "";
    if (days < 0) return `${Math.abs(days)} days overdue`;
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `${days} days left`;
  });

  let isUrgent = $derived(() => {
    const days = daysUntilDeadline();
    return days !== null && days <= 1;
  });

  // Routine progress
  let routineProgress = $derived(() => {
    if (task.type !== "ルーティン" || !task.recurrenceGoal) return null;
    const done = task.status.completionsThisPeriod ?? 0;
    const goal = task.recurrenceGoal.count;
    return { done, goal, percent: Math.min(100, (done / goal) * 100) };
  });

  // Time progress
  let timeProgress = $derived(() => {
    const spent = task.status.timeSpentMinutes;
    const total = task.totalDurationExpected ?? 60;
    return { spent, total, percent: Math.min(100, (spent / total) * 100) };
  });

  // Enriched per-session time (minutes)
  let sessionDurationLabel = $derived(() => {
    if (task.sessionDuration && task.sessionDuration > 0) {
      return `${task.sessionDuration} min session`;
    }
    return null;
  });

  // Genre/category label
  let genreLabel = $derived(() => {
    if (!task.genre) return null;
    return task.genre;
  });

  // Location label (UI in Japanese, internal values unchanged)
  let locationLabel = $derived(
    task.locationPreference === "home/near_home"
      ? "🏠 自宅/自宅付近"
      : task.locationPreference === "workplace/near_workplace"
        ? "🏢 勤務地"
        : "どこでも",
  );

  // Handlers
  function handleEdit() {
    taskActions.edit(task);
  }

  function handleDelete() {
    if (confirm("このタスクを削除しますか？")) {
      taskActions.delete(task.id);
    }
  }

  function handleComplete() {
    taskActions.markComplete(task.id);
  }
</script>

<div
  class="card relative mb-3 border-l-4 bg-base-100 shadow-sm transition-all duration-200 card-sm hover:-translate-y-0.5 hover:shadow-md {task.type ===
  '期限付き'
    ? 'border-l-warning'
    : task.type === 'ルーティン'
      ? 'border-l-primary'
      : 'border-l-base-300'}"
  class:opacity-60={task.status.completionState === "completed"}
  class:bg-base-200={task.status.completionState === "completed"}
>
  {#if isEnriching}
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-base-content/70 backdrop-blur-sm"
    >
      <span class="loading loading-md loading-spinner text-primary"></span>
      <span class="text-xs font-medium tracking-wide text-base-100"
        >AI analyzing...</span
      >
    </div>
  {/if}

  <div class="card-body gap-2 p-4">
    <!-- Title row -->
    <div class="flex items-center justify-between gap-2">
      <h3
        class="card-title flex-1 text-base"
        class:line-through={task.status.completionState === "completed"}
      >
        {task.title}
      </h3>
      <div class="flex flex-wrap items-center gap-1.5">
        <span
          class="badge badge-outline badge-sm text-[0.7rem] tracking-wider uppercase"
          >{typeLabel}</span
        >
        {#if genreLabel()}
          <span
            class="badge bg-[var(--color-surface-100)] badge-sm text-[var(--color-text-primary)]"
            >{genreLabel()}</span
          >
        {/if}
        {#if sessionDurationLabel()}
          <span
            class="badge bg-[var(--color-primary-100)] badge-sm text-[var(--color-primary-800)]"
            >{sessionDurationLabel()}</span
          >
        {/if}
      </div>
    </div>

    <!-- Meta info -->
    <div class="flex items-center justify-between gap-1.5 text-sm">
      <div class="flex flex-wrap items-center gap-1.5">
        {#if task.type === "期限付き" && task.deadline}
          <div
            class="flex items-center gap-1"
            class:text-error={isUrgent()}
            class:font-medium={isUrgent()}
          >
            <span>{deadlineText()}</span>
          </div>
        {/if}

        {#if task.type === "ルーティン" && routineProgress()}
          {@const prog = routineProgress()}
          <div class="flex items-center gap-1 text-[var(--color-text-secondary)]">
            <span
              >{prog?.done}/{prog?.goal} this {task.recurrenceGoal?.period}</span
            >
          </div>
        {/if}
      </div>

      <div class="flex items-center gap-1 text-[var(--color-text-secondary)]">
        <span>{locationLabel}</span>
      </div>
    </div>

    <!-- Progress bar, Time text and Action buttons -->
    <div class="flex items-center gap-2">
      {#if task.type === "ルーティン" && routineProgress()}
        {@const prog = routineProgress()}
        <progress
          class="progress flex-1 progress-primary"
          value={prog?.percent}
          max="100"
        ></progress>
      {:else}
        {@const prog = timeProgress()}
        <progress
          class="progress flex-1 progress-primary"
          value={prog.percent}
          max="100"
        ></progress>
      {/if}
      <div class="flex items-center gap-2">
        {#if task.type === "ルーティン" && routineProgress()}
          {@const prog = routineProgress()}
          <span
            class="text-xs text-[var(--color-text-secondary)]"
          >
            {prog?.done}/{prog?.goal}
          </span>
        {:else}
          {@const prog = timeProgress()}
          <span
            class="text-xs text-[var(--color-text-secondary)]"
          >
            {prog.spent}/{prog.total} min
          </span>
        {/if}
        <div
          class="card-actions justify-end opacity-100 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100"
        >
          {#if task.status.completionState !== "completed"}
            <button
              class="btn btn-square btn-outline btn-xs btn-success"
              onclick={handleComplete}
              title="Mark complete"
            >
              ✓
            </button>
          {/if}
          <button
            class="btn btn-square btn-outline btn-xs btn-primary"
            onclick={handleEdit}
            title="Edit"
          >
            ✏️
          </button>
          <button
            class="btn btn-square btn-outline btn-xs btn-error"
            onclick={handleDelete}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
