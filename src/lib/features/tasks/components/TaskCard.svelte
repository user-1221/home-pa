<script lang="ts">
  import type { Memo } from "$lib/types.ts";
  import { taskState } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import { createDragHandler } from "$lib/utils/pointer-drag.ts";
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";

  interface Props {
    task: Memo;
  }

  let { task }: Props = $props();

  // Check if this task is being enriched
  let isEnriching = $derived(taskState.enrichingIds.has(task.id));

  // Swipe state
  let translateX = $state(0);
  let isSwiping = $state(false);
  const SWIPE_THRESHOLD = 80; // px to reveal actions
  const MAX_SWIPE = 120; // Max px to swipe

  // Check if we're on mobile (screen width < 768px, which is Tailwind's md breakpoint)
  let isMobile = $state(false);

  let cleanupResize: (() => void) | undefined;

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
    cleanupResize = () => window.removeEventListener("resize", checkMobile);
  }

  onDestroy(() => {
    cleanupResize?.();
  });

  // Create drag handler for swipe (only used on mobile)
  const swipeHandler = createDragHandler<{ startX: number }>(
    {
      onStart: (_coords, _e) => {
        if (!isMobile) {
          // Return default context but onMove/onEnd will check isMobile
          return { startX: 0 };
        }
        isSwiping = true;
        return { startX: translateX };
      },
      onMove: (_coords, delta, context, _e) => {
        if (!isMobile) return; // Disable on desktop
        // Only allow left swipe (dx < 0) to reveal actions
        const newX = context.startX + delta.dx;
        translateX = Math.max(-MAX_SWIPE, Math.min(0, newX));
      },
      onEnd: (_coords, wasDrag, _context, _e) => {
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
    },
    {
      threshold: 3, // Lower threshold for swipe detection
      preventDefault: true,
      stopPropagation: true,
    },
  );

  // Deadline info
  let daysUntilDeadline = $derived(() => {
    if (!task.deadline) return null;
    // Compare at day level (midnight to midnight) to avoid off-by-one errors
    const now = new Date();
    const todayMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const deadline = new Date(task.deadline);
    const deadlineMidnight = new Date(
      deadline.getFullYear(),
      deadline.getMonth(),
      deadline.getDate(),
    );
    const diffDays = Math.round(
      (deadlineMidnight.getTime() - todayMidnight.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    return diffDays;
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

  // Enriched per-session time (minutes) label, e.g. "60 min session"
  let sessionDurationLabel = $derived(() => {
    const dur = task.sessionDuration;
    if (!dur || dur <= 0) return "";
    return `${dur} min session`;
  });

  // Routine period label (Daily / Weekly / Monthly)
  const recurrencePeriodLabels: Record<"day" | "week" | "month", string> = {
    day: "Daily",
    week: "Weekly",
    month: "Monthly",
  };

  let routinePeriodLabel = $derived(() => {
    const period = task.recurrenceGoal?.period;
    if (!period) return "";
    return recurrencePeriodLabels[period];
  });

  // Deadline progress (0–100% between createdAt and deadline)
  let deadlineProgress = $derived(() => {
    if (task.type !== "期限付き") return null;

    const created = task.deadlineState?.createdDay ?? task.createdAt;
    const deadline = task.deadlineState?.deadlineDay ?? task.deadline;

    if (!deadline) return null;

    const startTime = created.getTime();
    const endTime = deadline.getTime();

    if (endTime <= startTime) {
      return { percent: 100 };
    }

    const nowTime = new Date().getTime();
    const clampedNow = Math.min(Math.max(nowTime, startTime), endTime);
    const elapsed = clampedNow - startTime;
    const total = endTime - startTime;
    const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));

    return { percent };
  });

  // Genre/category label
  let genreLabel = $derived(() => {
    if (!task.genre) return null;
    return task.genre;
  });

  // Complete button icon type based on task type
  // - Checkmark: Deadline (no recurrence) or Backlog (delete-like action)
  // - Refresh: Event-linked deadline (advance to next occurrence)
  // - Plus: Routine (increment counter)
  let completeIconType = $derived(() => {
    if (task.type === "期限付き") {
      // Check if has recurrence (event-linked)
      if (task.eventLink) {
        return "refresh"; // Move to next occurrence
      }
      return "check"; // No recurrence = delete
    }
    if (task.type === "ルーティン") {
      return "plus"; // Increment counter
    }
    // バックログ
    return "check"; // Delete
  });

  // Location label (UI in Japanese, internal values unchanged)
  let locationLabel = $derived(() => {
    if (task.locationPreference === "home/near_home") return "自宅/自宅付近";
    if (task.locationPreference === "workplace/near_workplace") return "勤務地";
    return "どこでも";
  });

  // Handlers
  function handleEdit() {
    translateX = 0; // Close swipe
    taskState.edit(task);
  }

  function handleDelete() {
    if (confirm("このタスクを削除しますか？")) {
      taskState.delete(task.id);
    }
  }

  function handleComplete() {
    translateX = 0; // Close swipe
    taskState.markComplete(task.id);
  }
</script>

<div
  class="relative overflow-hidden rounded-r-xl"
  style="touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
>
  <!-- Action buttons behind (revealed on swipe, mobile only) -->
  <div
    class="absolute top-0 right-0 bottom-0 flex items-center gap-2 pr-3 md:hidden"
    style="width: {MAX_SWIPE}px;"
  >
    {#if task.status.completionState !== "completed"}
      <button
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-success/90 text-white shadow-sm transition-all duration-200 hover:bg-success active:scale-95"
        onclick={handleComplete}
        title="完了"
        aria-label="Mark complete"
      >
        {#if completeIconType() === "check"}
          <!-- Checkmark icon (delete-like action) -->
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        {:else if completeIconType() === "refresh"}
          <!-- Refresh/cycle icon (advance to next occurrence) -->
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        {:else}
          <!-- Plus icon (increment counter) -->
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
        {/if}
      </button>
    {/if}
    <button
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/90 text-white shadow-sm transition-all duration-200 hover:bg-[var(--color-primary)] active:scale-95"
      onclick={handleEdit}
      title="編集"
      aria-label="Edit task"
    >
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
          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
        />
      </svg>
    </button>
    <button
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-error/90 text-white shadow-sm transition-all duration-200 hover:bg-error active:scale-95"
      onclick={handleDelete}
      title="削除"
      aria-label="Delete task"
    >
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
          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
        />
      </svg>
    </button>
  </div>

  <!-- Main card content (swipeable on mobile only) -->
  <div
    class="relative rounded-r-xl border border-base-300/50 shadow-sm transition-colors duration-200 ease-out
      {task.type === '期限付き'
      ? 'border-l-[3px] border-l-[var(--color-warning-500)]'
      : task.type === 'ルーティン'
        ? 'border-l-[3px] border-l-[var(--color-primary)]'
        : 'border-l-[3px] border-l-base-content/20'}
      {task.status.completionState === 'completed'
      ? 'bg-base-200/60 opacity-50'
      : 'bg-base-100'}"
    style="transform: translateX({translateX}px); transition: {isSwiping
      ? 'none'
      : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'};"
    onpointerdown={isMobile ? swipeHandler.start : undefined}
    onpointermove={isMobile ? swipeHandler.move : undefined}
    onpointerup={isMobile ? swipeHandler.end : undefined}
    onpointercancel={isMobile ? swipeHandler.end : undefined}
    onlostpointercapture={isMobile ? swipeHandler.end : undefined}
  >
    {#if isEnriching}
      <div
        class="enriching-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-base-content/60 backdrop-blur-sm"
      >
        <span class="loading loading-md loading-spinner text-primary"></span>
        <span class="text-xs font-medium tracking-wide text-base-100"
          >AI analyzing...</span
        >
      </div>
    {/if}

    <div class="flex gap-3 p-3 md:p-4">
      <!-- Left column: Content -->
      <div class="min-w-0 flex-1 self-stretch">
        <!-- Title, meta, badges stacked and vertically centered -->
        <div class="flex h-full flex-col justify-center gap-1.5">
          <!-- Top: title -->
          <h3
            class="truncate text-[0.95rem] leading-tight font-medium tracking-tight
              {task.status.completionState === 'completed'
              ? 'text-base-content/60 line-through'
              : 'text-base-content'}"
          >
            {task.title}
          </h3>

          <!-- Middle: meta tags row (single line, no wrapping inside badges) -->
          <div class="flex flex-nowrap items-center gap-1.5 overflow-hidden">
            {#if task.type === "ルーティン" && routineProgress()}
              {@const periodLabel = routinePeriodLabel()}
              {#if periodLabel}
                <span
                  class="inline-flex items-center rounded-md bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-[var(--color-primary)]"
                  >{periodLabel}</span
                >
              {/if}
            {/if}
            {#if genreLabel()}
              <span
                class="inline-flex items-center rounded-md bg-base-200/80 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-base-content/70"
                >{genreLabel()}</span
              >
            {/if}
            <span
              class="inline-flex items-center rounded-md bg-base-200/60 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-base-content/60"
              >{locationLabel()}</span
            >
            {#if sessionDurationLabel()}
              <span
                class="inline-flex items-center rounded-md bg-base-200/60 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-base-content/60"
                >{sessionDurationLabel()}</span
              >
            {/if}
            {#if task.eventLink}
              <span
                class="inline-flex items-center gap-0.5 rounded-md bg-info/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-info"
              >
                <svg
                  class="h-2.5 w-2.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                イベント連携
              </span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Right column: Circular Progress Indicator and Desktop Action buttons -->
      <div class="flex shrink-0 flex-col items-center justify-center gap-1.5">
        <!-- Circular Progress Indicator -->
        {#if task.type === "ルーティン" && routineProgress()}
          {@const prog = routineProgress()}
          {@const percent = prog?.percent ?? 0}
          {@const radius = 24}
          {@const circumference = 2 * Math.PI * radius}
          {@const offset = circumference - (percent / 100) * circumference}
          <div class="relative h-16 w-16 shrink-0">
            <svg class="h-16 w-16 -rotate-90 transform" viewBox="0 0 64 64">
              <!-- Background ring -->
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                class="text-base-200"
              />
              <!-- Progress ring -->
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="var(--color-primary)"
                stroke-width="6"
                stroke-dasharray={circumference}
                stroke-dashoffset={offset}
                stroke-linecap="round"
                class="transition-all duration-300 ease-out"
              />
            </svg>
            <!-- Center text -->
            <div
              class="absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              <span class="text-sm font-medium text-base-content tabular-nums">
                {prog?.done}/{prog?.goal}
              </span>
            </div>
          </div>
        {:else if task.type === "期限付き" && task.deadline}
          {@const deadlineProg = deadlineProgress()}
          {@const percent = deadlineProg ? deadlineProg.percent : 0}
          {@const radius = 24}
          {@const circumference = 2 * Math.PI * radius}
          {@const offset = circumference - (percent / 100) * circumference}
          {@const showDaysFormat =
            !task.eventLink || task.eventLink.offset === "1_day_before"}
          <div class="relative h-16 w-16 shrink-0">
            <svg class="h-16 w-16 -rotate-90 transform" viewBox="0 0 64 64">
              <!-- Background ring -->
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                class="text-base-200"
              />
              <!-- Progress ring (time elapsed toward deadline) -->
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="var(--color-warning-500)"
                stroke-width="6"
                stroke-dasharray={circumference}
                stroke-dashoffset={offset}
                stroke-linecap="round"
                class="transition-all duration-300 ease-out"
              />
            </svg>
            <!-- Center text: days format for non-event-linked or 1_day_before, min format for same_day_after/1_day_after -->
            {#if showDaysFormat}
              <div
                class="absolute inset-0 flex flex-col items-center justify-center text-center"
              >
                <span class="text-xs font-normal text-base-content/60"
                  >あと</span
                >
                <span
                  class="text-base leading-tight font-medium text-base-content tabular-nums"
                >
                  {daysUntilDeadline() !== null
                    ? Math.abs(daysUntilDeadline() ?? 0)
                    : "?"}日
                </span>
              </div>
            {:else}
              {@const prog = timeProgress()}
              <div
                class="absolute inset-0 flex flex-col items-center justify-center text-center"
              >
                <span
                  class="text-sm font-medium text-base-content tabular-nums"
                >
                  {prog.spent}/{prog.total}
                </span>
                <span class="text-xs font-normal text-base-content/60">min</span
                >
              </div>
            {/if}
          </div>
        {:else}
          {@const prog = timeProgress()}
          {@const percent = prog.percent}
          {@const radius = 24}
          {@const circumference = 2 * Math.PI * radius}
          {@const offset = circumference - (percent / 100) * circumference}
          <div class="relative h-16 w-16 shrink-0">
            <svg class="h-16 w-16 -rotate-90 transform" viewBox="0 0 64 64">
              <!-- Background ring -->
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                class="text-base-200"
              />
              <!-- Progress ring -->
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke="var(--color-primary)"
                stroke-width="6"
                stroke-dasharray={circumference}
                stroke-dashoffset={offset}
                stroke-linecap="round"
                class="transition-all duration-300 ease-out"
              />
            </svg>
            <!-- Center text -->
            <div
              class="absolute inset-0 flex flex-col items-center justify-center text-center"
            >
              <span class="text-sm font-medium text-base-content tabular-nums">
                {prog.spent}/{prog.total}
              </span>
              <span class="text-xs font-normal text-base-content/60">min</span>
            </div>
          </div>
        {/if}
        <!-- Desktop-only action buttons (hidden on mobile, always visible on desktop) -->
        <div class="hidden items-center gap-1 md:flex">
          {#if task.status.completionState !== "completed"}
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md text-base-content/40 transition-colors duration-200 hover:bg-success/10 hover:text-success"
              onclick={handleComplete}
              title="Mark complete"
              aria-label="Mark complete"
            >
              {#if completeIconType() === "check"}
                <!-- Checkmark icon (delete-like action) -->
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              {:else if completeIconType() === "refresh"}
                <!-- Refresh/cycle icon (advance to next occurrence) -->
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              {:else}
                <!-- Plus icon (increment counter) -->
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              {/if}
            </button>
          {/if}
          <button
            class="flex h-7 w-7 items-center justify-center rounded-md text-base-content/40 transition-colors duration-200 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
            onclick={handleEdit}
            title="Edit"
            aria-label="Edit task"
          >
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
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
          </button>
          <button
            class="flex h-7 w-7 items-center justify-center rounded-md text-base-content/40 transition-colors duration-200 hover:bg-error/10 hover:text-error"
            onclick={handleDelete}
            title="Delete"
            aria-label="Delete task"
          >
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
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* Shimmer effect for enrichment overlay */
  .enriching-overlay {
    overflow: hidden;
  }

  .enriching-overlay::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.1) 50%,
      transparent 100%
    );
    animation: shimmer 2s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .enriching-overlay::after {
      animation: none;
    }
  }
</style>
