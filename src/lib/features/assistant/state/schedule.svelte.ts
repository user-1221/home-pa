/**
 * Schedule State - Svelte 5 Reactive Class
 *
 * Manages the suggestion system's state and user interactions.
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 *   memos (from tasks store) + gaps (from calendar) → engine → scheduleResult
 *
 * ============================================================================
 * USER ACTIONS
 * ============================================================================
 *
 * accept(suggestionId):
 *   1. Marks memo as accepted (updates routineState.acceptedToday = true)
 *   2. For deadline tasks: adds slot to deadlineState.acceptedSlots
 *   3. Regenerates schedule (accepted memo now hidden due to low score)
 *
 * skip(suggestionId):
 *   1. Marks memo as rejected (updates routineState.rejectedToday = true)
 *   2. Regenerates schedule (rejected memo excluded from suggestions)
 *
 * missedSuggestion(memoId):
 *   1. Removes from local acceptedMemos map
 *   2. Resets memo's acceptedToday flag (task can reappear)
 *   3. Regenerates schedule
 *
 * completeSuggestion(memoId, durationMinutes):
 *   1. Logs progress to memo (timeSpent, completions)
 *   2. Updates type-specific state (routine/deadline/backlog)
 *   3. Removes from local acceptedMemos map
 *
 * deleteAccepted(memoId):
 *   1. Removes from local acceptedMemos map
 *   2. Resets memo's acceptedToday flag
 *   3. Regenerates schedule
 *
 * moveSuggestion(suggestionId, newStartTime, newEndTime, newGapId):
 *   1. Adds/updates entry in movedSuggestions array
 *   2. Removes any overlapping suggestions
 *   3. Regenerates schedule
 *
 * ============================================================================
 * PERSISTENCE MODEL (Intentionally Asymmetric)
 * ============================================================================
 *
 * PERSISTED TO MEMO STATE (survives reload):
 * ─────────────────────────────────────────
 * - Accepted: routineState.acceptedToday, backlogState.acceptedToday,
 *             deadlineState.acceptedSlots (for deadline tasks)
 * - Rejected: routineState.rejectedToday, backlogState.rejectedToday,
 *             deadlineState.rejectedToday
 *
 * LOCAL MEMORY ONLY (lost on reload):
 * ─────────────────────────────────────
 * - movedSuggestions: Pending suggestions that user dragged to new positions
 * - acceptedMemos: Local map for UI display and gap blocking
 * - rejectedMemoIds: Local set (redundant with memo state, kept for fast lookup)
 *
 * RATIONALE:
 * - Moved suggestions are "uncommitted" - the user hasn't accepted them yet.
 *   If the user refreshes, showing fresh auto-scheduled suggestions is better
 *   than trying to restore arbitrary positions.
 * - Accepted/rejected state IS persisted because it represents user commitment.
 * - Local acceptedMemos map is rebuilt from memo state on startup.
 *
 * ============================================================================
 * DAILY RESET
 * ============================================================================
 *
 * All suggestion state resets at day boundaries:
 * - Routine/backlog: acceptedToday and rejectedToday reset via resetPeriodIfNeeded()
 * - Deadline: acceptedSlots and rejectedToday cleared
 * - Local stores: cleared in resetStoresIfNewDay()
 *
 * Migrated from writable stores to Svelte 5 reactive class ($state).
 */

import type { Memo, Gap, Suggestion } from "../../../types.ts";
import type {
  ScheduleResult,
  ScheduledBlock,
  PipelineSummary,
} from "../services/suggestions/index.ts";
import { createEngine } from "../services/suggestions/index.ts";
import { unifiedGapState } from "./unified-gaps.svelte.ts";
import {
  timeToMinutes,
  minutesToTime,
  findOverlappingSuggestions,
} from "../services/suggestion-drag.ts";
import { loadSyncData } from "../services/sync.remote.ts";
import { notifyWarning } from "$lib/utils/notification-utils.ts";

// ============================================================================
// Types for Suggestion Management
// ============================================================================

/**
 * Accepted memo info - stored in DB with time slot
 */
export interface AcceptedMemoInfo {
  memoId: string;
  startTime: string;
  endTime: string;
  duration: number;
  isProgressLogged: boolean; // true if progress was logged today
}

/**
 * A pending suggestion awaiting user action
 */
export interface PendingSuggestion extends ScheduledBlock {
  isPending: true;
}

/**
 * Manually moved/dragged suggestions that should persist
 * These are excluded from repopulation and maintain their position
 */
export interface MovedSuggestion extends ScheduledBlock {
  movedAt: Date;
}

// ============================================================================
// Helper Functions (module-level)
// ============================================================================

/**
 * Get today's date as YYYY-MM-DD string
 */
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// ============================================================================
// Engine Instance
// ============================================================================

const engine = createEngine();

// ============================================================================
// Schedule State Class
// ============================================================================

/**
 * Schedule state reactive class
 */
class ScheduleState {
  // ============================================================================
  // Reactive State
  // ============================================================================

  /** Current schedule result from the engine */
  result = $state<ScheduleResult | null>(null);

  /** Error state for schedule generation */
  error = $state<Error | null>(null);

  /** Loading state for schedule generation */
  isLoading = $state(false);

  /** Summary of the last pipeline execution */
  lastPipelineSummary = $state<PipelineSummary | null>(null);

  /** Timestamp of the last successful schedule generation */
  lastScheduleTime = $state<Date | null>(null);

  /** Accepted memos with their time slot info */
  acceptedMemos = $state<Map<string, AcceptedMemoInfo>>(new Map());

  /** Set of memo IDs that have been rejected (skipped) */
  rejectedMemoIds = $state<Set<string>>(new Set());

  /** Manually moved/dragged suggestions that should persist */
  movedSuggestions = $state<MovedSuggestion[]>([]);

  /** Whether sync data has been loaded from the server */
  isSyncLoaded = $state(false);

  /** Whether sync operations are in progress */
  isSyncing = $state(false);

  // ============================================================================
  // Private State (non-reactive, module-level tracking)
  // ============================================================================

  /** Tracks the date when synced data was last loaded/reset */
  private lastSyncDate: string | null = null;

  /** Promise that resolves when sync is complete (or fails) */
  private syncCompleteResolve: (() => void) | null = null;
  private syncCompletePromise: Promise<void> | null = null;

  // ============================================================================
  // Derived State (getters)
  // ============================================================================

  /**
   * All suggestions that should be displayed (scheduled + moved)
   * Scheduled blocks from result + moved suggestions (excluding any that overlap with accepted)
   */
  get allDisplayedSuggestions(): {
    scheduled: ScheduledBlock[];
    moved: MovedSuggestion[];
  } {
    const scheduled = this.result?.scheduled ?? [];
    const acceptedMemoIds = new Set(this.acceptedMemos.keys());

    // Filter out moved suggestions for memos that are now accepted
    const validMoved = this.movedSuggestions.filter(
      (m) => !acceptedMemoIds.has(m.memoId),
    );

    return {
      scheduled,
      moved: validMoved,
    };
  }

  /**
   * All scheduled blocks from the engine result
   */
  get scheduledBlocks(): ScheduledBlock[] {
    return this.result?.scheduled ?? [];
  }

  /**
   * Pending suggestions (scheduled blocks that haven't been accepted yet)
   */
  get pendingSuggestions(): PendingSuggestion[] {
    const scheduled = this.result?.scheduled ?? [];
    const movedIds = new Set(this.movedSuggestions.map((m) => m.suggestionId));
    const acceptedMemoIds = new Set(this.acceptedMemos.keys());

    // Include scheduled blocks (excluding moved ones AND accepted ones) and moved suggestions
    // IMPORTANT: Filter out accepted memos to prevent duplicate keys in CircularTimelineCss
    const fromScheduled = scheduled
      .filter(
        (b) => !movedIds.has(b.suggestionId) && !acceptedMemoIds.has(b.memoId),
      )
      .map((b): PendingSuggestion => ({ ...b, isPending: true }));

    // Also filter moved suggestions to exclude accepted memos
    const fromMoved = this.movedSuggestions
      .filter((m) => !acceptedMemoIds.has(m.memoId))
      .map(
        (m): PendingSuggestion => ({
          suggestionId: m.suggestionId,
          memoId: m.memoId,
          gapId: m.gapId,
          startTime: m.startTime,
          endTime: m.endTime,
          duration: m.duration,
          isPending: true,
        }),
      );

    return [...fromScheduled, ...fromMoved];
  }

  /**
   * Dropped suggestions (didn't fit in schedule)
   */
  get droppedSuggestions(): Suggestion[] {
    return this.result?.dropped ?? [];
  }

  /**
   * Mandatory tasks that were dropped (couldn't fit)
   */
  get droppedMandatory(): Suggestion[] {
    return this.result?.mandatoryDropped ?? [];
  }

  /**
   * Next scheduled block (earliest start time)
   */
  get nextScheduledBlock(): ScheduledBlock | null {
    const blocks = this.scheduledBlocks;
    if (blocks.length === 0) return null;
    return [...blocks].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    )[0];
  }

  /**
   * Whether there are any scheduled tasks
   */
  get hasScheduledTasks(): boolean {
    return this.scheduledBlocks.length > 0;
  }

  /**
   * Total minutes of scheduled tasks
   */
  get totalScheduledMinutes(): number {
    return this.scheduledBlocks.reduce((sum, b) => sum + b.duration, 0);
  }

  /**
   * Whether any mandatory tasks were dropped
   */
  get hasMandatoryDropped(): boolean {
    return this.droppedMandatory.length > 0;
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Find a scheduled block by memo ID
   */
  findBlockByMemoId(memoId: string): ScheduledBlock | undefined {
    return this.result?.scheduled.find((b) => b.memoId === memoId);
  }

  /**
   * Check if a memo is currently scheduled
   */
  isMemoScheduled(memoId: string): boolean {
    return this.findBlockByMemoId(memoId) !== undefined;
  }

  /**
   * Get all blocks for a specific gap
   */
  getBlocksForGap(gapId: string): ScheduledBlock[] {
    return this.result?.scheduled.filter((b) => b.gapId === gapId) ?? [];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if a new day has started since the last sync and clear stores if needed.
   * This ensures deadline acceptances and rejections reset daily, consistent with
   * how routine/backlog tasks reset their acceptedToday flags via resetPeriodIfNeeded().
   */
  private resetStoresIfNewDay(): void {
    const today = getTodayDateString();

    if (this.lastSyncDate !== null && this.lastSyncDate !== today) {
      console.log(
        `[Schedule] Day boundary crossed (${this.lastSyncDate} → ${today}), clearing synced stores`,
      );
      this.acceptedMemos = new Map();
      this.rejectedMemoIds = new Set();
      this.movedSuggestions = [];
      // Note: We don't clear server data here since loadSyncData() handles that cleanup
      // The server-side cleanup happens on next app restart
    }

    this.lastSyncDate = today;
  }

  /**
   * Signal that sync is complete (call this after sync finishes)
   */
  private signalSyncComplete(): void {
    if (this.syncCompleteResolve) {
      this.syncCompleteResolve();
      this.syncCompleteResolve = null;
    }
    this.syncCompletePromise = null;
  }

  /**
   * Sync blocker state to unifiedGapState for availableGaps computation.
   * Call this after any change to acceptedMemos or movedSuggestions.
   */
  private syncBlockersToGapState(): void {
    // Convert to TimeBlocker format
    const acceptedBlockers = new Map<
      string,
      { startTime: string; endTime: string }
    >();
    for (const [memoId, info] of this.acceptedMemos) {
      // Only un-logged accepted slots should block gaps
      // Logged slots (progress recorded) become available for new suggestions
      if (!info.isProgressLogged) {
        acceptedBlockers.set(memoId, {
          startTime: info.startTime,
          endTime: info.endTime,
        });
      }
    }

    const movedBlockers = this.movedSuggestions.map((m) => ({
      startTime: m.startTime,
      endTime: m.endTime,
    }));

    unifiedGapState.setBlockers(acceptedBlockers, movedBlockers);
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Wait for sync to complete before proceeding
   * Resolves immediately if sync is already complete
   * Also resolves on network errors (to allow proceeding without sync)
   */
  async waitForSync(): Promise<void> {
    if (this.isSyncLoaded) {
      return; // Already synced
    }

    if (!this.syncCompletePromise) {
      // Create a new promise if one doesn't exist
      this.syncCompletePromise = new Promise((resolve) => {
        this.syncCompleteResolve = resolve;
      });

      // Also set a timeout to prevent indefinite waiting (10 seconds)
      setTimeout(() => {
        if (this.syncCompleteResolve) {
          console.warn("[Schedule] Sync timeout - proceeding without sync");
          notifyWarning(
            "sync",
            "同期がタイムアウトしました。ローカルデータで継続します",
          );
          this.syncCompleteResolve();
          this.syncCompleteResolve = null;
        }
      }, 10000);
    }

    return this.syncCompletePromise;
  }

  /**
   * Generate a new schedule from memos and gaps
   * This is the main entry point for schedule generation
   *
   * @param memos - All memos to consider for scheduling
   * @param options - Optional gaps override and blockers
   */
  async regenerate(
    memos: Memo[],
    options?: {
      gaps?: Gap[];
      skipLLMEnrichment?: boolean;
    },
  ): Promise<void> {
    // Wait for sync to complete first
    await this.waitForSync();

    // Check for day boundary crossing and reset stores if needed
    // This ensures deadline acceptances reset daily like routine/backlog tasks
    this.resetStoresIfNewDay();

    this.isLoading = true;
    this.error = null;

    try {
      // Get current moved suggestions to exclude their memoIds
      const currentMoved = this.movedSuggestions;
      const movedMemoIds = new Set(currentMoved.map((m) => m.memoId));

      // Get accepted memos to use as blockers
      const accepted = this.acceptedMemos;
      const acceptedMemoIds = new Set(accepted.keys());

      // Get rejected memo IDs
      const rejected = this.rejectedMemoIds;

      // Filter memos: exclude rejected and already-moved memos
      const filteredMemos = memos.filter(
        (m) => !rejected.has(m.id) && !movedMemoIds.has(m.id),
      );

      // Sync blockers to unified gap state before getting available gaps
      this.syncBlockersToGapState();

      // Get available gaps from unified state (already has blockers subtracted)
      // If custom gaps are provided, use enrichedGaps as the base (caller handles blocker subtraction)
      const availableGaps = options?.gaps
        ? unifiedGapState.availableGaps
        : unifiedGapState.availableGaps;

      console.log("[Schedule] Generating schedule:", {
        memos: memos.length,
        filteredMemos: filteredMemos.length,
        enrichedGaps: unifiedGapState.enrichedGaps.length,
        availableGaps: availableGaps.length,
        movedSuggestions: currentMoved.length,
        acceptedMemos: accepted.size,
        rejectedMemos: rejected.size,
      });

      // Run the engine
      const startTime = performance.now();
      const { schedule: result, summary } = await engine.generateSchedule(
        filteredMemos,
        availableGaps,
        {
          acceptedMemoIds, // For reducing deadline task scores
        },
      );
      const endTime = performance.now();

      // Update stores
      this.result = result;
      this.lastScheduleTime = new Date();

      // Extend summary with additional info
      const extendedSummary = {
        ...summary,
        movedBlockers: currentMoved.length,
        acceptedBlockers: accepted.size,
        rejectedMemos: rejected.size,
        executionMs: Math.round(endTime - startTime),
      };
      this.lastPipelineSummary = extendedSummary;

      console.log("[Schedule] Generated:", {
        scheduled: result.scheduled.length,
        dropped: result.dropped.length,
        mandatoryDropped: result.mandatoryDropped.length,
        movedBlockers: currentMoved.length,
        acceptedBlockers: accepted.size,
        rejectedMemos: rejected.size,
        executionMs: Math.round(endTime - startTime),
      });
    } catch (error) {
      console.error("[Schedule] Generation failed:", error);
      this.error = error instanceof Error ? error : new Error(String(error));
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Accept a suggestion, converting it to a fixed event
   * Can accept from either result.scheduled or movedSuggestions
   *
   * FLOW:
   * 1. Find the suggestion block
   * 2. Mark the source memo as accepted (updates routineState/backlogState)
   * 3. Save action to DB: { memoId, action: "accepted", startTime, endTime, duration }
   * 4. Regenerate schedule (memo will now have low score, so no duplicate)
   *
   * @param suggestionId - ID of the suggestion to accept
   */
  async accept(suggestionId: string): Promise<void> {
    const result = this.result;
    const currentMoved = this.movedSuggestions;

    // Try to find in scheduled blocks first
    let block = result?.scheduled.find((b) => b.suggestionId === suggestionId);

    // If not found, check movedSuggestions
    if (!block) {
      const movedBlock = currentMoved.find(
        (m) => m.suggestionId === suggestionId,
      );
      if (movedBlock) {
        block = {
          suggestionId: movedBlock.suggestionId,
          memoId: movedBlock.memoId,
          gapId: movedBlock.gapId,
          startTime: movedBlock.startTime,
          endTime: movedBlock.endTime,
          duration: movedBlock.duration,
        };
      }
    }

    if (!block) {
      console.warn(
        "[Schedule] Cannot accept: suggestion not found",
        suggestionId,
      );
      return;
    }

    // IMPORTANT: Mark the source memo as accepted
    // This updates routineState.acceptedToday = true (or backlogState)
    // causing the scoring function to return a low score for this memo
    const { taskActions, taskState } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );

    // Find the memo to check its type (direct property access - Svelte 5 reactive)
    const memo = taskState.items.find((t) => t.id === block.memoId);

    if (memo?.type === "期限付き") {
      // For deadline tasks, add the accepted slot
      await taskActions.addAcceptedSlot(block.memoId, {
        startTime: block.startTime,
        endTime: block.endTime,
        duration: block.duration,
      });
    } else {
      // For routine/backlog tasks, mark as accepted with slot info for persistence
      await taskActions.markAccepted(block.memoId, {
        startTime: block.startTime,
        endTime: block.endTime,
        duration: block.duration,
      });
    }

    // Remove from movedSuggestions if it was there
    if (currentMoved.some((m) => m.suggestionId === suggestionId)) {
      this.movedSuggestions = this.movedSuggestions.filter(
        (m) => m.suggestionId !== suggestionId,
      );
    }

    // Add to accepted memos store (for UI/gap calculation)
    const acceptedInfo: AcceptedMemoInfo = {
      memoId: block.memoId,
      startTime: block.startTime,
      endTime: block.endTime,
      duration: block.duration,
      isProgressLogged: false,
    };

    const newMap = new Map(this.acceptedMemos);
    newMap.set(block.memoId, acceptedInfo);
    this.acceptedMemos = newMap;

    console.log(
      "[Schedule] Accepted suggestion:",
      suggestionId,
      "memoId:",
      block.memoId,
    );

    // Regenerate to fill remaining gaps
    // Use fresh memos from store (taskState.items is reactive, already updated)
    await this.regenerate(taskState.items);
  }

  /**
   * Reject a suggestion - the underlying memo will NEVER reappear (for today)
   * Can reject from either result.scheduled or movedSuggestions
   *
   * @param suggestionId - ID of the suggestion to reject
   */
  async skip(suggestionId: string): Promise<void> {
    const result = this.result;
    const currentMoved = this.movedSuggestions;

    // Try to find in scheduled blocks first
    const block = result?.scheduled.find(
      (b) => b.suggestionId === suggestionId,
    );
    let memoId: string | undefined = block?.memoId;

    // If not found, check movedSuggestions
    if (!memoId) {
      const movedBlock = currentMoved.find(
        (m) => m.suggestionId === suggestionId,
      );
      memoId = movedBlock?.memoId;
    }

    if (!memoId) {
      console.warn(
        "[Schedule] Cannot reject: suggestion not found",
        suggestionId,
      );
      return;
    }

    // Add memoId to rejected set
    const newSet = new Set(this.rejectedMemoIds);
    newSet.add(memoId);
    this.rejectedMemoIds = newSet;

    // Remove from movedSuggestions if it was there
    if (currentMoved.some((m) => m.suggestionId === suggestionId)) {
      this.movedSuggestions = this.movedSuggestions.filter(
        (m) => m.suggestionId !== suggestionId,
      );
    }

    console.log(
      "[Schedule] Rejected suggestion:",
      suggestionId,
      "memoId:",
      memoId,
    );

    // Persist rejection to memo state
    const { taskActions, taskState } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );
    await taskActions.markRejected(memoId);

    // Regenerate to get new suggestion for the gap
    // Use taskState.items directly (Svelte 5 reactive, already updated)
    await this.regenerate(taskState.items);
  }

  /**
   * Move a pending suggestion to a new time slot
   * Called when user drags a suggestion to a new position
   *
   * Behavior:
   * - The dragged suggestion persists at its new location (like a fixed event)
   * - Any overlapping pending suggestions are IMMEDIATELY removed
   * - Repopulation runs to fill remaining gaps
   * - The dragged suggestion's memoId is excluded from repopulation (no duplicates)
   * - The dragged suggestion can still be moved again
   * - Shrinking during drag (via edge snapping) is preserved
   *
   * @param suggestionId - ID of the suggestion to move
   * @param newStartTime - New start time in HH:mm format
   * @param newEndTime - New end time in HH:mm format (includes shrinking from drag)
   * @param newGapId - ID of the gap the suggestion is moved to
   * @param memos - Current memos for regeneration
   * @param externalGaps - Optional gaps to use instead of unified state
   */
  async moveSuggestion(
    suggestionId: string,
    newStartTime: string,
    newEndTime: string,
    newGapId: string,
    memos: Memo[],
    externalGaps?: Gap[],
  ): Promise<void> {
    const result = this.result;
    const currentMoved = this.movedSuggestions;
    const gaps = externalGaps ?? unifiedGapState.enrichedGaps;

    // Check if this is an already moved suggestion being moved again
    const existingMoved = currentMoved.find(
      (m) => m.suggestionId === suggestionId,
    );

    let block: ScheduledBlock | undefined;

    if (existingMoved) {
      // Re-moving an already moved suggestion
      block = existingMoved;
    } else if (result) {
      // Moving from scheduled blocks
      block = result.scheduled.find((b) => b.suggestionId === suggestionId);
    }

    if (!block) {
      console.warn(
        "[Schedule] Cannot move: suggestion not found",
        suggestionId,
      );
      return;
    }

    // Find the target gap to validate and constrain the move
    const targetGap = gaps.find((g) => g.gapId === newGapId);
    if (!targetGap) {
      console.warn("[Schedule] Cannot move: target gap not found", newGapId);
      return;
    }

    // Calculate duration from the provided times (preserves shrinking from drag)
    const startMinutes = timeToMinutes(newStartTime);
    const endMinutes = timeToMinutes(newEndTime);
    const newDuration = endMinutes - startMinutes;

    // Validate that the suggestion fits within the gap
    const gapStartMinutes = timeToMinutes(targetGap.start);
    const gapEndMinutes = timeToMinutes(targetGap.end);

    if (startMinutes < gapStartMinutes || endMinutes > gapEndMinutes) {
      console.warn(
        "[Schedule] Cannot move: suggestion doesn't fit in gap",
        suggestionId,
        { startMinutes, endMinutes, gapStartMinutes, gapEndMinutes },
      );
      return;
    }

    // Find overlapping suggestions (excluding the one being moved)
    const overlappingScheduledIds = result
      ? findOverlappingSuggestions(
          result.scheduled,
          newStartTime,
          newEndTime,
          suggestionId,
        )
      : [];

    const overlappingMovedIds = findOverlappingSuggestions(
      currentMoved,
      newStartTime,
      newEndTime,
      suggestionId,
    );

    // Create the moved suggestion with new duration (preserves shrinking)
    const moved: MovedSuggestion = {
      suggestionId: block.suggestionId,
      memoId: block.memoId,
      gapId: newGapId,
      startTime: newStartTime,
      endTime: newEndTime,
      duration: newDuration,
      movedAt: new Date(),
    };

    // Update movedSuggestions
    // Remove any existing entry for this suggestion
    let filtered = this.movedSuggestions.filter(
      (m) => m.suggestionId !== suggestionId,
    );
    // Remove overlapping moved suggestions
    const overlappingSet = new Set(overlappingMovedIds);
    filtered = filtered.filter((m) => !overlappingSet.has(m.suggestionId));
    // Add the newly moved suggestion
    this.movedSuggestions = [...filtered, moved];

    // Remove overlapping suggestions from scheduled result
    if (overlappingScheduledIds.length > 0 && result) {
      const overlappingScheduledSet = new Set(overlappingScheduledIds);
      this.result = {
        ...result,
        scheduled: result.scheduled.filter(
          (b) =>
            b.suggestionId === suggestionId ||
            !overlappingScheduledSet.has(b.suggestionId),
        ),
      };
    }

    console.log("[Schedule] Moved suggestion:", {
      suggestionId,
      from: block.startTime,
      to: newStartTime,
      duration: newDuration,
      gapId: newGapId,
      overlapsRemoved:
        overlappingScheduledIds.length + overlappingMovedIds.length,
    });

    // Regenerate to fill any gaps left by removed suggestions
    await this.regenerate(memos, { gaps });
  }

  /**
   * Update the duration of a pending (not yet accepted) suggestion
   * Used when user resizes a pending suggestion via drag handle
   *
   * @param suggestionId - ID of the suggestion to update
   * @param newDuration - New duration in minutes
   * @param memos - Current memos for regeneration
   */
  async updatePendingDuration(
    suggestionId: string,
    newDuration: number,
    _newEndTime: string, // Kept for backwards compatibility but calculated from duration
    memos: Memo[],
    externalGaps?: Gap[],
  ): Promise<void> {
    const result = this.result;
    const currentMoved = this.movedSuggestions;
    const gaps = externalGaps ?? unifiedGapState.enrichedGaps;

    // Check if this is a moved suggestion
    const movedIdx = currentMoved.findIndex(
      (m) => m.suggestionId === suggestionId,
    );
    let startTime: string;

    if (movedIdx !== -1) {
      // Update moved suggestion
      startTime = currentMoved[movedIdx].startTime;
      const newEndTime = minutesToTime(timeToMinutes(startTime) + newDuration);

      // Find overlapping suggestions (excluding the one being resized)
      const overlappingMovedIds = findOverlappingSuggestions(
        currentMoved,
        startTime,
        newEndTime,
        suggestionId,
      );

      const overlappingScheduledIds = result
        ? findOverlappingSuggestions(
            result.scheduled,
            startTime,
            newEndTime,
            suggestionId,
          )
        : [];

      // Remove overlapping scheduled suggestions
      if (overlappingScheduledIds.length > 0 && result) {
        const overlappingSet = new Set(overlappingScheduledIds);
        this.result = {
          ...result,
          scheduled: result.scheduled.filter(
            (b) => !overlappingSet.has(b.suggestionId),
          ),
        };
        console.log(
          "[Schedule] Removed overlapping scheduled suggestions:",
          overlappingScheduledIds,
        );
      }

      // Update movedSuggestions
      // Remove overlapping moved suggestions
      const overlappingSet = new Set(overlappingMovedIds);
      const filtered = this.movedSuggestions.filter(
        (m) =>
          m.suggestionId === suggestionId ||
          !overlappingSet.has(m.suggestionId),
      );

      // Update the resized suggestion
      this.movedSuggestions = filtered.map((m) =>
        m.suggestionId === suggestionId
          ? { ...m, duration: newDuration, endTime: newEndTime }
          : m,
      );

      if (overlappingMovedIds.length > 0) {
        console.log(
          "[Schedule] Removed overlapping moved suggestions:",
          overlappingMovedIds,
        );
      }

      console.log(
        "[Schedule] Updated moved suggestion duration:",
        suggestionId,
        newDuration,
      );

      // Always regenerate when duration changes (even without overlaps)
      // Shortening a suggestion frees up gap space for new suggestions
      await this.regenerate(memos, { gaps });
      return;
    }

    if (!result) return;

    // Find in scheduled blocks
    const scheduledBlock = result.scheduled.find(
      (b) => b.suggestionId === suggestionId,
    );
    if (!scheduledBlock) {
      console.warn(
        "[Schedule] Cannot update pending: suggestion not found",
        suggestionId,
      );
      return;
    }

    startTime = scheduledBlock.startTime;
    const newEndTime = minutesToTime(timeToMinutes(startTime) + newDuration);

    // Find overlapping suggestions (excluding the one being resized)
    const overlappingScheduledIds = findOverlappingSuggestions(
      result.scheduled,
      startTime,
      newEndTime,
      suggestionId,
    );

    const overlappingMovedIds = findOverlappingSuggestions(
      currentMoved,
      startTime,
      newEndTime,
      suggestionId,
    );

    // Remove overlapping moved suggestions
    if (overlappingMovedIds.length > 0) {
      const overlappingSet = new Set(overlappingMovedIds);
      this.movedSuggestions = this.movedSuggestions.filter(
        (m) => !overlappingSet.has(m.suggestionId),
      );
      console.log(
        "[Schedule] Removed overlapping moved suggestions:",
        overlappingMovedIds,
      );
    }

    // IMPORTANT: Move the suggestion to movedSuggestions store to persist the duration change
    // This ensures the duration change survives regeneration
    const movedWithNewDuration: MovedSuggestion = {
      suggestionId: scheduledBlock.suggestionId,
      memoId: scheduledBlock.memoId,
      gapId: scheduledBlock.gapId,
      startTime: scheduledBlock.startTime,
      endTime: newEndTime,
      duration: newDuration,
      movedAt: new Date(),
    };

    // Update movedSuggestions
    // Remove any existing entry for this suggestion
    let filtered = this.movedSuggestions.filter(
      (m) => m.suggestionId !== suggestionId,
    );
    // Remove overlapping moved suggestions
    const overlappingSet = new Set(overlappingMovedIds);
    filtered = filtered.filter((m) => !overlappingSet.has(m.suggestionId));
    // Add with new duration
    this.movedSuggestions = [...filtered, movedWithNewDuration];

    // Remove the suggestion from scheduled result (it's now in movedSuggestions)
    // Also remove any overlapping scheduled suggestions
    const toRemoveSet = new Set([suggestionId, ...overlappingScheduledIds]);
    this.result = {
      ...result,
      scheduled: result.scheduled.filter(
        (b) => !toRemoveSet.has(b.suggestionId),
      ),
    };

    if (overlappingScheduledIds.length > 0) {
      console.log(
        "[Schedule] Removed overlapping scheduled suggestions:",
        overlappingScheduledIds,
      );
    }

    console.log(
      "[Schedule] Updated pending suggestion duration (moved to persisted):",
      suggestionId,
      newDuration,
    );

    // Always regenerate when duration changes (even without overlaps)
    // Shortening a suggestion frees up gap space for new suggestions
    await this.regenerate(memos, { gaps });
  }

  /**
   * Update the duration of an accepted suggestion
   *
   * @param memoId - ID of the memo
   * @param newDuration - New duration in minutes
   * @param memos - Current memos for regeneration
   * @param gaps - Optional gaps for constraint calculation
   */
  async updateAcceptedDuration(
    memoId: string,
    newDuration: number,
    _memos: Memo[],
    _gaps?: Gap[],
  ): Promise<void> {
    const info = this.acceptedMemos.get(memoId);
    if (!info) {
      console.warn(
        "[Schedule] Cannot update accepted duration: memo not found",
        memoId,
      );
      return;
    }

    const newEndTime = minutesToTime(
      timeToMinutes(info.startTime) + newDuration,
    );

    // Update the accepted memo info locally
    const newMap = new Map(this.acceptedMemos);
    newMap.set(memoId, {
      ...info,
      duration: newDuration,
      endTime: newEndTime,
    });
    this.acceptedMemos = newMap;

    // Persist the duration change to the database
    const { taskActions } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );
    await taskActions.updateAcceptedSlotDuration(
      memoId,
      info.startTime,
      newDuration,
      newEndTime,
    );

    console.log("[Schedule] Updated accepted duration:", memoId, newDuration);
  }

  /**
   * Delete an accepted suggestion, freeing up the gap
   * Also resets the memo's acceptedToday flag so it can reappear
   *
   * @param memoId - ID of the memo
   * @param memos - Current memos for regeneration
   */
  async deleteAccepted(memoId: string, memos: Memo[]): Promise<void> {
    // Remove from accepted memos store
    const newMap = new Map(this.acceptedMemos);
    newMap.delete(memoId);
    this.acceptedMemos = newMap;

    console.log("[Schedule] Deleted accepted memo:", memoId);

    // Reset the memo's acceptedToday flag so it can reappear
    const { taskActions } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );
    await taskActions.resetAccepted(memoId);

    // Regenerate to fill the freed gap
    await this.regenerate(memos);
  }

  /**
   * Mark an accepted suggestion as complete
   * Logs duration to the memo and removes from accepted list
   *
   * @param memoId - ID of the memo
   * @param duration - Duration in minutes to log
   * @returns Promise resolving when complete
   */
  async completeSuggestion(memoId: string, duration: number): Promise<void> {
    // Mark as logged instead of removing - arc stays visible but faded
    const existing = this.acceptedMemos.get(memoId);
    if (existing) {
      const newMap = new Map(this.acceptedMemos);
      newMap.set(memoId, {
        ...existing,
        isProgressLogged: true,
      });
      this.acceptedMemos = newMap;
    }

    console.log("[Schedule] Completed suggestion:", {
      memoId,
      duration,
    });

    // Note: The actual memo update is done via the remote function
    // called from PersonalAssistantView
  }

  /**
   * Mark an accepted suggestion as missed
   * Removes from accepted list and resets the memo's acceptedToday flag
   * so the task can reappear in suggestions.
   *
   * @param memoId - ID of the memo
   */
  async missedSuggestion(memoId: string): Promise<void> {
    // Remove from accepted memos store
    const newMap = new Map(this.acceptedMemos);
    newMap.delete(memoId);
    this.acceptedMemos = newMap;

    console.log("[Schedule] Missed suggestion:", memoId);

    // Reset the memo's acceptedToday flag so it can reappear
    const { taskActions, taskState } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );
    await taskActions.resetAccepted(memoId);

    // Regenerate to potentially show the task again
    // Use taskState.items directly (Svelte 5 reactive, already updated)
    await this.regenerate(taskState.items);
  }

  /**
   * Clear the current schedule
   * Useful for resetting state
   */
  clear(): void {
    this.result = null;
    this.error = null;
    this.lastPipelineSummary = null;
    this.acceptedMemos = new Map();
    this.rejectedMemoIds = new Set();
    this.movedSuggestions = [];
    this.syncBlockersToGapState();
  }

  /**
   * Clear only accepted, rejected, and moved state (keep schedule result)
   * Useful for daily reset
   */
  clearAcceptedAndSkipped(): void {
    this.acceptedMemos = new Map();
    this.rejectedMemoIds = new Set();
    this.movedSuggestions = [];
    this.syncBlockersToGapState();
  }

  /**
   * Mark a session as complete and update the memo
   *
   * @param memo - The memo that was worked on
   * @param minutesSpent - How long the user worked
   * @returns Updated memo with new status
   */
  markSessionComplete(memo: Memo, minutesSpent: number): Memo {
    const result = engine.markSessionComplete(memo, {
      memoId: memo.id,
      minutesSpent,
    });

    console.log("[Schedule] Session complete:", {
      memoId: memo.id,
      minutesSpent,
      isNowComplete: result.isNowComplete,
      goalReached: result.goalReached,
    });

    return result.memo;
  }

  /**
   * Get the engine for advanced usage
   * (e.g., enriching a single memo)
   */
  getEngine() {
    return engine;
  }

  // ==========================================================================
  // Sync Functions
  // ==========================================================================

  /**
   * Rebuild acceptedMemos map and rejectedMemoIds set from persisted memo state
   * Called during initialization after memos are loaded from database.
   *
   * This restores accepted/rejected suggestions that were persisted before page reload:
   * - Deadline tasks: Uses acceptedSlots array and rejectedToday
   * - Routine tasks: Uses single acceptedSlot and rejectedToday
   * - Backlog tasks: Uses single acceptedSlot and rejectedToday
   */
  rebuildAcceptedMemosFromState(memos: Memo[]): void {
    const newMap = new Map<string, AcceptedMemoInfo>();
    const rejectedSet = new Set<string>();

    for (const memo of memos) {
      // Deadline tasks - can have multiple accepted slots
      if (
        memo.type === "期限付き" &&
        memo.deadlineState?.acceptedSlots &&
        memo.deadlineState.acceptedSlots.length > 0
      ) {
        // For deadline tasks, use the first slot (UI shows one at a time)
        const slot = memo.deadlineState.acceptedSlots[0];
        const isProgressLogged = slot.logged === true;

        newMap.set(memo.id, {
          memoId: memo.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: slot.duration,
          isProgressLogged,
        });
      }

      // Routine tasks - single accepted slot
      if (memo.type === "ルーティン" && memo.routineState?.acceptedSlot) {
        const slot = memo.routineState.acceptedSlot;
        const isProgressLogged = slot.logged === true;

        newMap.set(memo.id, {
          memoId: memo.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: slot.duration,
          isProgressLogged,
        });
      }

      // Backlog tasks - single accepted slot
      if (memo.type === "バックログ" && memo.backlogState?.acceptedSlot) {
        const slot = memo.backlogState.acceptedSlot;
        const isProgressLogged = slot.logged === true;

        newMap.set(memo.id, {
          memoId: memo.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: slot.duration,
          isProgressLogged,
        });
      }

      // Rebuild rejectedMemoIds from persisted rejectedToday flags
      const isRejected =
        memo.routineState?.rejectedToday ||
        memo.backlogState?.rejectedToday ||
        memo.deadlineState?.rejectedToday;

      if (isRejected) {
        rejectedSet.add(memo.id);
      }
    }

    this.acceptedMemos = newMap;
    this.rejectedMemoIds = rejectedSet;
    this.syncBlockersToGapState();
  }

  /**
   * Load synced data from the server
   * Should be called once when the app initializes
   *
   * Note: Suggestion actions (accepted/rejected) are now stored on memo state,
   * so this only loads cached transit data, then rebuilds acceptedMemos from memo state.
   */
  async loadSyncedData(): Promise<void> {
    if (this.isSyncLoaded) {
      console.log("[Schedule] Sync data already loaded");
      this.signalSyncComplete();
      return;
    }

    this.isSyncing = true;

    try {
      console.log("[Schedule] Loading synced data...");
      // Load cached transit data (suggestion actions now stored on memo state)
      await loadSyncData({});

      // Initialize lastSyncDate to track day boundaries
      this.lastSyncDate = getTodayDateString();

      // Rebuild acceptedMemos from persisted memo state
      // This restores accepted suggestions after page reload
      const { taskState } = await import(
        "$lib/features/tasks/state/taskActions.svelte.ts"
      );

      // Wait for tasks to load (they may be loading in parallel from +layout.svelte)
      // Poll until taskState.isLoading is false (max 10 seconds)
      const maxWaitMs = 10000;
      const pollIntervalMs = 100;
      let waitedMs = 0;
      while (taskState.isLoading && waitedMs < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        waitedMs += pollIntervalMs;
      }

      if (waitedMs >= maxWaitMs) {
        console.warn(
          "[Schedule] Timeout waiting for tasks to load, proceeding with empty items",
        );
      }

      this.rebuildAcceptedMemosFromState(taskState.items);

      this.isSyncLoaded = true;
      console.log("[Schedule] Synced data loaded");
    } catch (error) {
      console.error("[Schedule] Failed to load synced data:", error);
      notifyWarning("sync", "同期データの読み込みに失敗しました");
      // Continue without synced data - will work with fresh state
      // Mark as loaded anyway to prevent waiting forever
      this.isSyncLoaded = true;
    } finally {
      this.isSyncing = false;
      this.signalSyncComplete();
    }
  }

  /**
   * Perform local cleanup of expired data
   * Should be called periodically or on app initialization
   */
  cleanupExpiredData(): void {
    const today = new Date();
    const currentTime = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;

    // NOTE: We intentionally do NOT clean up accepted memos based on end time.
    // Users need the opportunity to mark accepted tasks as complete or missed,
    // even if the scheduled time has passed. The UI shows accepted tasks in a
    // different state when their time has passed, prompting the user to act.

    // Only clean up moved suggestions (pending, not yet accepted) whose end time has passed
    // These are auto-scheduled suggestions that the user hasn't committed to
    const before = this.movedSuggestions.length;
    const filtered = this.movedSuggestions.filter(
      (s) => s.endTime > currentTime,
    );
    if (filtered.length < before) {
      console.log(
        `[Schedule] Cleaned up ${before - filtered.length} expired moved suggestions`,
      );
      this.movedSuggestions = filtered;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global schedule state instance
 */
export const scheduleState = new ScheduleState();

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Wait for sync to complete before proceeding.
 * This is a convenience export for use in other modules.
 */
export async function waitForSync(): Promise<void> {
  return scheduleState.waitForSync();
}
