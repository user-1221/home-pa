/**
 * Schedule Store
 *
 * Holds the output of the suggestion scheduler.
 * This is the result of running the engine on memos + gaps.
 *
 * Data flow:
 *   memos + gaps → engine.generateSchedule() → scheduleResult
 *
 * Usage:
 *   1. Call scheduleActions.regenerate() when you want a new schedule
 *   2. Read $scheduleResult to display scheduled blocks
 *   3. Use $nextScheduledBlock for quick access to the next task
 *
 * Suggestion States:
 *   - Pending: Generated suggestions not yet accepted (shown with Accept/Skip UI)
 *   - Accepted: User-accepted suggestions that act as fixed events in gap calculation
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
  calculateExtension,
  getBlockersFromAccepted,
  timeToMinutes,
  minutesToTime,
  findOverlappingSuggestions,
} from "../services/suggestion-drag.ts";
import {
  loadSyncData,
  saveAcceptedSuggestions,
  removeAcceptedSuggestion,
  saveRejectedMemos,
  clearAcceptedSuggestions as clearSyncedAcceptedSuggestions,
} from "../services/sync.remote.ts";

// ============================================================================
// Types for Suggestion Management
// ============================================================================

/**
 * An accepted suggestion that acts as a fixed event
 * Extends ScheduledBlock with acceptance metadata
 */
export interface AcceptedSuggestion extends ScheduledBlock {
  acceptedAt: Date;
  /** Original duration before any resizing */
  originalDuration: number;
}

/**
 * A pending suggestion awaiting user action
 */
export interface PendingSuggestion extends ScheduledBlock {
  /** Reason/explanation for the suggestion */
  reason?: string;
}

// ============================================================================
// Engine Instance (Singleton)
// ============================================================================

/**
 * Single engine instance for the app
 * Reused across all schedule regenerations
 */
const engine = createEngine({
  enableLLMEnrichment: true, // Will gracefully skip if not configured
});

// ============================================================================
// Core Stores
// ============================================================================

/**
 * The schedule result from the last engine run
 * null = no schedule generated yet
 */
export const scheduleResult = writable<ScheduleResult | null>(null);

/**
 * Whether the schedule is currently being generated
 */
export const isScheduleLoading = writable<boolean>(false);

/**
 * Error message if schedule generation failed
 * null = no error
 */
export const scheduleError = writable<string | null>(null);

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
 * Accepted suggestions that act as fixed events
 * These block their time slots from future suggestions
 */
export const acceptedSuggestions = writable<AcceptedSuggestion[]>([]);

/**
 * Set of memo IDs that have been rejected (skipped)
 * Rejected memos NEVER reappear in any future repopulation
 * (Tracks by memoId, not suggestionId, so they're permanently excluded)
 */
export const rejectedMemoIds = writable<Set<string>>(new Set());

/**
 * Set of suggestion IDs that have been skipped (legacy - being replaced)
 * @deprecated Use rejectedMemoIds instead
 */
export const skippedSuggestionIds = writable<Set<string>>(new Set());

/**
 * Manually moved/dragged suggestions that should persist
 * These are excluded from repopulation and maintain their position
 */
export interface MovedSuggestion extends ScheduledBlock {
  movedAt: Date;
}
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

// ============================================================================
// Derived Stores
// ============================================================================

/**
 * All scheduled blocks from the current schedule
 * Returns empty array if no schedule
 */
export const scheduledBlocks = derived(
  scheduleResult,
  ($result) => $result?.scheduled ?? [],
);

/**
 * Pending suggestions (generated but not yet accepted/skipped)
 * Includes:
 * - Generated suggestions from scheduleResult
 * - Manually moved suggestions (with their new positions)
 * Excludes:
 * - Already accepted suggestions
 * - Rejected memos (by memoId - permanent exclusion)
 */
export const pendingSuggestions = derived(
  [
    scheduleResult,
    acceptedSuggestions,
    rejectedMemoIds,
    skippedSuggestionIds,
    movedSuggestions,
  ],
  ([$result, $accepted, $rejected, $skipped, $moved]): PendingSuggestion[] => {
    const acceptedIds = new Set($accepted.map((a) => a.suggestionId));
    const movedIds = new Set($moved.map((m) => m.suggestionId));

    // Get generated suggestions (excluding moved ones - they come from movedSuggestions)
    const generatedSuggestions = ($result?.scheduled ?? [])
      .filter(
        (block) =>
          !acceptedIds.has(block.suggestionId) &&
          !$rejected.has(block.memoId) && // Filter by memoId for rejections
          !$skipped.has(block.suggestionId) &&
          !movedIds.has(block.suggestionId),
      )
      .map((block): PendingSuggestion => ({ ...block }));

    // Add moved suggestions (they persist with their new positions)
    const movedAsPending: PendingSuggestion[] = $moved
      .filter(
        (m) =>
          !acceptedIds.has(m.suggestionId) &&
          !$rejected.has(m.memoId) &&
          !$skipped.has(m.suggestionId),
      )
      .map(
        (m): PendingSuggestion => ({
          suggestionId: m.suggestionId,
          memoId: m.memoId,
          gapId: m.gapId,
          startTime: m.startTime,
          endTime: m.endTime,
          duration: m.duration,
        }),
      );

    return [...generatedSuggestions, ...movedAsPending];
  },
);

/**
 * All dropped suggestions (couldn't fit in gaps)
 */
export const droppedSuggestions = derived(
  scheduleResult,
  ($result) => $result?.dropped ?? [],
);

/**
 * Mandatory tasks that were dropped (high priority issue!)
 */
export const droppedMandatory = derived(
  scheduleResult,
  ($result) => $result?.mandatoryDropped ?? [],
);

/**
 * The next scheduled block (first one in the list)
 * Most useful for "what should I do next?" UI
 */
export const nextScheduledBlock = derived(
  scheduleResult,
  ($result): ScheduledBlock | null => {
    if (!$result?.scheduled.length) return null;
    return $result.scheduled[0];
  },
);

/**
 * Whether there are any scheduled tasks
 */
export const hasScheduledTasks = derived(
  scheduleResult,
  ($result) => ($result?.scheduled.length ?? 0) > 0,
);

/**
 * Total minutes scheduled
 */
export const totalScheduledMinutes = derived(
  scheduleResult,
  ($result) => $result?.totalScheduledMinutes ?? 0,
);

/**
 * Whether any mandatory tasks were dropped
 * This is a warning condition
 */
export const hasMandatoryDropped = derived(
  scheduleResult,
  ($result) => ($result?.mandatoryDropped.length ?? 0) > 0,
);

// ============================================================================
// Actions
// ============================================================================

/**
 * Check if two time ranges overlap
 */
function timeRangesOverlapMinutes(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Subtract accepted suggestions from gaps to get remaining available gaps
 * Uses TIME RANGE matching, not just gapId, so moved suggestions are correctly subtracted
 */
function subtractAcceptedFromGaps(
  gaps: Gap[],
  accepted: AcceptedSuggestion[],
): Gap[] {
  if (accepted.length === 0) return gaps;

  const result: Gap[] = [];
  let gapCounter = 0;

  for (const gap of gaps) {
    const gapStart = timeToMinutes(gap.start);
    const gapEnd = timeToMinutes(gap.end);

    // Find ALL blockers that overlap with this gap's time range
    // This works regardless of gapId matching
    const overlappingBlockers = accepted.filter((a) => {
      const blockerStart = timeToMinutes(a.startTime);
      const blockerEnd = timeToMinutes(a.endTime);
      return timeRangesOverlapMinutes(
        gapStart,
        gapEnd,
        blockerStart,
        blockerEnd,
      );
    });

    if (overlappingBlockers.length === 0) {
      result.push(gap);
      continue;
    }

    // Sort blockers by start time
    const sortedBlockers = [...overlappingBlockers].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );

    // Find remaining gaps between/around blockers
    let currentStart = gapStart;

    for (const blocker of sortedBlockers) {
      const blockerStart = Math.max(timeToMinutes(blocker.startTime), gapStart);
      const blockerEnd = Math.min(timeToMinutes(blocker.endTime), gapEnd);

      // Gap before this blocker
      if (blockerStart > currentStart) {
        const duration = blockerStart - currentStart;
        if (duration >= 5) {
          // Minimum 5 minutes for a viable gap
          result.push({
            gapId: `${gap.gapId}-sub-${gapCounter++}`,
            start: minutesToTime(currentStart),
            end: minutesToTime(blockerStart),
            duration,
            locationLabel: gap.locationLabel,
          });
        }
      }
      currentStart = Math.max(currentStart, blockerEnd);
    }

    // Gap after all blockers
    if (currentStart < gapEnd) {
      const duration = gapEnd - currentStart;
      if (duration >= 5) {
        result.push({
          gapId: `${gap.gapId}-sub-${gapCounter++}`,
          start: minutesToTime(currentStart),
          end: minutesToTime(gapEnd),
          duration,
          locationLabel: gap.locationLabel,
        });
      }
    }
  }

  return result;
}

/**
 * Schedule management actions
 */
export const scheduleActions = {
  /**
   * Regenerate the schedule from current memos and gaps
   *
   * Call this when:
   * - User requests a new schedule
   * - Memos change significantly
   * - Time moves forward (new gaps available)
   *
   * @param memos - Current memos (pass from your memo store)
   * @param options - Optional overrides
   */
  async regenerate(
    memos: Memo[],
    options: {
      gaps?: Gap[];
      skipLLMEnrichment?: boolean;
    } = {},
  ): Promise<ScheduleResult | null> {
    // Wait for sync to complete before generating (unless it times out or errors)
    await waitForSync();

    // Set loading state
    isScheduleLoading.set(true);
    scheduleError.set(null);

    try {
      const previous = get(scheduleResult);
      const previousKey = previous ? stableSerializeSchedule(previous) : null;

      // Get current state for filtering
      const rejected = get(rejectedMemoIds);
      const moved = get(movedSuggestions);
      const accepted = get(acceptedSuggestions);

      // Build set of excluded memo IDs:
      // - Rejected memos: NEVER reappear
      // - Moved suggestion memos: excluded from repopulation (no duplicates)
      const excludedMemoIds = new Set<string>(rejected);
      for (const m of moved) {
        excludedMemoIds.add(m.memoId);
      }

      // Filter memos to exclude rejected and moved
      const filteredMemos = memos.filter(
        (memo) => !excludedMemoIds.has(memo.id),
      );

      // Get gaps from unified state (always fresh, enriched, with past time blocked)
      // This ensures consistent gap computation across initial generation and repopulation
      const rawGaps = options.gaps ?? unifiedGapState.enrichedGaps;
      const acceptedAndMoved: AcceptedSuggestion[] = [
        ...accepted,
        // Treat moved suggestions as accepted for gap subtraction
        ...moved.map((m) => ({
          ...m,
          acceptedAt: m.movedAt,
          originalDuration: m.duration,
        })),
      ];
      const availableGaps = subtractAcceptedFromGaps(rawGaps, acceptedAndMoved);

      // Call engine with available gaps and filtered memos
      const { schedule, summary } = await engine.generateSchedule(
        filteredMemos,
        availableGaps,
        {
          skipLLMEnrichment: options.skipLLMEnrichment,
          // Pass accepted memo IDs for score reduction
          acceptedMemoIds: new Set(accepted.map((a) => a.memoId)),
        },
      );

      const nextKey = stableSerializeSchedule(schedule);
      const isSameAsPrevious = previousKey === nextKey;

      if (isSameAsPrevious) {
        // No state change if identical to cached schedule
        console.log("[Schedule] Regeneration skipped (no change)");
        lastScheduleTime.set(new Date());
        lastPipelineSummary.set(summary);
        return schedule;
      }

      // Update stores
      scheduleResult.set(schedule);
      lastPipelineSummary.set(summary);
      lastScheduleTime.set(new Date());

      // Mark regeneration complete in unified gap state
      unifiedGapState.markRegenerated();

      // Log summary for debugging
      console.log("[Schedule] Generated:", {
        scheduled: schedule.scheduled.length,
        dropped: schedule.dropped.length,
        mandatoryDropped: schedule.mandatoryDropped.length,
        acceptedFixed: accepted.length,
        movedFixed: moved.length,
        rejectedMemos: rejected.size,
        executionMs: summary.executionTimeMs,
      });

      return schedule;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[Schedule] Generation failed:", error);
      scheduleError.set(message);
      return null;
    } finally {
      isScheduleLoading.set(false);
    }
  },

  /**
   * Accept a suggestion, converting it to a fixed event
   * Can accept from either result.scheduled or movedSuggestions
   *
   * @param suggestionId - ID of the suggestion to accept
   * @param memos - Current memos for regeneration
   */
  async accept(suggestionId: string, memos: Memo[]): Promise<void> {
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

    // Remove from movedSuggestions if it was there
    if (currentMoved.some((m) => m.suggestionId === suggestionId)) {
      movedSuggestions.update((list) =>
        list.filter((m) => m.suggestionId !== suggestionId),
      );
    }

    // Move to accepted
    const accepted: AcceptedSuggestion = {
      ...block,
      acceptedAt: new Date(),
      originalDuration: block.duration,
    };

    acceptedSuggestions.update((list) => [...list, accepted]);

    console.log("[Schedule] Accepted suggestion:", suggestionId);

    // Sync to server (fire and forget)
    scheduleActions.syncAcceptedSuggestions();

    // Regenerate to fill remaining gaps
    await scheduleActions.regenerate(memos);
  },

  /**
   * Reject a suggestion - the underlying memo will NEVER reappear
   *
   * @param suggestionId - ID of the suggestion to reject
   * @param memos - Current memos for regeneration
   */
  async skip(suggestionId: string, memos: Memo[]): Promise<void> {
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

    // Add memoId to rejected set (permanent exclusion)
    rejectedMemoIds.update((set) => {
      const next = new Set(set);
      next.add(block.memoId);
      return next;
    });

    // Also add to legacy skipped set for backward compatibility
    skippedSuggestionIds.update((set) => {
      const next = new Set(set);
      next.add(suggestionId);
      return next;
    });

    console.log(
      "[Schedule] Rejected suggestion:",
      suggestionId,
      "memoId:",
      block.memoId,
    );

    // Sync rejected memos to server (fire and forget)
    scheduleActions.syncRejectedMemos();

    // Regenerate to get new suggestion for the gap
    await scheduleActions.regenerate(memos);
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
   *
   * @param suggestionId - ID of the suggestion to move
   * @param newStartTime - New start time in HH:mm format
   * @param newEndTime - New end time in HH:mm format
   * @param newGapId - ID of the gap the suggestion is being moved to
   * @param memos - Current memos for regeneration
   * @param gaps - Optional gaps to use for regeneration (uses enrichedGaps if not provided)
   */
  async moveSuggestion(
    suggestionId: string,
    newStartTime: string,
    newEndTime: string,
    newGapId: string,
    memos: Memo[],
    gaps?: Gap[],
  ): Promise<void> {
    const result = get(scheduleResult);
    if (!result) return;

    // Find the suggestion being moved (could be in scheduleResult or movedSuggestions)
    const currentMoved = get(movedSuggestions);
    const existingMoved = currentMoved.find(
      (m) => m.suggestionId === suggestionId,
    );
    const blockFromResult = result.scheduled.find(
      (b) => b.suggestionId === suggestionId,
    );
    const block = existingMoved ?? blockFromResult;

    if (!block) {
      console.warn(
        "[Schedule] Cannot move: suggestion not found",
        suggestionId,
      );
      return;
    }

    // Calculate new duration from time range
    const newDuration = timeToMinutes(newEndTime) - timeToMinutes(newStartTime);

    // Create the moved suggestion with updated position
    const movedBlock: MovedSuggestion = {
      suggestionId: block.suggestionId,
      memoId: block.memoId,
      gapId: newGapId,
      startTime: newStartTime,
      endTime: newEndTime,
      duration: newDuration,
      movedAt: new Date(),
    };

    // Find overlapping suggestions in scheduleResult
    const overlappingIds = findOverlappingSuggestions(
      result.scheduled,
      newStartTime,
      newEndTime,
      suggestionId,
    );

    // Also check for overlaps with other moved suggestions
    const overlappingMovedIds = findOverlappingSuggestions(
      currentMoved,
      newStartTime,
      newEndTime,
      suggestionId,
    );

    // Combine all overlapping IDs
    const allOverlappingIds = new Set([
      ...overlappingIds,
      ...overlappingMovedIds,
    ]);

    if (allOverlappingIds.size > 0) {
      console.log("[Schedule] Removing overlapping suggestions:", [
        ...allOverlappingIds,
      ]);
    }

    // IMMEDIATELY remove overlapping suggestions from scheduleResult
    if (overlappingIds.length > 0) {
      const overlappingSet = new Set(overlappingIds);
      scheduleResult.set({
        ...result,
        scheduled: result.scheduled.filter(
          (b) => !overlappingSet.has(b.suggestionId),
        ),
      });
    }

    // Update moved suggestions:
    // - Remove any overlapping moved suggestions
    // - Remove any existing entry for this suggestion (if moved again)
    // - Add the new moved suggestion
    movedSuggestions.update((list) => {
      const filtered = list.filter(
        (m) =>
          m.suggestionId !== suggestionId &&
          !allOverlappingIds.has(m.suggestionId),
      );
      return [...filtered, movedBlock];
    });

    console.log("[Schedule] Moved suggestion:", suggestionId, "to", {
      start: newStartTime,
      end: newEndTime,
      gap: newGapId,
      overlapsRemoved: allOverlappingIds.size,
    });

    // Trigger repopulation to fill remaining gaps with new suggestions
    // The moved suggestion's time is subtracted from gaps during regeneration
    await scheduleActions.regenerate(memos, { gaps });
  },

  /**
   * Update the duration of an accepted suggestion (drag-to-resize)
   * Uses symmetric extension from midpoint when possible, otherwise one-sided.
   *
   * @param suggestionId - ID of the accepted suggestion
   * @param newDuration - New duration in minutes (must be multiple of 5)
   * @param memos - Current memos for regeneration
   * @param gaps - Optional gaps to use for constraint checking
   * @returns Object with success flag and max allowed duration
   */
  async updateAcceptedDuration(
    suggestionId: string,
    newDuration: number,
    memos: Memo[],
    gaps?: Gap[],
  ): Promise<{ success: boolean; maxAllowed?: number }> {
    const accepted = get(acceptedSuggestions);
    const idx = accepted.findIndex((a) => a.suggestionId === suggestionId);
    if (idx === -1) {
      console.warn(
        "[Schedule] Cannot resize: accepted suggestion not found",
        suggestionId,
      );
      return { success: false };
    }

    const suggestion = accepted[idx];

    // Snap to 5-minute increments
    const snappedDuration = Math.round(newDuration / 5) * 5;
    if (snappedDuration < 5) {
      console.warn("[Schedule] Cannot resize: duration too small");
      return { success: false, maxAllowed: 5 };
    }

    // Get the gap this suggestion belongs to
    const rawGaps = gaps ?? unifiedGapState.enrichedGaps;
    const suggestionGap = rawGaps.find((g) => g.gapId === suggestion.gapId);

    // Calculate current midpoint
    const startMinutes = timeToMinutes(suggestion.startTime);
    const endMinutes = timeToMinutes(suggestion.endTime);
    const midpoint = Math.floor((startMinutes + endMinutes) / 2);

    // Determine gap boundaries
    const gapStart = suggestionGap
      ? timeToMinutes(suggestionGap.start)
      : startMinutes;
    const gapEnd = suggestionGap
      ? timeToMinutes(suggestionGap.end)
      : endMinutes;

    // Get blockers (other accepted suggestions)
    const blockers = getBlockersFromAccepted(accepted, suggestionId);

    // Calculate extension with constraints
    const extensionResult = calculateExtension(
      midpoint,
      suggestion.duration,
      snappedDuration,
      gapStart,
      gapEnd,
      blockers,
    );

    if (extensionResult.blocked) {
      console.warn(
        "[Schedule] Cannot resize:",
        extensionResult.blockReason ?? "blocked by constraints",
      );
      return { success: false, maxAllowed: extensionResult.maxAllowedDuration };
    }

    // Update the suggestion with new times
    acceptedSuggestions.update((list) => {
      const updated = [...list];
      updated[idx] = {
        ...suggestion,
        duration: extensionResult.newDuration,
        startTime: extensionResult.newStartTime,
        endTime: extensionResult.newEndTime,
      };
      return updated;
    });

    console.log(
      "[Schedule] Resized accepted suggestion:",
      suggestionId,
      "to",
      extensionResult.newDuration,
      "min",
      `(${extensionResult.newStartTime} - ${extensionResult.newEndTime})`,
    );

    // Sync updated accepted suggestions to server (fire and forget)
    scheduleActions.syncAcceptedSuggestions();

    // Regenerate to reflow other suggestions
    await scheduleActions.regenerate(memos);
    return { success: true, maxAllowed: extensionResult.maxAllowedDuration };
  },

  /**
   * Update the duration of a pending suggestion
   * Start time is fixed, only end time changes.
   * Duration changes in 10-min increments.
   * Also removes any overlapping pending suggestions and triggers regeneration.
   *
   * @param suggestionId - ID of the pending suggestion
   * @param newDuration - New duration in minutes
   * @param newEndTime - New end time in HH:mm format
   * @param memos - Current memos for regeneration
   * @param gaps - Optional gaps to use for regeneration
   */
  async updatePendingDuration(
    suggestionId: string,
    newDuration: number,
    newEndTime: string,
    memos: Memo[],
    gaps?: Gap[],
  ): Promise<void> {
    const result = get(scheduleResult);
    if (!result) {
      console.warn("[Schedule] Cannot update pending: no schedule result");
      return;
    }

    // Check if in movedSuggestions first
    const currentMoved = get(movedSuggestions);
    const movedIdx = currentMoved.findIndex(
      (m) => m.suggestionId === suggestionId,
    );

    // Get the start time for overlap detection
    let startTime: string;

    if (movedIdx !== -1) {
      startTime = currentMoved[movedIdx].startTime;

      // Find overlapping suggestions in scheduleResult
      const overlappingScheduledIds = findOverlappingSuggestions(
        result.scheduled,
        startTime,
        newEndTime,
        suggestionId,
      );

      // Find overlapping moved suggestions
      const overlappingMovedIds = findOverlappingSuggestions(
        currentMoved,
        startTime,
        newEndTime,
        suggestionId,
      );

      const hadOverlaps =
        overlappingScheduledIds.length > 0 || overlappingMovedIds.length > 0;

      // Remove overlapping suggestions from scheduleResult
      if (overlappingScheduledIds.length > 0) {
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

      // Update in movedSuggestions and remove overlapping moved suggestions
      movedSuggestions.update((list) => {
        const overlappingSet = new Set(overlappingMovedIds);
        const filtered = list.filter(
          (m) =>
            m.suggestionId === suggestionId ||
            !overlappingSet.has(m.suggestionId),
        );
        const idx = filtered.findIndex((m) => m.suggestionId === suggestionId);
        if (idx !== -1) {
          filtered[idx] = {
            ...filtered[idx],
            duration: newDuration,
            endTime: newEndTime,
          };
        }
        return filtered;
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

      // Trigger regeneration to fill gaps left by removed suggestions
      if (hadOverlaps) {
        await scheduleActions.regenerate(memos, { gaps });
      }
      return;
    }

    // Update in scheduled blocks
    const idx = result.scheduled.findIndex(
      (b) => b.suggestionId === suggestionId,
    );
    if (idx === -1) {
      console.warn(
        "[Schedule] Cannot update pending: suggestion not found",
        suggestionId,
      );
      return;
    }

    startTime = result.scheduled[idx].startTime;

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

    // Create updated schedule result, removing overlapping suggestions
    const overlappingScheduledSet = new Set(overlappingScheduledIds);
    const updatedScheduled = result.scheduled.filter(
      (b) =>
        b.suggestionId === suggestionId ||
        !overlappingScheduledSet.has(b.suggestionId),
    );

    // Update the resized suggestion
    const updatedIdx = updatedScheduled.findIndex(
      (b) => b.suggestionId === suggestionId,
    );
    if (updatedIdx !== -1) {
      updatedScheduled[updatedIdx] = {
        ...updatedScheduled[updatedIdx],
        duration: newDuration,
        endTime: newEndTime,
      };
    }

    scheduleResult.set({
      ...result,
      scheduled: updatedScheduled,
    });

    const hadOverlaps =
      overlappingScheduledIds.length > 0 || overlappingMovedIds.length > 0;

    if (overlappingScheduledIds.length > 0) {
      console.log(
        "[Schedule] Removed overlapping scheduled suggestions:",
        overlappingScheduledIds,
      );
    }

    console.log(
      "[Schedule] Updated pending suggestion duration:",
      suggestionId,
      newDuration,
    );

    // Trigger regeneration to fill gaps left by removed suggestions
    if (hadOverlaps) {
      await scheduleActions.regenerate(memos, { gaps });
    }
  },

  /**
   * Delete an accepted suggestion, freeing up the gap
   *
   * @param suggestionId - ID of the accepted suggestion to delete
   * @param memos - Current memos for regeneration
   */
  async deleteAccepted(suggestionId: string, memos: Memo[]): Promise<void> {
    acceptedSuggestions.update((list) =>
      list.filter((a) => a.suggestionId !== suggestionId),
    );

    console.log("[Schedule] Deleted accepted suggestion:", suggestionId);

    // Remove from server sync (fire and forget)
    scheduleActions.unsyncAcceptedSuggestion(suggestionId);

    // Regenerate to fill the freed gap
    await scheduleActions.regenerate(memos);
  },

  /**
   * Mark an accepted suggestion as complete
   * Logs duration to the memo and removes from accepted list
   *
   * @param suggestionId - ID of the accepted suggestion
   * @param memoId - ID of the memo to update
   * @param duration - Duration in minutes to log
   * @returns Promise resolving when complete
   */
  async completeSuggestion(
    suggestionId: string,
    memoId: string,
    duration: number,
  ): Promise<void> {
    // Remove from accepted list
    acceptedSuggestions.update((list) =>
      list.filter((a) => a.suggestionId !== suggestionId),
    );

    console.log("[Schedule] Completed suggestion:", {
      suggestionId,
      memoId,
      duration,
    });

    // Remove from server sync (fire and forget)
    scheduleActions.unsyncAcceptedSuggestion(suggestionId);

    // Note: The actual memo update is done via the remote function
    // called from PersonalAssistantView
  },

  /**
   * Mark an accepted suggestion as missed
   * Simply removes from accepted list without logging progress
   *
   * @param suggestionId - ID of the accepted suggestion
   */
  missedSuggestion(suggestionId: string): void {
    // Remove from accepted list
    acceptedSuggestions.update((list) =>
      list.filter((a) => a.suggestionId !== suggestionId),
    );

    console.log("[Schedule] Missed suggestion:", suggestionId);

    // Remove from server sync (fire and forget)
    scheduleActions.unsyncAcceptedSuggestion(suggestionId);
    // No memo update for missed - just ignore
  },

  /**
   * Clear the current schedule
   * Useful for resetting state
   */
  clear(): void {
    scheduleResult.set(null);
    scheduleError.set(null);
    lastPipelineSummary.set(null);
    acceptedSuggestions.set([]);
    skippedSuggestionIds.set(new Set());
    rejectedMemoIds.set(new Set());
    movedSuggestions.set([]);
  },

  /**
   * Clear only accepted, skipped, rejected, and moved state (keep schedule result)
   * Useful for daily reset
   */
  clearAcceptedAndSkipped(): void {
    acceptedSuggestions.set([]);
    skippedSuggestionIds.set(new Set());
    rejectedMemoIds.set(new Set());
    movedSuggestions.set([]);
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

      // Convert synced accepted suggestions to local format
      // Include today's past suggestions so users can mark them as complete/missed
      const today = new Date();
      const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );

      const validSuggestions: AcceptedSuggestion[] = data.acceptedSuggestions
        .filter((s) => new Date(s.date) >= todayStart)
        .map((s) => ({
          suggestionId: s.suggestionId,
          memoId: s.memoId,
          gapId: s.gapId,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          originalDuration: s.originalDuration,
          acceptedAt: new Date(s.acceptedAt),
        }));

      // Load rejected memo IDs
      const rejectedSet = new Set(data.rejectedMemoIds);

      // Apply to stores
      acceptedSuggestions.set(validSuggestions);
      rejectedMemoIds.set(rejectedSet);

      isSyncLoaded.set(true);
      console.log("[Schedule] Synced data loaded:", {
        acceptedSuggestions: validSuggestions.length,
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
   * Sync current accepted suggestions to the server
   * Should be called after any change to accepted suggestions
   */
  async syncAcceptedSuggestions(): Promise<void> {
    const accepted = get(acceptedSuggestions);
    if (accepted.length === 0) return;

    try {
      // Get current date for the suggestions
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      await saveAcceptedSuggestions({
        suggestions: accepted.map((s) => ({
          suggestionId: s.suggestionId,
          memoId: s.memoId,
          gapId: s.gapId,
          date: dateStr,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          originalDuration: s.originalDuration,
          acceptedAt: s.acceptedAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("[Schedule] Failed to sync accepted suggestions:", error);
    }
  },

  /**
   * Remove a synced accepted suggestion
   */
  async unsyncAcceptedSuggestion(suggestionId: string): Promise<void> {
    try {
      await removeAcceptedSuggestion({ suggestionId });
    } catch (error) {
      console.error("[Schedule] Failed to unsync accepted suggestion:", error);
    }
  },

  /**
   * Sync rejected memo IDs to the server
   */
  async syncRejectedMemos(): Promise<void> {
    const rejected = get(rejectedMemoIds);
    if (rejected.size === 0) return;

    try {
      await saveRejectedMemos({
        memoIds: Array.from(rejected),
      });
    } catch (error) {
      console.error("[Schedule] Failed to sync rejected memos:", error);
    }
  },

  /**
   * Clear all synced data (useful for testing or reset)
   */
  async clearSyncedData(): Promise<void> {
    try {
      await clearSyncedAcceptedSuggestions({});
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
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    // Clean up accepted suggestions from previous days
    // Note: We don't have a date field in local AcceptedSuggestion,
    // so we need to check if the suggestion's time has passed
    const currentTime = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;

    acceptedSuggestions.update((list) => {
      const before = list.length;
      // Remove suggestions whose end time is in the past
      const filtered = list.filter((s) => s.endTime > currentTime);
      if (filtered.length < before) {
        console.log(
          `[Schedule] Cleaned up ${before - filtered.length} expired accepted suggestions`,
        );
      }
      return filtered;
    });

    // Clean up moved suggestions whose end time has passed
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

  return JSON.stringify({
    scheduled,
    dropped,
    mandatoryDropped,
    totalScheduledMinutes: schedule.totalScheduledMinutes,
    totalDroppedMinutes: schedule.totalDroppedMinutes,
  });
}

/**
 * Find a scheduled block by memo ID
 */
export function findBlockByMemoId(memoId: string): ScheduledBlock | null {
  const result = get(scheduleResult);
  if (!result) return null;
  return result.scheduled.find((b) => b.memoId === memoId) ?? null;
}

/**
 * Check if a memo is scheduled
 */
export function isMemoScheduled(memoId: string): boolean {
  return findBlockByMemoId(memoId) !== null;
}

/**
 * Get all blocks for a specific gap
 */
export function getBlocksForGap(gapId: string): ScheduledBlock[] {
  const result = get(scheduleResult);
  if (!result) return [];
  return result.scheduled.filter((b) => b.gapId === gapId);
}
