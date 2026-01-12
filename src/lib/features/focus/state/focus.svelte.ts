/**
 * Focus State - Svelte 5 Reactive Class
 *
 * Manages real-time task tracking with Pomodoro support.
 *
 * Features:
 * - Normal mode: Track time from "Start Now" until planned end time
 * - Pomodoro mode: Classic 25min work + 5min break cycles
 * - Global indicator: Shows active session across app navigation
 * - Persistence: Survives page refresh via localStorage
 *
 * Data Flow:
 * - User clicks "Start Now" → startNormal() → session begins
 * - User opens Pomodoro → startPomodoro() → cycles begin
 * - Planned end time reached → complete() auto-called
 * - Session completes → taskActions.logProgress() called
 */

import {
  parseTimeToday,
  getCurrentHHmm,
  calculateElapsedMinutes,
} from "../utils/timer-utils.ts";

// ============================================================================
// Types
// ============================================================================

export interface PomodoroState {
  phase: "work" | "break";
  cycleNumber: number;
  phaseStartedAt: string; // ISO string for serialization
  workDuration: number; // minutes (default 25)
  breakDuration: number; // minutes (default 5)
  totalWorkTime: number; // accumulated work minutes (excludes breaks)
}

export interface FocusSession {
  memoId: string;
  taskTitle: string;
  startedAt: string; // ISO string for serialization
  plannedEndTime: string; // HH:mm from suggestion
  mode: "normal" | "pomodoro";
  pomodoroState?: PomodoroState;
}

interface StoredSession {
  session: FocusSession;
  savedAt: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "focus_active_session";
const DEFAULT_WORK_DURATION = 25;
const DEFAULT_BREAK_DURATION = 5;

// ============================================================================
// FocusState Class
// ============================================================================

class FocusState {
  // Core state
  activeSession = $state<FocusSession | null>(null);
  isPaused = $state(false);
  private pausedAt: Date | null = null;
  private pausedDuration = 0; // Total paused time in ms

  // Timer interval reference
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  // Reactive tick counter for derived updates
  private tick = $state(0);

  // ============================================================================
  // Derived Properties
  // ============================================================================

  get isActive(): boolean {
    return this.activeSession !== null;
  }

  /**
   * Elapsed work minutes (excludes breaks and pauses)
   */
  get elapsedWorkMinutes(): number {
    // Reference tick to make this reactive
    void this.tick;

    if (!this.activeSession) return 0;

    const startedAt = new Date(this.activeSession.startedAt);
    const now = this.isPaused && this.pausedAt ? this.pausedAt : new Date();

    if (
      this.activeSession.mode === "pomodoro" &&
      this.activeSession.pomodoroState
    ) {
      // For Pomodoro, use accumulated work time + current phase time if in work phase
      const pomo = this.activeSession.pomodoroState;
      let total = pomo.totalWorkTime;

      if (pomo.phase === "work") {
        const phaseStarted = new Date(pomo.phaseStartedAt);
        total += calculateElapsedMinutes(phaseStarted, now);
      }

      return total;
    }

    // Normal mode: just elapsed time minus pauses
    const elapsedMs = now.getTime() - startedAt.getTime() - this.pausedDuration;
    return Math.max(0, Math.floor(elapsedMs / 60000));
  }

  /**
   * Current Pomodoro phase
   */
  get currentPhase(): "work" | "break" | null {
    if (!this.activeSession?.pomodoroState) return null;
    return this.activeSession.pomodoroState.phase;
  }

  /**
   * Seconds remaining in current Pomodoro phase
   */
  get phaseTimeRemaining(): number {
    // Reference tick to make this reactive
    void this.tick;

    if (!this.activeSession?.pomodoroState) return 0;

    const pomo = this.activeSession.pomodoroState;
    const phaseStarted = new Date(pomo.phaseStartedAt);
    const now = this.isPaused && this.pausedAt ? this.pausedAt : new Date();

    const phaseDuration =
      pomo.phase === "work" ? pomo.workDuration : pomo.breakDuration;
    const elapsedSeconds = Math.floor(
      (now.getTime() - phaseStarted.getTime()) / 1000,
    );
    const targetSeconds = phaseDuration * 60;

    return Math.max(0, targetSeconds - elapsedSeconds);
  }

  /**
   * Progress percentage for current Pomodoro phase (0-100)
   */
  get phaseProgress(): number {
    if (!this.activeSession?.pomodoroState) return 0;

    const pomo = this.activeSession.pomodoroState;
    const phaseDuration =
      pomo.phase === "work" ? pomo.workDuration : pomo.breakDuration;
    const targetSeconds = phaseDuration * 60;
    const remaining = this.phaseTimeRemaining;

    return Math.min(100, ((targetSeconds - remaining) / targetSeconds) * 100);
  }

  /**
   * Seconds until planned end time
   */
  get secondsUntilEnd(): number {
    // Reference tick to make this reactive
    void this.tick;

    if (!this.activeSession) return 0;

    const endTime = parseTimeToday(this.activeSession.plannedEndTime);
    const now = new Date();
    const diffMs = endTime.getTime() - now.getTime();

    return Math.max(0, Math.floor(diffMs / 1000));
  }

  /**
   * Check if planned end time has passed
   */
  get hasEndTimePassed(): boolean {
    return this.secondsUntilEnd === 0 && this.activeSession !== null;
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Start a normal (non-Pomodoro) tracking session
   */
  startNormal(memoId: string, taskTitle: string, plannedEndTime: string): void {
    if (this.activeSession) {
      console.warn("[Focus] Session already active, ignoring startNormal");
      return;
    }

    this.activeSession = {
      memoId,
      taskTitle,
      startedAt: new Date().toISOString(),
      plannedEndTime,
      mode: "normal",
    };

    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;

    this.startTicking();
    this.saveToStorage();

    console.log("[Focus] Started normal session:", {
      memoId,
      taskTitle,
      plannedEndTime,
    });
  }

  /**
   * Start a Pomodoro tracking session
   */
  startPomodoro(
    memoId: string,
    taskTitle: string,
    plannedEndTime: string,
    workDuration = DEFAULT_WORK_DURATION,
    breakDuration = DEFAULT_BREAK_DURATION,
  ): void {
    if (this.activeSession) {
      console.warn("[Focus] Session already active, ignoring startPomodoro");
      return;
    }

    this.activeSession = {
      memoId,
      taskTitle,
      startedAt: new Date().toISOString(),
      plannedEndTime,
      mode: "pomodoro",
      pomodoroState: {
        phase: "work",
        cycleNumber: 1,
        phaseStartedAt: new Date().toISOString(),
        workDuration,
        breakDuration,
        totalWorkTime: 0,
      },
    };

    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;

    this.startTicking();
    this.saveToStorage();

    console.log("[Focus] Started Pomodoro session:", {
      memoId,
      taskTitle,
      plannedEndTime,
    });
  }

  /**
   * Pause the current session
   */
  pause(): void {
    if (!this.activeSession || this.isPaused) return;

    this.isPaused = true;
    this.pausedAt = new Date();
    this.saveToStorage();

    console.log("[Focus] Session paused");
  }

  /**
   * Resume from pause
   */
  resume(): void {
    if (!this.activeSession || !this.isPaused || !this.pausedAt) return;

    // Track how long we were paused
    this.pausedDuration += Date.now() - this.pausedAt.getTime();
    this.isPaused = false;
    this.pausedAt = null;
    this.saveToStorage();

    console.log("[Focus] Session resumed");
  }

  /**
   * Complete the session and log progress
   */
  async complete(): Promise<void> {
    if (!this.activeSession) return;

    const { memoId } = this.activeSession;
    const duration = this.elapsedWorkMinutes;

    console.log("[Focus] Completing session:", { memoId, duration });

    // Dynamic import to avoid circular dependencies
    const { taskActions } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );
    const { scheduleState } = await import(
      "$lib/features/assistant/state/schedule.svelte.ts"
    );

    // Log progress to task
    await taskActions.logProgress(memoId, duration);

    // Remove from accepted memos
    await scheduleState.completeSuggestion(memoId, duration);

    // Clear session
    this.stopTicking();
    this.activeSession = null;
    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;
    this.clearStorage();

    console.log("[Focus] Session completed, logged", duration, "minutes");
  }

  /**
   * Cancel session without logging progress
   */
  cancel(): void {
    if (!this.activeSession) return;

    console.log("[Focus] Session cancelled (no progress logged)");

    this.stopTicking();
    this.activeSession = null;
    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;
    this.clearStorage();
  }

  // ============================================================================
  // Pomodoro-specific Actions
  // ============================================================================

  /**
   * End current Pomodoro phase and move to next
   */
  endPhase(): void {
    if (!this.activeSession?.pomodoroState) return;

    const pomo = this.activeSession.pomodoroState;
    const now = new Date();

    if (pomo.phase === "work") {
      // Calculate work time from this phase
      const phaseStarted = new Date(pomo.phaseStartedAt);
      const phaseMinutes = calculateElapsedMinutes(phaseStarted, now);

      // Move to break
      this.activeSession = {
        ...this.activeSession,
        pomodoroState: {
          ...pomo,
          phase: "break",
          phaseStartedAt: now.toISOString(),
          totalWorkTime: pomo.totalWorkTime + phaseMinutes,
        },
      };
    } else {
      // Move to next work cycle
      this.activeSession = {
        ...this.activeSession,
        pomodoroState: {
          ...pomo,
          phase: "work",
          cycleNumber: pomo.cycleNumber + 1,
          phaseStartedAt: now.toISOString(),
        },
      };
    }

    this.saveToStorage();
    console.log(
      "[Focus] Phase ended, now:",
      this.activeSession.pomodoroState?.phase,
    );
  }

  /**
   * Skip current break and start next work phase
   */
  skipBreak(): void {
    if (!this.activeSession?.pomodoroState) return;
    if (this.activeSession.pomodoroState.phase !== "break") return;

    const pomo = this.activeSession.pomodoroState;

    this.activeSession = {
      ...this.activeSession,
      pomodoroState: {
        ...pomo,
        phase: "work",
        cycleNumber: pomo.cycleNumber + 1,
        phaseStartedAt: new Date().toISOString(),
      },
    };

    this.saveToStorage();
    console.log("[Focus] Break skipped, starting cycle", pomo.cycleNumber + 1);
  }

  // ============================================================================
  // Timer Management
  // ============================================================================

  private startTicking(): void {
    if (this.tickInterval) return;

    // Tick every second for smooth timer display
    this.tickInterval = setInterval(() => {
      this.tick++;
      this.checkAutoComplete();
      this.checkPhaseEnd();
    }, 1000);
  }

  private stopTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private checkAutoComplete(): void {
    if (!this.activeSession || this.isPaused) return;

    // Auto-complete when planned end time is reached
    if (this.hasEndTimePassed) {
      console.log("[Focus] Planned end time reached, auto-completing");
      void this.complete();
    }
  }

  private checkPhaseEnd(): void {
    if (!this.activeSession?.pomodoroState || this.isPaused) return;

    // Check if current phase has ended
    if (this.phaseTimeRemaining === 0) {
      this.endPhase();
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  saveToStorage(): void {
    if (!this.activeSession) return;

    const stored: StoredSession = {
      session: this.activeSession,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (err) {
      console.error("[Focus] Failed to save to storage:", err);
    }
  }

  loadFromStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;

      const stored: StoredSession = JSON.parse(data);
      const session = stored.session;

      // Check if session is still valid (end time not passed)
      const now = getCurrentHHmm();
      if (now >= session.plannedEndTime) {
        console.log("[Focus] Stored session has expired, clearing");
        this.clearStorage();
        return;
      }

      // Restore session
      this.activeSession = session;
      this.isPaused = false;
      this.pausedAt = null;
      this.pausedDuration = 0;

      this.startTicking();

      console.log("[Focus] Restored session from storage:", session.taskTitle);
    } catch (err) {
      console.error("[Focus] Failed to load from storage:", err);
      this.clearStorage();
    }
  }

  clearStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("[Focus] Failed to clear storage:", err);
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  destroy(): void {
    this.stopTicking();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const focusState = new FocusState();
