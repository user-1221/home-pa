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
  let selectedDuration = $state(120); // Default 2 hours (in minutes)

  // Pomodoro settings
  const WORK_DURATION = 25;
  const BREAK_DURATION = 5;

  // Animation settings
  const ANIMATION_FPS = 18;

  // Duration settings (30-minute increments)
  const DURATION_STEP = 30; // 30 minutes
  const DURATION_MIN = 30; // Minimum 30 minutes
  const DURATION_MAX = 300; // Maximum 5 hours

  // Format duration for display in hours (e.g., "2" or "1.5")
  let durationDisplay = $derived.by(() => {
    const hours = selectedDuration / 60;
    if (Number.isInteger(hours)) {
      return `${hours}`;
    }
    // Show one decimal place for half-hours (e.g., 1.5h)
    return `${hours.toFixed(1).replace(/\.0$/, "")}`;
  });

  function decreaseDuration() {
    if (selectedDuration > DURATION_MIN) {
      selectedDuration -= DURATION_STEP;
    }
  }

  function increaseDuration() {
    if (selectedDuration < DURATION_MAX) {
      selectedDuration += DURATION_STEP;
    }
  }

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
      const endDate = new Date(now + selectedDuration * 60 * 1000);
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
    <div class="flex items-center gap-3">
      <!-- Pixel sword icon -->
      <svg class="h-5 w-5" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="1" width="2" height="2" />
        <rect x="3" y="3" width="2" height="2" />
        <rect x="5" y="5" width="2" height="2" />
        <rect x="7" y="7" width="2" height="2" />
        <rect x="9" y="9" width="2" height="2" />
        <rect x="11" y="11" width="2" height="2" />
        <rect x="9" y="13" width="2" height="2" />
        <rect x="13" y="9" width="2" height="2" />
      </svg>
      <!-- Title -->
      <span class="game-title">PIXEL TIMER</span>
    </div>
    {#if onClose}
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
          <rect x="0" y="0" width="2" height="2" />
          <rect x="2" y="2" width="2" height="2" />
          <rect x="4" y="4" width="4" height="4" />
          <rect x="8" y="2" width="2" height="2" />
          <rect x="10" y="0" width="2" height="2" />
          <rect x="2" y="8" width="2" height="2" />
          <rect x="0" y="10" width="2" height="2" />
          <rect x="8" y="8" width="2" height="2" />
          <rect x="10" y="10" width="2" height="2" />
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

        <!-- Quest Panel -->
        <div class="quest-panel-active">
          <div class="quest-header-active">
            <!-- Pixel art scroll icon -->
            <svg class="quest-header-icon" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="1" width="12" height="2" fill="#D8B070" />
              <rect x="2" y="1" width="12" height="1" fill="#E8C888" />
              <rect x="1" y="2" width="1" height="1" fill="#B89050" />
              <rect x="14" y="2" width="1" height="1" fill="#A88040" />
              <rect x="3" y="3" width="10" height="10" fill="#E9D8B8" />
              <rect x="3" y="3" width="10" height="1" fill="#F5EED8" />
              <rect x="5" y="5" width="2" height="1" fill="#C4A880" />
              <rect x="8" y="7" width="3" height="1" fill="#D8C098" />
              <rect x="6" y="9" width="2" height="1" fill="#C4A880" />
              <rect x="2" y="13" width="12" height="2" fill="#C4A060" />
              <rect x="2" y="14" width="12" height="1" fill="#B89050" />
            </svg>
            <span>QUEST</span>
          </div>
          <div class="quest-title-active">{activeSession.taskTitle}</div>
          {#if activeSession.pomodoroState}
            <div class="quest-stats-active">
              <span class="stat-label">CYCLE</span>
              <span class="stat-value"
                >{activeSession.pomodoroState.cycleNumber}</span
              >
              <span class="stat-divider-active"></span>
              <span class="stat-label">TIME</span>
              <span class="stat-value"
                >{formatDuration(focusState.elapsedWorkMinutes)}</span
              >
            </div>
          {/if}
        </div>

        <!-- Timer Display Panel -->
        <div
          class="timer-panel-active {focusState.currentPhase === 'break'
            ? 'timer-break-active'
            : 'timer-work-active'}"
        >
          <div class="timer-value-active">
            {formatTimerDisplay(focusState.phaseTimeRemaining)}
          </div>
          <div class="timer-phase-active">
            {focusState.currentPhase === "break" ? "REST" : "FOCUS"}
            {#if focusState.isPaused}
              <span class="paused-indicator-active">PAUSED</span>
            {/if}
          </div>
        </div>

        <!-- Control Buttons -->
        <div class="control-buttons-active">
          {#if focusState.currentPhase === "break"}
            <button class="ctrl-btn ctrl-btn-skip" onclick={handleSkipBreak}>
              <svg viewBox="0 0 16 16" fill="none" class="ctrl-btn-icon">
                <rect x="3" y="4" width="2" height="8" fill="currentColor" />
                <rect x="6" y="6" width="2" height="4" fill="currentColor" />
                <rect x="8" y="5" width="2" height="6" fill="currentColor" />
                <rect x="10" y="4" width="2" height="8" fill="currentColor" />
              </svg>
              <span>SKIP</span>
            </button>
          {:else}
            <button class="ctrl-btn ctrl-btn-pause" onclick={handlePause}>
              {#if focusState.isPaused}
                <svg viewBox="0 0 16 16" fill="none" class="ctrl-btn-icon">
                  <rect x="5" y="3" width="2" height="10" fill="currentColor" />
                  <rect x="7" y="4" width="2" height="8" fill="currentColor" />
                  <rect x="9" y="5" width="2" height="6" fill="currentColor" />
                  <rect x="11" y="6" width="2" height="4" fill="currentColor" />
                </svg>
                <span>RESUME</span>
              {:else}
                <svg viewBox="0 0 16 16" fill="none" class="ctrl-btn-icon">
                  <rect x="4" y="3" width="3" height="10" fill="currentColor" />
                  <rect x="9" y="3" width="3" height="10" fill="currentColor" />
                </svg>
                <span>PAUSE</span>
              {/if}
            </button>
          {/if}

          <button class="ctrl-btn ctrl-btn-complete" onclick={handleComplete}>
            <svg viewBox="0 0 16 16" fill="none" class="ctrl-btn-icon">
              <rect x="3" y="8" width="2" height="2" fill="currentColor" />
              <rect x="5" y="10" width="2" height="2" fill="currentColor" />
              <rect x="7" y="8" width="2" height="2" fill="currentColor" />
              <rect x="9" y="6" width="2" height="2" fill="currentColor" />
              <rect x="11" y="4" width="2" height="2" fill="currentColor" />
            </svg>
            <span>COMPLETE</span>
          </button>

          <button class="ctrl-btn ctrl-btn-abandon" onclick={handleCancel}>
            <svg viewBox="0 0 16 16" fill="none" class="ctrl-btn-icon">
              <rect x="4" y="4" width="2" height="2" fill="currentColor" />
              <rect x="6" y="6" width="2" height="2" fill="currentColor" />
              <rect x="8" y="6" width="2" height="2" fill="currentColor" />
              <rect x="10" y="4" width="2" height="2" fill="currentColor" />
              <rect x="4" y="10" width="2" height="2" fill="currentColor" />
              <rect x="6" y="8" width="2" height="2" fill="currentColor" />
              <rect x="8" y="8" width="2" height="2" fill="currentColor" />
              <rect x="10" y="10" width="2" height="2" fill="currentColor" />
            </svg>
            <span>QUIT</span>
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
          {#if selectedTaskId && selectedTaskTitle}
            <button
              class="quest-selected"
              onclick={() => (showTaskPicker = true)}
            >
              <!-- Medieval sign board shape -->
              <svg
                class="quest-sign-bg"
                viewBox="0 0 200 50"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient
                    id="woodGrain"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stop-color="#C4956A" />
                    <stop offset="20%" stop-color="#B8896A" />
                    <stop offset="50%" stop-color="#A07050" />
                    <stop offset="80%" stop-color="#906040" />
                    <stop offset="100%" stop-color="#805030" />
                  </linearGradient>
                  <linearGradient
                    id="woodHighlight"
                    x1="0%"
                    y1="0%"
                    x2="0%"
                    y2="100%"
                  >
                    <stop offset="0%" stop-color="#D8B080" />
                    <stop offset="100%" stop-color="#C4956A" />
                  </linearGradient>
                </defs>
                <!-- Main sign shape with wavy edges and corner points -->
                <path
                  d="M12,8
                     Q12,2 18,2
                     L40,6 Q100,10 160,6 L182,2
                     Q188,2 188,8
                     L192,18 Q196,25 192,32
                     L188,42
                     Q188,48 182,48
                     L160,44 Q100,40 40,44 L18,48
                     Q12,48 12,42
                     L8,32 Q4,25 8,18
                     Z"
                  fill="url(#woodGrain)"
                  stroke="url(#woodHighlight)"
                  stroke-width="2"
                />
              </svg>
              <span class="quest-title">{selectedTaskTitle}</span>
            </button>
          {:else}
            <div class="quest-empty">
              <div class="quest-board-container">
                <!-- High-detail painterly quest board (128x96) -->
                <svg viewBox="0 0 128 96" fill="none" class="quest-board-svg">
                  <!-- === WOOD FRAME (detailed grain, top-left lighting) === -->
                  <!-- Top frame - gradient from highlight to shadow -->
                  <rect x="0" y="0" width="128" height="6" fill="#8B6B4A" />
                  <rect x="0" y="0" width="128" height="1" fill="#C4956A" />
                  <rect x="0" y="1" width="128" height="1" fill="#B8896A" />
                  <rect x="0" y="2" width="128" height="1" fill="#A87D5A" />
                  <rect x="0" y="3" width="128" height="1" fill="#9B6B4A" />
                  <rect x="0" y="4" width="128" height="1" fill="#8B5B3A" />
                  <rect x="0" y="5" width="128" height="1" fill="#7D5640" />
                  <!-- Top grain details (knots, streaks) -->
                  <rect x="8" y="0" width="4" height="1" fill="#D4A57A" />
                  <rect x="9" y="1" width="3" height="1" fill="#C8A070" />
                  <rect x="10" y="2" width="2" height="1" fill="#B89060" />
                  <rect x="25" y="1" width="2" height="1" fill="#9B6B4A" />
                  <rect x="26" y="2" width="3" height="1" fill="#8B5B3A" />
                  <rect x="27" y="3" width="2" height="1" fill="#7D5035" />
                  <rect x="45" y="0" width="5" height="1" fill="#D8B080" />
                  <rect x="46" y="1" width="4" height="1" fill="#C4956A" />
                  <rect x="70" y="1" width="3" height="1" fill="#A87850" />
                  <rect x="71" y="2" width="4" height="1" fill="#987048" />
                  <rect x="72" y="3" width="3" height="1" fill="#8B6040" />
                  <rect x="95" y="0" width="4" height="1" fill="#D4A070" />
                  <rect x="96" y="1" width="3" height="1" fill="#C49060" />
                  <rect x="110" y="2" width="2" height="1" fill="#7D5035" />
                  <rect x="111" y="3" width="3" height="1" fill="#6D4830" />

                  <!-- Bottom frame -->
                  <rect x="0" y="90" width="128" height="6" fill="#7D5640" />
                  <rect x="0" y="90" width="128" height="1" fill="#8B6B4A" />
                  <rect x="0" y="91" width="128" height="1" fill="#7D5640" />
                  <rect x="0" y="92" width="128" height="1" fill="#6D4830" />
                  <rect x="0" y="93" width="128" height="1" fill="#5D4028" />
                  <rect x="0" y="94" width="128" height="1" fill="#4D3520" />
                  <rect x="0" y="95" width="128" height="1" fill="#3D2A18" />
                  <!-- Bottom grain -->
                  <rect x="15" y="90" width="3" height="1" fill="#9B7B5A" />
                  <rect x="16" y="91" width="2" height="1" fill="#8B6B4A" />
                  <rect x="50" y="91" width="4" height="1" fill="#6D4830" />
                  <rect x="51" y="92" width="3" height="1" fill="#5D4028" />
                  <rect x="85" y="90" width="2" height="1" fill="#9B7B5A" />
                  <rect x="105" y="92" width="3" height="1" fill="#4D3520" />

                  <!-- Left frame -->
                  <rect x="0" y="6" width="6" height="84" fill="#9B7B5A" />
                  <rect x="0" y="6" width="1" height="84" fill="#C4956A" />
                  <rect x="1" y="6" width="1" height="84" fill="#B8896A" />
                  <rect x="2" y="6" width="1" height="84" fill="#A87D5A" />
                  <rect x="3" y="6" width="1" height="84" fill="#9B6B4A" />
                  <rect x="4" y="6" width="1" height="84" fill="#8B5B3A" />
                  <rect x="5" y="6" width="1" height="84" fill="#7D5640" />
                  <!-- Left grain -->
                  <rect x="0" y="15" width="1" height="3" fill="#D4A57A" />
                  <rect x="1" y="16" width="1" height="2" fill="#C49060" />
                  <rect x="0" y="35" width="1" height="2" fill="#D8B080" />
                  <rect x="2" y="45" width="1" height="4" fill="#8B5030" />
                  <rect x="3" y="46" width="1" height="3" fill="#7D4828" />
                  <rect x="0" y="60" width="1" height="3" fill="#D4A57A" />
                  <rect x="1" y="61" width="1" height="2" fill="#C49060" />
                  <rect x="4" y="75" width="1" height="2" fill="#6D4028" />

                  <!-- Right frame -->
                  <rect x="122" y="6" width="6" height="84" fill="#6D4830" />
                  <rect x="122" y="6" width="1" height="84" fill="#8B5B3A" />
                  <rect x="123" y="6" width="1" height="84" fill="#7D5640" />
                  <rect x="124" y="6" width="1" height="84" fill="#6D4830" />
                  <rect x="125" y="6" width="1" height="84" fill="#5D4028" />
                  <rect x="126" y="6" width="1" height="84" fill="#4D3520" />
                  <rect x="127" y="6" width="1" height="84" fill="#3D2A18" />
                  <!-- Right grain -->
                  <rect x="122" y="20" width="1" height="2" fill="#9B6B4A" />
                  <rect x="125" y="40" width="1" height="3" fill="#4D3018" />
                  <rect x="126" y="41" width="1" height="2" fill="#3D2510" />
                  <rect x="122" y="55" width="1" height="2" fill="#9B6B4A" />
                  <rect x="124" y="70" width="1" height="2" fill="#5D3820" />

                  <!-- === CORK BOARD (rich texture) === -->
                  <rect x="6" y="6" width="116" height="84" fill="#C4956A" />
                  <!-- Cork base texture layers -->
                  <rect x="6" y="6" width="116" height="28" fill="#D4A070" />
                  <rect x="6" y="34" width="116" height="28" fill="#C4956A" />
                  <rect x="6" y="62" width="116" height="28" fill="#B88B60" />
                  <!-- Cork pores (many small texture spots) -->
                  <rect x="10" y="10" width="2" height="2" fill="#B8896A" />
                  <rect x="18" y="12" width="1" height="1" fill="#A87D5A" />
                  <rect x="25" y="9" width="2" height="1" fill="#D8B080" />
                  <rect x="32" y="14" width="1" height="2" fill="#9B7B5A" />
                  <rect x="40" y="8" width="1" height="1" fill="#E0B888" />
                  <rect x="48" y="11" width="2" height="1" fill="#A88060" />
                  <rect x="55" y="15" width="1" height="1" fill="#987048" />
                  <rect x="62" y="9" width="1" height="2" fill="#D4A070" />
                  <rect x="70" y="13" width="2" height="1" fill="#B89060" />
                  <rect x="78" y="10" width="1" height="1" fill="#C4956A" />
                  <rect x="85" y="12" width="1" height="2" fill="#A87850" />
                  <rect x="92" y="8" width="2" height="1" fill="#D8B080" />
                  <rect x="100" y="14" width="1" height="1" fill="#9B7B5A" />
                  <rect x="108" y="11" width="1" height="1" fill="#B8896A" />
                  <rect x="115" y="9" width="1" height="2" fill="#C49060" />
                  <!-- More pores row 2 -->
                  <rect x="12" y="22" width="1" height="1" fill="#9B7B5A" />
                  <rect x="20" y="25" width="2" height="1" fill="#D4A070" />
                  <rect x="28" y="20" width="1" height="2" fill="#B89060" />
                  <rect x="35" y="24" width="1" height="1" fill="#A87D5A" />
                  <rect x="45" y="21" width="2" height="1" fill="#C4956A" />
                  <rect x="52" y="26" width="1" height="1" fill="#987048" />
                  <rect x="60" y="22" width="1" height="1" fill="#D8B080" />
                  <rect x="68" y="19" width="1" height="2" fill="#A88060" />
                  <rect x="75" y="24" width="2" height="1" fill="#B8896A" />
                  <rect x="82" y="21" width="1" height="1" fill="#C49060" />
                  <rect x="90" y="25" width="1" height="1" fill="#9B6B4A" />
                  <rect x="98" y="20" width="2" height="1" fill="#D4A070" />
                  <rect x="105" y="23" width="1" height="2" fill="#A87850" />
                  <rect x="112" y="26" width="1" height="1" fill="#B89060" />
                  <!-- More pores row 3 -->
                  <rect x="15" y="38" width="1" height="1" fill="#A87D5A" />
                  <rect x="22" y="35" width="1" height="2" fill="#C4956A" />
                  <rect x="30" y="40" width="2" height="1" fill="#9B7B5A" />
                  <rect x="38" y="36" width="1" height="1" fill="#B8896A" />
                  <rect x="46" y="42" width="1" height="1" fill="#987048" />
                  <rect x="54" y="37" width="2" height="1" fill="#D4A070" />
                  <rect x="63" y="41" width="1" height="1" fill="#A88060" />
                  <rect x="72" y="38" width="1" height="2" fill="#C49060" />
                  <rect x="80" y="35" width="1" height="1" fill="#B89060" />
                  <rect x="88" y="40" width="2" height="1" fill="#9B6B4A" />
                  <rect x="96" y="37" width="1" height="1" fill="#D8B080" />
                  <rect x="104" y="42" width="1" height="1" fill="#A87850" />
                  <rect x="110" y="36" width="1" height="2" fill="#C4956A" />
                  <!-- More pores row 4 -->
                  <rect x="8" y="52" width="1" height="1" fill="#B8896A" />
                  <rect x="16" y="48" width="2" height="1" fill="#9B7B5A" />
                  <rect x="24" y="54" width="1" height="1" fill="#C49060" />
                  <rect x="32" y="50" width="1" height="2" fill="#A87D5A" />
                  <rect x="42" y="55" width="1" height="1" fill="#987048" />
                  <rect x="50" y="49" width="2" height="1" fill="#B89060" />
                  <rect x="58" y="53" width="1" height="1" fill="#C4956A" />
                  <rect x="66" y="48" width="1" height="1" fill="#D4A070" />
                  <rect x="74" y="54" width="1" height="2" fill="#A88060" />
                  <rect x="84" y="50" width="1" height="1" fill="#9B6B4A" />
                  <rect x="94" y="55" width="2" height="1" fill="#B8896A" />
                  <rect x="102" y="49" width="1" height="1" fill="#C49060" />
                  <rect x="109" y="52" width="1" height="2" fill="#A87850" />
                  <rect x="116" y="48" width="1" height="1" fill="#D8B080" />
                  <!-- More pores row 5 -->
                  <rect x="11" y="65" width="2" height="1" fill="#A87D5A" />
                  <rect x="19" y="68" width="1" height="1" fill="#9B7B5A" />
                  <rect x="27" y="64" width="1" height="2" fill="#B89060" />
                  <rect x="36" y="70" width="1" height="1" fill="#987048" />
                  <rect x="44" y="66" width="2" height="1" fill="#C4956A" />
                  <rect x="53" y="72" width="1" height="1" fill="#A88060" />
                  <rect x="61" y="67" width="1" height="1" fill="#9B6B4A" />
                  <rect x="69" y="64" width="1" height="2" fill="#B8896A" />
                  <rect x="77" y="70" width="2" height="1" fill="#C49060" />
                  <rect x="86" y="66" width="1" height="1" fill="#D4A070" />
                  <rect x="95" y="72" width="1" height="1" fill="#A87850" />
                  <rect x="103" y="65" width="1" height="2" fill="#9B7B5A" />
                  <rect x="111" y="68" width="2" height="1" fill="#B89060" />
                  <!-- More pores row 6 -->
                  <rect x="14" y="78" width="1" height="1" fill="#9B7B5A" />
                  <rect x="23" y="82" width="1" height="1" fill="#A87D5A" />
                  <rect x="31" y="76" width="2" height="1" fill="#B8896A" />
                  <rect x="40" y="80" width="1" height="2" fill="#987048" />
                  <rect x="49" y="84" width="1" height="1" fill="#C4956A" />
                  <rect x="57" y="78" width="1" height="1" fill="#9B6B4A" />
                  <rect x="65" y="82" width="2" height="1" fill="#A88060" />
                  <rect x="73" y="77" width="1" height="1" fill="#B89060" />
                  <rect x="82" y="84" width="1" height="1" fill="#C49060" />
                  <rect x="91" y="79" width="1" height="2" fill="#A87850" />
                  <rect x="99" y="76" width="2" height="1" fill="#D4A070" />
                  <rect x="107" y="82" width="1" height="1" fill="#9B7B5A" />
                  <rect x="114" y="78" width="1" height="1" fill="#B8896A" />

                  <!-- === PAPER 1 (left, medieval quest parchment) === -->
                  <g transform="translate(0,8)">
                    <!-- Deeper shadow on cork for a floating parchment feel -->
                    <rect x="14" y="18" width="32" height="40" fill="#8A5C3A" />
                    <rect x="15" y="19" width="30" height="38" fill="#A86C44" />
                    <!-- Parchment base (warmer, slightly aged) -->
                    <rect x="12" y="16" width="32" height="40" fill="#E9D8B8" />
                    <!-- Small chips/tears along edges -->
                    <rect x="15" y="16" width="2" height="1" fill="#C49C6C" />
                    <rect x="19" y="16" width="1" height="1" fill="#B0885A" />
                    <rect x="24" y="16" width="2" height="1" fill="#C49C6C" />
                    <rect x="32" y="16" width="1" height="1" fill="#B0885A" />
                    <rect x="38" y="16" width="2" height="1" fill="#C49C6C" />
                    <rect x="41" y="54" width="2" height="1" fill="#8A5C3A" />
                    <rect x="14" y="55" width="2" height="1" fill="#8A5C3A" />
                    <!-- Subtle burn marks / stains -->
                    <rect x="16" y="20" width="4" height="2" fill="#D8C098" />
                    <rect x="23" y="22" width="3" height="2" fill="#C4A880" />
                    <rect x="32" y="21" width="3" height="2" fill="#C49C6C" />
                    <rect x="18" y="30" width="3" height="2" fill="#D0B488" />
                    <rect x="26" y="34" width="4" height="2" fill="#C4A880" />
                    <rect x="36" y="28" width="3" height="2" fill="#B0885A" />
                    <rect x="20" y="46" width="3" height="2" fill="#C4A880" />
                    <rect x="33" y="48" width="3" height="2" fill="#B0885A" />
                    <!-- Center fold / crease (broken, dotted so it feels less like a solid line) -->
                    <rect x="28" y="19" width="1" height="4" fill="#D8C098" />
                    <rect x="29" y="21" width="1" height="3" fill="#C4A880" />
                    <rect x="28" y="25" width="1" height="3" fill="#D8C098" />
                    <rect x="29" y="28" width="1" height="3" fill="#C4A880" />
                    <rect x="28" y="32" width="1" height="3" fill="#D8C098" />
                    <rect x="29" y="35" width="1" height="3" fill="#C4A880" />
                    <rect x="28" y="39" width="1" height="3" fill="#D8C098" />
                    <rect x="29" y="42" width="1" height="3" fill="#C4A880" />
                    <!-- Curled corner (bottom right, stronger) -->
                    <rect x="39" y="51" width="2" height="2" fill="#C4A880" />
                    <rect x="40" y="52" width="2" height="2" fill="#B0885A" />
                    <rect x="41" y="53" width="2" height="3" fill="#8A5C3A" />
                    <!-- Decorative title strokes (broken, more like a real heading than a single bar) -->
                    <!-- Top row of title -->
                    <rect x="16" y="23" width="4" height="1" fill="#583524" />
                    <rect x="21" y="23" width="5" height="1" fill="#70402A" />
                    <rect x="28" y="23" width="4" height="1" fill="#583524" />
                    <rect x="33" y="23" width="3" height="1" fill="#70402A" />
                    <!-- Slightly offset second row for thickness/irregularity -->
                    <rect x="17" y="24" width="3" height="1" fill="#70402A" />
                    <rect x="21" y="24" width="4" height="1" fill="#583524" />
                    <rect x="27" y="24" width="4" height="1" fill="#70402A" />
                    <rect x="32" y="24" width="3" height="1" fill="#583524" />
                    <!-- Medieval-style text strokes: broken, dotted to feel like handwriting without real letters -->
                    <!-- Row 1 -->
                    <rect x="19" y="27" width="3" height="1" fill="#3F2A1E" />
                    <rect x="23" y="27" width="2" height="1" fill="#4A3122" />
                    <rect x="26" y="27" width="2" height="1" fill="#3F2A1E" />
                    <rect x="30" y="27" width="3" height="1" fill="#4A3122" />
                    <!-- Row 2 -->
                    <rect x="18" y="30" width="2" height="1" fill="#3F2A1E" />
                    <rect x="21" y="30" width="3" height="1" fill="#4A3122" />
                    <rect x="25" y="30" width="2" height="1" fill="#3F2A1E" />
                    <rect x="29" y="30" width="2" height="1" fill="#4A3122" />
                    <rect x="32" y="30" width="2" height="1" fill="#3F2A1E" />
                    <!-- Row 3 -->
                    <rect x="17" y="33" width="3" height="1" fill="#3F2A1E" />
                    <rect x="21" y="33" width="2" height="1" fill="#4A3122" />
                    <rect x="24" y="33" width="3" height="1" fill="#3F2A1E" />
                    <rect x="28" y="33" width="2" height="1" fill="#4A3122" />
                    <rect x="31" y="33" width="2" height="1" fill="#3F2A1E" />
                    <!-- Row 4 -->
                    <rect x="18" y="36" width="2" height="1" fill="#3F2A1E" />
                    <rect x="21" y="36" width="3" height="1" fill="#4A3122" />
                    <rect x="25" y="36" width="2" height="1" fill="#3F2A1E" />
                    <rect x="29" y="36" width="3" height="1" fill="#4A3122" />
                    <!-- Row 5 -->
                    <rect x="19" y="39" width="3" height="1" fill="#3F2A1E" />
                    <rect x="23" y="39" width="2" height="1" fill="#4A3122" />
                    <rect x="26" y="39" width="2" height="1" fill="#3F2A1E" />
                    <rect x="30" y="39" width="3" height="1" fill="#4A3122" />
                    <!-- Row 6 -->
                    <rect x="18" y="42" width="2" height="1" fill="#3F2A1E" />
                    <rect x="21" y="42" width="3" height="1" fill="#4A3122" />
                    <rect x="25" y="42" width="2" height="1" fill="#3F2A1E" />
                    <rect x="29" y="42" width="2" height="1" fill="#4A3122" />
                  </g>

                  <!-- === PAPER 2 (center, medieval parchment) === -->
                  <g transform="translate(0,-6)">
                    <!-- Paper shadow -->
                    <rect x="50" y="22" width="30" height="36" fill="#A86C44" />
                    <!-- Parchment base -->
                    <rect x="48" y="20" width="30" height="36" fill="#E9D8B8" />
                    <!-- Small chips/tears along edges -->
                    <rect x="51" y="20" width="2" height="1" fill="#C49C6C" />
                    <rect x="57" y="20" width="1" height="1" fill="#B0885A" />
                    <rect x="62" y="20" width="2" height="1" fill="#C49C6C" />
                    <rect x="69" y="20" width="1" height="1" fill="#B0885A" />
                    <rect x="74" y="20" width="2" height="1" fill="#C49C6C" />
                    <rect x="51" y="55" width="2" height="1" fill="#8A5C3A" />
                    <rect x="73" y="54" width="2" height="1" fill="#8A5C3A" />
                    <!-- Subtle burn marks / stains -->
                    <rect x="52" y="24" width="3" height="2" fill="#D8C098" />
                    <rect x="59" y="25" width="3" height="2" fill="#C4A880" />
                    <rect x="67" y="24" width="3" height="2" fill="#C49C6C" />
                    <rect x="54" y="33" width="3" height="2" fill="#D0B488" />
                    <rect x="62" y="36" width="4" height="2" fill="#C4A880" />
                    <rect x="70" y="30" width="3" height="2" fill="#B0885A" />
                    <rect x="56" y="44" width="3" height="2" fill="#C4A880" />
                    <rect x="67" y="47" width="3" height="2" fill="#B0885A" />
                    <!-- Center fold / crease (broken, dotted) -->
                    <rect x="63" y="22" width="1" height="4" fill="#D8C098" />
                    <rect x="64" y="24" width="1" height="3" fill="#C4A880" />
                    <rect x="63" y="28" width="1" height="3" fill="#D8C098" />
                    <rect x="64" y="31" width="1" height="3" fill="#C4A880" />
                    <rect x="63" y="35" width="1" height="3" fill="#D8C098" />
                    <rect x="64" y="38" width="1" height="3" fill="#C4A880" />
                    <rect x="63" y="42" width="1" height="3" fill="#D8C098" />
                    <rect x="64" y="45" width="1" height="3" fill="#C4A880" />
                    <!-- Decorative title strokes (broken heading) -->
                    <!-- Top row of title -->
                    <rect x="52" y="23" width="4" height="1" fill="#583524" />
                    <rect x="57" y="23" width="5" height="1" fill="#70402A" />
                    <rect x="64" y="23" width="4" height="1" fill="#583524" />
                    <rect x="69" y="23" width="3" height="1" fill="#70402A" />
                    <!-- Slightly offset second row -->
                    <rect x="53" y="24" width="3" height="1" fill="#70402A" />
                    <rect x="57" y="24" width="4" height="1" fill="#583524" />
                    <rect x="63" y="24" width="4" height="1" fill="#70402A" />
                    <rect x="68" y="24" width="3" height="1" fill="#583524" />
                    <!-- Medieval-style text strokes (broken, dotted) -->
                    <!-- Row 1 -->
                    <rect x="54" y="27" width="3" height="1" fill="#3F2A1E" />
                    <rect x="58" y="27" width="2" height="1" fill="#4A3122" />
                    <rect x="61" y="27" width="2" height="1" fill="#3F2A1E" />
                    <rect x="65" y="27" width="3" height="1" fill="#4A3122" />
                    <!-- Row 2 -->
                    <rect x="53" y="30" width="2" height="1" fill="#3F2A1E" />
                    <rect x="56" y="30" width="3" height="1" fill="#4A3122" />
                    <rect x="60" y="30" width="2" height="1" fill="#3F2A1E" />
                    <rect x="64" y="30" width="2" height="1" fill="#4A3122" />
                    <rect x="67" y="30" width="2" height="1" fill="#3F2A1E" />
                    <!-- Row 3 -->
                    <rect x="52" y="33" width="3" height="1" fill="#3F2A1E" />
                    <rect x="56" y="33" width="2" height="1" fill="#4A3122" />
                    <rect x="59" y="33" width="3" height="1" fill="#3F2A1E" />
                    <rect x="63" y="33" width="2" height="1" fill="#4A3122" />
                    <rect x="66" y="33" width="2" height="1" fill="#3F2A1E" />
                    <!-- Row 4 -->
                    <rect x="53" y="36" width="2" height="1" fill="#3F2A1E" />
                    <rect x="56" y="36" width="3" height="1" fill="#4A3122" />
                    <rect x="60" y="36" width="2" height="1" fill="#3F2A1E" />
                    <rect x="64" y="36" width="3" height="1" fill="#4A3122" />
                    <!-- Row 5 -->
                    <rect x="54" y="39" width="3" height="1" fill="#3F2A1E" />
                    <rect x="58" y="39" width="2" height="1" fill="#4A3122" />
                    <rect x="61" y="39" width="2" height="1" fill="#3F2A1E" />
                    <rect x="65" y="39" width="3" height="1" fill="#4A3122" />
                    <!-- Row 6 -->
                    <rect x="53" y="42" width="2" height="1" fill="#3F2A1E" />
                    <rect x="56" y="42" width="3" height="1" fill="#4A3122" />
                    <rect x="60" y="42" width="2" height="1" fill="#3F2A1E" />
                    <rect x="64" y="42" width="2" height="1" fill="#4A3122" />
                  </g>

                  <!-- === PAPER 3 (right, medieval parchment) === -->
                  <!-- Paper shadow -->
                  <rect x="86" y="28" width="28" height="44" fill="#A86C44" />
                  <!-- Parchment base -->
                  <rect x="84" y="26" width="28" height="44" fill="#E9D8B8" />
                  <!-- Small chips/tears along edges -->
                  <rect x="87" y="26" width="2" height="1" fill="#C49C6C" />
                  <rect x="92" y="26" width="1" height="1" fill="#B0885A" />
                  <rect x="97" y="26" width="2" height="1" fill="#C49C6C" />
                  <rect x="102" y="26" width="1" height="1" fill="#B0885A" />
                  <rect x="107" y="26" width="2" height="1" fill="#C49C6C" />
                  <rect x="87" y="69" width="2" height="1" fill="#8A5C3A" />
                  <rect x="106" y="68" width="2" height="1" fill="#8A5C3A" />
                  <!-- Subtle burn marks / stains -->
                  <rect x="88" y="30" width="3" height="2" fill="#D8C098" />
                  <rect x="95" y="32" width="3" height="2" fill="#C4A880" />
                  <rect x="102" y="31" width="3" height="2" fill="#C49C6C" />
                  <rect x="90" y="40" width="3" height="2" fill="#D0B488" />
                  <rect x="98" y="44" width="4" height="2" fill="#C4A880" />
                  <rect x="105" y="37" width="3" height="2" fill="#B0885A" />
                  <rect x="92" y="54" width="3" height="2" fill="#C4A880" />
                  <rect x="102" y="58" width="3" height="2" fill="#B0885A" />
                  <!-- Center fold / crease (broken, dotted) -->
                  <rect x="98" y="30" width="1" height="4" fill="#D8C098" />
                  <rect x="99" y="32" width="1" height="3" fill="#C4A880" />
                  <rect x="98" y="36" width="1" height="3" fill="#D8C098" />
                  <rect x="99" y="39" width="1" height="3" fill="#C4A880" />
                  <rect x="98" y="43" width="1" height="3" fill="#D8C098" />
                  <rect x="99" y="46" width="1" height="3" fill="#C4A880" />
                  <rect x="98" y="50" width="1" height="3" fill="#D8C098" />
                  <rect x="99" y="53" width="1" height="3" fill="#C4A880" />
                  <!-- Decorative title strokes (broken heading) -->
                  <!-- Top row of title -->
                  <rect x="88" y="29" width="4" height="1" fill="#583524" />
                  <rect x="93" y="29" width="5" height="1" fill="#70402A" />
                  <rect x="100" y="29" width="4" height="1" fill="#583524" />
                  <rect x="105" y="29" width="3" height="1" fill="#70402A" />
                  <!-- Slightly offset second row -->
                  <rect x="89" y="30" width="3" height="1" fill="#70402A" />
                  <rect x="93" y="30" width="4" height="1" fill="#583524" />
                  <rect x="99" y="30" width="4" height="1" fill="#70402A" />
                  <rect x="104" y="30" width="3" height="1" fill="#583524" />
                  <!-- Medieval-style text strokes (broken, dotted) -->
                  <!-- Row 1 -->
                  <rect x="90" y="34" width="3" height="1" fill="#3F2A1E" />
                  <rect x="94" y="34" width="2" height="1" fill="#4A3122" />
                  <rect x="97" y="34" width="2" height="1" fill="#3F2A1E" />
                  <rect x="101" y="34" width="3" height="1" fill="#4A3122" />
                  <!-- Row 2 -->
                  <rect x="89" y="37" width="2" height="1" fill="#3F2A1E" />
                  <rect x="92" y="37" width="3" height="1" fill="#4A3122" />
                  <rect x="96" y="37" width="2" height="1" fill="#3F2A1E" />
                  <rect x="100" y="37" width="2" height="1" fill="#4A3122" />
                  <rect x="103" y="37" width="2" height="1" fill="#3F2A1E" />
                  <!-- Row 3 -->
                  <rect x="88" y="40" width="3" height="1" fill="#3F2A1E" />
                  <rect x="92" y="40" width="2" height="1" fill="#4A3122" />
                  <rect x="95" y="40" width="3" height="1" fill="#3F2A1E" />
                  <rect x="99" y="40" width="2" height="1" fill="#4A3122" />
                  <rect x="102" y="40" width="2" height="1" fill="#3F2A1E" />
                  <!-- Row 4 -->
                  <rect x="89" y="43" width="2" height="1" fill="#3F2A1E" />
                  <rect x="92" y="43" width="3" height="1" fill="#4A3122" />
                  <rect x="96" y="43" width="2" height="1" fill="#3F2A1E" />
                  <rect x="100" y="43" width="3" height="1" fill="#4A3122" />
                  <!-- Row 5 -->
                  <rect x="90" y="46" width="3" height="1" fill="#3F2A1E" />
                  <rect x="94" y="46" width="2" height="1" fill="#4A3122" />
                  <rect x="97" y="46" width="2" height="1" fill="#3F2A1E" />
                  <rect x="101" y="46" width="3" height="1" fill="#4A3122" />
                  <!-- Row 6 -->
                  <rect x="89" y="49" width="2" height="1" fill="#3F2A1E" />
                  <rect x="92" y="49" width="3" height="1" fill="#4A3122" />
                  <rect x="96" y="49" width="2" height="1" fill="#3F2A1E" />
                  <rect x="100" y="49" width="2" height="1" fill="#4A3122" />

                  <!-- === PINS (metallic sheen, cast shadows) === -->
                  <!-- Pin 1 (removed for cleaner parchment top edge) -->

                  <!-- Pin 2 (blue) and Pin 3 (green) removed for cleaner parchment stack -->

                  <!-- === FRAME CORNER DETAILS (brass tacks) === -->
                  <!-- Top-left tack -->
                  <rect x="2" y="2" width="2" height="2" fill="#D8B070" />
                  <rect x="2" y="2" width="1" height="1" fill="#E8C888" />
                  <rect x="3" y="3" width="1" height="1" fill="#B89050" />
                  <!-- Top-right tack -->
                  <rect x="124" y="2" width="2" height="2" fill="#B89050" />
                  <rect x="124" y="2" width="1" height="1" fill="#D8B070" />
                  <rect x="125" y="3" width="1" height="1" fill="#987040" />
                  <!-- Bottom-left tack -->
                  <rect x="2" y="92" width="2" height="2" fill="#C4A060" />
                  <rect x="2" y="92" width="1" height="1" fill="#D8B070" />
                  <rect x="3" y="93" width="1" height="1" fill="#A88050" />
                  <!-- Bottom-right tack -->
                  <rect x="124" y="92" width="2" height="2" fill="#A88050" />
                  <rect x="124" y="92" width="1" height="1" fill="#C4A060" />
                  <rect x="125" y="93" width="1" height="1" fill="#886030" />
                </svg>
                <button
                  class="quest-text-button"
                  onclick={() => (showTaskPicker = true)}
                >
                  タスクを確認
                </button>
              </div>
            </div>
          {/if}
        </div>

        <!-- Game Rules + Duration Row -->
        <div class="rules-duration-row">
          <!-- Game Rules Panel -->
          <div class="rules-panel">
            <div class="rule-item">
              <!-- High-detail painterly hourglass (48x48) -->
              <svg
                class="rule-icon rule-icon-work"
                viewBox="0 0 48 48"
                fill="none"
              >
                <!-- === TOP FRAME (ornate brass with engraving) === -->
                <rect x="8" y="2" width="32" height="4" fill="#B89050" />
                <rect x="8" y="2" width="32" height="1" fill="#E8C888" />
                <rect x="8" y="3" width="32" height="1" fill="#D8B070" />
                <rect x="8" y="4" width="32" height="1" fill="#C4A060" />
                <rect x="8" y="5" width="32" height="1" fill="#A88050" />
                <!-- Frame engraving detail -->
                <rect x="12" y="2" width="4" height="1" fill="#F0D898" />
                <rect x="20" y="3" width="8" height="1" fill="#E0C080" />
                <rect x="32" y="2" width="4" height="1" fill="#F0D898" />
                <rect x="14" y="4" width="2" height="1" fill="#987040" />
                <rect x="32" y="4" width="2" height="1" fill="#987040" />
                <!-- Frame edge bevel -->
                <rect x="6" y="2" width="2" height="4" fill="#C4A060" />
                <rect x="6" y="2" width="1" height="4" fill="#D8B070" />
                <rect x="40" y="2" width="2" height="4" fill="#987040" />
                <rect x="41" y="2" width="1" height="4" fill="#886030" />

                <!-- === TOP GLASS BULB (refractive edges) === -->
                <rect x="12" y="6" width="24" height="2" fill="#E0EAE8" />
                <rect x="12" y="6" width="2" height="2" fill="#F0F8F5" />
                <rect x="34" y="6" width="2" height="2" fill="#C8D8D5" />
                <rect x="14" y="8" width="20" height="2" fill="#D8E8E5" />
                <rect x="14" y="8" width="2" height="2" fill="#E8F5F0" />
                <rect x="32" y="8" width="2" height="2" fill="#C0D0CD" />
                <rect x="16" y="10" width="16" height="2" fill="#E0EAE8" />
                <rect x="16" y="10" width="2" height="2" fill="#F0F8F5" />
                <rect x="30" y="10" width="2" height="2" fill="#C8D8D5" />
                <rect x="18" y="12" width="12" height="2" fill="#D8E8E5" />
                <rect x="18" y="12" width="2" height="2" fill="#E8F5F0" />
                <rect x="28" y="12" width="2" height="2" fill="#C0D0CD" />
                <rect x="20" y="14" width="8" height="2" fill="#E0EAE8" />
                <rect x="20" y="14" width="2" height="2" fill="#F0F8F5" />
                <rect x="26" y="14" width="2" height="2" fill="#C8D8D5" />
                <rect x="22" y="16" width="4" height="2" fill="#D8E8E5" />
                <rect x="22" y="16" width="1" height="2" fill="#E8F5F0" />
                <rect x="25" y="16" width="1" height="2" fill="#C0D0CD" />

                <!-- === SAND IN TOP (warm amber tones) === -->
                <rect x="15" y="9" width="18" height="1" fill="#E8C080" />
                <rect x="15" y="9" width="2" height="1" fill="#F0D090" />
                <rect x="31" y="9" width="2" height="1" fill="#D0A060" />
                <rect x="17" y="10" width="14" height="1" fill="#D8B070" />
                <rect x="19" y="11" width="10" height="1" fill="#E8C080" />
                <rect x="19" y="11" width="2" height="1" fill="#F0D090" />
                <rect x="21" y="12" width="6" height="1" fill="#D8B070" />

                <!-- === NECK (narrow waist) === -->
                <rect x="23" y="18" width="2" height="4" fill="#E0EAE8" />
                <rect x="23" y="18" width="1" height="4" fill="#F0F8F5" />
                <!-- Sand stream -->
                <rect x="23" y="19" width="2" height="2" fill="#D8B070" />

                <!-- === BOTTOM GLASS BULB === -->
                <rect x="22" y="22" width="4" height="2" fill="#D8E8E5" />
                <rect x="22" y="22" width="1" height="2" fill="#E8F5F0" />
                <rect x="25" y="22" width="1" height="2" fill="#C0D0CD" />
                <rect x="20" y="24" width="8" height="2" fill="#E0EAE8" />
                <rect x="20" y="24" width="2" height="2" fill="#F0F8F5" />
                <rect x="26" y="24" width="2" height="2" fill="#C8D8D5" />
                <rect x="18" y="26" width="12" height="2" fill="#D8E8E5" />
                <rect x="18" y="26" width="2" height="2" fill="#E8F5F0" />
                <rect x="28" y="26" width="2" height="2" fill="#C0D0CD" />
                <rect x="16" y="28" width="16" height="2" fill="#E0EAE8" />
                <rect x="16" y="28" width="2" height="2" fill="#F0F8F5" />
                <rect x="30" y="28" width="2" height="2" fill="#C8D8D5" />
                <rect x="14" y="30" width="20" height="2" fill="#D8E8E5" />
                <rect x="14" y="30" width="2" height="2" fill="#E8F5F0" />
                <rect x="32" y="30" width="2" height="2" fill="#C0D0CD" />
                <rect x="12" y="32" width="24" height="2" fill="#E0EAE8" />
                <rect x="12" y="32" width="2" height="2" fill="#F0F8F5" />
                <rect x="34" y="32" width="2" height="2" fill="#C8D8D5" />
                <rect x="10" y="34" width="28" height="2" fill="#D8E8E5" />
                <rect x="10" y="34" width="2" height="2" fill="#E8F5F0" />
                <rect x="36" y="34" width="2" height="2" fill="#C0D0CD" />
                <rect x="10" y="36" width="28" height="2" fill="#E0EAE8" />
                <rect x="10" y="36" width="2" height="2" fill="#F0F8F5" />
                <rect x="36" y="36" width="2" height="2" fill="#C8D8D5" />

                <!-- === SAND IN BOTTOM (accumulated pile) === -->
                <rect x="14" y="34" width="20" height="2" fill="#E8C080" />
                <rect x="14" y="34" width="2" height="2" fill="#F0D090" />
                <rect x="32" y="34" width="2" height="2" fill="#D0A060" />
                <rect x="12" y="36" width="24" height="2" fill="#D8B070" />
                <rect x="12" y="36" width="2" height="2" fill="#E8C080" />
                <rect x="34" y="36" width="2" height="2" fill="#C4A060" />
                <!-- Sand pile peak -->
                <rect x="22" y="32" width="4" height="2" fill="#E8C080" />
                <rect x="20" y="33" width="8" height="1" fill="#D8B070" />

                <!-- === BOTTOM FRAME === -->
                <rect x="8" y="38" width="32" height="4" fill="#B89050" />
                <rect x="8" y="38" width="32" height="1" fill="#C4A060" />
                <rect x="8" y="39" width="32" height="1" fill="#B89050" />
                <rect x="8" y="40" width="32" height="1" fill="#A88050" />
                <rect x="8" y="41" width="32" height="1" fill="#987040" />
                <!-- Frame engraving -->
                <rect x="12" y="38" width="4" height="1" fill="#D8B070" />
                <rect x="32" y="38" width="4" height="1" fill="#D8B070" />
                <rect x="20" y="39" width="8" height="1" fill="#C4A060" />
                <!-- Frame edge bevel -->
                <rect x="6" y="38" width="2" height="4" fill="#C4A060" />
                <rect x="6" y="38" width="1" height="4" fill="#D8B070" />
                <rect x="40" y="38" width="2" height="4" fill="#886030" />
                <rect x="41" y="38" width="1" height="4" fill="#785028" />

                <!-- === STAND FEET === -->
                <rect x="8" y="42" width="4" height="4" fill="#A88050" />
                <rect x="8" y="42" width="2" height="2" fill="#C4A060" />
                <rect x="10" y="44" width="2" height="2" fill="#886030" />
                <rect x="36" y="42" width="4" height="4" fill="#987040" />
                <rect x="36" y="42" width="2" height="2" fill="#B89050" />
                <rect x="38" y="44" width="2" height="2" fill="#785028" />
              </svg>
              <span class="rule-value">{WORK_DURATION}</span>
              <span class="rule-label">MIN</span>
            </div>
            <div class="rule-divider">
              <!-- Painterly divider dots -->
              <svg class="h-16 w-16" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="10" width="4" height="4" fill="#9B8B7B" />
                <rect x="4" y="10" width="2" height="2" fill="#B8A898" />
                <rect x="6" y="12" width="2" height="2" fill="#7B6B5B" />
                <rect x="10" y="10" width="4" height="4" fill="#A89888" />
                <rect x="10" y="10" width="2" height="2" fill="#C4B4A4" />
                <rect x="12" y="12" width="2" height="2" fill="#887868" />
                <rect x="16" y="10" width="4" height="4" fill="#9B8B7B" />
                <rect x="16" y="10" width="2" height="2" fill="#B8A898" />
                <rect x="18" y="12" width="2" height="2" fill="#7B6B5B" />
              </svg>
            </div>
            <div class="rule-item">
              <!-- High-detail painterly coffee cup (48x48) -->
              <svg
                class="rule-icon rule-icon-rest"
                viewBox="0 0 48 48"
                fill="none"
              >
                <!-- === STEAM (wispy curling shapes) === -->
                <rect x="16" y="2" width="2" height="2" fill="#D0DCE0" />
                <rect x="14" y="4" width="2" height="2" fill="#E0E8EC" />
                <rect x="16" y="6" width="2" height="2" fill="#D8E4E8" />
                <rect x="18" y="4" width="2" height="2" fill="#E8F0F4" />
                <rect x="24" y="0" width="2" height="2" fill="#E0E8EC" />
                <rect x="26" y="2" width="2" height="2" fill="#D0DCE0" />
                <rect x="24" y="4" width="2" height="2" fill="#E8F0F4" />
                <rect x="22" y="6" width="2" height="2" fill="#D8E4E8" />
                <rect x="32" y="2" width="2" height="2" fill="#D0DCE0" />
                <rect x="30" y="4" width="2" height="2" fill="#E0E8EC" />
                <rect x="32" y="6" width="2" height="2" fill="#D8E4E8" />
                <rect x="34" y="4" width="2" height="2" fill="#E8F0F4" />

                <!-- === CUP BODY (ceramic with glaze variation) === -->
                <!-- Cup base shape -->
                <rect x="8" y="14" width="32" height="24" fill="#F0E5D8" />
                <!-- Left edge highlight -->
                <rect x="8" y="14" width="2" height="24" fill="#FFF8ED" />
                <rect x="8" y="16" width="1" height="20" fill="#FFFAF0" />
                <!-- Right edge shadow -->
                <rect x="38" y="14" width="2" height="24" fill="#D8CFC0" />
                <rect x="39" y="16" width="1" height="20" fill="#C8BFB0" />
                <!-- Top rim highlight -->
                <rect x="8" y="14" width="32" height="2" fill="#FFF8ED" />
                <rect x="10" y="14" width="28" height="1" fill="#FFFAF0" />
                <!-- Glaze variation (subtle bands) -->
                <rect x="10" y="18" width="28" height="1" fill="#F8F0E5" />
                <rect x="10" y="22" width="28" height="1" fill="#E8E0D5" />
                <rect x="10" y="26" width="28" height="1" fill="#F0E8DD" />
                <rect x="10" y="30" width="28" height="1" fill="#E8E0D5" />
                <rect x="10" y="34" width="28" height="1" fill="#F8F0E5" />
                <!-- Glaze spots/imperfections -->
                <rect x="14" y="20" width="2" height="2" fill="#F8F0E5" />
                <rect x="26" y="24" width="3" height="2" fill="#E8E0D5" />
                <rect x="18" y="28" width="2" height="2" fill="#FFF8ED" />
                <rect x="32" y="32" width="2" height="2" fill="#D8CFC0" />
                <rect x="12" y="34" width="4" height="1" fill="#F8F0E5" />

                <!-- === COFFEE SURFACE === -->
                <rect x="10" y="16" width="28" height="4" fill="#5D3D20" />
                <rect x="10" y="16" width="28" height="1" fill="#6D4D30" />
                <rect x="12" y="17" width="24" height="1" fill="#7D5D40" />
                <!-- Coffee shine/reflection -->
                <rect x="14" y="16" width="8" height="1" fill="#8D6D50" />
                <rect x="16" y="17" width="4" height="1" fill="#9D7D60" />
                <!-- Coffee edge shadow -->
                <rect x="10" y="19" width="28" height="1" fill="#4D2D10" />

                <!-- === CUP HANDLE (ceramic with detail) === -->
                <rect x="40" y="18" width="4" height="2" fill="#F0E5D8" />
                <rect x="40" y="18" width="4" height="1" fill="#FFF8ED" />
                <rect x="44" y="18" width="2" height="4" fill="#F0E5D8" />
                <rect x="44" y="18" width="1" height="4" fill="#FFF8ED" />
                <rect x="45" y="20" width="1" height="2" fill="#D8CFC0" />
                <rect x="44" y="22" width="2" height="6" fill="#E8DFD0" />
                <rect x="44" y="22" width="1" height="6" fill="#F0E5D8" />
                <rect x="45" y="24" width="1" height="4" fill="#D8CFC0" />
                <rect x="44" y="28" width="2" height="4" fill="#F0E5D8" />
                <rect x="44" y="28" width="1" height="4" fill="#FFF8ED" />
                <rect x="45" y="30" width="1" height="2" fill="#D8CFC0" />
                <rect x="40" y="32" width="4" height="2" fill="#E8DFD0" />
                <rect x="40" y="32" width="4" height="1" fill="#F0E5D8" />
                <rect x="42" y="33" width="2" height="1" fill="#D8CFC0" />
                <!-- Handle inner shadow -->
                <rect x="42" y="20" width="2" height="12" fill="#C8BFB0" />
                <rect x="42" y="22" width="1" height="8" fill="#D8CFC0" />

                <!-- === CUP BOTTOM (slight shadow/thickness) === -->
                <rect x="8" y="38" width="32" height="2" fill="#D8CFC0" />
                <rect x="10" y="38" width="28" height="1" fill="#E8DFD0" />
                <rect x="8" y="39" width="32" height="1" fill="#C8BFB0" />

                <!-- === SAUCER === -->
                <rect x="4" y="40" width="40" height="4" fill="#F0E5D8" />
                <rect x="4" y="40" width="40" height="1" fill="#FFF8ED" />
                <rect x="4" y="41" width="2" height="3" fill="#FFF8ED" />
                <rect x="42" y="41" width="2" height="3" fill="#D8CFC0" />
                <rect x="4" y="43" width="40" height="1" fill="#D8CFC0" />
                <!-- Saucer rim detail -->
                <rect x="6" y="40" width="36" height="1" fill="#FFFAF0" />
                <rect x="6" y="43" width="36" height="1" fill="#C8BFB0" />
                <!-- Saucer glaze variation -->
                <rect x="10" y="41" width="6" height="1" fill="#F8F0E5" />
                <rect x="22" y="42" width="8" height="1" fill="#E8E0D5" />
                <rect x="34" y="41" width="4" height="1" fill="#F8F0E5" />

                <!-- === TABLE SURFACE HINT === -->
                <rect x="2" y="44" width="44" height="2" fill="#B8A090" />
                <rect x="2" y="44" width="44" height="1" fill="#C8B0A0" />
                <rect x="2" y="45" width="44" height="1" fill="#A89080" />
              </svg>
              <span class="rule-value">{BREAK_DURATION}</span>
              <span class="rule-label">MIN</span>
            </div>
          </div>

          <!-- Duration Selector (only show when not using scheduled suggestion) -->
          {#if !customEndTime}
            <div class="duration-panel">
              <div class="duration-item">
                <!-- Ornate antique pocket watch icon (48x48) -->
                <svg
                  class="duration-icon-display"
                  viewBox="0 0 48 48"
                  fill="none"
                >
                  <!-- === CROWN/LOOP (top winding knob) === -->
                  <rect x="21" y="2" width="6" height="2" fill="#B89050" />
                  <rect x="21" y="2" width="6" height="1" fill="#E8C888" />
                  <rect x="22" y="4" width="4" height="2" fill="#C4A060" />
                  <rect x="22" y="4" width="4" height="1" fill="#D8B070" />

                  <!-- === OUTER BRASS FRAME (ornate bezel) === -->
                  <rect x="14" y="8" width="20" height="2" fill="#B89050" />
                  <rect x="14" y="8" width="20" height="1" fill="#E8C888" />
                  <rect x="12" y="10" width="2" height="2" fill="#C4A060" />
                  <rect x="34" y="10" width="2" height="2" fill="#987040" />
                  <rect x="10" y="12" width="2" height="24" fill="#B89050" />
                  <rect x="10" y="12" width="1" height="24" fill="#D8B070" />
                  <rect x="36" y="12" width="2" height="24" fill="#886030" />
                  <rect x="12" y="36" width="2" height="2" fill="#987040" />
                  <rect x="34" y="36" width="2" height="2" fill="#6D4830" />
                  <rect x="14" y="38" width="20" height="2" fill="#987040" />
                  <rect x="14" y="39" width="20" height="1" fill="#6D4830" />

                  <!-- === CLOCK FACE (ivory/cream) === -->
                  <rect x="14" y="10" width="20" height="28" fill="#F5EED8" />
                  <rect x="12" y="12" width="2" height="24" fill="#E9E0C8" />
                  <rect x="34" y="12" width="2" height="24" fill="#D8D0B8" />

                  <!-- === INNER DECORATIVE RING === -->
                  <rect x="16" y="12" width="16" height="1" fill="#C4A060" />
                  <rect x="15" y="13" width="1" height="2" fill="#C4A060" />
                  <rect x="32" y="13" width="1" height="2" fill="#987040" />
                  <rect x="15" y="33" width="1" height="2" fill="#C4A060" />
                  <rect x="32" y="33" width="1" height="2" fill="#987040" />
                  <rect x="16" y="35" width="16" height="1" fill="#987040" />

                  <!-- === HOUR MARKERS (Roman numerals style dots) === -->
                  <rect x="23" y="14" width="2" height="2" fill="#3D2A18" />
                  <rect x="29" y="17" width="2" height="2" fill="#3D2A18" />
                  <rect x="31" y="23" width="2" height="2" fill="#3D2A18" />
                  <rect x="29" y="29" width="2" height="2" fill="#3D2A18" />
                  <rect x="23" y="32" width="2" height="2" fill="#3D2A18" />
                  <rect x="17" y="29" width="2" height="2" fill="#3D2A18" />
                  <rect x="15" y="23" width="2" height="2" fill="#3D2A18" />
                  <rect x="17" y="17" width="2" height="2" fill="#3D2A18" />

                  <!-- === CLOCK HANDS (ornate dark metal) === -->
                  <!-- Hour hand (pointing to ~2) -->
                  <rect x="23" y="20" width="2" height="5" fill="#2D1A08" />
                  <rect x="25" y="18" width="2" height="2" fill="#2D1A08" />
                  <rect x="27" y="17" width="2" height="2" fill="#2D1A08" />
                  <!-- Minute hand (pointing to ~12) -->
                  <rect x="23" y="15" width="2" height="9" fill="#2D1A08" />

                  <!-- === CENTER HUB (brass) === -->
                  <rect x="22" y="23" width="4" height="4" fill="#C4A060" />
                  <rect x="22" y="23" width="2" height="2" fill="#E8C888" />
                  <rect x="24" y="25" width="2" height="2" fill="#886030" />
                </svg>
                <div class="duration-controls">
                  <button
                    class="duration-btn"
                    onclick={decreaseDuration}
                    disabled={selectedDuration <= DURATION_MIN}
                    aria-label="Decrease duration"
                  >
                    <svg
                      viewBox="0 0 12 12"
                      fill="currentColor"
                      class="duration-btn-icon"
                    >
                      <rect x="2" y="5" width="8" height="2" />
                    </svg>
                  </button>
                  <span class="duration-value">{durationDisplay}</span>
                  <button
                    class="duration-btn"
                    onclick={increaseDuration}
                    disabled={selectedDuration >= DURATION_MAX}
                    aria-label="Increase duration"
                  >
                    <svg
                      viewBox="0 0 12 12"
                      fill="currentColor"
                      class="duration-btn-icon"
                    >
                      <rect x="5" y="2" width="2" height="8" />
                      <rect x="2" y="5" width="8" height="2" />
                    </svg>
                  </button>
                </div>
                <span class="duration-label">HOURS</span>
              </div>
            </div>
          {/if}
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
      <!-- Decorative Wood Frame SVG Background -->
      <svg
        class="modal-frame-svg"
        viewBox="0 0 200 300"
        preserveAspectRatio="none"
      >
        <!-- Wood Frame - Top -->
        <rect x="0" y="0" width="200" height="12" fill="#8B6B4A" />
        <rect x="0" y="0" width="200" height="2" fill="#C4956A" />
        <rect x="0" y="2" width="200" height="2" fill="#B8896A" />
        <rect x="0" y="4" width="200" height="2" fill="#A87D5A" />
        <rect x="0" y="6" width="200" height="2" fill="#9B6B4A" />
        <rect x="0" y="8" width="200" height="2" fill="#8B5B3A" />
        <rect x="0" y="10" width="200" height="2" fill="#7D5640" />
        <!-- Top grain details -->
        <rect x="15" y="1" width="6" height="2" fill="#D4A57A" />
        <rect x="45" y="3" width="4" height="2" fill="#9B6B4A" />
        <rect x="80" y="0" width="8" height="2" fill="#D8B080" />
        <rect x="120" y="2" width="5" height="2" fill="#A87850" />
        <rect x="160" y="1" width="6" height="2" fill="#D4A070" />

        <!-- Wood Frame - Bottom -->
        <rect x="0" y="288" width="200" height="12" fill="#7D5640" />
        <rect x="0" y="288" width="200" height="2" fill="#8B6B4A" />
        <rect x="0" y="290" width="200" height="2" fill="#7D5640" />
        <rect x="0" y="292" width="200" height="2" fill="#6D4830" />
        <rect x="0" y="294" width="200" height="2" fill="#5D4028" />
        <rect x="0" y="296" width="200" height="2" fill="#4D3520" />
        <rect x="0" y="298" width="200" height="2" fill="#3D2A18" />
        <!-- Bottom grain -->
        <rect x="25" y="289" width="5" height="2" fill="#9B7B5A" />
        <rect x="90" y="291" width="6" height="2" fill="#6D4830" />
        <rect x="150" y="290" width="4" height="2" fill="#9B7B5A" />

        <!-- Wood Frame - Left -->
        <rect x="0" y="12" width="12" height="276" fill="#9B7B5A" />
        <rect x="0" y="12" width="2" height="276" fill="#C4956A" />
        <rect x="2" y="12" width="2" height="276" fill="#B8896A" />
        <rect x="4" y="12" width="2" height="276" fill="#A87D5A" />
        <rect x="6" y="12" width="2" height="276" fill="#9B6B4A" />
        <rect x="8" y="12" width="2" height="276" fill="#8B5B3A" />
        <rect x="10" y="12" width="2" height="276" fill="#7D5640" />
        <!-- Left grain -->
        <rect x="1" y="30" width="2" height="5" fill="#D4A57A" />
        <rect x="1" y="80" width="2" height="4" fill="#D8B080" />
        <rect x="3" y="140" width="2" height="6" fill="#8B5030" />
        <rect x="1" y="200" width="2" height="5" fill="#D4A57A" />
        <rect x="5" y="250" width="2" height="4" fill="#6D4028" />

        <!-- Wood Frame - Right -->
        <rect x="188" y="12" width="12" height="276" fill="#6D4830" />
        <rect x="188" y="12" width="2" height="276" fill="#8B5B3A" />
        <rect x="190" y="12" width="2" height="276" fill="#7D5640" />
        <rect x="192" y="12" width="2" height="276" fill="#6D4830" />
        <rect x="194" y="12" width="2" height="276" fill="#5D4028" />
        <rect x="196" y="12" width="2" height="276" fill="#4D3520" />
        <rect x="198" y="12" width="2" height="276" fill="#3D2A18" />
        <!-- Right grain -->
        <rect x="189" y="50" width="2" height="4" fill="#9B6B4A" />
        <rect x="193" y="120" width="2" height="5" fill="#4D3018" />
        <rect x="189" y="180" width="2" height="4" fill="#9B6B4A" />
        <rect x="191" y="240" width="2" height="4" fill="#5D3820" />

        <!-- Cork Board Background -->
        <rect x="12" y="12" width="176" height="276" fill="#C4956A" />
        <rect x="12" y="12" width="176" height="92" fill="#D4A070" />
        <rect x="12" y="104" width="176" height="92" fill="#C4956A" />
        <rect x="12" y="196" width="176" height="92" fill="#B88B60" />

        <!-- Cork pores/texture -->
        <rect x="20" y="20" width="3" height="3" fill="#B8896A" />
        <rect x="50" y="25" width="2" height="2" fill="#A87D5A" />
        <rect x="90" y="18" width="3" height="2" fill="#D8B080" />
        <rect x="130" y="30" width="2" height="3" fill="#9B7B5A" />
        <rect x="170" y="22" width="2" height="2" fill="#E0B888" />
        <rect x="35" y="50" width="2" height="2" fill="#A88060" />
        <rect x="75" y="45" width="2" height="2" fill="#987048" />
        <rect x="115" y="55" width="3" height="2" fill="#D4A070" />
        <rect x="155" y="48" width="2" height="2" fill="#B89060" />
        <rect x="25" y="80" width="2" height="2" fill="#C4956A" />
        <rect x="65" y="75" width="2" height="3" fill="#A87850" />
        <rect x="105" y="85" width="3" height="2" fill="#D8B080" />
        <rect x="145" y="78" width="2" height="2" fill="#9B7B5A" />
        <rect x="40" y="120" width="2" height="2" fill="#9B7B5A" />
        <rect x="80" y="115" width="3" height="2" fill="#D4A070" />
        <rect x="120" y="125" width="2" height="3" fill="#B89060" />
        <rect x="160" y="118" width="2" height="2" fill="#A87D5A" />
        <rect x="30" y="160" width="2" height="2" fill="#B8896A" />
        <rect x="70" y="155" width="2" height="2" fill="#9B7B5A" />
        <rect x="110" y="165" width="3" height="2" fill="#C49060" />
        <rect x="150" y="158" width="2" height="2" fill="#987048" />
        <rect x="45" y="200" width="2" height="2" fill="#A87D5A" />
        <rect x="85" y="195" width="2" height="3" fill="#C4956A" />
        <rect x="125" y="205" width="2" height="2" fill="#9B7B5A" />
        <rect x="165" y="198" width="3" height="2" fill="#B8896A" />
        <rect x="25" y="240" width="2" height="2" fill="#9B7B5A" />
        <rect x="65" y="235" width="2" height="2" fill="#A87D5A" />
        <rect x="105" y="245" width="3" height="2" fill="#B8896A" />
        <rect x="145" y="238" width="2" height="3" fill="#987048" />
        <rect x="55" y="270" width="2" height="2" fill="#C4956A" />
        <rect x="95" y="265" width="2" height="2" fill="#9B6B4A" />
        <rect x="135" y="275" width="3" height="2" fill="#A88060" />

        <!-- Brass corner tacks -->
        <rect x="4" y="4" width="4" height="4" fill="#D8B070" />
        <rect x="4" y="4" width="2" height="2" fill="#E8C888" />
        <rect x="6" y="6" width="2" height="2" fill="#B89050" />
        <rect x="192" y="4" width="4" height="4" fill="#B89050" />
        <rect x="192" y="4" width="2" height="2" fill="#D8B070" />
        <rect x="194" y="6" width="2" height="2" fill="#987040" />
        <rect x="4" y="292" width="4" height="4" fill="#C4A060" />
        <rect x="4" y="292" width="2" height="2" fill="#D8B070" />
        <rect x="6" y="294" width="2" height="2" fill="#A88050" />
        <rect x="192" y="292" width="4" height="4" fill="#A88050" />
        <rect x="192" y="292" width="2" height="2" fill="#C4A060" />
        <rect x="194" y="294" width="2" height="2" fill="#886030" />
      </svg>

      <!-- Modal Header with detailed wood plank SVG -->
      <div class="modal-header">
        <!-- Wood plank background SVG -->
        <svg
          class="modal-header-bg"
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
        >
          <!-- Main wood plank -->
          <rect x="0" y="0" width="400" height="60" fill="#8B5B3A" />
          <!-- Wood grain horizontal bands -->
          <rect x="0" y="0" width="400" height="4" fill="#A87D5A" />
          <rect x="0" y="4" width="400" height="3" fill="#9B6B4A" />
          <rect x="0" y="7" width="400" height="2" fill="#8B5B3A" />
          <rect x="0" y="12" width="400" height="2" fill="#7D5030" />
          <rect x="0" y="18" width="400" height="3" fill="#9B6B4A" />
          <rect x="0" y="24" width="400" height="2" fill="#6D4828" />
          <rect x="0" y="30" width="400" height="2" fill="#8B5B3A" />
          <rect x="0" y="36" width="400" height="3" fill="#7D5030" />
          <rect x="0" y="42" width="400" height="2" fill="#9B6B4A" />
          <rect x="0" y="48" width="400" height="2" fill="#6D4828" />
          <rect x="0" y="54" width="400" height="3" fill="#7D5030" />
          <rect x="0" y="57" width="400" height="3" fill="#5D4028" />
          <!-- Vertical grain streaks -->
          <rect
            x="20"
            y="0"
            width="2"
            height="60"
            fill="#9B7B5A"
            opacity="0.3"
          />
          <rect
            x="60"
            y="0"
            width="3"
            height="60"
            fill="#7D5030"
            opacity="0.4"
          />
          <rect
            x="110"
            y="0"
            width="2"
            height="60"
            fill="#A87D5A"
            opacity="0.3"
          />
          <rect
            x="150"
            y="0"
            width="2"
            height="60"
            fill="#6D4828"
            opacity="0.4"
          />
          <rect
            x="200"
            y="0"
            width="3"
            height="60"
            fill="#9B7B5A"
            opacity="0.3"
          />
          <rect
            x="250"
            y="0"
            width="2"
            height="60"
            fill="#7D5030"
            opacity="0.4"
          />
          <rect
            x="300"
            y="0"
            width="2"
            height="60"
            fill="#A87D5A"
            opacity="0.3"
          />
          <rect
            x="350"
            y="0"
            width="3"
            height="60"
            fill="#6D4828"
            opacity="0.4"
          />
          <!-- Wood knots -->
          <ellipse cx="45" cy="25" rx="6" ry="8" fill="#5D4028" />
          <ellipse cx="45" cy="25" rx="4" ry="5" fill="#4D3520" />
          <ellipse cx="45" cy="24" rx="2" ry="3" fill="#3D2A18" />
          <ellipse cx="180" cy="40" rx="5" ry="6" fill="#5D4028" />
          <ellipse cx="180" cy="40" rx="3" ry="4" fill="#4D3520" />
          <ellipse cx="320" cy="20" rx="7" ry="9" fill="#5D4028" />
          <ellipse cx="320" cy="20" rx="5" ry="6" fill="#4D3520" />
          <ellipse cx="320" cy="19" rx="2" ry="3" fill="#3D2A18" />
          <!-- Highlight streaks -->
          <rect x="0" y="0" width="400" height="2" fill="#B8896A" />
          <rect x="75" y="8" width="30" height="1" fill="#A87D5A" />
          <rect x="160" y="15" width="40" height="1" fill="#9B7B5A" />
          <rect x="280" y="10" width="25" height="1" fill="#A87D5A" />
          <!-- Shadow at bottom -->
          <rect x="0" y="56" width="400" height="4" fill="#4D3520" />
          <!-- Nail heads -->
          <circle cx="12" cy="30" r="4" fill="#6D6D6D" />
          <circle cx="12" cy="30" r="3" fill="#8B8B8B" />
          <rect x="10" y="28" width="2" height="2" fill="#ABABAB" />
          <circle cx="388" cy="30" r="4" fill="#5D5D5D" />
          <circle cx="388" cy="30" r="3" fill="#7B7B7B" />
          <rect x="386" y="28" width="2" height="2" fill="#9B9B9B" />
        </svg>

        <div class="modal-header-content">
          <!-- Detailed scroll/banner icon -->
          <svg class="modal-title-icon" viewBox="0 0 32 32" fill="none">
            <!-- Scroll roll top -->
            <rect x="4" y="2" width="24" height="4" fill="#D8B070" />
            <rect x="4" y="2" width="24" height="1" fill="#F0D898" />
            <rect x="4" y="3" width="24" height="1" fill="#E8C888" />
            <rect x="4" y="5" width="24" height="1" fill="#C4A060" />
            <rect x="2" y="3" width="2" height="2" fill="#C4A060" />
            <rect x="28" y="3" width="2" height="2" fill="#B89050" />
            <!-- Scroll body -->
            <rect x="5" y="6" width="22" height="20" fill="#E9D8B8" />
            <rect x="5" y="6" width="22" height="1" fill="#F5EED8" />
            <!-- Parchment texture -->
            <rect x="8" y="8" width="3" height="1" fill="#D8C098" />
            <rect x="16" y="10" width="4" height="1" fill="#C4A880" />
            <rect x="10" y="14" width="2" height="1" fill="#D0B488" />
            <rect x="20" y="18" width="3" height="1" fill="#C49C6C" />
            <rect x="12" y="22" width="2" height="1" fill="#D8C098" />
            <!-- Text lines -->
            <rect x="8" y="9" width="16" height="2" fill="#583524" />
            <rect x="8" y="13" width="12" height="2" fill="#70402A" />
            <rect x="8" y="17" width="14" height="2" fill="#583524" />
            <rect x="8" y="21" width="10" height="2" fill="#70402A" />
            <!-- Scroll roll bottom -->
            <rect x="4" y="26" width="24" height="4" fill="#C4A060" />
            <rect x="4" y="26" width="24" height="1" fill="#D8B070" />
            <rect x="4" y="28" width="24" height="1" fill="#B89050" />
            <rect x="4" y="29" width="24" height="1" fill="#A88050" />
            <rect x="2" y="27" width="2" height="2" fill="#B89050" />
            <rect x="28" y="27" width="2" height="2" fill="#987040" />
          </svg>
          <span id="task-picker-title">QUEST LIST</span>
        </div>
        <button
          class="close-btn"
          onclick={() => (showTaskPicker = false)}
          aria-label="Close"
        >
          <svg class="close-icon" viewBox="0 0 16 16" fill="currentColor">
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
            <!-- Empty scroll illustration -->
            <svg class="empty-scroll-icon" viewBox="0 0 64 64" fill="none">
              <!-- Scroll background -->
              <rect x="12" y="8" width="40" height="48" fill="#E9D8B8" />
              <!-- Scroll top roll -->
              <rect x="10" y="4" width="44" height="6" fill="#D8B070" />
              <rect x="10" y="4" width="44" height="2" fill="#E8C888" />
              <rect x="10" y="8" width="44" height="2" fill="#C4A060" />
              <!-- Scroll bottom roll -->
              <rect x="10" y="54" width="44" height="6" fill="#C4A060" />
              <rect x="10" y="54" width="44" height="2" fill="#D8B070" />
              <rect x="10" y="58" width="44" height="2" fill="#B89050" />
              <!-- Sad face -->
              <rect x="22" y="22" width="4" height="4" fill="#8A5C3A" />
              <rect x="38" y="22" width="4" height="4" fill="#8A5C3A" />
              <rect x="24" y="38" width="16" height="2" fill="#8A5C3A" />
              <rect x="22" y="36" width="4" height="2" fill="#8A5C3A" />
              <rect x="38" y="36" width="4" height="2" fill="#8A5C3A" />
              <!-- Stain marks -->
              <rect x="16" y="16" width="4" height="2" fill="#D8C098" />
              <rect x="44" y="28" width="4" height="2" fill="#C4A880" />
              <rect x="18" y="44" width="3" height="2" fill="#D0B488" />
            </svg>
            <span>NO QUESTS AVAILABLE</span>
          </div>
        {:else}
          <div class="quest-list">
            {#each availableTasks as task, index (task.id)}
              <button class="quest-item" onclick={() => handleSelectTask(task)}>
                <!-- Detailed parchment paper background -->
                <svg
                  class="quest-item-bg"
                  viewBox="0 0 400 80"
                  preserveAspectRatio="none"
                >
                  <!-- Deep paper shadow (layered for depth) -->
                  <rect x="6" y="6" width="390" height="70" fill="#8A5C3A" />
                  <rect x="5" y="5" width="391" height="71" fill="#A86C44" />

                  <!-- Parchment base with gradient bands -->
                  <rect x="0" y="0" width="396" height="76" fill="#E9D8B8" />
                  <rect x="0" y="0" width="396" height="20" fill="#F0E0C8" />
                  <rect x="0" y="20" width="396" height="20" fill="#E9D8B8" />
                  <rect x="0" y="40" width="396" height="20" fill="#E0D0B0" />
                  <rect x="0" y="60" width="396" height="16" fill="#D8C8A8" />

                  <!-- Edge highlight (top-left lighting) -->
                  <rect x="0" y="0" width="396" height="2" fill="#F8F0E0" />
                  <rect x="0" y="0" width="2" height="76" fill="#F5EED8" />

                  <!-- Edge shadow (bottom-right) -->
                  <rect x="394" y="0" width="2" height="76" fill="#C4A880" />
                  <rect x="0" y="74" width="396" height="2" fill="#C49C6C" />

                  <!-- Top edge chips/tears -->
                  <rect x="12" y="0" width="5" height="3" fill="#D4B898" />
                  <rect x="13" y="3" width="3" height="2" fill="#C4A880" />
                  <rect x="45" y="0" width="3" height="2" fill="#C49C6C" />
                  <rect x="80" y="0" width="6" height="3" fill="#D8C098" />
                  <rect x="82" y="3" width="3" height="2" fill="#C4A880" />
                  <rect x="130" y="0" width="4" height="2" fill="#B0885A" />
                  <rect x="175" y="0" width="5" height="3" fill="#D4B898" />
                  <rect x="220" y="0" width="3" height="2" fill="#C49C6C" />
                  <rect x="270" y="0" width="6" height="3" fill="#D8C098" />
                  <rect x="272" y="3" width="2" height="2" fill="#C4A880" />
                  <rect x="320" y="0" width="4" height="2" fill="#B0885A" />
                  <rect x="365" y="0" width="5" height="3" fill="#D4B898" />

                  <!-- Bottom edge tears -->
                  <rect x="20" y="73" width="4" height="3" fill="#A86C44" />
                  <rect x="21" y="71" width="2" height="2" fill="#B88860" />
                  <rect x="90" y="74" width="5" height="2" fill="#9B6B4A" />
                  <rect x="160" y="73" width="3" height="3" fill="#A86C44" />
                  <rect x="240" y="74" width="4" height="2" fill="#9B6B4A" />
                  <rect x="310" y="73" width="5" height="3" fill="#A86C44" />
                  <rect x="312" y="71" width="2" height="2" fill="#B88860" />
                  <rect x="375" y="74" width="4" height="2" fill="#9B6B4A" />

                  <!-- Left edge wear -->
                  <rect x="0" y="15" width="3" height="4" fill="#C4A880" />
                  <rect x="0" y="40" width="2" height="5" fill="#D4B898" />
                  <rect x="0" y="60" width="3" height="3" fill="#C49C6C" />

                  <!-- Right edge wear -->
                  <rect x="393" y="20" width="3" height="4" fill="#B0885A" />
                  <rect x="394" y="45" width="2" height="5" fill="#C4A880" />
                  <rect x="393" y="65" width="3" height="4" fill="#B0885A" />

                  <!-- Curled corner (bottom right) -->
                  <rect x="386" y="66" width="6" height="6" fill="#C4A880" />
                  <rect x="388" y="68" width="6" height="6" fill="#B0885A" />
                  <rect x="390" y="70" width="6" height="6" fill="#9B6B4A" />
                  <rect x="392" y="72" width="4" height="4" fill="#8A5C3A" />

                  <!-- Stain marks (coffee/tea rings, water damage) -->
                  <ellipse
                    cx="35"
                    cy="20"
                    rx="8"
                    ry="6"
                    fill="#D8C098"
                    opacity="0.6"
                  />
                  <ellipse
                    cx="35"
                    cy="20"
                    rx="5"
                    ry="4"
                    fill="#E0D0B0"
                    opacity="0.4"
                  />
                  <rect
                    x="70"
                    y="35"
                    width="8"
                    height="5"
                    fill="#C4A880"
                    opacity="0.5"
                  />
                  <rect
                    x="72"
                    y="37"
                    width="4"
                    height="2"
                    fill="#D0B488"
                    opacity="0.4"
                  />
                  <ellipse
                    cx="140"
                    cy="55"
                    rx="10"
                    ry="7"
                    fill="#D4B898"
                    opacity="0.5"
                  />
                  <rect
                    x="190"
                    y="15"
                    width="6"
                    height="4"
                    fill="#C49C6C"
                    opacity="0.6"
                  />
                  <ellipse
                    cx="250"
                    cy="40"
                    rx="7"
                    ry="5"
                    fill="#D8C098"
                    opacity="0.5"
                  />
                  <rect
                    x="300"
                    y="25"
                    width="9"
                    height="5"
                    fill="#C4A880"
                    opacity="0.5"
                  />
                  <ellipse
                    cx="355"
                    cy="60"
                    rx="8"
                    ry="5"
                    fill="#D0B488"
                    opacity="0.5"
                  />

                  <!-- Age spots / foxing -->
                  <rect
                    x="25"
                    y="45"
                    width="2"
                    height="2"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="60"
                    y="15"
                    width="2"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />
                  <rect
                    x="100"
                    y="55"
                    width="3"
                    height="2"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="150"
                    y="25"
                    width="2"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />
                  <rect
                    x="210"
                    y="50"
                    width="2"
                    height="3"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="260"
                    y="20"
                    width="3"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />
                  <rect
                    x="330"
                    y="45"
                    width="2"
                    height="2"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="370"
                    y="30"
                    width="2"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />

                  <!-- Center fold crease (vertical) -->
                  <rect
                    x="196"
                    y="0"
                    width="1"
                    height="76"
                    fill="#D8C098"
                    opacity="0.7"
                  />
                  <rect
                    x="197"
                    y="0"
                    width="2"
                    height="76"
                    fill="#C4A880"
                    opacity="0.5"
                  />
                  <rect
                    x="199"
                    y="0"
                    width="1"
                    height="76"
                    fill="#D4B898"
                    opacity="0.3"
                  />

                  <!-- Horizontal fold creases -->
                  <rect
                    x="0"
                    y="25"
                    width="396"
                    height="1"
                    fill="#D8C098"
                    opacity="0.4"
                  />
                  <rect
                    x="0"
                    y="26"
                    width="396"
                    height="1"
                    fill="#C4A880"
                    opacity="0.3"
                  />
                  <rect
                    x="0"
                    y="50"
                    width="396"
                    height="1"
                    fill="#D8C098"
                    opacity="0.4"
                  />
                  <rect
                    x="0"
                    y="51"
                    width="396"
                    height="1"
                    fill="#C4A880"
                    opacity="0.3"
                  />

                  <!-- Fiber texture lines -->
                  <rect
                    x="10"
                    y="10"
                    width="40"
                    height="1"
                    fill="#D4B898"
                    opacity="0.3"
                  />
                  <rect
                    x="80"
                    y="30"
                    width="50"
                    height="1"
                    fill="#C4A880"
                    opacity="0.25"
                  />
                  <rect
                    x="200"
                    y="15"
                    width="45"
                    height="1"
                    fill="#D8C098"
                    opacity="0.3"
                  />
                  <rect
                    x="280"
                    y="45"
                    width="55"
                    height="1"
                    fill="#C4A880"
                    opacity="0.25"
                  />
                  <rect
                    x="50"
                    y="60"
                    width="40"
                    height="1"
                    fill="#D4B898"
                    opacity="0.3"
                  />
                  <rect
                    x="320"
                    y="65"
                    width="35"
                    height="1"
                    fill="#C4A880"
                    opacity="0.25"
                  />
                </svg>

                <!-- Detailed pin decoration -->
                <div
                  class="quest-pin"
                  style="--pin-color: {task.type === 'ルーティン'
                    ? '#40A040'
                    : task.type === '期限付き'
                      ? '#D8B070'
                      : '#4080D0'}; --pin-shadow: {task.type === 'ルーティン'
                    ? '#206020'
                    : task.type === '期限付き'
                      ? '#987040'
                      : '#204080'}; --pin-highlight: {task.type === 'ルーティン'
                    ? '#70D070'
                    : task.type === '期限付き'
                      ? '#F0E0A0'
                      : '#90C8F8'}"
                >
                  <svg viewBox="0 0 16 16" fill="none">
                    <!-- Pin shadow on paper -->
                    <ellipse
                      cx="9"
                      cy="10"
                      rx="4"
                      ry="2"
                      fill="#8A5C3A"
                      opacity="0.3"
                    />
                    <!-- Pin base (metallic ring) -->
                    <circle cx="8" cy="7" r="6" fill="var(--pin-shadow)" />
                    <circle cx="8" cy="7" r="5" fill="var(--pin-color)" />
                    <!-- Pin top highlight -->
                    <circle
                      cx="8"
                      cy="6"
                      r="4"
                      fill="var(--pin-highlight)"
                      opacity="0.4"
                    />
                    <circle cx="6" cy="5" r="2" fill="white" opacity="0.5" />
                    <!-- Pin center (pushed in) -->
                    <circle cx="8" cy="7" r="2" fill="var(--pin-shadow)" />
                    <rect
                      x="7"
                      y="6"
                      width="1"
                      height="1"
                      fill="var(--pin-color)"
                      opacity="0.5"
                    />
                  </svg>
                </div>

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
    /* Use app default font for English text; keep pixel-art rendering for graphics */
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
    padding: 12px 16px;
    background: oklch(var(--b1));
    border-bottom: 1px solid oklch(var(--bc) / 0.15);
  }

  .game-title {
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 0.12em;
    color: oklch(var(--bc));
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: oklch(var(--b3));
    color: oklch(var(--bc) / 0.5);
    border: 2px solid oklch(var(--bc) / 0.15);
    border-top-color: oklch(var(--bc) / 0.08);
    border-left-color: oklch(var(--bc) / 0.08);
    border-bottom-color: oklch(var(--bc) / 0.25);
    border-right-color: oklch(var(--bc) / 0.25);
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .close-btn:hover {
    background: oklch(var(--er) / 0.15);
    color: oklch(var(--er));
    border-color: oklch(var(--er) / 0.3);
  }

  .close-btn:active {
    border-top-color: oklch(var(--bc) / 0.25);
    border-left-color: oklch(var(--bc) / 0.25);
    border-bottom-color: oklch(var(--bc) / 0.08);
    border-right-color: oklch(var(--bc) / 0.08);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     GAME CONTENT - Main area
     ═══════════════════════════════════════════════════════════════════════════ */
  .game-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
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
    margin: auto 0;
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
     ACTIVE SESSION - Timer Panel (pixel art wood frame style)
     ═══════════════════════════════════════════════════════════════════════════ */
  .timer-panel-active {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 20px;

    /* Parchment background */
    background: linear-gradient(180deg, #e9d8b8 0%, #d8c098 50%, #c4a880 100%);

    /* Wood frame border with 3D bevel */
    border: 4px solid #9b6b4a;
    border-top-color: #c4956a;
    border-left-color: #b8896a;
    border-bottom-color: #5d4028;
    border-right-color: #7d5640;

    /* 3D depth */
    box-shadow:
      3px 3px 0 #4d3520,
      inset 2px 2px 0 rgba(255, 255, 255, 0.2),
      inset -2px -2px 0 rgba(0, 0, 0, 0.15);
  }

  /* Focus phase - warm red-tinted wood */
  .timer-work-active {
    border-color: #9b5a3a;
    border-top-color: #c47858;
    border-left-color: #b86848;
    border-bottom-color: #5d3028;
    border-right-color: #7d4030;
    box-shadow:
      3px 3px 0 #4d2520,
      inset 2px 2px 0 rgba(255, 200, 150, 0.25),
      inset -2px -2px 0 rgba(100, 30, 0, 0.15),
      0 0 12px oklch(var(--er) / 0.2);
  }

  /* Rest phase - cool green-tinted wood */
  .timer-break-active {
    border-color: #5a8b6a;
    border-top-color: #7ac49a;
    border-left-color: #6ab888;
    border-bottom-color: #2d5d38;
    border-right-color: #407d4a;
    box-shadow:
      3px 3px 0 #1d4d28,
      inset 2px 2px 0 rgba(150, 255, 200, 0.25),
      inset -2px -2px 0 rgba(0, 80, 40, 0.15),
      0 0 12px oklch(var(--su) / 0.2);
  }

  .timer-work-active .timer-value-active {
    color: #8b2020;
    text-shadow:
      2px 2px 0 rgba(255, 200, 180, 0.5),
      -1px -1px 0 rgba(100, 0, 0, 0.2);
  }

  .timer-break-active .timer-value-active {
    color: #1e6b48;
    text-shadow:
      2px 2px 0 rgba(180, 255, 200, 0.5),
      -1px -1px 0 rgba(0, 80, 40, 0.2);
  }

  .timer-value-active {
    font-size: 44px;
    font-weight: bold;
    letter-spacing: 0.08em;
    line-height: 1;
    color: #3d2a18;
    text-shadow:
      2px 2px 0 rgba(255, 255, 255, 0.5),
      -1px -1px 0 rgba(0, 0, 0, 0.1);
  }

  .timer-phase-active {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: #7d5640;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
  }

  .paused-indicator-active {
    padding: 3px 8px;
    background: linear-gradient(180deg, #e8c080 0%, #d8b070 50%, #c4a060 100%);
    border: 2px solid #b89050;
    border-top-color: #f0d898;
    border-left-color: #e8c888;
    border-bottom-color: #a88040;
    border-right-color: #a88040;
    color: #5d4028;
    font-size: 8px;
    font-weight: bold;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
    box-shadow:
      1px 1px 0 #987040,
      inset 1px 1px 0 rgba(255, 255, 255, 0.2);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ACTIVE SESSION - Quest Panel (pixel art parchment + wood frame)
     ═══════════════════════════════════════════════════════════════════════════ */
  .quest-panel-active {
    width: 100%;
    position: relative;

    /* Parchment base */
    background: linear-gradient(180deg, #e9d8b8 0%, #d8c098 100%);

    /* Wood frame border */
    border: 4px solid #9b6b4a;
    border-top-color: #c4956a;
    border-left-color: #b8896a;
    border-bottom-color: #5d4028;
    border-right-color: #7d5640;

    box-shadow:
      3px 3px 0 #4d3520,
      inset 2px 2px 0 rgba(255, 255, 255, 0.15),
      inset -2px -2px 0 rgba(0, 0, 0, 0.1);
  }

  /* Brass tacks at corners */
  .quest-panel-active::before,
  .quest-panel-active::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    background: linear-gradient(135deg, #e8c888 0%, #d8b070 50%, #b89050 100%);
    border-radius: 1px;
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.4),
      1px 1px 0 rgba(0, 0, 0, 0.3);
    z-index: 1;
  }

  .quest-panel-active::before {
    top: 4px;
    left: 4px;
  }

  .quest-panel-active::after {
    top: 4px;
    right: 4px;
  }

  .quest-header-active {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 16px;

    /* Wood plank header */
    background: linear-gradient(180deg, #9b6b4a 0%, #8b5b3a 50%, #7d5030 100%);
    border-bottom: 2px solid #5d4028;

    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: #fff8ed;
    text-shadow: 1px 1px 0 #3d2a18;
  }

  .quest-header-icon {
    width: 16px;
    height: 16px;
    image-rendering: pixelated;
    filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.3));
  }

  .quest-title-active {
    padding: 10px 16px;
    font-size: 13px;
    font-weight: bold;
    color: #3d2a18;
    text-align: center;
    word-break: break-word;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.5);
  }

  .quest-stats-active {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 16px;

    /* Darker parchment footer */
    background: linear-gradient(180deg, #d8c098 0%, #c4a880 100%);
    border-top: 1px solid #b0885a;
  }

  .stat-label {
    font-size: 8px;
    font-weight: bold;
    letter-spacing: 0.08em;
    color: #7d5640;
  }

  .stat-value {
    font-size: 13px;
    font-weight: bold;
    color: #3d2a18;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
  }

  /* Decorative brass tack divider */
  .stat-divider-active {
    width: 6px;
    height: 6px;
    background: linear-gradient(135deg, #e8c888 0%, #d8b070 50%, #b89050 100%);
    border-radius: 1px;
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.3),
      1px 1px 0 rgba(0, 0, 0, 0.2);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ACTIVE SESSION - Control Buttons (pixel art wood button style)
     ═══════════════════════════════════════════════════════════════════════════ */
  .control-buttons-active {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .ctrl-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 12px;
    min-width: 60px;

    /* Wood button base */
    background: linear-gradient(
      180deg,
      #b8896a 0%,
      #9b6b4a 30%,
      #8b5b3a 70%,
      #7d5030 100%
    );

    /* 3D wood frame border */
    border: 3px solid #7d5640;
    border-top-color: #c4956a;
    border-left-color: #b8896a;
    border-bottom-color: #4d3520;
    border-right-color: #5d4028;
    font-size: 9px;
    font-weight: bold;
    letter-spacing: 0.08em;
    color: #fff8ed;
    text-shadow: 1px 1px 0 #3d2a18;
    cursor: pointer;

    box-shadow:
      2px 2px 0 #3d2a18,
      inset 1px 1px 0 rgba(255, 255, 255, 0.15),
      inset -1px -1px 0 rgba(0, 0, 0, 0.1);

    transition: all 0.1s ease;
  }

  .ctrl-btn:hover {
    background: linear-gradient(
      180deg,
      #c4956a 0%,
      #a87d5a 30%,
      #9b6b4a 70%,
      #8b5b3a 100%
    );
    box-shadow:
      1px 1px 0 #3d2a18,
      inset 1px 1px 0 rgba(255, 255, 255, 0.2),
      inset -1px -1px 0 rgba(0, 0, 0, 0.1);
  }

  .ctrl-btn:active {
    /* Pressed state - invert bevel */
    border-top-color: #4d3520;
    border-left-color: #5d4028;
    border-bottom-color: #c4956a;
    border-right-color: #b8896a;
    box-shadow:
      inset 2px 2px 0 rgba(0, 0, 0, 0.2),
      inset -1px -1px 0 rgba(255, 255, 255, 0.1);
    transform: translate(1px, 1px);
  }

  .ctrl-btn-icon {
    width: 14px;
    height: 14px;
    filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.3));
  }

  /* PAUSE/RESUME button - neutral wood (default) */
  .ctrl-btn-pause {
    /* Uses default wood styling */
  }

  /* SKIP button - green tinted wood */
  .ctrl-btn-skip {
    background: linear-gradient(
      180deg,
      #7ac49a 0%,
      #5a9b7a 30%,
      #4a8b6a 70%,
      #3a7d5a 100%
    );
    border-color: #2d5d38;
    border-top-color: #8ad4aa;
    border-left-color: #7ac49a;
    border-bottom-color: #1d4d28;
    border-right-color: #2d5d38;
    box-shadow:
      2px 2px 0 #1d4d28,
      inset 1px 1px 0 rgba(200, 255, 220, 0.2),
      inset -1px -1px 0 rgba(0, 50, 20, 0.15);
  }

  .ctrl-btn-skip:hover {
    background: linear-gradient(
      180deg,
      #8ad4aa 0%,
      #6aab8a 30%,
      #5a9b7a 70%,
      #4a8b6a 100%
    );
    box-shadow:
      1px 1px 0 #1d4d28,
      inset 1px 1px 0 rgba(200, 255, 220, 0.25),
      inset -1px -1px 0 rgba(0, 50, 20, 0.15);
  }

  /* COMPLETE button - green tinted wood */
  .ctrl-btn-complete {
    background: linear-gradient(
      180deg,
      #7ac49a 0%,
      #5a9b7a 30%,
      #4a8b6a 70%,
      #3a7d5a 100%
    );
    border-color: #2d5d38;
    border-top-color: #8ad4aa;
    border-left-color: #7ac49a;
    border-bottom-color: #1d4d28;
    border-right-color: #2d5d38;
    box-shadow:
      2px 2px 0 #1d4d28,
      inset 1px 1px 0 rgba(200, 255, 220, 0.2),
      inset -1px -1px 0 rgba(0, 50, 20, 0.15);
  }

  .ctrl-btn-complete:hover {
    background: linear-gradient(
      180deg,
      #8ad4aa 0%,
      #6aab8a 30%,
      #5a9b7a 70%,
      #4a8b6a 100%
    );
    box-shadow:
      1px 1px 0 #1d4d28,
      inset 1px 1px 0 rgba(200, 255, 220, 0.25),
      inset -1px -1px 0 rgba(0, 50, 20, 0.15);
  }

  /* QUIT button - red tinted wood */
  .ctrl-btn-abandon {
    background: linear-gradient(
      180deg,
      #c47858 0%,
      #9b5a3a 30%,
      #8b4a2a 70%,
      #7d3a1a 100%
    );
    border-color: #5d3028;
    border-top-color: #d48868;
    border-left-color: #c47858;
    border-bottom-color: #3d2018;
    border-right-color: #4d2520;
    box-shadow:
      2px 2px 0 #3d2018,
      inset 1px 1px 0 rgba(255, 200, 180, 0.2),
      inset -1px -1px 0 rgba(80, 20, 0, 0.15);
  }

  .ctrl-btn-abandon:hover {
    background: linear-gradient(
      180deg,
      #d48868 0%,
      #ab6a4a 30%,
      #9b5a3a 70%,
      #8b4a2a 100%
    );
    box-shadow:
      1px 1px 0 #3d2018,
      inset 1px 1px 0 rgba(255, 200, 180, 0.25),
      inset -1px -1px 0 rgba(80, 20, 0, 0.15);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     QUEST PANEL - Task display
     ═══════════════════════════════════════════════════════════════════════════ */
  .quest-panel {
    width: 100%;
  }

  .quest-title {
    position: relative;
    z-index: 1;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.05em;
    color: #f5eed8;
    text-shadow:
      1px 1px 0 #3d2a18,
      -1px -1px 0 #3d2a18,
      1px -1px 0 #3d2a18,
      -1px 1px 0 #3d2a18;
    text-align: center;
    word-break: break-word;
    padding: 0 16px;
  }

  /* Medieval wooden sign board */
  .quest-selected {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 48px;
    padding: 8px 24px;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: filter 0.1s ease;
  }

  .quest-sign-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .quest-selected:hover {
    filter: brightness(1.1);
  }

  .quest-selected:active {
    filter: brightness(0.95);
    transform: translateY(1px);
  }

  .quest-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 0;
  }

  .quest-board-container {
    position: relative;
    width: 100%;
    max-width: 200px;
  }

  .quest-board-svg {
    width: 100%;
    height: auto;
    image-rendering: pixelated;
  }

  .quest-text-button {
    position: absolute;
    /* Position at bottom cork section: y=62 to y=90 out of 96 total height */
    bottom: calc(6 / 96 * 100%);
    left: calc(6 / 128 * 100%);
    width: calc(116 / 128 * 100%);
    height: calc(28 / 96 * 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #f5eed8;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 0.05em;
    text-shadow:
      1px 1px 0 #3d2a18,
      -1px -1px 0 #3d2a18,
      1px -1px 0 #3d2a18,
      -1px 1px 0 #3d2a18,
      2px 2px 2px rgba(0, 0, 0, 0.4);
    transition: all 0.15s ease;
  }

  .quest-text-button:hover {
    color: #e8c888;
    text-shadow:
      1px 1px 0 #3d2a18,
      -1px -1px 0 #3d2a18,
      1px -1px 0 #3d2a18,
      -1px 1px 0 #3d2a18,
      0 0 8px rgba(232, 200, 136, 0.5);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RULES PANEL - Game rules display
     ═══════════════════════════════════════════════════════════════════════════ */
  .rules-duration-row {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    justify-content: center;
    gap: 12px;
    margin: 12px 0 16px;
  }

  .rules-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 16px;
    background: oklch(var(--b1));
    border: 2px solid oklch(var(--bc) / 0.2);
  }

  .rule-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .rule-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
  }

  .rule-value {
    font-size: 18px;
    font-weight: bold;
    color: oklch(var(--bc));
    line-height: 1;
  }

  .rule-label {
    font-size: 9px;
    font-weight: bold;
    letter-spacing: 0.08em;
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

  /* Duration Panel - Matching rules-panel style */
  .duration-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 16px;
    background: oklch(var(--b1));
    border: 2px solid oklch(var(--bc) / 0.2);
  }

  .duration-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .duration-icon-display {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
  }

  .duration-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .duration-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: oklch(var(--b3));
    border: none;
    color: oklch(var(--bc));
    cursor: pointer;
    transition: all 0.1s ease;
    box-shadow:
      inset -1px -1px 0 oklch(var(--bc) / 0.2),
      inset 1px 1px 0 oklch(var(--b1) / 0.5);
  }

  .duration-btn:hover:not(:disabled) {
    background: oklch(var(--bc) / 0.2);
  }

  .duration-btn:active:not(:disabled) {
    box-shadow:
      inset 1px 1px 0 oklch(var(--bc) / 0.2),
      inset -1px -1px 0 oklch(var(--b1) / 0.5);
  }

  .duration-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .duration-btn-icon {
    width: 10px;
    height: 10px;
  }

  .duration-value {
    min-width: 32px;
    font-size: 18px;
    font-weight: bold;
    color: oklch(var(--bc));
    text-align: center;
    line-height: 1;
  }

  .duration-label {
    font-size: 9px;
    font-weight: bold;
    letter-spacing: 0.08em;
    color: oklch(var(--bc) / 0.5);
  }

  .primary-action-btn {
    position: relative;
    padding: 10px 28px;
    background: linear-gradient(180deg, #c4a060 0%, #9b7b4a 50%, #8b6b3a 100%);
    border: 4px solid;
    border-color: #e8c888 #5d4028 #3d2a18 #d8b070;
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: #f5eed8;
    cursor: pointer;
    text-shadow:
      2px 2px 0 #3d2a18,
      -1px -1px 0 #3d2a18,
      1px -1px 0 #3d2a18,
      -1px 1px 0 #3d2a18;
    box-shadow:
      4px 4px 0 #3d2a18,
      inset 2px 2px 0 rgba(255, 255, 255, 0.2),
      inset -2px -2px 0 rgba(0, 0, 0, 0.2);
    image-rendering: pixelated;
  }

  .primary-action-btn::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    right: 2px;
    height: 2px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.3) 50%,
      transparent 100%
    );
  }

  .primary-action-btn:hover {
    background: linear-gradient(180deg, #d8b070 0%, #b89050 50%, #9b7b4a 100%);
    box-shadow:
      2px 2px 0 #3d2a18,
      inset 2px 2px 0 rgba(255, 255, 255, 0.3),
      inset -2px -2px 0 rgba(0, 0, 0, 0.2);
  }

  .primary-action-btn:active {
    background: linear-gradient(180deg, #8b6b3a 0%, #7d5b2a 50%, #6d4b1a 100%);
    border-color: #9b7b4a #d8b070 #e8c888 #5d4028;
    box-shadow:
      1px 1px 0 #3d2a18,
      inset -2px -2px 0 rgba(255, 255, 255, 0.1),
      inset 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .primary-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: 2px 2px 0 #3d2a18;
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
     MODAL - Task picker (painterly wood frame with fine details)
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
    background: oklch(var(--bc) / 0.75);
    backdrop-filter: blur(2px);
  }

  .modal-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 420px;
    max-height: 75vh;
    overflow: hidden;
  }

  .modal-frame-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    pointer-events: none;
  }

  .modal-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    margin: 12px 12px 0;
    overflow: hidden;
  }

  .modal-header-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    pointer-events: none;
  }

  .modal-header-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 1;
  }

  .modal-title-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.4));
  }

  .modal-header #task-picker-title {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: #fff8ed;
    text-shadow:
      2px 2px 0 #3d2a18,
      3px 3px 0 rgba(0, 0, 0, 0.3),
      -1px -1px 0 rgba(255, 255, 255, 0.15);
  }

  .modal-header .close-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #9b6b4a 0%, #7d5640 50%, #5d4028 100%);
    border: 4px solid #4d3520;
    border-top-color: #b8896a;
    border-left-color: #b8896a;
    color: #fff8ed;
    cursor: pointer;
    transition: all 0.1s ease;
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.2),
      inset -1px -1px 0 rgba(0, 0, 0, 0.2),
      2px 2px 0 rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  .modal-header .close-btn .close-icon {
    width: 16px;
    height: 16px;
  }

  .modal-header .close-btn:hover {
    background: linear-gradient(135deg, #d04040 0%, #a02020 50%, #701010 100%);
    border-color: #501010;
    border-top-color: #f06060;
    border-left-color: #f06060;
  }

  .modal-header .close-btn:active {
    border-top-color: #501010;
    border-left-color: #501010;
    border-bottom-color: #f06060;
    border-right-color: #f06060;
    box-shadow:
      inset 2px 2px 0 rgba(0, 0, 0, 0.3),
      1px 1px 0 rgba(0, 0, 0, 0.2);
  }

  .modal-body {
    position: relative;
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    margin: 8px 12px 12px;
    scrollbar-width: thin;
    scrollbar-color: #9b6b4a #c4956a;
  }

  .modal-body::-webkit-scrollbar {
    width: 10px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: #c4956a;
    border: 2px solid #9b6b4a;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #9b6b4a 0%, #7d5640 100%);
    border: 2px solid #5a3d2b;
    border-top-color: #b8896a;
    border-left-color: #b8896a;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: #5a3d2b;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
  }

  .empty-scroll-icon {
    width: 80px;
    height: 80px;
    image-rendering: pixelated;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.15));
  }

  .quest-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .quest-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 72px;
    padding: 16px 20px 16px 44px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: transform 0.12s ease;
  }

  .quest-item-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    pointer-events: none;
    transition:
      filter 0.15s ease,
      transform 0.12s ease;
  }

  .quest-item:hover {
    transform: translateX(6px) translateY(-3px);
  }

  .quest-item:hover .quest-item-bg {
    filter: brightness(1.06) saturate(1.15);
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
  }

  .quest-item:active {
    transform: translateX(3px) translateY(-1px);
  }

  .quest-item:active .quest-item-bg {
    filter: brightness(0.98);
  }

  .quest-pin {
    position: absolute;
    top: 6px;
    left: 10px;
    width: 22px;
    height: 22px;
    z-index: 2;
    color: #fff8ed;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.25));
    image-rendering: pixelated;
  }

  .quest-pin svg {
    width: 100%;
    height: 100%;
  }

  .quest-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    font-size: 16px;
    font-weight: bold;
    border: 4px solid;
    border-top-color: rgba(255, 255, 255, 0.5);
    border-left-color: rgba(255, 255, 255, 0.5);
    box-shadow:
      inset 2px 2px 0 rgba(255, 255, 255, 0.25),
      inset -2px -2px 0 rgba(0, 0, 0, 0.25),
      3px 3px 0 rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  .quest-routine {
    background: linear-gradient(135deg, #70d070 0%, #40a040 50%, #308030 100%);
    border-color: #308030;
    border-bottom-color: #206020;
    border-right-color: #206020;
    color: #ffffff;
    text-shadow: 1px 1px 0 #206020;
  }

  .quest-deadline {
    background: linear-gradient(135deg, #f0d090 0%, #d8b070 50%, #c4a060 100%);
    border-color: #b89050;
    border-bottom-color: #987040;
    border-right-color: #987040;
    color: #5a3d2b;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.4);
  }

  .quest-normal {
    background: linear-gradient(135deg, #90c8f8 0%, #4080d0 50%, #3060a0 100%);
    border-color: #3060a0;
    border-bottom-color: #204080;
    border-right-color: #204080;
    color: #ffffff;
    text-shadow: 1px 1px 0 #204080;
  }

  .quest-info {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 1;
  }

  .quest-name {
    font-size: 15px;
    font-weight: bold;
    color: #3d2a18;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow:
      1px 1px 0 rgba(255, 255, 255, 0.6),
      -1px -1px 0 rgba(255, 255, 255, 0.2);
  }

  .quest-type {
    font-size: 11px;
    color: #5a4a3a;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.4);
  }

  .quest-badge {
    position: relative;
    padding: 5px 14px;
    background: linear-gradient(
      135deg,
      #f8e0a0 0%,
      #e8c880 25%,
      #d8b070 50%,
      #c4a060 100%
    );
    border: 4px solid #b89050;
    border-top-color: #f8e8b0;
    border-left-color: #f8e8b0;
    border-bottom-color: #906830;
    border-right-color: #906830;
    color: #4a3020;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.08em;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.5);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.3),
      inset -1px -1px 0 rgba(0, 0, 0, 0.1),
      3px 3px 0 rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  /* Mobile full-screen modal */
  @media (max-width: 640px) {
    .pixel-modal {
      padding: 0;
    }

    .modal-panel {
      max-width: none;
      max-height: none;
      width: 100%;
      height: 100%;
      border-radius: 0;
    }

    .modal-frame-svg {
      display: none;
    }

    .modal-header {
      margin: 0;
      border-bottom: 4px solid #4d3520;
    }

    .modal-body {
      margin: 0;
      padding: 16px;
      background: #c4956a;
    }

    .quest-item {
      min-height: 68px;
      padding: 14px 16px 14px 40px;
    }

    .quest-pin {
      width: 20px;
      height: 20px;
      top: 5px;
      left: 8px;
    }
  }
</style>
