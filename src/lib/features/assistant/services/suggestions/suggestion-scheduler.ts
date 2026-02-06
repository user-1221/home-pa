/**
 * @fileoverview Suggestion Scheduler Module
 *
 * Assigns suggestions to gaps using state-space search:
 * - Mandatory/optional partitioning
 * - Anchor placement for mandatory tasks
 * - Beam search with concave utility scoring
 * - Duration expansion levels per task
 *
 * Location matching uses string labels (handled by location-matching.ts).
 */

import type { Gap, Suggestion, LocationLabel } from "$lib/types.ts";
import { isLocationCompatible } from "./location-matching.ts";
import { MANDATORY_THRESHOLD } from "./suggestion-scoring.ts";
import {
  EXTENSION_CONFIG,
  GAP_CONFIG,
  SHRINK_CONFIG,
  SEARCH_CONFIG,
} from "$lib/features/assistant/config/suggestion-config.ts";
import type { MemoType } from "$lib/types.ts";

// ============================================================================
// TYPES
// ============================================================================

/**
 * A scheduled block representing a suggestion assigned to a gap
 */
export interface ScheduledBlock {
  suggestionId: string;
  memoId: string;
  gapId: string;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  duration: number; // minutes
}

/**
 * Result of scheduling operation
 */
export interface ScheduleResult {
  scheduled: ScheduledBlock[];
  dropped: Suggestion[];
  totalScheduledMinutes: number;
  totalDroppedMinutes: number;
  mandatoryDropped: Suggestion[]; // Warning: mandatory tasks that couldn't fit
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TOLERANCE = 1e-6;

/**
 * Constants from centralized config, re-exported for backward compatibility.
 * Other modules may import these from here.
 */
export const MINUTES_PER_DOT = GAP_CONFIG.minutesPerDot;
export const DOT_EDGE_MINUTES = GAP_CONFIG.dotEdgeMinutes;
export const DRAG_SNAP_MINUTES = GAP_CONFIG.dragSnapMinutes;
export const MIN_DOTS_FOR_DRAG = GAP_CONFIG.minDotsForDrag;

/**
 * Minimum duration for dragging, aligned to DRAG_SNAP_MINUTES.
 * Use this for UI constraints instead of calculateMinDurationForDots().
 */
export const MIN_DRAG_DURATION = GAP_CONFIG.minDragDuration;

/**
 * Configuration for duration extension when extra gap time is available.
 * Re-exported type for backward compatibility.
 */
export interface DurationExtensionConfig {
  enabled: boolean;
  minExtensionMinutes: number;
  maxExtensionFactor: number;
  extensionStepMinutes: number;
}

/**
 * Default extension config from centralized source.
 */
export const DEFAULT_EXTENSION_CONFIG: DurationExtensionConfig = {
  enabled: EXTENSION_CONFIG.enabled,
  minExtensionMinutes: EXTENSION_CONFIG.minExtraMinutes,
  maxExtensionFactor: EXTENSION_CONFIG.maxFactor,
  extensionStepMinutes: EXTENSION_CONFIG.stepMinutes,
};

// ============================================================================
// DOT CALCULATION UTILITIES
// ============================================================================

/**
 * Calculate minimum duration required to display N dots
 *
 * Used for drag constraints - 5 dots = 45 min minimum.
 *
 * Examples:
 * - 5 dots → 45 min minimum (for drag constraint)
 * - 3 dots → 25 min
 * - 1 dot → 5 min
 */
export function calculateMinDurationForDots(dotCount: number): number {
  if (dotCount <= 1) {
    return DOT_EDGE_MINUTES; // 5 min
  }
  // First dot: 5 min, then (N-1) intervals of 10 min each
  // Total: 5 + 10*(N-1) = 10*N - 5
  return dotCount * MINUTES_PER_DOT - DOT_EDGE_MINUTES;
}

/**
 * Snap a time value to the nearest DRAG_SNAP_MINUTES increment
 *
 * @param minutes - Time in minutes
 * @returns Snapped time in minutes
 */
export function snapToIncrement(minutes: number): number {
  return Math.round(minutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate score for sorting (need + importance)
 */
function calculateScore(suggestion: Suggestion): number {
  return Math.min(suggestion.need, 1.0) + Math.min(suggestion.importance, 1.0);
}

/**
 * Convert HH:mm time string to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HH:mm time string
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = Math.floor(minutes % 60);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Add minutes to a time string, returning new time string
 */
function addMinutesToTime(time: string, minutesToAdd: number): string {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

// ============================================================================
// PARTITIONING
// ============================================================================

/**
 * Partition suggestions into mandatory (need >= 1.0) and optional
 */
export function partitionSuggestions(suggestions: Suggestion[]): {
  mandatory: Suggestion[];
  optional: Suggestion[];
} {
  const mandatory: Suggestion[] = [];
  const optional: Suggestion[] = [];

  for (const s of suggestions) {
    if (s.need >= MANDATORY_THRESHOLD - TOLERANCE) {
      mandatory.push(s);
    } else {
      optional.push(s);
    }
  }

  return { mandatory, optional };
}

// ============================================================================
// SORTING
// ============================================================================

/**
 * Sort suggestions by priority (score = need + importance) descending
 */
export function sortByPriority(suggestions: Suggestion[]): Suggestion[] {
  return [...suggestions].sort((a, b) => calculateScore(b) - calculateScore(a));
}

// ============================================================================
// GAP ALLOCATION
// ============================================================================

/**
 * Check if a task type allows shrinking
 */
function canShrink(taskType: MemoType): boolean {
  return (SHRINK_CONFIG.allowedTypes as readonly string[]).includes(taskType);
}

// ============================================================================
// STATE-SPACE SEARCH SCHEDULER
// ============================================================================

/**
 * Allocation entry for a task in a gap
 */
interface TaskAllocation {
  suggestionId: string;
  memoId: string;
  duration: number;
}

/**
 * State of a single gap in the search
 */
interface GapState {
  gapId: string;
  start: string;
  end: string;
  totalDuration: number;
  allocations: TaskAllocation[];
  usedTime: number;
  locationLabel?: LocationLabel;
}

/**
 * Complete schedule state for search
 */
interface ScheduleState {
  gaps: GapState[];
  usedSuggestionIds: Set<string>;
  score: number;
}

/**
 * Calculate utility for a single task allocation using concave diminishing returns.
 *
 * Formula: U(t) = priority × (1 - e^(-α × t / ideal)) + β × priority × 𝟙[t ≥ ideal]
 *
 * @param allocatedTime - Time allocated to this task
 * @param idealDuration - Task's ideal duration (calculatedDuration for deadline, 2x base for others)
 * @param priority - Task priority (need + importance, capped)
 * @returns Utility value for this allocation
 */
export function taskUtility(
  allocatedTime: number,
  idealDuration: number,
  priority: number,
): number {
  if (allocatedTime <= 0 || idealDuration <= 0) return 0;

  const { alpha, finishBonus, maxPriority, durationNeedBonus } = SEARCH_CONFIG;
  const cappedPriority = Math.min(priority, maxPriority);

  // Saturating exponential: fast early gains, diminishing returns
  const saturation = 1 - Math.exp((-alpha * allocatedTime) / idealDuration);
  let utility = cappedPriority * saturation;

  // Small bonus for "completing" the task (reaching ideal duration)
  if (allocatedTime >= idealDuration) {
    utility += finishBonus * cappedPriority;
  }

  // Duration-need scaling: longer ideal = higher utility per progress unit
  const durationScale = 1 + durationNeedBonus * (idealDuration / 60);
  utility *= durationScale;

  return utility;
}

/**
 * Get the ideal (max) duration for a suggestion based on type.
 * For all types, `suggestion.duration` is the intended session length:
 * - Deadline: regression-predicted ideal duration
 * - Routine/Backlog: same as baseDuration (no extension beyond ideal)
 */
function getIdealDuration(suggestion: Suggestion): number {
  return suggestion.duration;
}

/**
 * Calculate the score for a complete schedule state.
 *
 * Score = Σ taskUtility - switchPenalty - unusedPenalty
 */
function scoreScheduleState(
  state: ScheduleState,
  suggestions: Suggestion[],
): number {
  const { switchCost, unusedCost } = SEARCH_CONFIG;
  const suggestionMap = new Map(suggestions.map((s) => [s.id, s]));

  let totalUtility = 0;
  let totalSwitchPenalty = 0;
  let totalUnusedPenalty = 0;

  for (const gap of state.gaps) {
    // Calculate utility for each task in this gap
    for (const alloc of gap.allocations) {
      const suggestion = suggestionMap.get(alloc.suggestionId);
      if (!suggestion) continue;

      const priority = suggestion.need + suggestion.importance;
      const idealDuration = getIdealDuration(suggestion);
      totalUtility += taskUtility(alloc.duration, idealDuration, priority);
    }

    // Context-switching penalty
    if (gap.allocations.length > 1) {
      totalSwitchPenalty += switchCost * (gap.allocations.length - 1);
    }

    // Unused time penalty
    const unusedTime = gap.totalDuration - gap.usedTime;
    if (unusedTime > 0) {
      totalUnusedPenalty += unusedCost * unusedTime;
    }
  }

  return totalUtility - totalSwitchPenalty - totalUnusedPenalty;
}

/**
 * Create initial empty state from gaps
 */
function createEmptyState(gaps: Gap[]): ScheduleState {
  return {
    gaps: gaps.map((g) => ({
      gapId: g.gapId,
      start: g.start,
      end: g.end,
      totalDuration: g.duration,
      allocations: [],
      usedTime: 0,
      locationLabel: g.locationLabel,
    })),
    usedSuggestionIds: new Set(),
    score: 0,
  };
}

/**
 * Clone a schedule state (immutable update helper)
 * IMPORTANT: Deep copies allocations to prevent mutation across branches
 */
function cloneState(state: ScheduleState): ScheduleState {
  return {
    gaps: state.gaps.map((g) => ({
      ...g,
      // Deep copy each allocation object to prevent shared mutation
      allocations: g.allocations.map((a) => ({ ...a })),
    })),
    usedSuggestionIds: new Set(state.usedSuggestionIds),
    score: state.score,
  };
}

/**
 * Get expansion levels for a task in a gap.
 * Tries 20%, 40%, 60%, 80%, 100% of gap (capped at ideal duration).
 */
function getTaskExpansionLevels(
  gapRemaining: number,
  baseDuration: number,
  idealDuration: number,
): number[] {
  const { expansionLevels } = SEARCH_CONFIG;
  const stepMinutes = SHRINK_CONFIG.stepMinutes;

  // Generate levels as percentages of gap
  const levels: number[] = [];
  for (const pct of expansionLevels) {
    let duration = Math.floor(gapRemaining * pct);
    // Snap to step grid
    duration = Math.floor(duration / stepMinutes) * stepMinutes;
    // Cap at ideal duration
    duration = Math.min(duration, idealDuration);
    // Must be at least base duration
    if (duration >= baseDuration) {
      levels.push(duration);
    }
  }

  // Remove duplicates and sort
  return [...new Set(levels)].sort((a, b) => a - b);
}

/**
 * Get valid gap indices for a suggestion (gaps where it can fit by baseDuration).
 * Note: We only use location matching here, not duration, because
 * duration check is done manually with effectiveBase (baseDuration for shrinkable tasks)
 */
function getValidGapIndices(
  suggestion: Suggestion,
  gaps: Gap[],
  currentUsedTime: number[],
): number[] {
  const effectiveBase = canShrink(suggestion.type)
    ? suggestion.baseDuration
    : suggestion.duration;

  const validIndices: number[] = [];
  for (let i = 0; i < gaps.length; i++) {
    const remaining = gaps[i].duration - currentUsedTime[i];
    // Duration check: does effectiveBase fit in remaining space?
    if (remaining >= effectiveBase) {
      // Location check only (not duration - we handle that above)
      if (
        isLocationCompatible(
          suggestion.locationPreference,
          gaps[i].locationLabel,
        )
      ) {
        validIndices.push(i);
      }
    }
  }
  return validIndices;
}

/**
 * Recursively generate all valid placement combinations for mandatory tasks.
 * Each task can go to any valid gap (where it fits by baseDuration).
 * Multiple tasks can share the same gap if they fit together.
 */
function generatePlacementCombinations(
  mandatory: Suggestion[],
  gaps: Gap[],
  taskIndex: number,
  currentUsedTime: number[],
  currentPlacements: Array<{ suggestionId: string; gapIndex: number }>,
): Array<Array<{ suggestionId: string; gapIndex: number }>> {
  // Base case: all tasks placed
  if (taskIndex >= mandatory.length) {
    return [currentPlacements];
  }

  const task = mandatory[taskIndex];
  const effectiveBase = canShrink(task.type)
    ? task.baseDuration
    : task.duration;

  // Get valid gaps for this task
  const validGapIndices = getValidGapIndices(task, gaps, currentUsedTime);

  // If no valid gaps, this task can't be placed - return current placements without it
  if (validGapIndices.length === 0) {
    return generatePlacementCombinations(
      mandatory,
      gaps,
      taskIndex + 1,
      currentUsedTime,
      currentPlacements,
    );
  }

  const allCombinations: Array<
    Array<{ suggestionId: string; gapIndex: number }>
  > = [];

  // Try placing task in each valid gap
  for (const gapIndex of validGapIndices) {
    const newUsedTime = [...currentUsedTime];
    newUsedTime[gapIndex] += effectiveBase;

    const newPlacements = [
      ...currentPlacements,
      { suggestionId: task.id, gapIndex },
    ];

    const combinations = generatePlacementCombinations(
      mandatory,
      gaps,
      taskIndex + 1,
      newUsedTime,
      newPlacements,
    );
    allCombinations.push(...combinations);
  }

  return allCombinations;
}

/**
 * Generate all valid anchor placement states.
 * Instead of fixed one-per-gap, this tries all valid combinations.
 *
 * Limits:
 * - Max 64 combinations (to prevent explosion with many mandatory tasks/gaps)
 * - Falls back to greedy placement if over limit
 */
function generateAnchorPlacements(
  suggestions: Suggestion[],
  gaps: Gap[],
): {
  states: ScheduleState[];
  remainingSuggestions: Suggestion[];
} {
  const sorted = sortByPriority(suggestions);
  const mandatory = sorted.filter((s) => s.need >= MANDATORY_THRESHOLD);

  // No mandatory tasks - just return empty state
  if (mandatory.length === 0) {
    return {
      states: [createEmptyState(gaps)],
      remainingSuggestions: suggestions,
    };
  }

  // Generate all placement combinations
  const initialUsedTime = gaps.map(() => 0);
  const allCombinations = generatePlacementCombinations(
    mandatory,
    gaps,
    0,
    initialUsedTime,
    [],
  );

  // Limit combinations to prevent explosion
  const MAX_COMBINATIONS = 64;
  const limitedCombinations =
    allCombinations.length > MAX_COMBINATIONS
      ? allCombinations.slice(0, MAX_COMBINATIONS)
      : allCombinations;

  // Convert combinations to states
  const states: ScheduleState[] = [];

  for (const placements of limitedCombinations) {
    const state = createEmptyState(gaps);

    for (const { suggestionId, gapIndex } of placements) {
      const suggestion = mandatory.find((s) => s.id === suggestionId);
      if (!suggestion) continue;

      const effectiveBase = canShrink(suggestion.type)
        ? suggestion.baseDuration
        : suggestion.duration;

      state.gaps[gapIndex].allocations.push({
        suggestionId: suggestion.id,
        memoId: suggestion.memoId,
        duration: effectiveBase,
      });
      state.gaps[gapIndex].usedTime += effectiveBase;
      state.usedSuggestionIds.add(suggestion.id);
    }

    states.push(state);
  }

  // If no valid combinations found, return empty state
  if (states.length === 0) {
    states.push(createEmptyState(gaps));
  }

  // Remaining suggestions (including unplaced mandatory)
  const placedIds = new Set(
    limitedCombinations.flatMap((c) => c.map((p) => p.suggestionId)),
  );
  const remaining = suggestions.filter((s) => !placedIds.has(s.id));

  return { states, remainingSuggestions: remaining };
}

/**
 * Generate all expansion branches for anchored tasks in a gap.
 * Each anchor can stay at base or expand to various levels.
 */
function generateExpandBranches(
  state: ScheduleState,
  gapIndex: number,
  suggestions: Suggestion[],
): ScheduleState[] {
  const gap = state.gaps[gapIndex];
  if (gap.allocations.length === 0) {
    return [state]; // No anchors, return unchanged
  }

  const suggestionMap = new Map(suggestions.map((s) => [s.id, s]));
  let currentBranches: ScheduleState[] = [state];

  // For each anchor, branch on expansion levels
  for (let i = 0; i < gap.allocations.length; i++) {
    const nextBranches: ScheduleState[] = [];
    const alloc = gap.allocations[i];
    const suggestion = suggestionMap.get(alloc.suggestionId);
    if (!suggestion) {
      nextBranches.push(...currentBranches);
      continue;
    }

    const baseDuration = canShrink(suggestion.type)
      ? suggestion.baseDuration
      : suggestion.duration;
    const idealDuration = getIdealDuration(suggestion);

    for (const branch of currentBranches) {
      const branchGap = branch.gaps[gapIndex];
      const otherAllocTime = branchGap.allocations
        .filter((a) => a.suggestionId !== alloc.suggestionId)
        .reduce((sum, a) => sum + a.duration, 0);
      const gapRemaining = branchGap.totalDuration - otherAllocTime;

      const levels = getTaskExpansionLevels(
        gapRemaining,
        baseDuration,
        idealDuration,
      );

      // If no valid levels, keep current duration
      if (levels.length === 0) {
        nextBranches.push(branch);
        continue;
      }

      // Create a branch for each expansion level
      for (const duration of levels) {
        const newState = cloneState(branch);
        const newAlloc = newState.gaps[gapIndex].allocations.find(
          (a) => a.suggestionId === alloc.suggestionId,
        );
        if (newAlloc) {
          const oldDuration = newAlloc.duration;
          newAlloc.duration = duration;
          newState.gaps[gapIndex].usedTime += duration - oldDuration;
        }
        nextBranches.push(newState);
      }
    }

    currentBranches = nextBranches;
  }

  return currentBranches;
}

/**
 * Generate fill branches: add more tasks or leave gap as-is.
 * Recursively adds tasks until gap is full or no more tasks fit.
 */
function generateFillBranches(
  state: ScheduleState,
  gapIndex: number,
  availableSuggestions: Suggestion[],
  maxDepth: number = 10, // Prevent infinite recursion
): ScheduleState[] {
  if (maxDepth <= 0) return [state];

  const gap = state.gaps[gapIndex];
  const remaining = gap.totalDuration - gap.usedTime;

  // Filter to suggestions that can fit
  // Note: We check effectiveBase (baseDuration for shrinkable tasks) instead of
  // suggestion.duration, because shrinkable tasks can fit in smaller spaces.
  const candidates = availableSuggestions.filter((s) => {
    if (state.usedSuggestionIds.has(s.id)) return false;

    const effectiveBase = canShrink(s.type) ? s.baseDuration : s.duration;
    if (remaining < effectiveBase) return false;

    // Location check only (duration is handled above with effectiveBase)
    return isLocationCompatible(s.locationPreference, gap.locationLabel);
  });

  if (candidates.length === 0) {
    return [state]; // No more tasks can fit
  }

  const branches: ScheduleState[] = [state]; // Always include "skip" option

  // Try adding each candidate
  for (const candidate of candidates) {
    const baseDuration = canShrink(candidate.type)
      ? candidate.baseDuration
      : candidate.duration;
    const idealDuration = getIdealDuration(candidate);
    const levels = getTaskExpansionLevels(
      remaining,
      baseDuration,
      idealDuration,
    );

    for (const duration of levels) {
      const newState = cloneState(state);
      newState.gaps[gapIndex].allocations.push({
        suggestionId: candidate.id,
        memoId: candidate.memoId,
        duration,
      });
      newState.gaps[gapIndex].usedTime += duration;
      newState.usedSuggestionIds.add(candidate.id);

      // Recursively try to fill more
      const remainingCandidates = candidates.filter(
        (c) => c.id !== candidate.id,
      );
      const recursiveBranches = generateFillBranches(
        newState,
        gapIndex,
        remainingCandidates,
        maxDepth - 1,
      );
      branches.push(...recursiveBranches);
    }
  }

  return branches;
}

/**
 * Prune candidates to top-K by score (beam search).
 */
function pruneToTopK(
  states: ScheduleState[],
  suggestions: Suggestion[],
  k: number,
): ScheduleState[] {
  // Score all states
  for (const state of states) {
    state.score = scoreScheduleState(state, suggestions);
  }

  // Sort by score descending and keep top-K
  states.sort((a, b) => b.score - a.score);
  return states.slice(0, k);
}

/**
 * Convert a schedule state to scheduled blocks.
 * Validates that total duration doesn't exceed gap bounds.
 */
function stateToBlocks(
  state: ScheduleState,
  originalGaps?: Gap[],
): ScheduledBlock[] {
  const blocks: ScheduledBlock[] = [];
  const gapMap = originalGaps
    ? new Map(originalGaps.map((g) => [g.gapId, g]))
    : null;

  for (const gap of state.gaps) {
    let currentTime = gap.start;
    const gapEndMinutes = timeToMinutes(gap.end);

    for (const alloc of gap.allocations) {
      const startMinutes = timeToMinutes(currentTime);
      let duration = alloc.duration;

      // Validate: don't exceed gap end time
      if (startMinutes + duration > gapEndMinutes) {
        // Cap duration to fit within gap
        duration = Math.max(0, gapEndMinutes - startMinutes);
        if (duration <= 0) continue; // Skip if no time left
      }

      const endTime = addMinutesToTime(currentTime, duration);
      blocks.push({
        suggestionId: alloc.suggestionId,
        memoId: alloc.memoId,
        gapId: gap.gapId,
        startTime: currentTime,
        endTime,
        duration,
      });
      currentTime = endTime;
    }
  }

  return blocks;
}

/**
 * Main state-space search scheduler.
 *
 * Algorithm:
 * 1. Generate all valid anchor placements (mandatory tasks across gaps)
 * 2. For each placement, run state-space search:
 *    a. Generate expand branches (anchor duration options)
 *    b. Generate fill branches (add more tasks)
 *    c. Prune to top-K candidates (beam search)
 * 3. Combine results from all placements, pick best overall
 */
export function scheduleWithStateSearch(
  suggestions: Suggestion[],
  gaps: Gap[],
): ScheduleResult {
  const { beamWidth } = SEARCH_CONFIG;

  // Initialize result
  const result: ScheduleResult = {
    scheduled: [],
    dropped: [],
    totalScheduledMinutes: 0,
    totalDroppedMinutes: 0,
    mandatoryDropped: [],
  };

  // Handle empty inputs
  if (gaps.length === 0 || suggestions.length === 0) {
    result.dropped = [...suggestions];
    result.totalDroppedMinutes = suggestions.reduce(
      (sum, s) => sum + s.duration,
      0,
    );
    result.mandatoryDropped = suggestions.filter(
      (s) => s.need >= MANDATORY_THRESHOLD - TOLERANCE,
    );
    return result;
  }

  // Dynamic task limit: only consider as many tasks as could fit in available gaps
  const totalGapMinutes = gaps.reduce((sum, g) => sum + g.duration, 0);
  const maxTasks = Math.floor(totalGapMinutes / 30);
  const capped = sortByPriority(suggestions).slice(0, maxTasks);

  // Phase 1: Generate all valid anchor placements
  const { states: anchorStates, remainingSuggestions } =
    generateAnchorPlacements(capped, gaps);

  // Phase 2: State-space search starting from each anchor placement
  let candidates: ScheduleState[] = [...anchorStates];

  for (let gapIndex = 0; gapIndex < gaps.length; gapIndex++) {
    const nextCandidates: ScheduleState[] = [];

    for (const state of candidates) {
      // Generate expansion branches for anchored tasks
      const expandBranches = generateExpandBranches(state, gapIndex, capped);

      // Generate fill branches for each expansion
      for (const branch of expandBranches) {
        const fillBranches = generateFillBranches(
          branch,
          gapIndex,
          remainingSuggestions,
        );
        nextCandidates.push(...fillBranches);
      }
    }

    // Prune to top-K (beam search)
    candidates = pruneToTopK(nextCandidates, capped, beamWidth);
  }

  // Pick best final state
  if (candidates.length === 0) {
    result.dropped = [...capped];
    result.totalDroppedMinutes = capped.reduce((sum, s) => sum + s.duration, 0);
    result.mandatoryDropped = capped.filter(
      (s) => s.need >= MANDATORY_THRESHOLD - TOLERANCE,
    );
    return result;
  }

  // Final scoring and selection
  candidates = pruneToTopK(candidates, capped, 1);
  const bestState = candidates[0];

  // Convert to blocks (with duration validation)
  result.scheduled = stateToBlocks(bestState, gaps);

  // Calculate dropped
  const scheduledIds = new Set(result.scheduled.map((b) => b.suggestionId));
  result.dropped = capped.filter((s) => !scheduledIds.has(s.id));
  result.mandatoryDropped = result.dropped.filter(
    (s) => s.need >= MANDATORY_THRESHOLD - TOLERANCE,
  );

  // Calculate totals
  result.totalScheduledMinutes = result.scheduled.reduce(
    (sum, b) => sum + b.duration,
    0,
  );
  result.totalDroppedMinutes = result.dropped.reduce(
    (sum, s) => sum + s.duration,
    0,
  );

  // Sort by time
  result.scheduled.sort((a, b) => {
    const gapCompare = a.gapId.localeCompare(b.gapId);
    if (gapCompare !== 0) return gapCompare;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  return result;
}

// ============================================================================
// MAIN SCHEDULER
// ============================================================================

/**
 * Scheduler options
 */
export interface SchedulerOptions {
  /** Duration extension config (extend sessions when extra gap time available) */
  durationExtension?: Partial<DurationExtensionConfig>;
}

/**
 * Schedule suggestions into gaps using state-space search
 *
 * Algorithm:
 * 1. Cap suggestions to dynamic limit (totalGapDuration / 30)
 * 2. Generate anchor placements for mandatory tasks
 * 3. Expand anchors and fill remaining gaps via beam search
 * 4. Pick best schedule by concave utility scoring
 *
 * @param suggestions - All suggestions to schedule
 * @param gaps - Available gaps (should be time-sorted)
 * @param _options - Scheduler options (reserved for future use)
 */
export function scheduleSuggestions(
  suggestions: Suggestion[],
  gaps: Gap[],
  _options: SchedulerOptions = {},
): ScheduleResult {
  return scheduleWithStateSearch(suggestions, gaps);
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export { calculateScore, timeToMinutes, minutesToTime, addMinutesToTime };
