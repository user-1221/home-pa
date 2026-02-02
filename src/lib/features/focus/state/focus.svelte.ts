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
 * - Cross-device sync: Only one active timer per user across all devices
 * - 24-hour cap: Sessions older than 24h are auto-discarded without logging
 *
 * Data Flow:
 * - User clicks "Start Now" → startNormal() → session begins
 * - User opens Pomodoro → startPomodoro() → cycles begin
 * - Planned end time reached → complete() auto-called
 * - Session completes → taskActions.logProgress() called
 *
 * @scope session
 * @owner src/lib/features/focus/components/FocusPanel.svelte
 * @cleanup destroy() stops interval, clearStorage() on session complete/cancel
 */

import {
  parseTimeToday,
  calculateElapsedMinutes,
} from "../utils/timer-utils.ts";
import {
  startTimerSession,
  getActiveTimerSession,
  endTimerSession,
  updateTimerSession,
  moveTimerToDevice,
} from "./focus.remote.ts";
import { notifyWarning } from "$lib/utils/notification-utils.ts";
import { getDeviceId, getDeviceName } from "$lib/utils/device.ts";

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
  isPaused?: boolean;
  pausedAt?: string | null;
  pausedDuration?: number;
}

/** Info about timer running on another device */
export interface OtherDeviceSession {
  deviceName: string;
  taskTitle: string;
  startedAt: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "focus_active_session";
const DEFAULT_WORK_DURATION = 25;
const DEFAULT_BREAK_DURATION = 5;
const MAX_SESSION_HOURS = 24;

// ============================================================================
// FocusState Class
// ============================================================================

class FocusState {
  // Core state
  activeSession = $state<FocusSession | null>(null);
  isPaused = $state(false);
  private pausedAt: Date | null = null;
  private pausedDuration = 0; // Total paused time in ms

  // Cross-device state
  otherDeviceSession = $state<OtherDeviceSession | null>(null);

  // Timer interval reference
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  // Reactive tick counter for derived updates
  private tick = $state(0);

  // Debounce timer for pause sync
  private syncPauseDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
        const elapsedMs =
          now.getTime() - phaseStarted.getTime() - this.pausedDuration;
        total += Math.max(0, Math.floor(elapsedMs / 60000));
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
    const elapsedMs =
      now.getTime() - phaseStarted.getTime() - this.pausedDuration;
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
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

    const startedAt = new Date(this.activeSession.startedAt);
    const endTime = parseTimeToday(this.activeSession.plannedEndTime);

    // Handle midnight crossing: if end time appears before start time,
    // the session was meant to end the next day
    if (endTime.getTime() < startedAt.getTime()) {
      endTime.setDate(endTime.getDate() + 1);
    }

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
   * Returns false if timer is running on another device
   */
  async startNormal(
    memoId: string,
    taskTitle: string,
    plannedEndTime: string,
  ): Promise<boolean> {
    if (this.activeSession) {
      console.warn("[Focus] Session already active, ignoring startNormal");
      return false;
    }

    const startedAt = new Date().toISOString();

    // Sync with server first
    try {
      const result = await startTimerSession({
        memoId,
        taskTitle,
        startedAt,
        plannedEndTime,
        mode: "normal",
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      });

      if (!result.success) {
        if (result.reason === "timer_on_other_device") {
          this.otherDeviceSession = {
            deviceName: result.deviceName,
            taskTitle: result.taskTitle,
            startedAt: result.startedAt,
          };
          console.log(
            "[Focus] Timer running on another device:",
            result.deviceName,
          );
          return false;
        }
      }
    } catch (err) {
      console.error(
        "[Focus] Failed to sync with server, continuing locally:",
        err,
      );
      notifyWarning("sync", "サーバー同期に失敗しました。ローカルで継続します");
      // Continue with local-only session if server sync fails
    }

    this.activeSession = {
      memoId,
      taskTitle,
      startedAt,
      plannedEndTime,
      mode: "normal",
    };

    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;
    this.otherDeviceSession = null;

    this.startTicking();
    this.saveToStorage();

    console.log("[Focus] Started normal session:", {
      memoId,
      taskTitle,
      plannedEndTime,
    });

    return true;
  }

  /**
   * Start a Pomodoro tracking session
   * Returns false if timer is running on another device
   */
  async startPomodoro(
    memoId: string,
    taskTitle: string,
    plannedEndTime: string,
    workDuration = DEFAULT_WORK_DURATION,
    breakDuration = DEFAULT_BREAK_DURATION,
  ): Promise<boolean> {
    if (this.activeSession) {
      console.warn("[Focus] Session already active, ignoring startPomodoro");
      return false;
    }

    const startedAt = new Date().toISOString();
    const pomodoroState: PomodoroState = {
      phase: "work",
      cycleNumber: 1,
      phaseStartedAt: startedAt,
      workDuration,
      breakDuration,
      totalWorkTime: 0,
    };

    // Sync with server first
    try {
      const result = await startTimerSession({
        memoId,
        taskTitle,
        startedAt,
        plannedEndTime,
        mode: "pomodoro",
        pomodoroState,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      });

      if (!result.success) {
        if (result.reason === "timer_on_other_device") {
          this.otherDeviceSession = {
            deviceName: result.deviceName,
            taskTitle: result.taskTitle,
            startedAt: result.startedAt,
          };
          console.log(
            "[Focus] Timer running on another device:",
            result.deviceName,
          );
          return false;
        }
      }
    } catch (err) {
      console.error(
        "[Focus] Failed to sync with server, continuing locally:",
        err,
      );
      notifyWarning("sync", "サーバー同期に失敗しました。ローカルで継続します");
      // Continue with local-only session if server sync fails
    }

    this.activeSession = {
      memoId,
      taskTitle,
      startedAt,
      plannedEndTime,
      mode: "pomodoro",
      pomodoroState,
    };

    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;
    this.otherDeviceSession = null;

    this.startTicking();
    this.saveToStorage();

    console.log("[Focus] Started Pomodoro session:", {
      memoId,
      taskTitle,
      plannedEndTime,
    });

    return true;
  }

  /**
   * Pause the current session
   */
  pause(): void {
    if (!this.activeSession || this.isPaused) return;

    this.isPaused = true;
    this.pausedAt = new Date();
    this.saveToStorage();
    this.syncPauseState();

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
    this.syncPauseState();

    console.log("[Focus] Session resumed");
  }

  /**
   * Sync pause state to server with debouncing
   * Prevents rapid fire on quick pause/resume toggles
   */
  private syncPauseState(): void {
    if (this.syncPauseDebounceTimer) {
      clearTimeout(this.syncPauseDebounceTimer);
    }

    this.syncPauseDebounceTimer = setTimeout(() => {
      this.syncPauseDebounceTimer = null;
      void updateTimerSession({
        isPaused: this.isPaused,
        pausedAt: this.pausedAt?.toISOString() ?? null,
        pausedDuration: this.pausedDuration,
        deviceId: getDeviceId(),
      }).catch((err) => {
        console.error("[Focus] Failed to sync pause state:", err);
      });
    }, 300);
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
    const { taskState } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );
    const { scheduleState } = await import(
      "$lib/features/assistant/state/schedule.svelte.ts"
    );

    // Log progress to task
    await taskState.logProgress(memoId, duration);

    // Mark as complete with actual wall-clock end time
    // Pass undefined for startTime - helper will find the slot by memoId
    const actualEndTime = new Date().toTimeString().slice(0, 5);
    await scheduleState.completeSuggestion(
      memoId,
      undefined,
      duration,
      actualEndTime,
    );

    // Clear server session
    try {
      await endTimerSession({ deviceId: getDeviceId() });
    } catch (err) {
      console.error("[Focus] Failed to clear server session:", err);
    }

    // Clear session
    this.stopTicking();
    this.activeSession = null;
    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;
    this.otherDeviceSession = null;
    this.clearStorage();

    console.log("[Focus] Session completed, logged", duration, "minutes");
  }

  /**
   * Cancel session without logging progress
   */
  cancel(): void {
    if (!this.activeSession) return;

    console.log("[Focus] Session cancelled (no progress logged)");

    // Clear server session (fire and forget)
    void endTimerSession({ deviceId: getDeviceId() }).catch((err) => {
      console.error("[Focus] Failed to clear server session:", err);
    });

    this.stopTicking();
    this.activeSession = null;
    this.isPaused = false;
    this.pausedAt = null;
    this.pausedDuration = 0;
    this.otherDeviceSession = null;
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

    let newPomodoroState: PomodoroState;

    if (pomo.phase === "work") {
      // Calculate work time from this phase (excluding paused time)
      const phaseStarted = new Date(pomo.phaseStartedAt);
      const elapsedMs =
        now.getTime() - phaseStarted.getTime() - this.pausedDuration;
      const phaseMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

      // Move to break
      newPomodoroState = {
        ...pomo,
        phase: "break",
        phaseStartedAt: now.toISOString(),
        totalWorkTime: pomo.totalWorkTime + phaseMinutes,
      };
    } else {
      // Move to next work cycle
      newPomodoroState = {
        ...pomo,
        phase: "work",
        cycleNumber: pomo.cycleNumber + 1,
        phaseStartedAt: now.toISOString(),
      };
    }

    // Reset pausedDuration for the new phase
    this.pausedDuration = 0;

    this.activeSession = {
      ...this.activeSession,
      pomodoroState: newPomodoroState,
    };

    this.saveToStorage();

    // Sync phase change to server (include pausedDuration reset for cross-device sync)
    void updateTimerSession({
      pomodoroState: newPomodoroState,
      pausedDuration: 0,
      deviceId: getDeviceId(),
    }).catch((err) => {
      console.error("[Focus] Failed to sync phase change:", err);
    });

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

    const newPomodoroState: PomodoroState = {
      ...pomo,
      phase: "work",
      cycleNumber: pomo.cycleNumber + 1,
      phaseStartedAt: new Date().toISOString(),
    };

    // Reset pausedDuration for the new phase (same as endPhase does)
    this.pausedDuration = 0;

    this.activeSession = {
      ...this.activeSession,
      pomodoroState: newPomodoroState,
    };

    this.saveToStorage();

    // Sync phase change to server (include pausedDuration reset for cross-device sync)
    void updateTimerSession({
      pomodoroState: newPomodoroState,
      pausedDuration: 0,
      deviceId: getDeviceId(),
    }).catch((err) => {
      console.error("[Focus] Failed to sync skip break:", err);
    });

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
      this.checkMaxDuration();
      this.checkAutoComplete();
      this.checkPhaseEnd();
    }, 1000);
  }

  /**
   * Check if session has exceeded maximum duration (24 hours)
   * If so, discard without logging progress
   */
  private checkMaxDuration(): void {
    if (!this.activeSession) return;

    const startedAt = new Date(this.activeSession.startedAt);
    const hoursElapsed = (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);

    if (hoursElapsed >= MAX_SESSION_HOURS) {
      console.log(
        `[Focus] 24h cap exceeded (${hoursElapsed.toFixed(1)}h), discarding session without logging`,
      );
      this.cancel();
    }
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
      isPaused: this.isPaused,
      pausedAt: this.pausedAt?.toISOString() ?? null,
      pausedDuration: this.pausedDuration,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (err) {
      console.error("[Focus] Failed to save to storage:", err);
    }
  }

  /**
   * Load and restore session from localStorage
   * Also checks server for cross-device state
   * If session has expired, auto-complete it and log progress
   */
  async loadFromStorage(): Promise<void> {
    // First check server for cross-device state
    try {
      const serverSession = await getActiveTimerSession({});

      if (serverSession) {
        // Check if expired
        if ("expired" in serverSession && serverSession.expired) {
          console.log(
            "[Focus] Server session expired (24h cap), clearing local storage",
          );
          this.clearStorage();
          return;
        }

        // Check if running on another device
        if (
          "deviceId" in serverSession &&
          serverSession.deviceId !== getDeviceId()
        ) {
          this.otherDeviceSession = {
            deviceName: serverSession.deviceName,
            taskTitle: serverSession.taskTitle,
            startedAt: serverSession.startedAt,
          };
          console.log(
            "[Focus] Timer running on another device:",
            serverSession.deviceName,
          );
          // Clear local storage since server has different session
          this.clearStorage();
          return;
        }

        // This device owns the session - restore from server
        // Server pause state is authoritative (may have been updated from another tab)
        if ("memoId" in serverSession) {
          this.activeSession = {
            memoId: serverSession.memoId,
            taskTitle: serverSession.taskTitle,
            startedAt: serverSession.startedAt,
            plannedEndTime: serverSession.plannedEndTime,
            mode: serverSession.mode,
            pomodoroState: serverSession.pomodoroState ?? undefined,
          };
          this.isPaused = serverSession.isPaused;
          this.pausedAt = serverSession.pausedAt
            ? new Date(serverSession.pausedAt)
            : null;
          this.pausedDuration = serverSession.pausedDuration;
          this.otherDeviceSession = null;
          this.startTicking();
          this.saveToStorage(); // Sync local storage with server state
          console.log(
            "[Focus] Restored session from server:",
            serverSession.taskTitle,
          );
          return;
        }
      }
    } catch (err) {
      console.error("[Focus] Failed to check server state:", err);
      // Continue with local storage if server check fails
    }

    // Now check local storage
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;

      const stored: StoredSession = JSON.parse(data);
      const session = stored.session;

      // Check 24h cap locally
      const startedAt = new Date(session.startedAt);
      const hoursElapsed =
        (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);
      if (hoursElapsed >= MAX_SESSION_HOURS) {
        console.log(
          `[Focus] Local session exceeded 24h cap (${hoursElapsed.toFixed(1)}h), discarding`,
        );
        this.clearStorage();
        // Also clear server session
        void endTimerSession({ deviceId: getDeviceId() }).catch(() => {});
        return;
      }

      // Check if session has expired using date-aware comparison
      if (this.isSessionExpired(session)) {
        console.log("[Focus] Stored session has expired, auto-completing");
        await this.completeExpiredSession(session);
        return;
      }

      // Restore active session and pause state
      this.activeSession = session;
      this.isPaused = stored.isPaused ?? false;
      this.pausedAt = stored.pausedAt ? new Date(stored.pausedAt) : null;
      this.pausedDuration = stored.pausedDuration ?? 0;
      this.otherDeviceSession = null;

      this.startTicking();

      console.log("[Focus] Restored session from storage:", session.taskTitle);
    } catch (err) {
      console.error("[Focus] Failed to load from storage:", err);
      this.clearStorage();
    }
  }

  /**
   * Check if a session has expired (planned end time has passed)
   * Handles midnight crossing correctly
   */
  private isSessionExpired(session: FocusSession): boolean {
    const startedAt = new Date(session.startedAt);
    const endTime = parseTimeToday(session.plannedEndTime);

    // Handle midnight crossing: if end time appears before start time,
    // the session was meant to end the next day
    if (endTime.getTime() < startedAt.getTime()) {
      endTime.setDate(endTime.getDate() + 1);
    }

    return new Date() >= endTime;
  }

  /**
   * Complete an expired session that was stored while app was closed
   */
  private async completeExpiredSession(session: FocusSession): Promise<void> {
    // Calculate work duration from session data
    const startedAt = new Date(session.startedAt);
    const endTime = parseTimeToday(session.plannedEndTime);

    // Handle midnight crossing
    if (endTime.getTime() < startedAt.getTime()) {
      endTime.setDate(endTime.getDate() + 1);
    }

    // Calculate duration (capped at planned duration)
    let duration: number;
    if (session.mode === "pomodoro" && session.pomodoroState) {
      // For Pomodoro, use accumulated work time + partial current phase
      const pomo = session.pomodoroState;
      duration = pomo.totalWorkTime;

      // Add time from current work phase if it was in progress
      if (pomo.phase === "work") {
        const phaseStarted = new Date(pomo.phaseStartedAt);
        // Cap at phase duration
        const phaseMinutes = Math.min(
          pomo.workDuration,
          calculateElapsedMinutes(phaseStarted, endTime),
        );
        duration += phaseMinutes;
      }
    } else {
      // For normal mode, calculate elapsed time until end
      duration = calculateElapsedMinutes(startedAt, endTime);
    }

    console.log("[Focus] Auto-completing expired session:", {
      memoId: session.memoId,
      duration,
    });

    try {
      // Dynamic import to avoid circular dependencies
      const { taskState } = await import(
        "$lib/features/tasks/state/taskActions.svelte.ts"
      );
      const { scheduleState } = await import(
        "$lib/features/assistant/state/schedule.svelte.ts"
      );

      // Log progress to task
      await taskState.logProgress(session.memoId, duration);

      // Mark as complete (pass undefined for startTime - helper will find by memoId)
      await scheduleState.completeSuggestion(
        session.memoId,
        undefined,
        duration,
      );

      console.log(
        "[Focus] Expired session completed, logged",
        duration,
        "minutes",
      );
    } catch (err) {
      console.error("[Focus] Failed to complete expired session:", err);
    } finally {
      // Always clear storage after attempting completion
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
  // Cross-Device Actions
  // ============================================================================

  /**
   * Move timer from another device to this device
   * Preserves all timer state and progress
   */
  async moveTimerHere(): Promise<boolean> {
    try {
      const result = await moveTimerToDevice({
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      });

      if (!result.success) {
        if (result.reason === "24h_cap_exceeded") {
          // Timer was too old, already deleted on server
          this.otherDeviceSession = null;
          console.log("[Focus] Timer expired (24h cap), cannot move");
          // Show toast notification
          const { toastState } = await import("$lib/bootstrap/toast.svelte.ts");
          toastState.show("タイマーは24時間を超えたため削除されました", "info");
          return false;
        }
        if (result.reason === "no_session") {
          this.otherDeviceSession = null;
          console.log("[Focus] No session to move");
          return false;
        }
        return false;
      }

      // Restore session locally with preserved progress
      const session = result.session;
      this.activeSession = {
        memoId: session.memoId,
        taskTitle: session.taskTitle,
        startedAt: session.startedAt,
        plannedEndTime: session.plannedEndTime,
        mode: session.mode,
        pomodoroState: session.pomodoroState ?? undefined,
      };

      this.otherDeviceSession = null;
      // Restore pause state from server (preserves paused timer state)
      this.isPaused = session.isPaused;
      this.pausedAt = session.pausedAt ? new Date(session.pausedAt) : null;
      this.pausedDuration = session.pausedDuration;

      this.startTicking();
      this.saveToStorage();

      console.log("[Focus] Timer moved from other device, progress preserved");
      return true;
    } catch (err) {
      console.error("[Focus] Failed to move timer:", err);
      return false;
    }
  }

  /**
   * Clear the other device session state
   * Used when user dismisses the "timer on other device" message
   */
  clearOtherDeviceSession(): void {
    this.otherDeviceSession = null;
  }

  // ============================================================================
  // SSE Event Handlers (Real-time sync from other devices)
  // ============================================================================

  /**
   * Handle timer started on another device
   */
  handleRemoteTimerStarted(payload: {
    memoId?: string;
    taskTitle?: string;
    startedAt?: string;
    deviceName?: string;
  }): void {
    // Show "timer on other device" message
    this.otherDeviceSession = {
      deviceName: payload.deviceName ?? "Unknown Device",
      taskTitle: payload.taskTitle ?? "",
      startedAt: payload.startedAt ?? new Date().toISOString(),
    };

    // Clear local session if any (shouldn't happen normally)
    if (this.activeSession) {
      this.stopTicking();
      this.activeSession = null;
      this.clearStorage();
    }

    console.log("[Focus] Remote timer started:", payload.taskTitle);
  }

  /**
   * Handle timer stopped on another device
   */
  handleRemoteTimerStopped(): void {
    // Clear the "timer on other device" message
    this.otherDeviceSession = null;
    console.log("[Focus] Remote timer stopped");
  }

  /**
   * Handle timer moved between devices
   */
  handleRemoteTimerMoved(payload: {
    memoId?: string;
    taskTitle?: string;
    startedAt?: string;
    plannedEndTime?: string;
    mode?: "normal" | "pomodoro";
    pomodoroState?: PomodoroState;
    deviceName?: string;
    targetDeviceId?: string;
  }): void {
    const myDeviceId = getDeviceId();

    if (payload.targetDeviceId === myDeviceId) {
      // Timer was moved TO this device
      // Don't clear otherDeviceSession here - let moveTimerHere() handle it
      // This prevents a race where SSE arrives before HTTP response
      console.log("[Focus] Timer move to this device acknowledged via SSE");
      return;
    } else {
      // Timer was moved AWAY from this device or to another device
      if (this.activeSession) {
        // This device had the timer, but it was moved away
        this.stopTicking();
        this.activeSession = null;
        this.clearStorage();
      }

      // Show timer is on another device
      this.otherDeviceSession = {
        deviceName: payload.deviceName ?? "Unknown Device",
        taskTitle: payload.taskTitle ?? "",
        startedAt: payload.startedAt ?? new Date().toISOString(),
      };
      console.log("[Focus] Timer moved to another device:", payload.deviceName);
    }
  }

  /**
   * Handle timer updated on another device (e.g., pomodoro phase change, pause state)
   */
  handleRemoteTimerUpdated(payload: {
    pomodoroState?: PomodoroState;
    isPaused?: boolean;
    pausedAt?: string | null;
    pausedDuration?: number;
  }): void {
    console.log("[Focus] Remote timer updated", payload);

    if (payload.isPaused !== undefined) {
      this.isPaused = payload.isPaused;
    }
    if (payload.pausedAt !== undefined) {
      this.pausedAt = payload.pausedAt ? new Date(payload.pausedAt) : null;
    }
    if (payload.pausedDuration !== undefined) {
      this.pausedDuration = payload.pausedDuration;
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

/** Export class type for handler typing */
export type { FocusState };
