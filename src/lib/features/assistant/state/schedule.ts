/**
 * Schedule Store
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
 * USER ACTIONS (stored in SuggestionAction collection)
 * ============================================================================
 *
 * accept(memoId):
 *   1. Marks memo as accepted (updates routineState.acceptedToday = true)
 *   2. Saves action to DB: { memoId, action: "accepted", startTime, endTime, duration }
 *   3. Regenerates schedule (accepted memo now hidden due to low score)
 *
 * skip(memoId):
 *   1. Saves action to DB: { memoId, action: "rejected" }
 *   2. Regenerates schedule
 *
 * missedSuggestion(memoId):
 *   1. Removes "accepted" action from DB
 *   2. Resets memo's acceptedToday flag (task can reappear)
 *   3. Regenerates schedule
 *
 * completeSuggestion(memoId, durationMinutes):
 *   1. Logs progress to memo (timeSpent, completions)
 *   2. Updates type-specific state (routine/deadline/backlog)
 *   3. Removes "accepted" action from DB
 *
 * deleteAccepted(memoId):
 *   1. Removes "accepted" action from DB
 *   2. Resets memo's acceptedToday flag
 *   3. Regenerates schedule
 *
 * ============================================================================
 * STORES
 * ============================================================================
 *
 * - scheduleResult: Current scheduled suggestions
 * - acceptedMemos: Map of memoId -> time slot info (from DB)
 * - rejectedMemoIds: Set of rejected memoIds (from DB)
 * - movedSuggestions: Suggestions dragged to new positions (local only)
 *
 * ============================================================================
 * SYNCED DATA (cleared daily)
 * ============================================================================
 *
 * On startup, loadSyncData() restores:
 * - Accepted memos with their time slots
 * - Rejected memo IDs
 * - Cached transit info
 *
 * All suggestion actions are cleared at the start of each new day.
 */

import { writable, derived, get } from "svelte/store";
import type { Memo, Gap } from "../../../types.ts";
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
import {
  loadSyncData,
  saveSuggestionActions,
  removeSuggestionAction,
  clearSuggestionActions,
} from "../services/sync.remote.ts";

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
// Schedule Result Store
// ============================================================================

/**
 * Current schedule result from the engine
 */
export const scheduleResult = writable<ScheduleResult | null>(null);

/**
 * Error state for schedule generation
 */
export const scheduleError = writable<Error | null>(null);

/**
 * Loading state for schedule generation
 */
export const isScheduleLoading = writable<boolean>(false);

/**
 * Summary of the last pipeline execution
 * Useful for debugging and UI feedback
 */
export const lastPipelineSummary = writable<PipelineSummary | null>(null);

/**
 * Timestamp of the last successful schedule generation
 */
export const lastScheduleTime = writable<Date | null>(null);

// ============================================================================
// Suggestion State Stores
// ============================================================================

/**
 * Accepted memos with their time slot info
 * Key: memoId, Value: time slot info
 */
export const acceptedMemos = writable<Map<string, AcceptedMemoInfo>>(new Map());

/**
 * Set of memo IDs that have been rejected (skipped)
 * Rejected memos NEVER reappear in any future repopulation (for today)
 */
export const rejectedMemoIds = writable<Set<string>>(new Set());

/**
 * Manually moved/dragged suggestions that should persist
 * These are excluded from repopulation and maintain their position
 */
export const movedSuggestions = writable<MovedSuggestion[]>([]);

/**
 * Whether sync data has been loaded from the server
 */
export const isSyncLoaded = writable<boolean>(false);

/**
 * Whether sync operations are in progress
 */
export const isSyncing = writable<boolean>(false);

/**
 * Promise that resolves when sync is complete (or fails)
 * Used to wait for sync before regenerating or calling transit API
 */
let syncCompleteResolve: (() => void) | null = null;
let syncCompletePromise: Promise<void> | null = null;

/**
 * Wait for sync to complete before proceeding
 * Resolves immediately if sync is already complete
 * Also resolves on network errors (to allow proceeding without sync)
 */
export async function waitForSync(): Promise<void> {
  if (get(isSyncLoaded)) {
    return; // Already synced
  }

  if (!syncCompletePromise) {
    // Create a new promise if one doesn't exist
    syncCompletePromise = new Promise((resolve) => {
      syncCompleteResolve = resolve;
    });

    // Also set a timeout to prevent indefinite waiting (10 seconds)
    setTimeout(() => {
      if (syncCompleteResolve) {
        console.warn("[Schedule] Sync timeout - proceeding without sync");
        syncCompleteResolve();
        syncCompleteResolve = null;
      }
    }, 10000);
  }

  return syncCompletePromise;
}

/**
 * Signal that sync is complete (call this after sync finishes)
 */
function signalSyncComplete(): void {
  if (syncCompleteResolve) {
    syncCompleteResolve();
    syncCompleteResolve = null;
  }
  syncCompletePromise = null;
}

/**
 * Sync blocker state to unifiedGapState for availableGaps computation.
 * Call this after any change to acceptedMemos or movedSuggestions.
 */
function syncBlockersToGapState(): void {
  const accepted = get(acceptedMemos);
  const moved = get(movedSuggestions);

  // Convert to TimeBlocker format
  const acceptedBlockers = new Map<
    string,
    { startTime: string; endTime: string }
  >();
  for (const [memoId, info] of accepted) {
    acceptedBlockers.set(memoId, {
      startTime: info.startTime,
      endTime: info.endTime,
    });
  }

  const movedBlockers = moved.map((m) => ({
    startTime: m.startTime,
    endTime: m.endTime,
  }));

  unifiedGapState.setBlockers(acceptedBlockers, movedBlockers);
}

// ============================================================================
// Derived Stores
// ============================================================================

/**
 * All suggestions that should be displayed (scheduled + moved)
 * Scheduled blocks from result + moved suggestions (excluding any that overlap with accepted)
 */
export const allDisplayedSuggestions = derived(
  [scheduleResult, movedSuggestions, acceptedMemos],
  ([$result, $moved, $accepted]) => {
    const scheduled = $result?.scheduled ?? [];
    const acceptedMemoIds = new Set($accepted.keys());

    // Filter out moved suggestions for memos that are now accepted
    const validMoved = $moved.filter((m) => !acceptedMemoIds.has(m.memoId));

    return {
      scheduled,
      moved: validMoved,
    };
  },
);

/**
 * All scheduled blocks from the engine result
 */
export const scheduledBlocks = derived(
  [scheduleResult],
  ([$result]) => $result?.scheduled ?? [],
);

/**
 * Pending suggestions (scheduled blocks that haven't been accepted yet)
 */
export const pendingSuggestions = derived(
  [scheduleResult, movedSuggestions],
  ([$result, $moved]): PendingSuggestion[] => {
    const scheduled = $result?.scheduled ?? [];
    const movedIds = new Set($moved.map((m) => m.suggestionId));

    // Include scheduled blocks (excluding moved ones) and moved suggestions
    const fromScheduled = scheduled
      .filter((b) => !movedIds.has(b.suggestionId))
      .map((b): PendingSuggestion => ({ ...b, isPending: true }));

    const fromMoved = $moved.map(
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
  },
);

/**
 * Dropped suggestions (didn't fit in schedule)
 */
export const droppedSuggestions = derived(
  [scheduleResult],
  ([$result]) => $result?.dropped ?? [],
);

/**
 * Mandatory tasks that were dropped (couldn't fit)
 */
export const droppedMandatory = derived(
  [scheduleResult],
  ([$result]) => $result?.mandatoryDropped ?? [],
);

/**
 * Next scheduled block (earliest start time)
 */
export const nextScheduledBlock = derived([scheduledBlocks], ([$blocks]) => {
  if ($blocks.length === 0) return null;
  return [...$blocks].sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
});

/**
 * Whether there are any scheduled tasks
 */
export const hasScheduledTasks = derived(
  [scheduledBlocks],
  ([$blocks]) => $blocks.length > 0,
);

/**
 * Total minutes of scheduled tasks
 */
export const totalScheduledMinutes = derived([scheduledBlocks], ([$blocks]) =>
  $blocks.reduce((sum, b) => sum + b.duration, 0),
);

/**
 * Whether any mandatory tasks were dropped
 */
export const hasMandatoryDropped = derived(
  [droppedMandatory],
  ([$dropped]) => $dropped.length > 0,
);

/**
 * Find a scheduled block by memo ID
 */
export function findBlockByMemoId(memoId: string): ScheduledBlock | undefined {
  const result = get(scheduleResult);
  return result?.scheduled.find((b) => b.memoId === memoId);
}

/**
 * Check if a memo is currently scheduled
 */
export function isMemoScheduled(memoId: string): boolean {
  return findBlockByMemoId(memoId) !== undefined;
}

/**
 * Get all blocks for a specific gap
 */
export function getBlocksForGap(gapId: string): ScheduledBlock[] {
  const result = get(scheduleResult);
  return result?.scheduled.filter((b) => b.gapId === gapId) ?? [];
}

// ============================================================================
// Engine Instance
// ============================================================================

const engine = createEngine();

// ============================================================================
// Schedule Actions
// ============================================================================

export const scheduleActions = {
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
    await waitForSync();

    isScheduleLoading.set(true);
    scheduleError.set(null);

    try {
      // Get current moved suggestions to exclude their memoIds
      const currentMoved = get(movedSuggestions);
      const movedMemoIds = new Set(currentMoved.map((m) => m.memoId));

      // Get accepted memos to use as blockers
      const accepted = get(acceptedMemos);
      const acceptedMemoIds = new Set(accepted.keys());

      // Get rejected memo IDs
      const rejected = get(rejectedMemoIds);

      // Filter memos: exclude rejected and already-moved memos
      const filteredMemos = memos.filter(
        (m) => !rejected.has(m.id) && !movedMemoIds.has(m.id),
      );

      // Sync blockers to unified gap state before getting available gaps
      syncBlockersToGapState();

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
      scheduleResult.set(result);
      lastScheduleTime.set(new Date());

      // Extend summary with additional info
      const extendedSummary = {
        ...summary,
        movedBlockers: currentMoved.length,
        acceptedBlockers: accepted.size,
        rejectedMemos: rejected.size,
        executionMs: Math.round(endTime - startTime),
      };
      lastPipelineSummary.set(extendedSummary);

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
      scheduleError.set(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      isScheduleLoading.set(false);
    }
  },

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
    const result = get(scheduleResult);
    const currentMoved = get(movedSuggestions);

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
    const { taskActions, tasks } = await import(
      "$lib/features/tasks/state/taskActions.ts"
    );
    await taskActions.markAccepted(block.memoId);

    // Remove from movedSuggestions if it was there
    if (currentMoved.some((m) => m.suggestionId === suggestionId)) {
      movedSuggestions.update((list) =>
        list.filter((m) => m.suggestionId !== suggestionId),
      );
    }

    // Add to accepted memos store
    const acceptedInfo: AcceptedMemoInfo = {
      memoId: block.memoId,
      startTime: block.startTime,
      endTime: block.endTime,
      duration: block.duration,
    };

    acceptedMemos.update((map) => {
      const newMap = new Map(map);
      newMap.set(block.memoId, acceptedInfo);
      return newMap;
    });

    console.log(
      "[Schedule] Accepted suggestion:",
      suggestionId,
      "memoId:",
      block.memoId,
    );

    // Sync to server (fire and forget)
    scheduleActions.syncAcceptedAction(block.memoId, acceptedInfo);

    // Regenerate to fill remaining gaps
    // Use fresh memos from store (after markAccepted updated the state)
    const freshMemos = get(tasks);
    await scheduleActions.regenerate(freshMemos);
  },

  /**
   * Reject a suggestion - the underlying memo will NEVER reappear (for today)
   *
   * @param suggestionId - ID of the suggestion to reject
   */
  async skip(suggestionId: string): Promise<void> {
    const result = get(scheduleResult);
    if (!result) return;

    // Find the suggestion to get its memoId
    const block = result.scheduled.find((b) => b.suggestionId === suggestionId);
    if (!block) {
      console.warn(
        "[Schedule] Cannot reject: suggestion not found",
        suggestionId,
      );
      return;
    }

    // Add memoId to rejected set
    rejectedMemoIds.update((set) => {
      const next = new Set(set);
      next.add(block.memoId);
      return next;
    });

    console.log(
      "[Schedule] Rejected suggestion:",
      suggestionId,
      "memoId:",
      block.memoId,
    );

    // Sync rejected memo to server (fire and forget)
    scheduleActions.syncRejectedAction(block.memoId);

    // Regenerate to get new suggestion for the gap
    const { tasks } = await import("$lib/features/tasks/state/taskActions.ts");
    const freshMemos = get(tasks);
    await scheduleActions.regenerate(freshMemos);
  },

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
    const result = get(scheduleResult);
    const currentMoved = get(movedSuggestions);
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

    // Update movedSuggestions store
    movedSuggestions.update((list) => {
      // Remove any existing entry for this suggestion
      const filtered = list.filter((m) => m.suggestionId !== suggestionId);
      // Remove overlapping moved suggestions
      const overlappingSet = new Set(overlappingMovedIds);
      const withoutOverlaps = filtered.filter(
        (m) => !overlappingSet.has(m.suggestionId),
      );
      // Add the newly moved suggestion
      return [...withoutOverlaps, moved];
    });

    // Remove overlapping suggestions from scheduled result
    if (overlappingScheduledIds.length > 0 && result) {
      const overlappingSet = new Set(overlappingScheduledIds);
      scheduleResult.set({
        ...result,
        scheduled: result.scheduled.filter(
          (b) =>
            b.suggestionId === suggestionId ||
            !overlappingSet.has(b.suggestionId),
        ),
      });
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
    await scheduleActions.regenerate(memos, { gaps });
  },

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
    const result = get(scheduleResult);
    const currentMoved = get(movedSuggestions);
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
        scheduleResult.set({
          ...result,
          scheduled: result.scheduled.filter(
            (b) => !overlappingSet.has(b.suggestionId),
          ),
        });
        console.log(
          "[Schedule] Removed overlapping scheduled suggestions:",
          overlappingScheduledIds,
        );
      }

      const hadOverlaps =
        overlappingScheduledIds.length > 0 || overlappingMovedIds.length > 0;

      movedSuggestions.update((list) => {
        // Remove overlapping moved suggestions
        const overlappingSet = new Set(overlappingMovedIds);
        const filtered = list.filter(
          (m) =>
            m.suggestionId === suggestionId ||
            !overlappingSet.has(m.suggestionId),
        );

        // Update the resized suggestion
        return filtered.map((m) =>
          m.suggestionId === suggestionId
            ? { ...m, duration: newDuration, endTime: newEndTime }
            : m,
        );
      });

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
      await scheduleActions.regenerate(memos, { gaps });
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
      movedSuggestions.update((list) =>
        list.filter((m) => !overlappingSet.has(m.suggestionId)),
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

    movedSuggestions.update((list) => {
      // Remove any existing entry for this suggestion
      const filtered = list.filter((m) => m.suggestionId !== suggestionId);
      // Remove overlapping moved suggestions
      const overlappingSet = new Set(overlappingMovedIds);
      const withoutOverlaps = filtered.filter(
        (m) => !overlappingSet.has(m.suggestionId),
      );
      // Add with new duration
      return [...withoutOverlaps, movedWithNewDuration];
    });

    // Remove the suggestion from scheduled result (it's now in movedSuggestions)
    // Also remove any overlapping scheduled suggestions
    const toRemoveSet = new Set([suggestionId, ...overlappingScheduledIds]);
    scheduleResult.set({
      ...result,
      scheduled: result.scheduled.filter(
        (b) => !toRemoveSet.has(b.suggestionId),
      ),
    });

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
    await scheduleActions.regenerate(memos, { gaps });
  },

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
    memos: Memo[],
    gaps?: Gap[],
  ): Promise<void> {
    const accepted = get(acceptedMemos);
    const info = accepted.get(memoId);
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

    // Update the accepted memo info
    acceptedMemos.update((map) => {
      const newMap = new Map(map);
      newMap.set(memoId, {
        ...info,
        duration: newDuration,
        endTime: newEndTime,
      });
      return newMap;
    });

    console.log("[Schedule] Updated accepted duration:", memoId, newDuration);

    // Sync to server
    scheduleActions.syncAcceptedAction(memoId, {
      ...info,
      duration: newDuration,
      endTime: newEndTime,
    });
  },

  /**
   * Delete an accepted suggestion, freeing up the gap
   * Also resets the memo's acceptedToday flag so it can reappear
   *
   * @param memoId - ID of the memo
   * @param memos - Current memos for regeneration
   */
  async deleteAccepted(memoId: string, memos: Memo[]): Promise<void> {
    // Remove from accepted memos store
    acceptedMemos.update((map) => {
      const newMap = new Map(map);
      newMap.delete(memoId);
      return newMap;
    });

    console.log("[Schedule] Deleted accepted memo:", memoId);

    // Remove from server sync (fire and forget)
    scheduleActions.unsyncAcceptedAction(memoId);

    // Reset the memo's acceptedToday flag so it can reappear
    const { taskActions } = await import(
      "$lib/features/tasks/state/taskActions.ts"
    );
    await taskActions.resetAccepted(memoId);

    // Regenerate to fill the freed gap
    await scheduleActions.regenerate(memos);
  },

  /**
   * Mark an accepted suggestion as complete
   * Logs duration to the memo and removes from accepted list
   *
   * @param memoId - ID of the memo
   * @param duration - Duration in minutes to log
   * @returns Promise resolving when complete
   */
  async completeSuggestion(memoId: string, duration: number): Promise<void> {
    // Remove from accepted memos store
    acceptedMemos.update((map) => {
      const newMap = new Map(map);
      newMap.delete(memoId);
      return newMap;
    });

    console.log("[Schedule] Completed suggestion:", {
      memoId,
      duration,
    });

    // Remove from server sync (fire and forget)
    scheduleActions.unsyncAcceptedAction(memoId);

    // Note: The actual memo update is done via the remote function
    // called from PersonalAssistantView
  },

  /**
   * Mark an accepted suggestion as missed
   * Removes from accepted list and resets the memo's acceptedToday flag
   * so the task can reappear in suggestions.
   *
   * @param memoId - ID of the memo
   */
  async missedSuggestion(memoId: string): Promise<void> {
    // Remove from accepted memos store
    acceptedMemos.update((map) => {
      const newMap = new Map(map);
      newMap.delete(memoId);
      return newMap;
    });

    console.log("[Schedule] Missed suggestion:", memoId);

    // Remove from server sync (fire and forget)
    scheduleActions.unsyncAcceptedAction(memoId);

    // Reset the memo's acceptedToday flag so it can reappear
    const { taskActions, tasks } = await import(
      "$lib/features/tasks/state/taskActions.ts"
    );
    await taskActions.resetAccepted(memoId);

    // Regenerate to potentially show the task again
    const freshMemos = get(tasks);
    await scheduleActions.regenerate(freshMemos);
  },

  /**
   * Clear the current schedule
   * Useful for resetting state
   */
  clear(): void {
    scheduleResult.set(null);
    scheduleError.set(null);
    lastPipelineSummary.set(null);
    acceptedMemos.set(new Map());
    rejectedMemoIds.set(new Set());
    movedSuggestions.set([]);
    syncBlockersToGapState();
  },

  /**
   * Clear only accepted, rejected, and moved state (keep schedule result)
   * Useful for daily reset
   */
  clearAcceptedAndSkipped(): void {
    acceptedMemos.set(new Map());
    rejectedMemoIds.set(new Set());
    movedSuggestions.set([]);
    syncBlockersToGapState();
  },

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
  },

  /**
   * Get the engine for advanced usage
   * (e.g., enriching a single memo)
   */
  getEngine() {
    return engine;
  },

  // ==========================================================================
  // Sync Functions
  // ==========================================================================

  /**
   * Load synced data from the server
   * Should be called once when the app initializes
   * This includes cleanup of expired data (handled server-side)
   */
  async loadSyncedData(): Promise<void> {
    if (get(isSyncLoaded)) {
      console.log("[Schedule] Sync data already loaded");
      signalSyncComplete();
      return;
    }

    isSyncing.set(true);

    try {
      console.log("[Schedule] Loading synced data...");
      const data = await loadSyncData({});

      // Convert synced actions to local format
      const acceptedMap = new Map<string, AcceptedMemoInfo>();
      const rejectedSet = new Set<string>();

      for (const action of data.suggestionActions) {
        if (
          action.action === "accepted" &&
          action.startTime &&
          action.endTime &&
          action.duration
        ) {
          acceptedMap.set(action.memoId, {
            memoId: action.memoId,
            startTime: action.startTime,
            endTime: action.endTime,
            duration: action.duration,
          });
        } else if (action.action === "rejected") {
          rejectedSet.add(action.memoId);
        }
        // "missed" actions don't need to be loaded - they just remove "accepted"
      }

      // Apply to stores
      acceptedMemos.set(acceptedMap);
      rejectedMemoIds.set(rejectedSet);

      // Sync blockers to gap state for availableGaps computation
      syncBlockersToGapState();

      isSyncLoaded.set(true);
      console.log("[Schedule] Synced data loaded:", {
        acceptedMemos: acceptedMap.size,
        rejectedMemos: rejectedSet.size,
      });
    } catch (error) {
      console.error("[Schedule] Failed to load synced data:", error);
      // Continue without synced data - will work with fresh state
      // Mark as loaded anyway to prevent waiting forever
      isSyncLoaded.set(true);
    } finally {
      isSyncing.set(false);
      signalSyncComplete();
    }
  },

  /**
   * Sync an accepted action to the server
   */
  async syncAcceptedAction(
    memoId: string,
    info: AcceptedMemoInfo,
  ): Promise<void> {
    try {
      await saveSuggestionActions({
        actions: [
          {
            memoId,
            action: "accepted",
            startTime: info.startTime,
            endTime: info.endTime,
            duration: info.duration,
          },
        ],
      });
    } catch (error) {
      console.error("[Schedule] Failed to sync accepted action:", error);
    }
  },

  /**
   * Remove an accepted action from the server
   */
  async unsyncAcceptedAction(memoId: string): Promise<void> {
    try {
      await removeSuggestionAction({ memoId, action: "accepted" });
    } catch (error) {
      console.error("[Schedule] Failed to unsync accepted action:", error);
    }
  },

  /**
   * Sync a rejected action to the server
   */
  async syncRejectedAction(memoId: string): Promise<void> {
    try {
      await saveSuggestionActions({
        actions: [
          {
            memoId,
            action: "rejected",
          },
        ],
      });
    } catch (error) {
      console.error("[Schedule] Failed to sync rejected action:", error);
    }
  },

  /**
   * Clear all synced data (useful for testing or reset)
   */
  async clearSyncedData(): Promise<void> {
    try {
      await clearSuggestionActions({});
      console.log("[Schedule] Cleared all synced data");
    } catch (error) {
      console.error("[Schedule] Failed to clear synced data:", error);
    }
  },

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
    movedSuggestions.update((list) => {
      const before = list.length;
      const filtered = list.filter((s) => s.endTime > currentTime);
      if (filtered.length < before) {
        console.log(
          `[Schedule] Cleaned up ${before - filtered.length} expired moved suggestions`,
        );
      }
      return filtered;
    });
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function stableSerializeSchedule(schedule: ScheduleResult): string {
  const scheduled = [...schedule.scheduled].sort((a, b) => {
    const idCompare = a.suggestionId.localeCompare(b.suggestionId);
    if (idCompare !== 0) return idCompare;
    return a.startTime.localeCompare(b.startTime);
  });

  const dropped = [...schedule.dropped].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const mandatoryDropped = [...schedule.mandatoryDropped].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  return JSON.stringify({ scheduled, dropped, mandatoryDropped });
}
