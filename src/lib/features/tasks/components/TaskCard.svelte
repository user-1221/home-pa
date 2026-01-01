<script lang="ts">
  import type { Memo } from "$lib/types.ts";
  import {
    taskActions,
    enrichingTaskIds,
  } from "$lib/features/tasks/state/taskActions.ts";
  import { createDragHandler } from "$lib/utils/pointer-drag.ts";
  import { browser } from "$app/environment";

  interface Props {
    task: Memo;
  }

  let { task }: Props = $props();

  // Check if this task is being enriched
  let isEnriching = $derived($enrichingTaskIds.has(task.id));

  // Swipe state
  let translateX = $state(0);
  let isSwiping = $state(false);
  const SWIPE_THRESHOLD = 80; // px to reveal actions
  const MAX_SWIPE = 120; // Max px to swipe

  // Check if we're on mobile (screen width < 768px, which is Tailwind's md breakpoint)
  let isMobile = $state(false);
  
  if (browser) {
    const checkMobile = () => {
      const wasMobile = isMobile;
      isMobile = window.innerWidth < 768;
      // Reset swipe position when switching to desktop
      if (wasMobile && !isMobile) {
        translateX = 0;
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
  }

  // Create drag handler for swipe (only used on mobile)
  const swipeHandler = createDragHandler<{ startX: number }>({
    onStart: (coords) => {
      if (!isMobile) return null; // Disable on desktop
      isSwiping = true;
      return { startX: translateX };
    },
    onMove: (coords, delta, context) => {
      if (!isMobile || !context) return; // Disable on desktop
      // Only allow left swipe (dx < 0) to reveal actions
      const newX = context.startX + delta.dx;
      translateX = Math.max(-MAX_SWIPE, Math.min(0, newX));
    },
    onEnd: (coords, wasDrag) => {
      if (!isMobile) return; // Disable on desktop
      isSwiping = false;
      
      if (!wasDrag) {
        // Click - reset swipe if swiped, otherwise do nothing
        if (translateX !== 0) {
          translateX = 0;
        }
        return;
      }

      // Snap to open or closed based on threshold
      if (translateX < -SWIPE_THRESHOLD) {
        translateX = -MAX_SWIPE; // Snap to fully open
      } else {
        translateX = 0; // Snap to closed
      }
    },
  }, {
    threshold: 3, // Lower threshold for swipe detection
    preventDefault: true,
    stopPropagation: true,
  });

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
    translateX = 0; // Close swipe
    taskActions.edit(task);
  }

  function handleDelete() {
    if (confirm("このタスクを削除しますか？")) {
      taskActions.delete(task.id);
    }
  }

  function handleComplete() {
    translateX = 0; // Close swipe
    taskActions.markComplete(task.id);
  }
</script>

<div
  class="relative overflow-hidden"
  style="touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
>
  <!-- Action buttons behind (revealed on swipe, mobile only) -->
  <div
    class="absolute right-0 top-0 bottom-0 flex items-center gap-2 pr-2 md:hidden"
    style="width: {MAX_SWIPE}px;"
  >
    {#if task.status.completionState !== "completed"}
      <button
        class="btn btn-square btn-success btn-sm"
        onclick={handleComplete}
        title="完了"
      >
        ✓
      </button>
    {/if}
    <button
      class="btn btn-square btn-primary btn-sm"
      onclick={handleEdit}
      title="編集"
    >
      ✏️
    </button>
    <button
      class="btn btn-square btn-error btn-sm"
      onclick={handleDelete}
      title="削除"
    >
      🗑️
    </button>
  </div>

  <!-- Main card content (swipeable on mobile only) -->
  <div
    class="card relative border-l-4 bg-base-100 shadow-sm transition-all duration-200 card-sm {task.type ===
    '期限付き'
      ? 'border-l-warning'
      : task.type === 'ルーティン'
        ? 'border-l-primary'
        : 'border-l-base-300'}"
    class:opacity-60={task.status.completionState === "completed"}
    class:bg-base-200={task.status.completionState === "completed"}
    class:shadow-md={translateX < 0}
    style="transform: translateX({translateX}px); transition: {isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'};"
    onpointerdown={isMobile ? swipeHandler.start : undefined}
    onpointermove={isMobile ? swipeHandler.move : undefined}
    onpointerup={isMobile ? swipeHandler.end : undefined}
    onpointercancel={isMobile ? swipeHandler.end : undefined}
    onlostpointercapture={isMobile ? swipeHandler.end : undefined}
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

      <!-- Progress bar, Time text and Desktop Action buttons -->
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
          <!-- Desktop-only action buttons (hidden on mobile, always visible on desktop) -->
          <div
            class="card-actions justify-end hidden md:flex"
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
</div>
