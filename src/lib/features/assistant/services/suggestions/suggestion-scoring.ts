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
 * - Discrete values only: 0.0, 0.2, 0.4
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
  DurationPoint,
} from "$lib/types.ts";
import { isSameDay, isSameWeek } from "./period-utils.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface ScoreInput {
  memo: Memo;
  currentTime: Date;
}

export interface ScoreOutput {
  need: number; // 0.0–1.0 (≥1.0 = mandatory, <0.5 = hidden)
  importance: number; // Discrete: 0.0, 0.2, 0.4
  duration: number; // Ideal duration (minutes)
  minDuration: number; // Minimum acceptable duration
  isHidden: boolean; // True if need < 0.5
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Display threshold - tasks below this are hidden */
export const DISPLAY_THRESHOLD = 0.5;

/** Mandatory threshold - tasks at or above this must be scheduled */
export const MANDATORY_THRESHOLD = 1.0;

/** Duration bounds */
const DEFAULT_MIN_DURATION = 15; // minutes
const DEFAULT_SESSION_DURATION = 30; // minutes
const MIN_DURATION_FLOOR = 10; // absolute minimum

// ============================================================================
// IMPORTANCE CALCULATION (Discrete Values)
// ============================================================================

/**
 * Convert importance level string to discrete numeric value
 * NEW: Only 0.0, 0.2, 0.4 allowed
 */
export function importanceToNumber(importance: ImportanceLevel): number {
  switch (importance) {
    case "low":
      return 0.0;
    case "medium":
      return 0.2;
    case "high":
      return 0.4;
    default:
      return 0.2; // Default to medium
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
  return (
    memo.routineState ?? {
      acceptedToday: false,
      completedToday: false,
      completedCountThisWeek: 0,
      lastCompletedDay: null,
      wasCappedThisWeek: false,
      weekStartDate: getWeekStart(currentTime),
    }
  );
}

/**
 * Get the start of the week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  return new Date(d.setDate(diff));
}

/**
 * Check if routine state needs week reset
 */
function shouldResetRoutineWeek(
  state: RoutineState,
  currentTime: Date,
): boolean {
  if (!state.weekStartDate) return true;
  return !isSameWeek(state.weekStartDate, currentTime);
}

/**
 * Calculate need score for ルーティン (Routine) tasks
 *
 * Frequency-based growth model:
 * - Growth rate: Δ = 0.9 / (7 / goal_count) per day
 * - Score reaches 0.9 at each ideal interval
 * - Display capped at 0.49 when weekly goal met
 *
 * Range: 0.0 – 0.9 (never mandatory)
 */
export function calculateRoutineNeed(memo: Memo, currentTime: Date): number {
  const state = initializeRoutineState(memo, currentTime);
  const goal = memo.recurrenceGoal;

  // Default goal: 3 times per week
  const goalCount = goal?.count ?? 3;

  // Calculate ideal interval and growth rate
  const idealIntervalDays = 7 / goalCount;
  const dailyGrowth = 0.9 / idealIntervalDays;

  // Days since last completion
  let daysSinceCompletion: number;

  // Check if accepted today (within same day) - treat as if just completed
  if (state.acceptedToday && state.lastCompletedDay) {
    const lastCompleted = new Date(state.lastCompletedDay);
    // Only apply "accepted today" logic if it's still the same day
    if (isSameDay(lastCompleted, currentTime)) {
      // Accepted today - treat as if just completed (daysSinceCompletion = 0)
      daysSinceCompletion = 0;
    } else {
      // New day - use normal calculation
      daysSinceCompletion =
        (currentTime.getTime() - lastCompleted.getTime()) / MS_PER_DAY;
    }
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

  // Handle week boundary
  if (shouldResetRoutineWeek(state, currentTime)) {
    // New week - check if was capped last week
    if (state.wasCappedThisWeek) {
      // Case A: Was capped - resume from 0.49 + growth since last completion
      score = 0.49 + daysSinceCompletion * dailyGrowth;
    }
    // Case B: Was not capped - continue uninterrupted (already calculated)
  }

  // Cap at 0.9 (routine never mandatory)
  score = Math.min(score, 0.9);

  // Weekly goal display cap
  if (state.completedCountThisWeek >= goalCount) {
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
 */
export function initializeDeadlineState(
  memo: Memo,
  _currentTime: Date,
): DeadlineState {
  if (memo.deadlineState) {
    return memo.deadlineState;
  }

  const createdDay = new Date(memo.createdAt);
  const deadlineDay = memo.deadline ? new Date(memo.deadline) : createdDay;
  const minDuration = memo.sessionDuration ?? DEFAULT_MIN_DURATION;

  // Generate expected duration curve (linear from min to 5x min)
  const expectedDurationPoints = generateExpectedDurationCurve(
    createdDay,
    deadlineDay,
    minDuration,
  );

  return {
    createdDay,
    deadlineDay,
    lastCompletedDay: null,
    actualDurationPoints: [],
    expectedDurationPoints,
    smoothedMultiplier: 1.0,
  };
}

/**
 * Generate expected duration curve from creation to deadline
 * Duration scales from min_duration to 5 × min_duration
 */
function generateExpectedDurationCurve(
  createdDay: Date,
  deadlineDay: Date,
  minDuration: number,
): DurationPoint[] {
  const points: DurationPoint[] = [];
  const totalDays = Math.max(
    1,
    Math.ceil((deadlineDay.getTime() - createdDay.getTime()) / MS_PER_DAY),
  );

  for (let i = 0; i <= totalDays; i++) {
    const day = new Date(createdDay.getTime() + i * MS_PER_DAY);
    // Linear interpolation: min_duration → 5 × min_duration
    const progress = totalDays > 0 ? i / totalDays : 1;
    const duration = minDuration * (1 + 4 * progress);
    points.push({ day, duration: Math.round(duration) });
  }

  return points;
}

/**
 * Calculate need score for 期限付き (Deadline) tasks
 *
 * Linear growth from creation to deadline:
 * - At creation: 0.1
 * - Day before deadline: 1.0 (mandatory)
 * - At/after deadline: 1.0 (stays mandatory)
 *
 * Range: 0.1 – 1.0
 */
export function calculateDeadlineNeed(memo: Memo, currentTime: Date): number {
  const state = initializeDeadlineState(memo, currentTime);

  const created = new Date(state.createdDay);
  const deadline = new Date(state.deadlineDay);
  const now = currentTime;

  // Total days from creation to deadline
  const totalDays = Math.max(
    1,
    (deadline.getTime() - created.getTime()) / MS_PER_DAY,
  );

  // Days elapsed since creation
  const elapsedDays = (now.getTime() - created.getTime()) / MS_PER_DAY;

  // Progress ratio (0 at creation, 1 at deadline)
  const progress = Math.max(0, elapsedDays / totalDays);

  // Linear interpolation: 0.1 → 1.0
  // Reaches 1.0 on day before deadline (progress = 1 - 1/totalDays approx)
  let score: number;

  if (totalDays <= 1) {
    // Very short deadline - immediately approach 1.0
    score = 1.0;
  } else if (progress >= 1) {
    // At or past deadline - mandatory
    score = 1.0;
  } else {
    // Linear growth: reaches 1.0 at progress = (totalDays - 1) / totalDays
    const effectiveProgress = progress * (totalDays / (totalDays - 1));
    score = 0.1 + 0.9 * Math.min(effectiveProgress, 1);
  }

  // Cap at 1.0 (no escalation beyond mandatory)
  return Math.min(score, 1.0);
}

/**
 * Calculate suggested duration for deadline task using adaptive model
 *
 * Uses smoothed duration curve with constraints:
 * - min_duration ≤ duration ≤ 5 × min_duration
 * - Smoothing factor α ≤ 0.3 to prevent instability
 */
export function calculateDeadlineDuration(
  memo: Memo,
  currentTime: Date,
): { duration: number; minDuration: number } {
  const state = initializeDeadlineState(memo, currentTime);
  const minDuration = memo.sessionDuration ?? DEFAULT_MIN_DURATION;
  const maxDuration = minDuration * 5;

  // Find expected duration for today
  const today = currentTime;
  let expectedDuration = minDuration;

  for (const point of state.expectedDurationPoints) {
    if (isSameDay(new Date(point.day), today)) {
      expectedDuration = point.duration;
      break;
    }
    // Use closest previous point
    if (new Date(point.day) < today) {
      expectedDuration = point.duration;
    }
  }

  // Apply smoothed multiplier from actual data
  let adjustedDuration = expectedDuration * state.smoothedMultiplier;

  // Apply constraints
  adjustedDuration = Math.max(
    minDuration,
    Math.min(maxDuration, adjustedDuration),
  );

  return {
    duration: Math.round(adjustedDuration),
    minDuration: Math.max(MIN_DURATION_FLOOR, minDuration),
  };
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

  const BASE_SCORE = 0.5;
  const MAX_SCORE = 0.7;
  const DAILY_GROWTH = 0.02;
  const SATURATION_DAYS = 10; // (0.7 - 0.5) / 0.02 = 10

  // ACCEPTED TODAY: Return score below threshold to hide the task
  // This prevents duplicate suggestions after accepting
  if (state.acceptedToday && state.lastCompletedDay) {
    const lastCompleted = new Date(state.lastCompletedDay);
    // Only apply "accepted today" logic if it's still the same day
    if (isSameDay(lastCompleted, currentTime)) {
      // Accepted today - return 0 to hide (below DISPLAY_THRESHOLD of 0.5)
      return 0;
    }
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
 * Returns both ideal duration and minimum acceptable duration
 */
export function selectDuration(
  memo: Memo,
  currentTime: Date,
): { duration: number; minDuration: number } {
  // Deadline tasks use adaptive duration
  if (memo.type === "期限付き") {
    return calculateDeadlineDuration(memo, currentTime);
  }

  // Other types use sessionDuration or defaults
  const baseDuration = memo.sessionDuration ?? DEFAULT_SESSION_DURATION;
  const minDuration = Math.max(
    MIN_DURATION_FLOOR,
    Math.min(baseDuration, DEFAULT_MIN_DURATION),
  );

  return {
    duration: baseDuration,
    minDuration,
  };
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
  const { duration, minDuration } = selectDuration(memo, currentTime);
  const isHidden = need < DISPLAY_THRESHOLD;

  return {
    need,
    importance,
    duration,
    minDuration,
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
    minDuration: score.minDuration,
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

/**
 * Calculate priority for sorting suggestions
 * Higher priority = scheduled first
 */
export function calculatePriority(suggestion: Suggestion): number {
  return suggestion.need + suggestion.importance;
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

  // Check for week reset
  const needsWeekReset = shouldResetRoutineWeek(state, currentTime);

  return {
    ...memo,
    routineState: {
      ...state,
      acceptedToday: true,
      // Reset week state if needed
      completedCountThisWeek: needsWeekReset ? 0 : state.completedCountThisWeek,
      wasCappedThisWeek: needsWeekReset ? false : state.wasCappedThisWeek,
      weekStartDate: needsWeekReset
        ? getWeekStart(currentTime)
        : state.weekStartDate,
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

  // Check for week reset
  const needsWeekReset = shouldResetRoutineWeek(state, currentTime);
  const baseCount = needsWeekReset ? 0 : state.completedCountThisWeek;
  const newCount = baseCount + 1;

  // Check if cap should be applied
  const wasCapped = needsWeekReset ? false : state.wasCappedThisWeek;
  const shouldCap = newCount >= goalCount;

  return {
    ...memo,
    routineState: {
      ...state,
      acceptedToday: true,
      completedToday: true,
      completedCountThisWeek: newCount,
      lastCompletedDay: currentTime,
      wasCappedThisWeek: wasCapped || shouldCap,
      weekStartDate: needsWeekReset
        ? getWeekStart(currentTime)
        : state.weekStartDate,
    },
    lastActivity: currentTime,
  };
}

/**
 * Update deadline state when task session is completed
 * Records actual duration and updates smoothed curve
 */
export function recordDeadlineSession(
  memo: Memo,
  currentTime: Date,
  actualDuration: number,
): Memo {
  if (memo.type !== "期限付き") return memo;

  const state = initializeDeadlineState(memo, currentTime);
  const SMOOTHING_ALPHA = 0.3;

  // Add actual duration point
  const newActualPoints: DurationPoint[] = [
    ...state.actualDurationPoints,
    { day: currentTime, duration: actualDuration },
  ];

  // Calculate new smoothed multiplier
  // Compare actual duration to expected duration for today
  const minDuration = memo.sessionDuration ?? DEFAULT_MIN_DURATION;
  let expectedToday = minDuration;
  for (const point of state.expectedDurationPoints) {
    if (isSameDay(new Date(point.day), currentTime)) {
      expectedToday = point.duration;
      break;
    }
  }

  const actualRatio = actualDuration / expectedToday;
  const newMultiplier =
    SMOOTHING_ALPHA * actualRatio +
    (1 - SMOOTHING_ALPHA) * state.smoothedMultiplier;

  return {
    ...memo,
    deadlineState: {
      ...state,
      lastCompletedDay: currentTime,
      actualDurationPoints: newActualPoints,
      smoothedMultiplier: newMultiplier,
    },
    lastActivity: currentTime,
  };
}

/**
 * Update backlog state when task is accepted (not fully completed)
 */
export function markBacklogAccepted(memo: Memo, currentTime: Date): Memo {
  if (memo.type !== "バックログ") return memo;

  const state = initializeBacklogState(memo);

  return {
    ...memo,
    backlogState: {
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

  return {
    ...memo,
    backlogState: {
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
export function resetBacklogAcceptance(memo: Memo, currentTime: Date): Memo {
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
