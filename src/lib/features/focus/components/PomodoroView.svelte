<script lang="ts">
  /**
   * PomodoroView Component
   *
   * Mini app for Pomodoro timer with task tracking integration.
   * - Auto-selects current accepted suggestion if available
   * - Classic 25min work + 5min break cycles
   * - Integrates with focusState for global tracking
   *
   * Design: "静かな知性" - Calm & Intelligent, zen-like minimalism
   */

  import { onMount } from "svelte";
  import { focusState } from "../state/index.ts";
  import { formatTimerDisplay, formatDuration } from "../utils/index.ts";
  import { scheduleState } from "$lib/features/assistant/state/schedule.svelte.ts";
  import { taskState } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import type { Memo } from "$lib/types.ts";

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  // Local state
  let selectedTaskId = $state<string | null>(null);
  let selectedTaskTitle = $state<string>("");
  let customEndTime = $state<string | null>(null);
  let showTaskPicker = $state(false);

  // Pomodoro settings
  const WORK_DURATION = 25;
  const BREAK_DURATION = 5;

  // Get current accepted suggestion that's in the current time window
  let currentAcceptedSuggestion = $derived.by(() => {
    const now = new Date();
    const nowHours = now.getHours().toString().padStart(2, "0");
    const nowMins = now.getMinutes().toString().padStart(2, "0");
    const nowTime = `${nowHours}:${nowMins}`;

    for (const [memoId, info] of scheduleState.acceptedMemos) {
      if (nowTime >= info.startTime && nowTime < info.endTime) {
        const task = taskState.items.find((t) => t.id === memoId);
        if (task) {
          return {
            memoId,
            title: task.title,
            endTime: info.endTime,
          };
        }
      }
    }
    return null;
  });

  // Available tasks for manual selection (active, non-completed)
  let availableTasks = $derived(
    taskState.items.filter((t) => t.status.completionState !== "completed"),
  );

  // Check if we're already tracking
  let isTracking = $derived(focusState.isActive);
  let activeSession = $derived(focusState.activeSession);

  // Initialize with current accepted suggestion
  onMount(() => {
    if (currentAcceptedSuggestion && !isTracking) {
      selectedTaskId = currentAcceptedSuggestion.memoId;
      selectedTaskTitle = currentAcceptedSuggestion.title;
      customEndTime = currentAcceptedSuggestion.endTime;
    }
  });

  // ============================================================================
  // Actions
  // ============================================================================

  function handleSelectTask(task: Memo) {
    selectedTaskId = task.id;
    selectedTaskTitle = task.title;
    customEndTime = null;
    showTaskPicker = false;
  }

  function handleStart() {
    if (!selectedTaskId || !selectedTaskTitle) return;

    let endTime = customEndTime;
    if (!endTime) {
      // Calculate end time 2 hours from now (non-reactive, just a calculation)
      const now = Date.now();
      const endDate = new Date(now + 2 * 60 * 60 * 1000);
      endTime = `${endDate.getHours().toString().padStart(2, "0")}:${endDate.getMinutes().toString().padStart(2, "0")}`;
    }

    focusState.startPomodoro(
      selectedTaskId,
      selectedTaskTitle,
      endTime,
      WORK_DURATION,
      BREAK_DURATION,
    );
  }

  async function handleComplete() {
    await focusState.complete();
  }

  function handleCancel() {
    focusState.cancel();
  }

  function handlePause() {
    if (focusState.isPaused) {
      focusState.resume();
    } else {
      focusState.pause();
    }
  }

  function handleSkipBreak() {
    focusState.skipBreak();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && showTaskPicker) {
      showTaskPicker = false;
    }
  }

  // Calculate circle progress
  let circleProgress = $derived.by(() => {
    if (!activeSession?.pomodoroState) return 0;
    return focusState.phaseProgress;
  });

  // SVG circle parameters
  const CIRCLE_RADIUS = 85;
  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
  let strokeDashoffset = $derived(
    CIRCLE_CIRCUMFERENCE - (circleProgress / 100) * CIRCLE_CIRCUMFERENCE,
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col bg-gradient-to-b from-base-100 to-base-200/50">
  <!-- Header -->
  <div
    class="flex items-center justify-between border-b border-base-200 bg-base-100/80 px-4 py-3 backdrop-blur-sm"
  >
    <div class="flex items-center gap-3">
      <span class="text-xl">🍅</span>
      <h2
        class="text-base font-normal tracking-tight text-[var(--color-text-primary)]"
      >
        Pomodoro
      </h2>
    </div>
    {#if onClose}
      <button
        class="btn btn-circle btn-ghost btn-sm"
        onclick={onClose}
        aria-label="閉じる"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex flex-1 flex-col items-center justify-center gap-8 p-6">
    {#if isTracking && activeSession}
      <!-- Active Session View -->
      <div class="flex flex-col items-center gap-8">
        <!-- Timer Circle -->
        <div class="relative">
          <!-- Outer glow effect -->
          <div
            class="absolute -inset-4 rounded-full opacity-20 blur-xl transition-colors duration-1000 {focusState.currentPhase ===
            'break'
              ? 'bg-success'
              : 'bg-primary'}"
          ></div>

          <svg
            class="relative h-48 w-48 -rotate-90 transform md:h-56 md:w-56"
            viewBox="0 0 200 200"
          >
            <!-- Background circle -->
            <circle
              cx="100"
              cy="100"
              r={CIRCLE_RADIUS}
              fill="none"
              stroke="currentColor"
              stroke-width="6"
              class="text-base-300/50"
            />
            <!-- Progress circle -->
            <circle
              cx="100"
              cy="100"
              r={CIRCLE_RADIUS}
              fill="none"
              stroke="currentColor"
              stroke-width="6"
              stroke-linecap="round"
              stroke-dasharray={CIRCLE_CIRCUMFERENCE}
              stroke-dashoffset={strokeDashoffset}
              class="transition-all duration-1000 {focusState.currentPhase ===
              'break'
                ? 'text-success'
                : 'text-primary'}"
            />
          </svg>

          <!-- Timer display in center -->
          <div
            class="absolute inset-0 flex flex-col items-center justify-center"
          >
            <span
              class="font-mono text-5xl font-light tracking-tight md:text-6xl {focusState.currentPhase ===
              'break'
                ? 'text-success'
                : 'text-primary'}"
            >
              {formatTimerDisplay(focusState.phaseTimeRemaining)}
            </span>
            <span
              class="mt-2 text-xs tracking-widest uppercase {focusState.currentPhase ===
              'break'
                ? 'text-success/70'
                : 'text-primary/70'}"
            >
              {focusState.currentPhase === "break" ? "休憩" : "集中"}
            </span>
          </div>
        </div>

        <!-- Task info -->
        <div class="w-full max-w-xs text-center">
          <h3
            class="truncate text-lg font-normal text-[var(--color-text-primary)]"
          >
            {activeSession.taskTitle}
          </h3>
          {#if activeSession.pomodoroState}
            <div
              class="mt-2 flex items-center justify-center gap-4 text-sm text-[var(--color-text-secondary)]"
            >
              <span>サイクル {activeSession.pomodoroState.cycleNumber}</span>
              <span class="text-base-300">・</span>
              <span>{formatDuration(focusState.elapsedWorkMinutes)}</span>
            </div>
          {/if}
        </div>

        <!-- Controls -->
        <div class="flex items-center gap-3">
          {#if focusState.currentPhase === "break"}
            <button
              class="btn gap-2 border-success/20 bg-success/10 text-success btn-sm hover:bg-success hover:text-success-content"
              onclick={handleSkipBreak}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M5 4l10 8-10 8V4zm11 0h3v16h-3V4z" />
              </svg>
              スキップ
            </button>
          {:else}
            <button
              class="btn gap-2 border-base-300 bg-base-100 text-base-content btn-sm hover:bg-base-200"
              onclick={handlePause}
            >
              {#if focusState.isPaused}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                再開
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                一時停止
              {/if}
            </button>
          {/if}

          <button
            class="btn gap-2 border-primary/20 bg-primary/10 text-primary btn-sm hover:bg-primary hover:text-primary-content"
            onclick={handleComplete}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            完了
          </button>

          <button
            class="btn btn-circle text-base-content/40 btn-ghost btn-sm hover:text-error"
            onclick={handleCancel}
            title="キャンセル"
            aria-label="キャンセル"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    {:else}
      <!-- Setup View -->
      <div class="flex w-full max-w-sm flex-col items-center gap-8">
        <!-- Decorative timer preview -->
        <div class="relative">
          <div
            class="absolute -inset-4 rounded-full bg-primary/5 blur-xl"
          ></div>
          <div
            class="relative flex h-32 w-32 items-center justify-center rounded-full border-4 border-base-200 bg-base-100"
          >
            <div class="text-center">
              <span class="block font-mono text-3xl font-light text-primary"
                >{WORK_DURATION}</span
              >
              <span
                class="text-[10px] tracking-widest text-[var(--color-text-muted)] uppercase"
                >分</span
              >
            </div>
          </div>
        </div>

        <!-- Task selector -->
        <div class="w-full">
          {#if selectedTaskId && selectedTaskTitle}
            <button
              class="group flex w-full items-center gap-4 rounded-xl border border-base-200 bg-base-100 p-4 text-left transition-all duration-200 hover:border-primary/30 hover:shadow-sm"
              onclick={() => (showTaskPicker = true)}
            >
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-[var(--color-text-muted)]">選択中</p>
                <p
                  class="truncate font-normal text-[var(--color-text-primary)]"
                >
                  {selectedTaskTitle}
                </p>
                {#if customEndTime}
                  <p class="text-xs text-[var(--color-text-secondary)]">
                    〜 {customEndTime} まで
                  </p>
                {/if}
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-base-content/30 transition-colors group-hover:text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          {:else}
            <button
              class="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-base-300 bg-base-100/50 p-6 text-[var(--color-text-secondary)] transition-all duration-200 hover:border-primary/50 hover:bg-base-100 hover:text-primary"
              onclick={() => (showTaskPicker = true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>タスクを選択</span>
            </button>
          {/if}
        </div>

        <!-- Pomodoro cycle info -->
        <div class="flex items-center gap-6">
          <div class="text-center">
            <span class="block font-mono text-2xl font-light text-primary"
              >{WORK_DURATION}</span
            >
            <span
              class="text-[10px] tracking-widest text-[var(--color-text-muted)] uppercase"
              >分集中</span
            >
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 text-base-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
          <div class="text-center">
            <span class="block font-mono text-2xl font-light text-success"
              >{BREAK_DURATION}</span
            >
            <span
              class="text-[10px] tracking-widest text-[var(--color-text-muted)] uppercase"
              >分休憩</span
            >
          </div>
        </div>

        <!-- Start button -->
        <button
          class="btn gap-3 rounded-full border-none bg-primary px-8 text-primary-content shadow-lg shadow-primary/20 transition-all duration-200 btn-lg hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:shadow-none"
          onclick={handleStart}
          disabled={!selectedTaskId}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          スタート
        </button>

        {#if currentAcceptedSuggestion && selectedTaskId !== currentAcceptedSuggestion.memoId}
          <button
            class="btn text-[var(--color-text-secondary)] btn-ghost btn-sm"
            onclick={() => {
              selectedTaskId = currentAcceptedSuggestion.memoId;
              selectedTaskTitle = currentAcceptedSuggestion.title;
              customEndTime = currentAcceptedSuggestion.endTime;
            }}
          >
            現在の予定に戻す
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Task Picker Modal -->
{#if showTaskPicker}
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2200] md:modal-middle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-picker-title"
  >
    <div
      class="modal-box flex h-full max-h-full flex-col p-0 md:h-auto md:max-h-[70vh] md:max-w-md"
    >
      <!-- Header -->
      <div
        class="flex flex-shrink-0 items-center justify-between border-b border-base-200 px-4 py-3"
      >
        <h3
          id="task-picker-title"
          class="text-base font-normal text-[var(--color-text-primary)]"
        >
          タスクを選択
        </h3>
        <button
          class="btn btn-circle btn-ghost btn-sm"
          onclick={() => (showTaskPicker = false)}
          aria-label="閉じる"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Task list -->
      <div class="flex-1 overflow-y-auto p-2">
        {#if availableTasks.length === 0}
          <div
            class="flex flex-col items-center justify-center gap-3 py-12 text-center"
          >
            <div
              class="flex h-12 w-12 items-center justify-center rounded-full bg-base-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-base-content/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <p class="text-sm text-[var(--color-text-muted)]">
              タスクがありません
            </p>
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            {#each availableTasks as task (task.id)}
              <button
                class="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors duration-150 hover:bg-base-200/80 active:bg-base-200"
                onclick={() => handleSelectTask(task)}
              >
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium {task.type ===
                  'ルーティン'
                    ? 'bg-success/10 text-success'
                    : task.type === '期限付き'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-primary/10 text-primary'}"
                >
                  {task.title.charAt(0)}
                </div>
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate font-normal text-[var(--color-text-primary)]"
                  >
                    {task.title}
                  </p>
                  <p class="text-xs text-[var(--color-text-muted)]">
                    {task.type}
                  </p>
                </div>
                {#if task.id === currentAcceptedSuggestion?.memoId}
                  <span
                    class="badge border-primary/20 bg-primary/10 badge-sm text-primary"
                  >
                    予定中
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-backdrop bg-base-content/40 backdrop-blur-sm"
      role="button"
      tabindex="-1"
      aria-label="閉じる"
      onclick={() => (showTaskPicker = false)}
    ></div>
  </div>
{/if}
