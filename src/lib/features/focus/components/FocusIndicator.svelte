<script lang="ts">
  /**
   * FocusIndicator Component
   *
   * Global indicator that shows above the bottom navigation when a task is being tracked.
   * Displays task title, elapsed time, and Pomodoro phase if applicable.
   * Can be expanded to show controls for completing/cancelling the session.
   */

  import { focusState } from "../state/index.ts";
  import { formatDuration, formatTimerDisplay } from "../utils/index.ts";

  let isExpanded = $state(false);

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
</script>

{#if focusState.isActive && focusState.activeSession}
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
            class="h-4 w-4 text-base-content/40 transition-transform duration-200 {isExpanded
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
                <button
                  class="btn flex-1 border-success/30 bg-success/10 text-success btn-sm hover:bg-success hover:text-success-content"
                  onclick={handleSkipBreak}
                >
                  休憩をスキップ
                </button>
              {:else}
                <button
                  class="btn flex-1 border-base-300 bg-base-200 text-base-content btn-sm hover:bg-base-300"
                  onclick={handlePause}
                >
                  {focusState.isPaused ? "再開" : "一時停止"}
                </button>
              {/if}

              <button
                class="btn flex-1 border-primary/30 bg-primary/10 text-primary btn-sm hover:bg-primary hover:text-primary-content"
                onclick={handleComplete}
              >
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
        </div>
      {/if}
    </div>
  </div>
{/if}
