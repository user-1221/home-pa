/**
 * @fileoverview Period Tracking Utilities
 *
 * Handles period calculations for routine tasks (daily/weekly/monthly cycles).
 * Used by scoring module to determine need based on routine goal completion.
 *
 * Core date comparison and period calculation functions are imported from
 * the shared utility module at $lib/utils/period-utils.ts.
 */

import type { Memo } from "$lib/types.ts";
import {
  type Period,
  isSameDay,
  isSameWeek,
  isSameMonth,
  getNextPeriodStart,
  isNewCalendarPeriod,
  getCalendarPeriodStart,
  getCreationAlignedPeriodStart,
  isNewCreationAlignedPeriod,
} from "$lib/utils/period-utils.ts";

// ============================================================================
// RE-EXPORTS FROM SHARED UTILITY
// ============================================================================

export {
  type Period,
  isSameDay,
  isSameWeek,
  isSameMonth,
  getNextPeriodStart,
  isNewCalendarPeriod,
  getCalendarPeriodStart,
  getCreationAlignedPeriodStart,
  isNewCreationAlignedPeriod,
};

// Backward compatibility alias
export { isNewCalendarPeriod as isNewPeriod };

// ============================================================================
// PERIOD PROGRESS (Feature-specific)
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
// MEMO PERIOD MANAGEMENT (Feature-specific)
// ============================================================================

/**
 * Reset daily flags if we've entered a new day
 * Call this before scoring to ensure fresh state
 *
 * Note: Period counter reset (completedCountThisPeriod) is handled server-side
 * in logSuggestionComplete/markMemoAccepted for single source of truth.
 *
 * Handles:
 * - Routine tasks: acceptedToday, completedToday, rejectedToday
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
    // Note: Period counter reset is handled server-side in logSuggestionComplete/markMemoAccepted
    // Client only resets daily flags here

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
          memo.routineState.acceptedSlot ||
          memo.status.timeSpentToday > 0)
      ) {
        // New day - reset acceptedToday, completedToday, rejectedToday, acceptedSlot, and timeSpentToday
        updated = {
          ...updated,
          status: {
            ...updated.status,
            timeSpentToday: 0,
          },
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
        memo.backlogState.acceptedSlot ||
        memo.status.timeSpentToday > 0)
    ) {
      // New day - reset acceptedToday, rejectedToday, acceptedSlot, and timeSpentToday
      updated = {
        ...updated,
        status: {
          ...updated.status,
          timeSpentToday: 0,
        },
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

    const hasAcceptedSlots =
      memo.deadlineState.acceptedSlots &&
      memo.deadlineState.acceptedSlots.length > 0;

    // Reset if lastActivity is on a different day,
    // OR if slots exist but lastActivity is null (edge case recovery)
    const needsReset = lastActivity
      ? !isSameDay(lastActivity, currentTime)
      : hasAcceptedSlots;

    if (
      needsReset &&
      (hasAcceptedSlots ||
        memo.deadlineState.rejectedToday ||
        memo.status.timeSpentToday > 0)
    ) {
      // New day - reset acceptedSlots, rejectedToday, and timeSpentToday
      updated = {
        ...updated,
        status: {
          ...updated.status,
          timeSpentToday: 0,
        },
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
