/**
 * @fileoverview Period Tracking Utilities
 *
 * Handles period calculations for routine tasks (daily/weekly/monthly cycles).
 * Used by scoring module to determine need based on routine goal completion.
 *
 * @author Personal Assistant Team
 * @version 1.0.0
 */

import type { Memo } from "$lib/types.ts";

// ============================================================================
// TYPES
// ============================================================================

export type Period = "day" | "week" | "month";

// ============================================================================
// PERIOD PROGRESS
// ============================================================================

/**
 * Get how far through the current period we are (0.0 - 1.0)
 *
 * @param currentTime - Current time to check
 * @param period - Period type (day/week/month)
 * @returns Progress ratio from 0.0 (start of period) to 1.0 (end of period)
 *
 * @example
 * // Monday 12:00 noon
 * getPeriodProgress(date, "day")   // ~0.5 (halfway through day)
 * getPeriodProgress(date, "week")  // ~0.07 (1/7 of week + half day)
 * getPeriodProgress(date, "month") // depends on day of month
 */
export function getPeriodProgress(currentTime: Date, period: Period): number {
  switch (period) {
    case "day":
      return getDayProgress(currentTime);
    case "week":
      return getWeekProgress(currentTime);
    case "month":
      return getMonthProgress(currentTime);
  }
}

/**
 * Progress through current day (0.0 at midnight, 1.0 at 23:59)
 */
function getDayProgress(time: Date): number {
  const hours = time.getHours();
  const minutes = time.getMinutes();
  return (hours * 60 + minutes) / (24 * 60);
}

/**
 * Progress through current week (0.0 at Sunday midnight, 1.0 at Saturday 23:59)
 * Note: Week starts on Sunday (day 0)
 */
function getWeekProgress(time: Date): number {
  const dayOfWeek = time.getDay(); // 0 = Sunday, 6 = Saturday
  const dayProgress = getDayProgress(time);
  return (dayOfWeek + dayProgress) / 7;
}

/**
 * Progress through current month (0.0 on 1st, 1.0 on last day)
 */
function getMonthProgress(time: Date): number {
  const dayOfMonth = time.getDate(); // 1-31
  const daysInMonth = getDaysInMonth(time);
  const dayProgress = getDayProgress(time);
  return (dayOfMonth - 1 + dayProgress) / daysInMonth;
}

/**
 * Get number of days in the month of the given date
 */
function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// ============================================================================
// PERIOD BOUNDARY CHECKING
// ============================================================================

/**
 * Check if we've entered a new period since the last tracking date
 *
 * @param lastPeriodStart - When the tracking period started
 * @param currentTime - Current time to check against
 * @param period - Period type (day/week/month)
 * @returns true if we've crossed into a new period
 *
 * @example
 * // lastPeriodStart = Monday, currentTime = Tuesday
 * isNewPeriod(lastPeriodStart, currentTime, "day")   // true
 * isNewPeriod(lastPeriodStart, currentTime, "week")  // false (same week)
 */
export function isNewPeriod(
  lastPeriodStart: Date,
  currentTime: Date,
  period: Period,
): boolean {
  switch (period) {
    case "day":
      return !isSameDay(lastPeriodStart, currentTime);
    case "week":
      return !isSameWeek(lastPeriodStart, currentTime);
    case "month":
      return !isSameMonth(lastPeriodStart, currentTime);
  }
}

/**
 * Check if two dates are the same calendar day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if two dates are in the same week
 * Week is considered to start on Sunday
 */
export function isSameWeek(date1: Date, date2: Date): boolean {
  const week1 = getWeekNumber(date1);
  const week2 = getWeekNumber(date2);
  return date1.getFullYear() === date2.getFullYear() && week1 === week2;
}

/**
 * Get ISO week number for a date
 */
function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor(
    (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

/**
 * Check if two dates are in the same month
 */
export function isSameMonth(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

/**
 * Get the next period start date by advancing exactly one period
 *
 * Periods are task-creation-aligned, not calendar-aligned.
 * If you create a weekly task on Wednesday, your weeks are Wed-Tue.
 *
 * @param previousPeriodStart - The start of the previous period
 * @param period - Period type (day/week/month)
 * @returns Date representing the start of the next period
 *
 * @example
 * // previousPeriodStart = Wed Jan 8, 2025 (weekly task created on Wed)
 * getNextPeriodStart(previousPeriodStart, "week") // Wed Jan 15, 2025
 */
export function getNextPeriodStart(
  previousPeriodStart: Date,
  period: Period,
): Date {
  const result = new Date(previousPeriodStart);
  switch (period) {
    case "day":
      result.setDate(result.getDate() + 1);
      break;
    case "week":
      result.setDate(result.getDate() + 7);
      break;
    case "month":
      result.setMonth(result.getMonth() + 1);
      break;
  }
  return result;
}

/**
 * Find the current period start by iterating forward from the original period start
 *
 * This handles cases where multiple periods have passed since the last update.
 * Periods are task-creation-aligned based on when the task was first created.
 *
 * @param originalPeriodStart - The original/previous period start date
 * @param currentTime - Current time to check against
 * @param period - Period type (day/week/month)
 * @returns The start date of the current period
 *
 * @example
 * // Task created on Wed Jan 1, multiple weeks passed, now Jan 20
 * getCurrentPeriodStart(Jan1, Jan20, "week") // Wed Jan 15 (current week start)
 */
export function getCurrentPeriodStart(
  originalPeriodStart: Date,
  currentTime: Date,
  period: Period,
): Date {
  let periodStart = new Date(originalPeriodStart);

  // Advance until we find the period that contains currentTime
  while (isNewPeriod(periodStart, currentTime, period)) {
    const nextStart = getNextPeriodStart(periodStart, period);
    // Safety check: if next period would be after current time, we found our period
    if (nextStart > currentTime) {
      break;
    }
    periodStart = nextStart;
  }

  return periodStart;
}

// ============================================================================
// MEMO PERIOD MANAGEMENT
// ============================================================================

/**
 * Reset period counter and daily flags if we've entered a new period/day
 * Call this before scoring to ensure fresh state
 *
 * Handles:
 * - Routine tasks: completionsThisPeriod, acceptedToday, completedToday, rejectedToday
 * - Backlog tasks: acceptedToday, rejectedToday
 * - Deadline tasks: rejectedToday, acceptedSlots
 *
 * Daily flags reset at day boundary, detected using memo.lastActivity:
 * - If lastActivity is on a previous day: reset daily flags
 * - If lastActivity is today or null: keep current state
 *
 * @param memo - Memo to check and potentially reset
 * @param currentTime - Current time
 * @returns Updated memo (new object if reset, same object if not)
 */
export function resetPeriodIfNeeded(memo: Memo, currentTime: Date): Memo {
  let updated = memo;
  let hasChanges = false;

  // Handle routine tasks
  if (memo.type === "ルーティン") {
    // Reset period counter if entered new period
    if (memo.recurrenceGoal) {
      const periodStart = memo.status.periodStartDate;
      if (!periodStart) {
        // First time: use currentTime as initial period start (task-creation-aligned)
        // If you create a weekly task on Wed, your weeks are Wed-Tue
        updated = {
          ...updated,
          status: {
            ...updated.status,
            completionsThisPeriod: 0,
            periodStartDate: currentTime,
          },
        };
        hasChanges = true;
      } else if (
        isNewPeriod(periodStart, currentTime, memo.recurrenceGoal.period)
      ) {
        // Existing period start: advance to current period (task-creation-aligned)
        // This preserves the original day-of-week/day-of-month alignment
        const newPeriodStart = getCurrentPeriodStart(
          periodStart,
          currentTime,
          memo.recurrenceGoal.period,
        );
        updated = {
          ...updated,
          status: {
            ...updated.status,
            completionsThisPeriod: 0,
            periodStartDate: newPeriodStart,
          },
        };
        hasChanges = true;
      }
    }

    // Reset daily flags if it's a new day
    if (memo.routineState) {
      // Use lastActivity for day boundary detection (tracks accept/reject/complete)
      const lastActivity = memo.lastActivity
        ? new Date(memo.lastActivity)
        : null;

      // Only reset if lastActivity exists and is on a different day
      // If lastActivity is null, keep current state (no activity to reset from)
      const needsReset = lastActivity
        ? !isSameDay(lastActivity, currentTime)
        : false;

      if (
        needsReset &&
        (memo.routineState.acceptedToday ||
          memo.routineState.completedToday ||
          memo.routineState.rejectedToday ||
          memo.routineState.acceptedSlot)
      ) {
        // New day - reset acceptedToday, completedToday, rejectedToday, and acceptedSlot
        updated = {
          ...updated,
          routineState: {
            ...updated.routineState!,
            acceptedToday: false,
            completedToday: false,
            rejectedToday: false,
            acceptedSlot: null,
          },
        };
        hasChanges = true;
      }
    }
  }

  // Handle backlog tasks
  if (memo.type === "バックログ" && memo.backlogState) {
    // Use lastActivity for day boundary detection (tracks accept/reject/complete)
    const lastActivity = memo.lastActivity ? new Date(memo.lastActivity) : null;

    // Only reset if lastActivity exists and is on a different day
    // If lastActivity is null, keep current state (no activity to reset from)
    const needsReset = lastActivity
      ? !isSameDay(lastActivity, currentTime)
      : false;

    if (
      needsReset &&
      (memo.backlogState.acceptedToday ||
        memo.backlogState.rejectedToday ||
        memo.backlogState.acceptedSlot)
    ) {
      // New day - reset acceptedToday, rejectedToday, and acceptedSlot
      updated = {
        ...updated,
        backlogState: {
          ...updated.backlogState!,
          acceptedToday: false,
          rejectedToday: false,
          acceptedSlot: null,
        },
      };
      hasChanges = true;
    }
  }

  // Handle deadline tasks
  if (memo.type === "期限付き" && memo.deadlineState) {
    // Use lastActivity for day boundary detection (tracks accept/reject/complete)
    const lastActivity = memo.lastActivity ? new Date(memo.lastActivity) : null;

    // Only reset if lastActivity exists and is on a different day
    // If lastActivity is null, keep current state (no activity to reset from)
    const needsReset = lastActivity
      ? !isSameDay(lastActivity, currentTime)
      : false;

    const hasAcceptedSlots =
      memo.deadlineState.acceptedSlots &&
      memo.deadlineState.acceptedSlots.length > 0;

    if (needsReset && (hasAcceptedSlots || memo.deadlineState.rejectedToday)) {
      // New day - reset acceptedSlots and rejectedToday
      updated = {
        ...updated,
        deadlineState: {
          ...updated.deadlineState!,
          acceptedSlots: [],
          rejectedToday: false,
        },
      };
      hasChanges = true;
    }
  }

  return hasChanges ? updated : memo;
}

/**
 * Increment completion count when user finishes a session
 * Call this when user accepts/completes a scheduled suggestion
 *
 * @param memo - Memo to update
 * @param currentTime - Current time
 * @returns Updated memo with incremented counter
 */
export function incrementCompletion(memo: Memo, currentTime: Date): Memo {
  // Only applies to routine memos
  if (memo.type !== "ルーティン") {
    return memo;
  }

  // First ensure we're in the right period
  const normalized = resetPeriodIfNeeded(memo, currentTime);

  return {
    ...normalized,
    status: {
      ...normalized.status,
      completionsThisPeriod: (normalized.status.completionsThisPeriod ?? 0) + 1,
    },
    lastActivity: currentTime,
  };
}

// ============================================================================
// ADDITIONAL HELPERS
// ============================================================================

// Note: isSameDay and isSameWeek are exported inline above
// isSameMonth, getWeekNumber, getDaysInMonth are internal helpers
