/**
 * @fileoverview Suggestion Scoring Module (Revised)
 *
 * Calculates need/importance/duration scores for each memo to produce Suggestions.
 * Core of the suggestion engine that determines what tasks to prioritize.
 *
 * === NEW SCORING SYSTEM ===
 *
 * Need Score Thresholds:
 * - Need < 0.5 → Task NOT displayed
 * - Need ≥ 1.0 → Task is MANDATORY
 *
 * Need Score Ranges by Type:
 * - ルーティン (Routine):  0.0 – 0.9 (never mandatory)
 * - 期限付き (Deadline):   0.1 – 1.0 (can become mandatory)
 * - バックログ (Backlog):  0.5 – 0.7 (never mandatory, slow ramp)
 *
 * Importance Score:
 * - Discrete values only: 0.0, 0.1, 0.2
 *
 * Key Design Principles:
 * - Explicit state flags required (no inference from floats)
 * - Total-time budgeting removed from Routine and Deadline
 * - Routine: display cap at 0.49 when weekly goal met
 * - Deadline: adaptive duration with smoothing
 * - Backlog: slow saturation (0.02/day over 10 days)
 */

import type {
  Memo,
  Suggestion,
  ImportanceLevel,
  RoutineState,
  DeadlineState,
  BacklogState,
} from "$lib/types.ts";
import {
  isSameDay,
  isSameWeek,
  isSameMonth,
  getCalendarPeriodStart,
} from "./period-utils.ts";
import {
  SCORING_CONFIG,
  DURATION_CONFIG,
} from "$lib/features/assistant/config/suggestion-config.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface ScoreInput {
  memo: Memo;
  currentTime: Date;
}

export interface ScoreOutput {
  need: number; // 0.0–1.0 (≥1.0 = mandatory, <0.5 = hidden)
  importance: number; // Discrete: 0.0, 0.1, 0.2
  duration: number; // Calculated duration in minutes (may be extended for deadline tasks)
  baseDuration: number; // Original sessionDuration - shrink floor for deadline tasks
  isHidden: boolean; // True if need < 0.5
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Re-export thresholds from centralized config for backward compatibility.
 * Other modules import these from here, so we keep the exports.
 */
export const DISPLAY_THRESHOLD = SCORING_CONFIG.displayThreshold;
export const MANDATORY_THRESHOLD = SCORING_CONFIG.mandatoryThreshold;

// Duration constants from centralized config
const DEFAULT_SESSION_DURATION = DURATION_CONFIG.defaultSession;

// Weights for linear regression (actual data points count more than expected)
const ACTUAL_WEIGHT = 2.0;
const EXPECTED_WEIGHT = 1.0;

// ============================================================================
// LINEAR REGRESSION HELPERS
// ============================================================================

/**
 * Calculate day index (0-based offset from createdDay)
 */
function getDayIndex(createdDay: Date, targetDay: Date): number {
  const created = new Date(createdDay);
  created.setHours(0, 0, 0, 0);

  const target = new Date(targetDay);
  target.setHours(0, 0, 0, 0);

  return Math.floor((target.getTime() - created.getTime()) / MS_PER_DAY);
}

/**
 * Weighted linear regression (重み付き最小二乗法)
 * Returns slope and intercept for the fitted line: y = slope * x + intercept
 *
 * Actual data points have 2x weight vs expected values.
 */
function weightedLinearRegression(
  points: Array<{ x: number; y: number; weight: number }>,
): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;

  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXY = 0;
  let sumWX2 = 0;

  for (const { x, y, weight } of points) {
    sumW += weight;
    sumWX += weight * x;
    sumWY += weight * y;
    sumWXY += weight * x * y;
    sumWX2 += weight * x * x;
  }

  const denom = sumW * sumWX2 - sumWX * sumWX;
  if (denom === 0) return null;

  const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
  return {
    slope,
    intercept: (sumWY - slope * sumWX) / sumW,
  };
}

// ============================================================================
// IMPORTANCE CALCULATION (Discrete Values)
// ============================================================================

/**
 * Convert importance level string to discrete numeric value
 * NEW: Only 0.0, 0.1, 0.2 allowed
 */
export function importanceToNumber(importance: ImportanceLevel): number {
  switch (importance) {
    case "low":
      return 0.0;
    case "medium":
      return 0.1;
    case "high":
      return 0.2;
    default:
      return 0.1; // Default to medium
  }
}

/**
 * Calculate importance score for a memo
 */
export function calculateImportance(memo: Memo): number {
  return importanceToNumber(memo.importance ?? "medium");
}

// ============================================================================
// ROUTINE SCORING (0.0 - 0.9)
// ============================================================================

/**
 * Initialize routine state if not present
 */
export function initializeRoutineState(
  memo: Memo,
  currentTime: Date,
): RoutineState {
  if (memo.routineState) {
    return memo.routineState;
  }

  return {
    acceptedToday: false,
    completedToday: false,
    completedCountThisPeriod: 0,
    lastCompletedDay: null,
    previousLastCompletedDay: null,
    wasCappedThisPeriod: false,
    periodStartDate: getCalendarPeriodStart(
      currentTime,
      memo.recurrenceGoal?.period ?? "week",
    ),
    rejectedToday: false,
    acceptedSlot: null,
  };
}

/**
 * Check if routine state needs period reset based on task's recurrence period
 */
function shouldResetRoutinePeriod(
  state: RoutineState,
  currentTime: Date,
  period: "day" | "week" | "month",
): boolean {
  if (!state.periodStartDate) return true;
  const periodStart = new Date(state.periodStartDate);
  switch (period) {
    case "day":
      return !isSameDay(periodStart, currentTime);
    case "week":
      return !isSameWeek(periodStart, currentTime);
    case "month":
      return !isSameMonth(periodStart, currentTime);
  }
}

/**
 * Calculate need score for ルーティン (Routine) tasks
 *
 * Frequency-based growth model:
 * - Growth rate: Δ = 0.9 / ideal_interval_days per day
 * - Ideal interval: 1 day (daily), 7/goal_count days (weekly), 30/goal_count days (monthly)
 * - Score reaches 0.9 at each ideal interval
 * - Display capped at 0.49 when period goal met (respects day/week/month period)
 *
 * Range: 0.0 – 0.9 (never mandatory)
 */
export function calculateRoutineNeed(memo: Memo, currentTime: Date): number {
  const state = initializeRoutineState(memo, currentTime);

  // If rejected today, hide the suggestion
  if (state.rejectedToday) return 0;

  const goal = memo.recurrenceGoal;

  // Default goal: 3 times per week
  const goalCount = goal?.count ?? 3;
  const goalPeriod = goal?.period ?? "week";

  // Calculate ideal interval based on period
  let idealIntervalDays: number;
  switch (goalPeriod) {
    case "day":
      idealIntervalDays = 1;
      break;
    case "week":
      idealIntervalDays = 7 / goalCount;
      break;
    case "month":
      idealIntervalDays = 30 / goalCount;
      break;
    default:
      idealIntervalDays = 7 / goalCount;
  }
  const dailyGrowth = 0.9 / idealIntervalDays;

  // Check if we need to reset the period (new day/week/month based on task's period)
  const needsPeriodReset = shouldResetRoutinePeriod(
    state,
    currentTime,
    goalPeriod,
  );

  // Days since last completion
  let daysSinceCompletion: number;

  // Check acceptedToday FIRST - if accepted, treat as just completed regardless of lastCompletedDay
  if (state.acceptedToday) {
    // Accepted today - treat as just completed (score will be 0)
    daysSinceCompletion = 0;
  } else if (state.lastCompletedDay) {
    // Normal case: use last completion date
    const lastCompleted = new Date(state.lastCompletedDay);
    daysSinceCompletion =
      (currentTime.getTime() - lastCompleted.getTime()) / MS_PER_DAY;
  } else {
    // Never completed - use days since creation
    daysSinceCompletion =
      (currentTime.getTime() - new Date(memo.createdAt).getTime()) / MS_PER_DAY;
  }

  // Calculate base score
  let score = daysSinceCompletion * dailyGrowth;

  // Handle period boundary
  if (needsPeriodReset) {
    // New period - check if was capped last period
    if (state.wasCappedThisPeriod) {
      // Case A: Was capped - resume from 0.49 + growth since last completion
      score = 0.49 + daysSinceCompletion * dailyGrowth;
    }
    // Case B: Was not capped - continue uninterrupted (already calculated)
  }

  // Cap at 0.9 (routine never mandatory)
  score = Math.min(score, 0.9);

  // Period goal display cap - only apply if still in the same period
  if (!needsPeriodReset && state.completedCountThisPeriod >= goalCount) {
    // Cap displayed score at 0.49
    score = Math.min(score, 0.49);
  }

  return Math.max(0, score);
}

// ============================================================================
// DEADLINE SCORING (0.1 - 1.0)
// ============================================================================

/**
 * Initialize deadline state if not present
 * Creates fixed-length arrays for linear regression-based duration prediction
 *
 * Also handles migration from old data:
 * - If expectedDurations is empty, recompute from createdAt/deadline/sessionDuration
 * - If actualDurations is shorter than totalDays, extend with zeros
 */
export function initializeDeadlineState(
  memo: Memo,
  _currentTime: Date,
): DeadlineState {
  const createdDay = new Date(memo.createdAt);
  const deadlineDay = memo.deadline ? new Date(memo.deadline) : createdDay;
  const baseDuration = memo.sessionDuration ?? DEFAULT_SESSION_DURATION;

  // Calculate total days (inclusive of both creation and deadline)
  const totalDays = Math.max(
    1,
    Math.ceil((deadlineDay.getTime() - createdDay.getTime()) / MS_PER_DAY) + 1,
  );

  // If state exists, check if arrays need to be computed/extended
  if (memo.deadlineState) {
    const state = memo.deadlineState;
    let needsUpdate = false;

    // Compute expectedDurations if empty (migration from old format)
    let expectedDurations = state.expectedDurations;
    if (!expectedDurations || expectedDurations.length === 0) {
      expectedDurations = generateExpectedDurations(totalDays, baseDuration);
      needsUpdate = true;
    }

    // Extend actualDurations if too short
    let actualDurations = state.actualDurations ?? [];
    if (actualDurations.length < totalDays) {
      actualDurations = [
        ...actualDurations,
        ...new Array(totalDays - actualDurations.length).fill(0),
      ];
      needsUpdate = true;
    }

    if (needsUpdate) {
      return {
        ...state,
        createdDay,
        deadlineDay,
        actualDurations,
        expectedDurations,
        totalDays,
      };
    }

    return state;
  }

  // Create fresh state
  const expectedDurations = generateExpectedDurations(totalDays, baseDuration);
  const actualDurations = new Array<number>(totalDays).fill(0);

  return {
    createdDay,
    deadlineDay,
    lastCompletedDay: null,
    previousLastCompletedDay: null,
    actualDurations,
    expectedDurations,
    totalDays,
    rejectedToday: false,
    acceptedSlots: [],
  };
}

/**
 * Generate fixed-length expected duration array
 * Linear interpolation from baseDuration to 5 × baseDuration
 */
function generateExpectedDurations(
  totalDays: number,
  baseDuration: number,
): number[] {
  const durations: number[] = [];

  for (let i = 0; i < totalDays; i++) {
    // Linear interpolation: baseDuration at day 0, 5*baseDuration at last day
    const progress = totalDays > 1 ? i / (totalDays - 1) : 1;
    const duration = baseDuration * (1 + 4 * progress);
    durations.push(Math.round(duration));
  }

  return durations;
}

/**
 * Calculate need score for 期限付き (Deadline) tasks
 *
 * Linear growth from creation to deadline:
 * - Same-day deadline (created & due today): 1.0 (immediately mandatory)
 * - Multi-day deadline at creation: 0.1
 * - Day before deadline: 1.0 (mandatory)
 * - At/after deadline: 1.0 (stays mandatory)
 *
 * Range: 0.1 – 1.0
 */
export function calculateDeadlineNeed(memo: Memo, currentTime: Date): number {
  // Check if task has a delayed suggestion start (dormant until event ends)
  if (
    memo.suggestionAvailableFrom &&
    currentTime < new Date(memo.suggestionAvailableFrom)
  ) {
    return 0; // Return 0 (hidden) - task is dormant until event timing is met
  }

  const state = initializeDeadlineState(memo, currentTime);

  // If rejected today, hide the suggestion
  if (state.rejectedToday) return 0;

  const created = new Date(state.createdDay);
  const deadline = new Date(state.deadlineDay);
  const now = currentTime;

  // Total time from creation to deadline (in milliseconds for finer granularity)
  const totalMs = deadline.getTime() - created.getTime();
  const totalDays = totalMs / MS_PER_DAY;

  // Elapsed time since creation
  const elapsedMs = now.getTime() - created.getTime();

  // Progress ratio (0 at creation, 1 at deadline)
  const progress = totalMs > 0 ? Math.max(0, elapsedMs / totalMs) : 1;

  // Linear interpolation: 0.1 → 1.0
  let score: number;

  if (totalDays < 1) {
    // Deadline is same day as creation - immediately mandatory
    score = 1.0;
  } else if (progress >= 1) {
    // At or past deadline - mandatory
    score = 1.0;
  } else if (totalDays <= 1) {
    // Exactly 1-day deadline: use proportional growth within the day
    score = 0.1 + 0.9 * progress;
  } else {
    // Normal case: Linear growth reaching 1.0 at (totalDays - 1) / totalDays
    const effectiveProgress = progress * (totalDays / (totalDays - 1));
    score = 0.1 + 0.9 * Math.min(effectiveProgress, 1);
  }

  // Cap at 1.0 (no escalation beyond mandatory)
  return Math.min(score, 1.0);
}

/**
 * Calculate suggested duration for deadline task using weighted linear regression
 *
 * Algorithm:
 * 1. Merge actual and expected durations (actual if non-zero, else expected)
 * 2. Apply weighted linear regression (actual points have 2x weight)
 * 3. Use fitted line to get duration for today
 * 4. Constrain to [baseDuration, 5 × baseDuration]
 */
export function calculateDeadlineDuration(
  memo: Memo,
  currentTime: Date,
): number {
  const state = initializeDeadlineState(memo, currentTime);
  const baseDuration = memo.sessionDuration ?? DEFAULT_SESSION_DURATION;
  const maxDuration = baseDuration * 5;

  // Calculate current day index
  const todayIndex = getDayIndex(state.createdDay, currentTime);

  // If before creation, use base duration
  if (todayIndex < 0) {
    return baseDuration;
  }
  // If after deadline, use max duration
  if (todayIndex >= state.totalDays) {
    return maxDuration;
  }

  // Build merged data points for regression
  // Use actual if non-zero, otherwise expected
  // Actual points have 2x weight
  const points: Array<{ x: number; y: number; weight: number }> = [];

  for (let i = 0; i < state.totalDays; i++) {
    const hasActual = state.actualDurations[i] > 0;
    points.push({
      x: i,
      y: hasActual ? state.actualDurations[i] : state.expectedDurations[i],
      weight: hasActual ? ACTUAL_WEIGHT : EXPECTED_WEIGHT,
    });
  }

  // Apply weighted linear regression
  const regression = weightedLinearRegression(points);

  let predictedDuration: number;

  if (regression) {
    // Use fitted line: y = slope * x + intercept
    predictedDuration = regression.slope * todayIndex + regression.intercept;
  } else {
    // Fallback: use expected duration for today
    predictedDuration = state.expectedDurations[todayIndex] ?? baseDuration;
  }

  // Apply constraints
  predictedDuration = Math.max(
    baseDuration,
    Math.min(maxDuration, predictedDuration),
  );

  return Math.round(predictedDuration);
}

// ============================================================================
// BACKLOG SCORING (0.5 - 0.7)
// ============================================================================

/**
 * Initialize backlog state if not present
 */
export function initializeBacklogState(memo: Memo): BacklogState {
  return (
    memo.backlogState ?? {
      acceptedToday: false,
      lastCompletedDay: memo.lastActivity ? new Date(memo.lastActivity) : null,
      previousLastCompletedDay: null,
      rejectedToday: false,
      acceptedSlot: null,
    }
  );
}

/**
 * Calculate need score for バックログ (Backlog) tasks
 *
 * Slow ramp model:
 * - Base score: 0.5
 * - Growth: +0.02 per day since last completion
 * - Saturates at 0.7 after 10 days
 * - Resets to 0.5 on completion
 *
 * Range: 0.5 – 0.7 (never mandatory, always visible)
 */
export function calculateBacklogNeed(memo: Memo, currentTime: Date): number {
  const state = initializeBacklogState(memo);

  // If rejected today, hide the suggestion
  if (state.rejectedToday) return 0;

  const BASE_SCORE = 0.5;
  const MAX_SCORE = 0.7;
  const DAILY_GROWTH = 0.02;
  const SATURATION_DAYS = 10; // (0.7 - 0.5) / 0.02 = 10

  // ACCEPTED TODAY: Return base score (0.5) - still visible but at lowest priority
  // Unlike routine tasks, backlog tasks should remain visible after acceptance
  // so user can schedule additional work sessions if desired
  // Check acceptedToday FIRST - if accepted, return base score regardless of lastCompletedDay
  if (state.acceptedToday) {
    // Accepted today - return base score (lowest visible priority)
    return BASE_SCORE;
  }

  // Days since last completion
  let daysSinceCompletion: number;

  if (state.lastCompletedDay) {
    // Normal case: use last completion date
    const lastCompleted = new Date(state.lastCompletedDay);
    daysSinceCompletion =
      (currentTime.getTime() - lastCompleted.getTime()) / MS_PER_DAY;
  } else {
    // Never completed - use days since creation
    daysSinceCompletion =
      (currentTime.getTime() - new Date(memo.createdAt).getTime()) / MS_PER_DAY;
    // Cap at saturation days for new tasks
    daysSinceCompletion = Math.min(daysSinceCompletion, SATURATION_DAYS);
  }

  // Calculate score with saturation
  const score =
    BASE_SCORE +
    Math.min(daysSinceCompletion * DAILY_GROWTH, MAX_SCORE - BASE_SCORE);

  return Math.min(score, MAX_SCORE);
}

// ============================================================================
// MAIN NEED DISPATCH
// ============================================================================

/**
 * Calculate need score based on memo type
 * Dispatches to type-specific calculation
 */
export function calculateNeed(memo: Memo, currentTime: Date): number {
  switch (memo.type) {
    case "ルーティン":
      return calculateRoutineNeed(memo, currentTime);
    case "期限付き":
      return calculateDeadlineNeed(memo, currentTime);
    case "バックログ":
      return calculateBacklogNeed(memo, currentTime);
    default:
      return 0.5; // Default to display threshold
  }
}

// ============================================================================
// DURATION SELECTION
// ============================================================================

/**
 * Clamp a value between min and max bounds
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Select session duration for a memo
 * Returns the duration in minutes (no shrinking - duration is both ideal and minimum)
 */
export function selectDuration(memo: Memo, currentTime: Date): number {
  // Deadline tasks use adaptive duration
  if (memo.type === "期限付き") {
    return calculateDeadlineDuration(memo, currentTime);
  }

  // Other types use sessionDuration or defaults
  return memo.sessionDuration ?? DEFAULT_SESSION_DURATION;
}

// ============================================================================
// MAIN SCORING FUNCTIONS
// ============================================================================

/**
 * Score a memo to produce need/importance/duration
 * Main entry point for scoring system
 */
export function scoreMemo(input: ScoreInput): ScoreOutput {
  const { memo, currentTime } = input;

  const need = calculateNeed(memo, currentTime);
  const importance = calculateImportance(memo);
  const duration = selectDuration(memo, currentTime);
  const baseDuration = memo.sessionDuration ?? DEFAULT_SESSION_DURATION;
  const isHidden = need < DISPLAY_THRESHOLD;

  // Log scores for each task
  console.log(`[Task Score] ${memo.title || memo.id}`, {
    type: memo.type,
    need: need.toFixed(3),
    importance: importance.toFixed(3),
    duration: `${duration}min`,
    baseDuration: `${baseDuration}min`,
    isHidden,
    threshold: DISPLAY_THRESHOLD,
  });

  return {
    need,
    importance,
    duration,
    baseDuration,
    isHidden,
  };
}

/**
 * Convert a memo with its scores to a Suggestion
 * Creates the final output for the scheduler
 */
export function memoToSuggestion(memo: Memo, score: ScoreOutput): Suggestion {
  return {
    id: `suggestion-${memo.id}-${Date.now()}`,
    memoId: memo.id,
    need: score.need,
    importance: score.importance,
    duration: score.duration,
    baseDuration: score.baseDuration,
    type: memo.type,
    locationPreference: memo.locationPreference,
    isHidden: score.isHidden,
  };
}

/**
 * Score a memo and immediately convert to Suggestion
 * Convenience function combining scoreMemo + memoToSuggestion
 */
export function createSuggestionFromMemo(
  memo: Memo,
  currentTime: Date,
): Suggestion {
  const score = scoreMemo({ memo, currentTime });
  return memoToSuggestion(memo, score);
}

/**
 * Check if a suggestion is mandatory (must be scheduled)
 */
export function isMandatory(suggestion: Suggestion): boolean {
  return suggestion.need >= MANDATORY_THRESHOLD;
}

/**
 * Check if a suggestion should be hidden (below display threshold)
 */
export function isHidden(suggestion: Suggestion): boolean {
  return suggestion.need < DISPLAY_THRESHOLD || suggestion.isHidden === true;
}

// ============================================================================
// STATE UPDATE FUNCTIONS
// ============================================================================

/**
 * Update routine state when task is accepted
 */
export function markRoutineAccepted(memo: Memo, currentTime: Date): Memo {
  if (memo.type !== "ルーティン") return memo;

  const state = initializeRoutineState(memo, currentTime);
  const goalPeriod = memo.recurrenceGoal?.period ?? "week";

  // Check for period reset based on task's period setting
  const needsPeriodReset = shouldResetRoutinePeriod(
    state,
    currentTime,
    goalPeriod,
  );

  return {
    ...memo,
    routineState: {
      ...state,
      acceptedToday: true,
      // Reset period state if needed
      completedCountThisPeriod: needsPeriodReset
        ? 0
        : state.completedCountThisPeriod,
      wasCappedThisPeriod: needsPeriodReset ? false : state.wasCappedThisPeriod,
      periodStartDate: needsPeriodReset
        ? getCalendarPeriodStart(currentTime, goalPeriod)
        : state.periodStartDate,
    },
    lastActivity: currentTime,
  };
}

/**
 * Update routine state when task is completed
 */
export function markRoutineCompleted(memo: Memo, currentTime: Date): Memo {
  if (memo.type !== "ルーティン") return memo;

  const state = initializeRoutineState(memo, currentTime);
  const goal = memo.recurrenceGoal;
  const goalCount = goal?.count ?? 3;
  const goalPeriod = goal?.period ?? "week";

  // Check for period reset based on task's period setting
  const needsPeriodReset = shouldResetRoutinePeriod(
    state,
    currentTime,
    goalPeriod,
  );
  const baseCount = needsPeriodReset ? 0 : state.completedCountThisPeriod;
  const newCount = baseCount + 1;

  // Check if cap should be applied
  const wasCapped = needsPeriodReset ? false : state.wasCappedThisPeriod;
  const shouldCap = newCount >= goalCount;

  return {
    ...memo,
    routineState: {
      ...state,
      acceptedToday: true,
      completedToday: true,
      completedCountThisPeriod: newCount,
      lastCompletedDay: currentTime,
      wasCappedThisPeriod: wasCapped || shouldCap,
      periodStartDate: needsPeriodReset
        ? getCalendarPeriodStart(currentTime, goalPeriod)
        : state.periodStartDate,
    },
    lastActivity: currentTime,
  };
}

/**
 * Update deadline state when task session is recorded
 * Sums the duration to the corresponding day's slot in actualDurations array
 *
 * Called on:
 * - Suggestion acceptance (with possibly modified duration)
 * - Timer completion (adds actual time spent)
 * Multiple sessions on the same day are summed
 */
export function recordDeadlineSession(
  memo: Memo,
  currentTime: Date,
  actualDuration: number,
): Memo {
  if (memo.type !== "期限付き") return memo;

  const state = initializeDeadlineState(memo, currentTime);

  // Calculate day index (0-based, from createdDay)
  const dayIndex = getDayIndex(state.createdDay, currentTime);

  // Validate index is within bounds
  if (dayIndex < 0 || dayIndex >= state.totalDays) {
    console.warn(
      `[recordDeadlineSession] Day index ${dayIndex} out of bounds for task ${memo.id}`,
    );
    return memo;
  }

  // Create new array with summed duration for this day
  const newActualDurations = [...state.actualDurations];
  newActualDurations[dayIndex] =
    (newActualDurations[dayIndex] ?? 0) + actualDuration;

  return {
    ...memo,
    deadlineState: {
      ...state,
      lastCompletedDay: currentTime,
      actualDurations: newActualDurations,
    },
    lastActivity: currentTime,
  };
}

/**
 * Update backlog state when task is accepted (not fully completed)
 */
export function markBacklogAccepted(memo: Memo, currentTime: Date): Memo {
  if (memo.type !== "バックログ") return memo;

  const currentState = initializeBacklogState(memo);
  return {
    ...memo,
    backlogState: {
      ...currentState,
      acceptedToday: true,
      lastCompletedDay: currentTime, // Set as if completed today
    },
    lastActivity: currentTime,
  };
}

/**
 * Update backlog state when task is completed
 */
export function markBacklogCompleted(memo: Memo, currentTime: Date): Memo {
  if (memo.type !== "バックログ") return memo;

  const currentState = initializeBacklogState(memo);
  return {
    ...memo,
    backlogState: {
      ...currentState,
      acceptedToday: true,
      lastCompletedDay: currentTime,
    },
    lastActivity: currentTime,
  };
}

/**
 * Reset backlog acceptance for a new day
 * Call this when day changes or when task is marked as "missed"
 */
export function resetBacklogAcceptance(memo: Memo, _currentTime: Date): Memo {
  if (memo.type !== "バックログ") return memo;

  const state = initializeBacklogState(memo);

  return {
    ...memo,
    backlogState: {
      ...state,
      acceptedToday: false,
    },
  };
}

/**
 * Reset routine acceptance for a new day
 * Call this when day changes or when task is marked as "missed"
 */
export function resetRoutineAcceptance(memo: Memo, currentTime: Date): Memo {
  if (memo.type !== "ルーティン") return memo;

  const state = initializeRoutineState(memo, currentTime);

  return {
    ...memo,
    routineState: {
      ...state,
      acceptedToday: false,
      completedToday: false,
    },
  };
}
