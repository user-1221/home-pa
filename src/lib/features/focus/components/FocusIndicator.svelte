<script lang="ts">
  /**
   * FocusIndicator Component
   *
   * Global indicator that shows above the bottom navigation when a task is being tracked.
   * Displays task title, elapsed time, and Pomodoro phase if applicable.
   * Can be expanded to show controls for completing/cancelling the session.
   */

  import { onMount } from "svelte";
  import { focusState } from "../state/index.ts";
  import { formatDuration, formatTimerDisplay } from "../utils/index.ts";
  import { Button } from "$lib/features/shared/components/index.ts";
  import { initTimerSSEHandler } from "../services/timer-sse-handler.ts";

  let isExpanded = $state(false);

  // Restore session from localStorage on mount
  // This handles the case where the app was closed while a timer was running
  onMount(() => {
    void focusState.loadFromStorage();

    // Initialize SSE handler for real-time cross-device sync
    const cleanupSSE = initTimerSSEHandler(focusState);

    return () => {
      cleanupSSE();
    };
  });

  function toggleExpand() {
    isExpanded = !isExpanded;
  }

  async function handleComplete() {
    await focusState.complete();
    isExpanded = false;
  }

  function handleCancel() {
    focusState.cancel();
    isExpanded = false;
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

  let isMoving = $state(false);

  async function handleMoveTimerHere() {
    isMoving = true;
    try {
      await focusState.moveTimerHere();
    } finally {
      isMoving = false;
    }
  }

  function handleDismissOtherDevice() {
    focusState.clearOtherDeviceSession();
  }
</script>

<!-- Timer running on another device -->
{#if focusState.otherDeviceSession}
  <div
    class="fixed right-0 bottom-[var(--bottom-nav-height,60px)] left-0 z-[1999] px-3 pb-2"
    style="padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));"
  >
    <div
      class="mx-auto max-w-lg overflow-hidden rounded-xl border border-warning/30 bg-warning/10 shadow-lg backdrop-blur-md"
    >
      <div class="p-3">
        <div class="flex items-start gap-3">
          <!-- Warning icon -->
          <div class="flex-shrink-0 pt-0.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-warning"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <!-- Message -->
          <div class="min-w-0 flex-1">
            <p class="text-sm text-[var(--color-text-primary)]">
              別のデバイス（<span class="font-medium"
                >{focusState.otherDeviceSession.deviceName}</span
              >）で「<span class="font-medium"
                >{focusState.otherDeviceSession.taskTitle}</span
              >」のタイマーが実行中です
            </p>
          </div>

          <!-- Dismiss button -->
          <button
            class="flex-shrink-0 p-1 text-base-content/50 hover:text-base-content"
            onclick={handleDismissOtherDevice}
            aria-label="閉じる"
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

        <!-- Move button -->
        <div class="mt-3 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onclick={handleMoveTimerHere}
            disabled={isMoving}
          >
            {#if isMoving}
              <span class="loading loading-xs loading-spinner"></span>
              移動中...
            {:else}
              このデバイスに移動
            {/if}
          </Button>
        </div>
      </div>
    </div>
  </div>
{:else if focusState.isActive && focusState.activeSession}
  <div
    class="fixed right-0 bottom-[var(--bottom-nav-height,60px)] left-0 z-[1999] px-3 pb-2"
    style="padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));"
  >
    <div
      class="mx-auto max-w-lg overflow-hidden rounded-xl border border-base-300 bg-base-100/95 shadow-lg backdrop-blur-md transition-all duration-300"
    >
      <!-- Main bar (always visible) -->
      <button
        class="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-base-200/50"
        onclick={toggleExpand}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "折りたたむ" : "展開する"}
      >
        <!-- Pulse indicator -->
        <div class="relative flex h-3 w-3 flex-shrink-0">
          {#if !focusState.isPaused}
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 {focusState.currentPhase ===
              'break'
                ? 'bg-success'
                : 'bg-primary'}"
            ></span>
          {/if}
          <span
            class="relative inline-flex h-3 w-3 rounded-full {focusState.isPaused
              ? 'bg-base-300'
              : focusState.currentPhase === 'break'
                ? 'bg-success'
                : 'bg-primary'}"
          ></span>
        </div>

        <!-- Task info -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="truncate text-sm font-medium text-[var(--color-text-primary)]"
            >
              {focusState.activeSession.taskTitle}
            </span>
            {#if focusState.activeSession.mode === "pomodoro" && focusState.activeSession.pomodoroState}
              <span
                class="badge badge-xs {focusState.currentPhase === 'break'
                  ? 'bg-success/15 text-success'
                  : 'bg-primary/15 text-primary'}"
              >
                {focusState.currentPhase === "break" ? "休憩" : "集中"}
                #{focusState.activeSession.pomodoroState.cycleNumber}
              </span>
            {/if}
            {#if focusState.isPaused}
              <span class="badge bg-base-200 badge-xs text-base-content/60">
                一時停止
              </span>
            {/if}
          </div>
        </div>

        <!-- Timer display -->
        <div class="flex flex-shrink-0 items-center gap-2">
          {#if focusState.activeSession.mode === "pomodoro"}
            <!-- Pomodoro: show phase timer -->
            <span
              class="font-mono text-sm font-medium {focusState.currentPhase ===
              'break'
                ? 'text-success'
                : 'text-primary'}"
            >
              {formatTimerDisplay(focusState.phaseTimeRemaining)}
            </span>
          {:else}
            <!-- Normal: show elapsed time -->
            <span class="font-mono text-sm font-medium text-primary">
              {formatDuration(focusState.elapsedWorkMinutes)}
            </span>
          {/if}

          <!-- Expand/collapse arrow -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 text-base-content/50 transition-transform duration-200 {isExpanded
              ? 'rotate-180'
              : ''}"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 15l7-7 7 7"
            />
          </svg>
        </div>
      </button>

      <!-- Expanded controls -->
      {#if isExpanded}
        <div class="border-t border-base-200 p-3">
          <div class="flex flex-col gap-3">
            <!-- Progress info -->
            <div class="flex items-center justify-between text-sm">
              <span class="text-[var(--color-text-secondary)]">作業時間</span>
              <span
                class="font-mono font-medium text-[var(--color-text-primary)]"
              >
                {formatDuration(focusState.elapsedWorkMinutes)}
              </span>
            </div>

            {#if focusState.activeSession.mode === "pomodoro" && focusState.activeSession.pomodoroState}
              <!-- Pomodoro-specific info -->
              <div class="flex items-center justify-between text-sm">
                <span class="text-[var(--color-text-secondary)]">サイクル</span>
                <span
                  class="font-mono font-medium text-[var(--color-text-primary)]"
                >
                  {focusState.activeSession.pomodoroState.cycleNumber}回目
                </span>
              </div>

              <!-- Phase progress bar -->
              <div class="h-1.5 overflow-hidden rounded-full bg-base-200">
                <div
                  class="h-full transition-all duration-1000 {focusState.currentPhase ===
                  'break'
                    ? 'bg-success'
                    : 'bg-primary'}"
                  style="width: {focusState.phaseProgress}%"
                ></div>
              </div>
            {/if}

            <!-- Action buttons -->
            <div class="flex gap-2">
              {#if focusState.currentPhase === "break"}
                <Button
                  variant="success"
                  size="sm"
                  class="flex-1"
                  onclick={handleSkipBreak}
                >
                  休憩をスキップ
                </Button>
              {:else}
                <Button
                  variant="secondary"
                  size="sm"
                  class="flex-1"
                  onclick={handlePause}
                >
                  {focusState.isPaused ? "再開" : "一時停止"}
                </Button>
              {/if}

              <Button
                variant="primary"
                size="sm"
                class="flex-1"
                onclick={handleComplete}
              >
                完了
              </Button>

              <Button
                variant="ghost"
                size="sm"
                class="hover:text-error"
                onclick={handleCancel}
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
              </Button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
