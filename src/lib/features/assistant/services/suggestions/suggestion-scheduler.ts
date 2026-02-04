/**
 * @fileoverview Suggestion Scheduler Module
 *
 * Assigns suggestions to gaps using:
 * - Mandatory/optional partitioning
 * - Knapsack DP for optimal subset selection
 * - Permutation enumeration for optimal ordering
 * - Greedy gap assignment
 *
 * Simplified from Python version: no coordinates or travel time calculations.
 * Location matching uses string labels (handled by location-matching.ts).
 */

import type { Gap, Suggestion, LocationLabel } from "$lib/types.ts";
import { canFit } from "./location-matching.ts";
import { MANDATORY_THRESHOLD } from "./suggestion-scoring.ts";
import {
  EXTENSION_CONFIG,
  GAP_CONFIG,
  SHRINK_CONFIG,
  EXTENSION_TIERS,
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
  permutationsEvaluated: number;
  mandatoryDropped: Suggestion[]; // Warning: mandatory tasks that couldn't fit
}

/**
 * Mutable gap for tracking remaining capacity during scheduling
 */
interface MutableGap {
  gapId: string;
  start: string;
  end: string;
  duration: number;
  remaining: number; // Remaining capacity in minutes
  locationLabel?: LocationLabel;
  currentStartTime: string; // Tracks where next block should start
}

/**
 * Allocation state for tracking progress through gaps
 */
interface _AllocationState {
  gaps: MutableGap[];
  currentGapIndex: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PERMUTATION_LIMIT = 8;
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
// KNAPSACK SELECTION
// ============================================================================

/**
 * Select optimal subset of suggestions using 0/1 Knapsack DP
 * Maximizes total score under capacity constraint
 *
 * @param suggestions - Candidate suggestions
 * @param capacityMinutes - Available time capacity
 * @param resolutionMinutes - Discretization resolution (default 1 minute)
 * @returns Selected suggestions sorted by score descending
 */
export function knapsackSelect(
  suggestions: Suggestion[],
  capacityMinutes: number,
  resolutionMinutes: number = 1.0,
): Suggestion[] {
  if (capacityMinutes <= TOLERANCE || suggestions.length === 0) {
    return [];
  }

  const items = [...suggestions];
  const n = items.length;

  // Convert to integer DP units
  const W = Math.max(0, Math.round(capacityMinutes / resolutionMinutes));
  const weights = items.map((s) =>
    Math.max(1, Math.round(s.duration / resolutionMinutes)),
  );
  const values = items.map((s) => calculateScore(s));

  // DP table: dp[w] = max score achievable with capacity w
  const dp: number[] = new Array(W + 1).fill(0);
  // Track which items are taken at each capacity
  const take: boolean[][] = Array.from({ length: n }, () =>
    new Array(W + 1).fill(false),
  );

  // Fill DP table
  for (let i = 0; i < n; i++) {
    const wi = weights[i];
    const vi = values[i];
    // Iterate backwards to avoid reusing items
    for (let w = W; w >= wi; w--) {
      const candidate = dp[w - wi] + vi;
      if (candidate > dp[w]) {
        dp[w] = candidate;
        take[i][w] = true;
      }
    }
  }

  // Backtrack to find chosen items
  let w = W;
  const chosen: Suggestion[] = [];
  for (let i = n - 1; i >= 0; i--) {
    if (take[i][w]) {
      chosen.push(items[i]);
      w -= weights[i];
    }
  }

  // Sort by score descending
  return chosen.sort((a, b) => calculateScore(b) - calculateScore(a));
}

// ============================================================================
// PERMUTATION ENUMERATION
// ============================================================================

/**
 * Generate all permutations of an array
 */
function* permutations<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) {
    yield [...arr];
    return;
  }

  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [arr[i], ...perm];
    }
  }
}

/**
 * Evaluate a specific ordering of suggestions against gaps
 * Returns number of suggestions that can be scheduled (higher = better)
 *
 * Since we don't have travel time, we just check if suggestions fit in order
 * Can extend duration when gaps have extra room
 */
function evaluateOrder(
  order: Suggestion[],
  gaps: MutableGap[],
  extensionConfig: DurationExtensionConfig = DEFAULT_EXTENSION_CONFIG,
): { schedulable: number; totalDuration: number } {
  // Clone gaps for simulation
  const simGaps = gaps.map((g) => ({ ...g }));
  const gapIndex = 0;
  let schedulable = 0;
  let totalDuration = 0;

  for (const suggestion of order) {
    // Find a gap that can fit this suggestion
    let found = false;
    for (let i = gapIndex; i < simGaps.length; i++) {
      const gap = simGaps[i];

      // Calculate effective duration (with shrinking support for deadline tasks)
      const effectiveDuration = calculateEffectiveDurationWithShrink({
        calculatedDuration: suggestion.duration,
        baseDuration: suggestion.baseDuration,
        availableTime: gap.remaining,
        taskType: suggestion.type,
      });

      // Skip if can't fit
      if (effectiveDuration <= 0) {
        continue;
      }

      // Check location compatibility
      const tempGap: Gap = {
        gapId: gap.gapId,
        start: gap.currentStartTime,
        end: gap.end,
        duration: gap.remaining,
        locationLabel: gap.locationLabel,
      };
      if (canFit(suggestion, tempGap)) {
        // Can fit here
        gap.remaining -= effectiveDuration;
        gap.currentStartTime = addMinutesToTime(
          gap.currentStartTime,
          effectiveDuration,
        );
        schedulable++;
        totalDuration += effectiveDuration;
        found = true;
        break;
      }
    }
    if (!found) {
      // This suggestion can't be scheduled
      break;
    }
  }

  return { schedulable, totalDuration };
}

/**
 * Find the best ordering of suggestions via permutation enumeration
 *
 * @param suggestions - Suggestions to order
 * @param gaps - Available gaps
 * @param permutationLimit - Max suggestions to permute (factorial explosion protection)
 * @param extensionConfig - Duration extension/shrinking config
 * @returns Best order and number of permutations evaluated
 */
export function enumerateBestOrder(
  suggestions: Suggestion[],
  gaps: MutableGap[],
  permutationLimit: number = DEFAULT_PERMUTATION_LIMIT,
  extensionConfig: DurationExtensionConfig = DEFAULT_EXTENSION_CONFIG,
): { order: Suggestion[]; permutationsChecked: number } {
  const n = suggestions.length;

  if (n === 0) {
    return { order: [], permutationsChecked: 0 };
  }

  // If too many suggestions, just use priority sort (can't enumerate)
  if (n > permutationLimit) {
    console.warn(
      `Permutation limit exceeded: ${n} > ${permutationLimit}. Using priority sort.`,
    );
    return { order: sortByPriority(suggestions), permutationsChecked: 0 };
  }

  let bestOrder: Suggestion[] = [...suggestions];
  let bestScore = -1;
  let permutationsChecked = 0;

  for (const perm of permutations(suggestions)) {
    permutationsChecked++;
    const { schedulable, totalDuration } = evaluateOrder(
      perm,
      gaps,
      extensionConfig,
    );
    // Score: prioritize more schedulable, then more duration
    const score = schedulable * 10000 + totalDuration;
    if (score > bestScore) {
      bestScore = score;
      bestOrder = perm;
    }
  }

  return { order: bestOrder, permutationsChecked };
}

// ============================================================================
// GAP ALLOCATION
// ============================================================================

/**
 * Create mutable gaps from immutable gaps
 */
function createMutableGaps(gaps: Gap[]): MutableGap[] {
  return gaps.map((g) => ({
    gapId: g.gapId,
    start: g.start,
    end: g.end,
    duration: g.duration,
    remaining: g.duration,
    locationLabel: g.locationLabel,
    currentStartTime: g.start,
  }));
}

/**
 * Calculate total remaining capacity across all gaps
 */
function totalRemainingCapacity(gaps: MutableGap[]): number {
  return gaps.reduce((sum, g) => sum + g.remaining, 0);
}

/**
 * Parameters for calculating effective duration with shrinking support
 */
export interface EffectiveDurationParams {
  /** Calculated duration (may be extended by regression for deadline tasks) */
  calculatedDuration: number;
  /** Original sessionDuration - shrink floor for deadline tasks */
  baseDuration: number;
  /** Available gap time in minutes */
  availableTime: number;
  /** Task type - determines if shrinking is allowed */
  taskType: MemoType;
}

/**
 * Calculate effective duration for a single task with shrinking support.
 * Used for UI operations like drag where multi-task allocation isn't needed.
 *
 * - Deadline tasks can shrink down to baseDuration
 * - Routine/backlog tasks cannot shrink (use full duration or skip)
 * - All tasks can extend up to 2x when extra gap time is available
 *
 * @returns Effective duration, or 0 if can't fit
 */
export function calculateEffectiveDurationWithShrink(
  params: EffectiveDurationParams,
): number {
  const { calculatedDuration, baseDuration, availableTime, taskType } = params;

  // Determine shrink floor based on task type
  const shrinkAllowed = canShrink(taskType);
  const floor = shrinkAllowed ? baseDuration : calculatedDuration;

  // Case 1: Gap too small even for shrunk duration → can't fit
  if (availableTime < floor) {
    return 0;
  }

  // Case 2: Gap smaller than calculated but above floor → shrink with snapping
  if (availableTime < calculatedDuration) {
    const snapped =
      Math.floor(availableTime / SHRINK_CONFIG.stepMinutes) *
      SHRINK_CONFIG.stepMinutes;
    return snapped >= floor ? snapped : 0;
  }

  // Case 3: Gap equals or exceeds calculated → check for extension
  if (!EXTENSION_CONFIG.enabled) return calculatedDuration;

  const extraTime = availableTime - calculatedDuration;
  if (extraTime < EXTENSION_CONFIG.minExtraMinutes) {
    return calculatedDuration;
  }

  // Calculate extension
  const maxExtended = Math.floor(
    calculatedDuration * EXTENSION_CONFIG.maxFactor,
  );
  const extensionSteps = Math.floor(extraTime / EXTENSION_CONFIG.stepMinutes);
  const extension = extensionSteps * EXTENSION_CONFIG.stepMinutes;

  return Math.min(calculatedDuration + extension, maxExtended, availableTime);
}

/**
 * Calculate effective duration based on available gap time (legacy version).
 * Can EXTEND duration when extra time is available.
 *
 * @deprecated Use calculateEffectiveDurationWithShrink for shrinking support
 * @param baseDuration - Original/ideal session duration in minutes
 * @param availableTime - Remaining gap time in minutes
 * @param config - Extension configuration
 * @returns Effective duration (extended or base), or 0 if can't fit
 */
export function calculateEffectiveDuration(
  baseDuration: number,
  availableTime: number,
  config: DurationExtensionConfig = DEFAULT_EXTENSION_CONFIG,
): number {
  // If gap is smaller than base duration, can't fit
  if (availableTime < baseDuration) {
    return 0;
  }

  // Gap equals or exceeds base duration - check for extension
  if (!config.enabled) return baseDuration;

  // Check if there's enough extra time for extension
  const extraTime = availableTime - baseDuration;
  if (extraTime < config.minExtensionMinutes) {
    return baseDuration;
  }

  // Calculate max extended duration based on factor
  const maxExtended = Math.floor(baseDuration * config.maxExtensionFactor);

  // Calculate how many extension steps we can add
  const extensionSteps = Math.floor(extraTime / config.extensionStepMinutes);
  const extension = extensionSteps * config.extensionStepMinutes;

  // Return extended duration, capped at max and available time
  const extended = Math.min(
    baseDuration + extension,
    maxExtended,
    availableTime,
  );

  return extended;
}

// ============================================================================
// MULTI-TASK ALLOCATION WITH SHRINKING
// ============================================================================

/**
 * Result of allocating multiple suggestions to a single gap
 */
export interface AllocationResult {
  /** Map from suggestionId to allocated duration */
  allocations: Map<string, number>;
  /** Suggestions that couldn't fit in this gap */
  dropped: Suggestion[];
}

/**
 * Check if a task type allows shrinking
 */
function canShrink(taskType: MemoType): boolean {
  return (SHRINK_CONFIG.allowedTypes as readonly string[]).includes(taskType);
}

/**
 * Allocate durations for multiple suggestions competing for a single gap.
 * Uses two-phase algorithm:
 *
 * Phase 1: Selection (by baseDuration)
 * - Sort tasks by need + importance (descending)
 * - Include tasks greedily while sum(baseDuration) <= gapDuration
 * - Tasks whose baseDuration doesn't fit are skipped
 *
 * Phase 2: Tiered Extension
 * - After base allocation, distribute remaining time in priority tiers
 * - Tier 1: mandatory (need >= 1.0)
 * - Tier 2: high (need >= 0.75)
 * - Tier 3: normal (need >= 0.5)
 *
 * @param suggestions - Suggestions sorted by priority (need + importance)
 * @param gapDuration - Available gap time in minutes
 * @returns Allocation result with duration map and dropped suggestions
 */
export function allocateDurationsToGap(
  suggestions: Suggestion[],
  gapDuration: number,
): AllocationResult {
  const allocations = new Map<string, number>();
  const dropped: Suggestion[] = [];

  // Phase 1: Selection by baseDuration
  const selected: Suggestion[] = [];
  let totalBase = 0;

  for (const s of suggestions) {
    // Only deadline tasks can shrink; others use calculated duration as base
    const effectiveBase = canShrink(s.type) ? s.baseDuration : s.duration;

    if (totalBase + effectiveBase <= gapDuration) {
      selected.push(s);
      totalBase += effectiveBase;
      allocations.set(s.id, effectiveBase); // Start with base
    } else {
      dropped.push(s);
    }
  }

  // Phase 2: Tiered Extension
  // Extend each task up to its calculatedDuration (no snapping for restore)
  // Snapping only applies when extending BEYOND calculatedDuration
  let remaining = gapDuration - totalBase;

  // Process tiers in priority order: mandatory → high → normal
  const tierThresholds = [
    { threshold: EXTENSION_TIERS.mandatory, isTop: true },
    { threshold: EXTENSION_TIERS.high, isTop: false },
    { threshold: EXTENSION_TIERS.normal, isTop: false },
  ];

  for (let i = 0; i < tierThresholds.length && remaining > 0; i++) {
    const { threshold, isTop } = tierThresholds[i];

    // Collect tasks in this tier
    const tierTasks = selected.filter((s) => {
      if (isTop) return s.need >= threshold;
      return s.need >= threshold && s.need < tierThresholds[i - 1].threshold;
    });

    if (tierTasks.length === 0) continue;

    // Calculate wanted extension for each task in tier (up to calculatedDuration)
    const wanted = tierTasks.map((s) => {
      const currentAlloc = allocations.get(s.id) ?? s.baseDuration;
      return {
        suggestion: s,
        want: Math.max(0, s.duration - currentAlloc), // How much more to reach calculated
      };
    });

    const totalWanted = wanted.reduce((sum, w) => sum + w.want, 0);
    if (totalWanted <= 0) continue;

    // Distribute proportionally (no snapping - we're restoring to calculated, not extending beyond)
    const toDistribute = Math.min(remaining, totalWanted);
    const ratio = toDistribute / totalWanted;

    for (const { suggestion, want } of wanted) {
      // Give proportional share without snapping
      // This is restoring toward calculatedDuration, not extending beyond
      const extension = Math.floor(want * ratio);
      const current = allocations.get(suggestion.id) ?? suggestion.baseDuration;
      allocations.set(suggestion.id, current + extension);
    }

    remaining -= toDistribute;
  }

  // Final snap: Ensure all allocations are on the step grid
  // Only snap down if it keeps us above the effective base
  for (const s of selected) {
    const current = allocations.get(s.id) ?? 0;
    const effectiveBase = canShrink(s.type) ? s.baseDuration : s.duration;
    const snapped =
      Math.floor(current / SHRINK_CONFIG.stepMinutes) *
      SHRINK_CONFIG.stepMinutes;

    // Only use snapped if it's >= base, otherwise keep current
    if (snapped >= effectiveBase) {
      allocations.set(s.id, snapped);
    }
    // If snapping would go below base, keep the unsnapped value
    // (this can happen with odd proportional distributions)
  }

  return { allocations, dropped };
}

/**
 * Assign an ordered list of suggestions to gaps using shrink-extend algorithm.
 * Processes gaps one by one, fitting as many suggestions as possible into each.
 *
 * For each gap:
 * 1. Filter suggestions by location compatibility
 * 2. Use allocateDurationsToGap to determine which fit and their durations
 * 3. Create blocks for allocated suggestions
 * 4. Continue to next gap with remaining suggestions
 *
 * @param orderedSuggestions - Suggestions sorted by priority (need + importance)
 * @param gaps - Mutable gaps to assign into
 * @param _extensionConfig - Deprecated, extension is now handled by allocateDurationsToGap
 */
export function assignOrderToGaps(
  orderedSuggestions: Suggestion[],
  gaps: MutableGap[],
  _extensionConfig: DurationExtensionConfig = DEFAULT_EXTENSION_CONFIG,
): { blocks: ScheduledBlock[]; dropped: Suggestion[] } {
  const blocks: ScheduledBlock[] = [];
  let remainingSuggestions = [...orderedSuggestions];

  for (const gap of gaps) {
    if (remainingSuggestions.length === 0) break;
    if (gap.remaining <= 0) continue;

    // Filter suggestions by location compatibility for this gap
    const tempGap: Gap = {
      gapId: gap.gapId,
      start: gap.currentStartTime,
      end: gap.end,
      duration: gap.remaining,
      locationLabel: gap.locationLabel,
    };

    const compatibleSuggestions = remainingSuggestions.filter((s) =>
      canFit(s, tempGap),
    );

    if (compatibleSuggestions.length === 0) continue;

    // Allocate durations for compatible suggestions competing for this gap
    const { allocations, dropped: gapDropped } = allocateDurationsToGap(
      compatibleSuggestions,
      gap.remaining,
    );

    // Create blocks for allocated suggestions (in priority order)
    let currentTime = gap.currentStartTime;
    const allocatedIds = new Set<string>();

    for (const suggestion of compatibleSuggestions) {
      const duration = allocations.get(suggestion.id);
      if (!duration) continue;

      const endTime = addMinutesToTime(currentTime, duration);
      blocks.push({
        suggestionId: suggestion.id,
        memoId: suggestion.memoId,
        gapId: gap.gapId,
        startTime: currentTime,
        endTime,
        duration,
      });

      currentTime = endTime;
      allocatedIds.add(suggestion.id);
    }

    // Update gap state
    const totalAllocated = [...allocations.values()].reduce((a, b) => a + b, 0);
    gap.remaining -= totalAllocated;
    gap.currentStartTime = currentTime;

    // Remove allocated suggestions from remaining pool
    // Dropped suggestions (couldn't fit in this gap) stay for next gap
    remainingSuggestions = remainingSuggestions.filter(
      (s) => !allocatedIds.has(s.id),
    );
  }

  // Any remaining suggestions that never got allocated
  return { blocks, dropped: remainingSuggestions };
}

// ============================================================================
// MAIN SCHEDULER
// ============================================================================

/**
 * Scheduler options
 */
export interface SchedulerOptions {
  permutationLimit?: number;
  resolutionMinutes?: number;
  /** Duration extension config (extend sessions when extra gap time available) */
  durationExtension?: Partial<DurationExtensionConfig>;
}

/**
 * Schedule suggestions into gaps
 *
 * Algorithm:
 * 1. Partition into mandatory vs optional
 * 2. Sort mandatory by priority → permute → assign
 * 3. Calculate remaining capacity
 * 4. Knapsack select optimal optional subset
 * 5. Permute selected optional → assign
 * 6. Return results
 *
 * @param suggestions - All suggestions to schedule
 * @param gaps - Available gaps (should be time-sorted)
 * @param options - Scheduler options
 */
export function scheduleSuggestions(
  suggestions: Suggestion[],
  gaps: Gap[],
  options: SchedulerOptions = {},
): ScheduleResult {
  const {
    permutationLimit = DEFAULT_PERMUTATION_LIMIT,
    resolutionMinutes = 1.0,
    durationExtension = {},
  } = options;

  // Merge extension config with defaults
  const extensionConfig: DurationExtensionConfig = {
    ...DEFAULT_EXTENSION_CONFIG,
    ...durationExtension,
  };

  // Initialize result
  const result: ScheduleResult = {
    scheduled: [],
    dropped: [],
    totalScheduledMinutes: 0,
    totalDroppedMinutes: 0,
    permutationsEvaluated: 0,
    mandatoryDropped: [],
  };

  // Handle empty inputs
  if (gaps.length === 0) {
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

  // Create mutable gaps
  const mutableGaps = createMutableGaps(gaps);

  // Partition suggestions
  const { mandatory, optional } = partitionSuggestions(suggestions);

  // =========================================================================
  // PHASE 1: Schedule mandatory suggestions
  // =========================================================================
  if (mandatory.length > 0) {
    // Find best order via permutation
    const { order: mandatoryOrder, permutationsChecked } = enumerateBestOrder(
      sortByPriority(mandatory),
      mutableGaps,
      permutationLimit,
      extensionConfig,
    );
    result.permutationsEvaluated += permutationsChecked;

    // Assign to gaps
    const { blocks, dropped } = assignOrderToGaps(
      mandatoryOrder,
      mutableGaps,
      extensionConfig,
    );
    result.scheduled.push(...blocks);
    result.mandatoryDropped.push(...dropped);
    result.dropped.push(...dropped);
  }

  // =========================================================================
  // PHASE 2: Schedule optional suggestions
  // =========================================================================
  if (optional.length > 0) {
    // Calculate remaining capacity
    const remainingCapacity = totalRemainingCapacity(mutableGaps);

    if (remainingCapacity > TOLERANCE) {
      // Use knapsack to select optimal subset
      const selected = knapsackSelect(
        optional,
        remainingCapacity,
        resolutionMinutes,
      );

      if (selected.length > 0) {
        // Find best order via permutation
        const { order: optionalOrder, permutationsChecked } =
          enumerateBestOrder(
            selected,
            mutableGaps,
            permutationLimit,
            extensionConfig,
          );
        result.permutationsEvaluated += permutationsChecked;

        // Assign to gaps
        const { blocks, dropped } = assignOrderToGaps(
          optionalOrder,
          mutableGaps,
          extensionConfig,
        );
        result.scheduled.push(...blocks);
        result.dropped.push(...dropped);
      }

      // Add unselected optional suggestions to dropped
      const selectedIds = new Set(selected.map((s) => s.id));
      for (const s of optional) {
        if (!selectedIds.has(s.id)) {
          result.dropped.push(s);
        }
      }
    } else {
      // No capacity left, drop all optional
      result.dropped.push(...optional);
    }
  }

  // Calculate totals
  result.totalScheduledMinutes = result.scheduled.reduce(
    (sum, b) => sum + b.duration,
    0,
  );
  result.totalDroppedMinutes = result.dropped.reduce(
    (sum, s) => sum + s.duration,
    0,
  );

  // Sort scheduled blocks by time
  result.scheduled.sort((a, b) => {
    const gapCompare = a.gapId.localeCompare(b.gapId);
    if (gapCompare !== 0) return gapCompare;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  return result;
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export { calculateScore, timeToMinutes, minutesToTime, addMinutesToTime };
