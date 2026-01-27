<script lang="ts">
  /**
   * PixelTimerView Component
   *
   * RPG-style pixel art timer with game-like UI.
   * - Walking animation when working (not paused)
   * - Static/resting when paused or on break
   * - Same functionality as PomodoroView
   */

  import { onMount } from "svelte";
  import { focusState } from "../state/index.ts";
  import { formatTimerDisplay, formatDuration } from "../utils/index.ts";
  import { scheduleState } from "$lib/features/assistant/state/schedule.svelte.ts";
  import { taskState } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import PixelSprite from "./PixelSprite.svelte";
  import type { Memo } from "$lib/types.ts";

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  // Walking animation frames (24 frames: 00-23)
  const WALK_FRAMES = Array.from(
    { length: 24 },
    (_, i) =>
      `/pixel-timer/walk/pixel_knight_walking${i.toString().padStart(2, "0")}.png`,
  );

  // Resting frames (for break/pause) - use first walk frame as static for now
  const REST_FRAMES = [WALK_FRAMES[0]];

  // Local state
  let selectedTaskId = $state<string | null>(null);
  let selectedTaskTitle = $state<string>("");
  let customEndTime = $state<string | null>(null);
  let showTaskPicker = $state(false);

  // Pomodoro settings
  const WORK_DURATION = 25;
  const BREAK_DURATION = 5;

  // Animation settings
  const ANIMATION_FPS = 18;

  // Animation state
  let isAnimating = $derived(
    focusState.isActive &&
      focusState.currentPhase === "work" &&
      !focusState.isPaused,
  );
  let currentFrames = $derived(isAnimating ? WALK_FRAMES : REST_FRAMES);

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

  // Available tasks for manual selection
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

  let isStarting = $state(false);

  async function handleStart() {
    if (!selectedTaskId || !selectedTaskTitle || isStarting) return;

    let endTime = customEndTime;
    if (!endTime) {
      const now = Date.now();
      const endDate = new Date(now + 2 * 60 * 60 * 1000);
      endTime = `${endDate.getHours().toString().padStart(2, "0")}:${endDate.getMinutes().toString().padStart(2, "0")}`;
    }

    isStarting = true;
    try {
      await focusState.startPomodoro(
        selectedTaskId,
        selectedTaskTitle,
        endTime,
        WORK_DURATION,
        BREAK_DURATION,
      );
    } finally {
      isStarting = false;
    }
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

  // Cross-device state
  let isMoving = $state(false);
  let hasOtherDeviceSession = $derived(focusState.otherDeviceSession !== null);

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

<svelte:window onkeydown={handleKeydown} />

<div class="pixel-game flex h-full flex-col">
  <!-- ═══════════════════════════════════════════════════════════════════════
       TOP BAR - Game-style header
       ═══════════════════════════════════════════════════════════════════════ -->
  <div class="game-header">
    <div class="flex items-center gap-8">
      <!-- Pixel controller icon -->
      <svg class="h-16 w-16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="4" width="4" height="4" />
        <rect x="4" y="2" width="4" height="4" />
        <rect x="4" y="6" width="4" height="4" />
        <rect x="6" y="4" width="4" height="4" />
        <rect x="10" y="5" width="2" height="2" />
        <rect x="13" y="5" width="2" height="2" />
        <rect x="11" y="7" width="2" height="2" />
      </svg>
      <!-- Title -->
      <span class="game-title">PIXEL TIMER</span>
    </div>
    {#if onClose}
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
          <rect x="3" y="3" width="2" height="2" />
          <rect x="5" y="5" width="2" height="2" />
          <rect x="7" y="7" width="2" height="2" />
          <rect x="9" y="5" width="2" height="2" />
          <rect x="11" y="3" width="2" height="2" />
          <rect x="5" y="9" width="2" height="2" />
          <rect x="3" y="11" width="2" height="2" />
          <rect x="9" y="9" width="2" height="2" />
          <rect x="11" y="11" width="2" height="2" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════
       MAIN CONTENT AREA
       ═══════════════════════════════════════════════════════════════════════ -->
  <div class="game-content">
    <!-- Cross-device warning -->
    {#if hasOtherDeviceSession && focusState.otherDeviceSession}
      <div class="pixel-panel warning-panel">
        <div class="panel-header">
          <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
            <rect x="7" y="2" width="2" height="2" />
            <rect x="7" y="5" width="2" height="5" />
            <rect x="7" y="12" width="2" height="2" />
          </svg>
          <span>NOTICE</span>
        </div>
        <div class="panel-body">
          <p class="mb-4">
            Timer active on {focusState.otherDeviceSession.deviceName}
          </p>
          <p class="text-xs opacity-70">
            {focusState.otherDeviceSession.taskTitle}
          </p>
        </div>
        <div class="flex gap-8">
          <button
            class="action-btn action-btn-primary flex-1"
            onclick={handleMoveTimerHere}
            disabled={isMoving}
          >
            {isMoving ? "..." : "TAKE OVER"}
          </button>
          <button class="action-btn" onclick={handleDismissOtherDevice}>
            DISMISS
          </button>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════
           ACTIVE SESSION VIEW
           ═══════════════════════════════════════════════════════════════════ -->
    {:else if isTracking && activeSession}
      <div class="game-screen">
        <!-- Character Area - Central Focus -->
        <div class="character-stage">
          <PixelSprite
            frames={currentFrames}
            playing={isAnimating}
            fps={ANIMATION_FPS}
            class="h-64 md:h-80"
            alt={isAnimating ? "Walking character" : "Resting character"}
          />
        </div>

        <!-- Timer Display Panel -->
        <div
          class="timer-panel {focusState.currentPhase === 'break'
            ? 'timer-break'
            : 'timer-work'}"
        >
          <div class="timer-value">
            {formatTimerDisplay(focusState.phaseTimeRemaining)}
          </div>
          <div class="timer-phase">
            {focusState.currentPhase === "break" ? "REST TIME" : "FOCUS TIME"}
            {#if focusState.isPaused}
              <span class="paused-indicator">PAUSED</span>
            {/if}
          </div>
        </div>

        <!-- Quest Panel -->
        <div class="quest-panel">
          <div class="quest-header">
            <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="1" width="12" height="2" />
              <rect x="2" y="3" width="2" height="10" />
              <rect x="12" y="3" width="2" height="10" />
              <rect x="2" y="13" width="12" height="2" />
              <rect x="5" y="5" width="6" height="2" />
              <rect x="5" y="9" width="4" height="2" />
            </svg>
            <span>CURRENT QUEST</span>
          </div>
          <div class="quest-title">{activeSession.taskTitle}</div>
          {#if activeSession.pomodoroState}
            <div class="quest-stats">
              <span>CYCLE {activeSession.pomodoroState.cycleNumber}</span>
              <span class="stat-divider"></span>
              <span>{formatDuration(focusState.elapsedWorkMinutes)}</span>
            </div>
          {/if}
        </div>

        <!-- Control Buttons -->
        <div class="control-buttons">
          {#if focusState.currentPhase === "break"}
            <button
              class="action-btn action-btn-success"
              onclick={handleSkipBreak}
            >
              SKIP REST
            </button>
          {:else}
            <button class="action-btn" onclick={handlePause}>
              {focusState.isPaused ? "CONTINUE" : "PAUSE"}
            </button>
          {/if}

          <button
            class="action-btn action-btn-primary"
            onclick={handleComplete}
          >
            COMPLETE
          </button>

          <button class="action-btn action-btn-danger" onclick={handleCancel}>
            ABANDON
          </button>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════
           SETUP VIEW - Quest Selection
           ═══════════════════════════════════════════════════════════════════ -->
    {:else}
      <div class="game-screen">
        <!-- Character Area - Central Focus -->
        <div class="character-stage">
          <PixelSprite
            frames={WALK_FRAMES}
            playing={true}
            fps={ANIMATION_FPS}
            class="h-64 md:h-80"
            alt="Character preview"
          />
        </div>

        <!-- Quest Selection Panel -->
        <div class="quest-panel">
          <div class="quest-header">
            <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="1" width="12" height="2" />
              <rect x="2" y="3" width="2" height="10" />
              <rect x="12" y="3" width="2" height="10" />
              <rect x="2" y="13" width="12" height="2" />
              <rect x="5" y="5" width="6" height="2" />
              <rect x="5" y="9" width="4" height="2" />
            </svg>
            <span>SELECT QUEST</span>
          </div>
          {#if selectedTaskId && selectedTaskTitle}
            <button
              class="quest-selected"
              onclick={() => (showTaskPicker = true)}
            >
              <span class="quest-title">{selectedTaskTitle}</span>
              <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
                <rect x="6" y="2" width="2" height="2" />
                <rect x="8" y="4" width="2" height="2" />
                <rect x="10" y="6" width="2" height="2" />
                <rect x="8" y="8" width="2" height="2" />
                <rect x="6" y="10" width="2" height="2" />
              </svg>
            </button>
          {:else}
            <button class="quest-empty" onclick={() => (showTaskPicker = true)}>
              <svg class="h-16 w-16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="7" y="3" width="2" height="10" />
                <rect x="3" y="7" width="10" height="2" />
              </svg>
              <span>CHOOSE A QUEST</span>
            </button>
          {/if}
        </div>

        <!-- Game Rules Panel -->
        <div class="rules-panel">
          <div class="rule-item">
            <!-- Sword icon for work -->
            <svg class="rule-icon" viewBox="0 0 16 16" fill="currentColor">
              <rect x="7" y="1" width="2" height="2" />
              <rect x="7" y="3" width="2" height="8" />
              <rect x="4" y="11" width="8" height="2" />
              <rect x="6" y="13" width="4" height="2" />
            </svg>
            <span class="rule-value">{WORK_DURATION}</span>
            <span class="rule-label">MIN</span>
          </div>
          <div class="rule-divider">
            <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="7" width="2" height="2" />
              <rect x="7" y="7" width="2" height="2" />
              <rect x="11" y="7" width="2" height="2" />
            </svg>
          </div>
          <div class="rule-item">
            <!-- Campfire icon for rest -->
            <svg class="rule-icon" viewBox="0 0 16 16" fill="currentColor">
              <rect x="7" y="1" width="2" height="2" />
              <rect x="6" y="3" width="4" height="2" />
              <rect x="5" y="5" width="6" height="2" />
              <rect x="4" y="7" width="8" height="2" />
              <rect x="3" y="9" width="2" height="2" />
              <rect x="11" y="9" width="2" height="2" />
              <rect x="2" y="11" width="4" height="2" />
              <rect x="10" y="11" width="4" height="2" />
            </svg>
            <span class="rule-value">{BREAK_DURATION}</span>
            <span class="rule-label">MIN</span>
          </div>
        </div>

        <!-- Primary Action Button -->
        <button
          class="primary-action-btn"
          onclick={handleStart}
          disabled={!selectedTaskId}
        >
          BEGIN QUEST
        </button>

        {#if currentAcceptedSuggestion && selectedTaskId !== currentAcceptedSuggestion.memoId}
          <button
            class="action-btn mt-8"
            onclick={() => {
              selectedTaskId = currentAcceptedSuggestion.memoId;
              selectedTaskTitle = currentAcceptedSuggestion.title;
              customEndTime = currentAcceptedSuggestion.endTime;
            }}
          >
            USE SCHEDULED
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     TASK PICKER MODAL
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if showTaskPicker}
  <div
    class="pixel-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-picker-title"
  >
    <div class="modal-panel">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="flex items-center gap-8">
          <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="1" width="12" height="2" />
            <rect x="2" y="3" width="2" height="10" />
            <rect x="12" y="3" width="2" height="10" />
            <rect x="2" y="13" width="12" height="2" />
            <rect x="5" y="5" width="6" height="2" />
            <rect x="5" y="9" width="4" height="2" />
          </svg>
          <span id="task-picker-title">QUEST LIST</span>
        </div>
        <button
          class="close-btn"
          onclick={() => (showTaskPicker = false)}
          aria-label="Close"
        >
          <svg class="h-12 w-12" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="2" height="2" />
            <rect x="5" y="5" width="2" height="2" />
            <rect x="7" y="7" width="2" height="2" />
            <rect x="9" y="5" width="2" height="2" />
            <rect x="11" y="3" width="2" height="2" />
            <rect x="5" y="9" width="2" height="2" />
            <rect x="3" y="11" width="2" height="2" />
            <rect x="9" y="9" width="2" height="2" />
            <rect x="11" y="11" width="2" height="2" />
          </svg>
        </button>
      </div>

      <!-- Task List -->
      <div class="modal-body">
        {#if availableTasks.length === 0}
          <div class="empty-state">
            <svg class="h-24 w-24" viewBox="0 0 16 16" fill="currentColor">
              <rect x="6" y="3" width="4" height="2" />
              <rect x="5" y="5" width="2" height="2" />
              <rect x="9" y="5" width="2" height="2" />
              <rect x="6" y="11" width="4" height="2" />
            </svg>
            <span>NO QUESTS AVAILABLE</span>
          </div>
        {:else}
          <div class="quest-list">
            {#each availableTasks as task (task.id)}
              <button class="quest-item" onclick={() => handleSelectTask(task)}>
                <div
                  class="quest-icon {task.type === 'ルーティン'
                    ? 'quest-routine'
                    : task.type === '期限付き'
                      ? 'quest-deadline'
                      : 'quest-normal'}"
                >
                  {task.title.charAt(0).toUpperCase()}
                </div>
                <div class="quest-info">
                  <span class="quest-name">{task.title}</span>
                  <span class="quest-type">{task.type}</span>
                </div>
                {#if task.id === currentAcceptedSuggestion?.memoId}
                  <span class="quest-badge">NOW</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-backdrop"
      role="button"
      tabindex="-1"
      aria-label="Close"
      onclick={() => (showTaskPicker = false)}
    ></div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     BASE STYLES - Pixel art foundation
     ═══════════════════════════════════════════════════════════════════════════ */
  .pixel-game {
    font-family: monospace;
    image-rendering: pixelated;
    background: oklch(var(--b2));
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     GAME HEADER - Top bar
     ═══════════════════════════════════════════════════════════════════════════ */
  .game-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: oklch(var(--b1));
    border-bottom: 4px solid oklch(var(--bc) / 0.2);
  }

  .game-title {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.1em;
    color: oklch(var(--bc));
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: oklch(var(--b3));
    color: oklch(var(--bc) / 0.6);
    border: none;
    cursor: pointer;
  }

  .close-btn:hover {
    background: oklch(var(--er));
    color: oklch(var(--erc));
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     GAME CONTENT - Main area
     ═══════════════════════════════════════════════════════════════════════════ */
  .game-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    overflow-y: auto;
  }

  .game-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
    max-width: 400px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CHARACTER STAGE - Central focus area
     ═══════════════════════════════════════════════════════════════════════════ */
  .character-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TIMER PANEL - Time display
     ═══════════════════════════════════════════════════════════════════════════ */
  .timer-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 24px;
    background: oklch(var(--b1));
    border: 4px solid;
  }

  .timer-work {
    border-color: oklch(var(--p));
  }

  .timer-break {
    border-color: oklch(var(--su));
  }

  .timer-value {
    font-size: 48px;
    font-weight: bold;
    letter-spacing: 0.15em;
    line-height: 1;
  }

  .timer-work .timer-value {
    color: oklch(var(--p));
  }

  .timer-break .timer-value {
    color: oklch(var(--su));
  }

  .timer-phase {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.2em;
    color: oklch(var(--bc) / 0.7);
  }

  .paused-indicator {
    padding: 2px 8px;
    background: oklch(var(--wa));
    color: oklch(var(--wac));
    font-size: 10px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     QUEST PANEL - Task display
     ═══════════════════════════════════════════════════════════════════════════ */
  .quest-panel {
    width: 100%;
    background: oklch(var(--b1));
    border: 4px solid oklch(var(--bc) / 0.3);
  }

  .quest-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: oklch(var(--bc) / 0.1);
    border-bottom: 2px solid oklch(var(--bc) / 0.2);
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: oklch(var(--bc) / 0.7);
  }

  .quest-title {
    padding: 12px;
    font-size: 14px;
    font-weight: bold;
    color: oklch(var(--bc));
    text-align: center;
    word-break: break-word;
  }

  .quest-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px;
    border-top: 2px solid oklch(var(--bc) / 0.1);
    font-size: 11px;
    color: oklch(var(--bc) / 0.6);
  }

  .stat-divider {
    width: 4px;
    height: 4px;
    background: oklch(var(--bc) / 0.3);
  }

  .quest-selected {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: oklch(var(--bc));
  }

  .quest-selected:hover {
    background: oklch(var(--wa) / 0.1);
  }

  .quest-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 24px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: oklch(var(--bc) / 0.5);
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.1em;
  }

  .quest-empty:hover {
    background: oklch(var(--wa) / 0.1);
    color: oklch(var(--wa));
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RULES PANEL - Game rules display
     ═══════════════════════════════════════════════════════════════════════════ */
  .rules-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 12px 24px;
    background: oklch(var(--b1));
    border: 2px solid oklch(var(--bc) / 0.2);
  }

  .rule-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .rule-icon {
    width: 20px;
    height: 20px;
    color: oklch(var(--bc) / 0.5);
  }

  .rule-value {
    font-size: 24px;
    font-weight: bold;
    color: oklch(var(--bc));
    line-height: 1;
  }

  .rule-label {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.1em;
    color: oklch(var(--bc) / 0.5);
  }

  .rule-divider {
    color: oklch(var(--bc) / 0.3);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     BUTTONS - Action buttons
     ═══════════════════════════════════════════════════════════════════════════ */
  .action-btn {
    padding: 8px 16px;
    background: oklch(var(--b3));
    border: none;
    font-family: monospace;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.1em;
    color: oklch(var(--bc));
    cursor: pointer;
    box-shadow:
      inset -2px -2px 0 oklch(var(--bc) / 0.3),
      inset 2px 2px 0 oklch(var(--b1) / 0.5);
  }

  .action-btn:hover {
    background: oklch(var(--bc) / 0.2);
  }

  .action-btn:active {
    box-shadow:
      inset 2px 2px 0 oklch(var(--bc) / 0.3),
      inset -2px -2px 0 oklch(var(--b1) / 0.5);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn-primary {
    background: oklch(var(--p));
    color: oklch(var(--pc));
  }

  .action-btn-primary:hover {
    background: oklch(var(--p) / 0.8);
  }

  .action-btn-success {
    background: oklch(var(--su));
    color: oklch(var(--suc));
  }

  .action-btn-success:hover {
    background: oklch(var(--su) / 0.8);
  }

  .action-btn-danger {
    background: oklch(var(--er) / 0.7);
    color: oklch(var(--erc));
  }

  .action-btn-danger:hover {
    background: oklch(var(--er));
  }

  .control-buttons {
    display: flex;
    gap: 8px;
  }

  .primary-action-btn {
    padding: 16px 32px;
    background: oklch(var(--wa));
    border: none;
    font-family: monospace;
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: oklch(var(--wac));
    cursor: pointer;
    box-shadow:
      4px 4px 0 oklch(var(--wa) / 0.5),
      inset -2px -2px 0 oklch(var(--bc) / 0.2),
      inset 2px 2px 0 oklch(var(--b1) / 0.3);
  }

  .primary-action-btn:hover {
    box-shadow:
      2px 2px 0 oklch(var(--wa) / 0.5),
      inset -2px -2px 0 oklch(var(--bc) / 0.2),
      inset 2px 2px 0 oklch(var(--b1) / 0.3);
  }

  .primary-action-btn:active {
    box-shadow:
      inset 2px 2px 0 oklch(var(--bc) / 0.3),
      inset -2px -2px 0 oklch(var(--b1) / 0.3);
  }

  .primary-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PIXEL PANELS - Generic panel style
     ═══════════════════════════════════════════════════════════════════════════ */
  .pixel-panel {
    width: 100%;
    max-width: 320px;
    background: oklch(var(--b1));
    border: 4px solid oklch(var(--bc) / 0.3);
  }

  .warning-panel {
    border-color: oklch(var(--wa));
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: oklch(var(--wa) / 0.2);
    border-bottom: 2px solid oklch(var(--wa) / 0.3);
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: oklch(var(--wa));
  }

  .panel-body {
    padding: 12px;
    font-size: 12px;
    color: oklch(var(--bc));
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MODAL - Task picker
     ═══════════════════════════════════════════════════════════════════════════ */
  .pixel-modal {
    position: fixed;
    inset: 0;
    z-index: 2200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal-backdrop {
    position: absolute;
    inset: 0;
    background: oklch(var(--bc) / 0.4);
  }

  .modal-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 400px;
    max-height: 70vh;
    background: oklch(var(--b1));
    border: 4px solid oklch(var(--bc) / 0.3);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: oklch(var(--bc) / 0.1);
    border-bottom: 2px solid oklch(var(--bc) / 0.2);
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 0.1em;
    color: oklch(var(--bc));
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    background: oklch(var(--b2));
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px;
    color: oklch(var(--bc) / 0.4);
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.1em;
  }

  .quest-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .quest-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    background: oklch(var(--b1));
    border: 2px solid transparent;
    cursor: pointer;
    text-align: left;
  }

  .quest-item:hover {
    border-color: oklch(var(--wa));
    background: oklch(var(--wa) / 0.1);
  }

  .quest-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    font-size: 14px;
    font-weight: bold;
    border: 2px solid;
  }

  .quest-routine {
    border-color: oklch(var(--su));
    background: oklch(var(--su) / 0.2);
    color: oklch(var(--su));
  }

  .quest-deadline {
    border-color: oklch(var(--wa));
    background: oklch(var(--wa) / 0.2);
    color: oklch(var(--wa));
  }

  .quest-normal {
    border-color: oklch(var(--p));
    background: oklch(var(--p) / 0.2);
    color: oklch(var(--p));
  }

  .quest-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .quest-name {
    font-size: 13px;
    font-weight: bold;
    color: oklch(var(--bc));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quest-type {
    font-size: 10px;
    color: oklch(var(--bc) / 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .quest-badge {
    padding: 2px 8px;
    background: oklch(var(--wa));
    color: oklch(var(--wac));
    font-size: 10px;
    font-weight: bold;
  }

  /* Mobile full-screen modal */
  @media (max-width: 640px) {
    .modal-panel {
      max-width: none;
      max-height: none;
      height: 100%;
      border: none;
    }
  }
</style>
