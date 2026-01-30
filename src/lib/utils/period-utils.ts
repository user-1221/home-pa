/**
 * @fileoverview Shared Period Calculation Utilities
 *
 * Provides date comparison and period boundary functions for task scheduling.
 * Supports two period alignment strategies:
 *
 * 1. **Calendar-aligned**: Week starts Monday, month starts 1st
 *    - Used for initializing new routine tasks
 *    - Functions: getCalendarPeriodStart, isNewCalendarPeriod
 *
 * 2. **Creation-aligned**: Boundaries based on when the task was created
 *    - Used for server-side period tracking and counter resets
 *    - Functions: getCreationAlignedPeriodStart, isNewCreationAlignedPeriod
 */

// ============================================================================
// TYPES
// ============================================================================

export type Period = "day" | "week" | "month";

// ============================================================================
// DATE COMPARISON (Local Timezone)
// ============================================================================

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
 * Week boundary is determined by ISO week number
 */
export function isSameWeek(date1: Date, date2: Date): boolean {
  const week1 = getWeekNumber(date1);
  const week2 = getWeekNumber(date2);
  return date1.getFullYear() === date2.getFullYear() && week1 === week2;
}

/**
 * Check if two dates are in the same calendar month
 */
export function isSameMonth(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
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

// ============================================================================
// CALENDAR-ALIGNED PERIODS
// ============================================================================

/**
 * Get the start of a calendar period (Monday for week, 1st for month)
 *
 * Used for initializing new routine state with standard boundaries.
 *
 * @param date - The reference date
 * @param period - Period type (day/week/month)
 * @returns Date representing the start of the calendar period
 *
 * @example
 * // Wednesday January 15
 * getCalendarPeriodStart(date, "week")  // Monday January 13
 * getCalendarPeriodStart(date, "month") // January 1
 */
export function getCalendarPeriodStart(date: Date, period: Period): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  switch (period) {
    case "day":
      return d;
    case "week": {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      return new Date(d.getFullYear(), d.getMonth(), diff);
    }
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1);
  }
}

/**
 * Check if two dates are in different calendar periods
 *
 * Uses isSameDay/Week/Month for comparison.
 *
 * @param lastPeriodStart - The previous period start date
 * @param currentTime - Current time to check against
 * @param period - Period type (day/week/month)
 * @returns true if we've crossed into a new calendar period
 */
export function isNewCalendarPeriod(
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

// ============================================================================
// CREATION-ALIGNED PERIODS
// ============================================================================

/**
 * Get the start of the current period aligned to the task's creation date.
 *
 * This maintains consistent period boundaries based on when the task was created:
 * - Daily: Returns start of current day (midnight)
 * - Weekly: Returns same weekday as createdAt in current week
 * - Monthly: Returns same day-of-month as createdAt in current month
 *
 * @param createdAt - When the task was originally created
 * @param currentTime - Current time to check against
 * @param period - Period type (day/week/month)
 * @returns Date representing the start of the current creation-aligned period
 *
 * @example
 * // Task created on Wednesday, current time is Monday
 * // Weeks run Wed-Tue, so Monday is still in the previous week
 * getCreationAlignedPeriodStart(Wed, Mon, "week") // Previous Wednesday
 */
export function getCreationAlignedPeriodStart(
  createdAt: Date,
  currentTime: Date,
  period: Period,
): Date {
  const result = new Date(currentTime);
  result.setHours(0, 0, 0, 0);

  switch (period) {
    case "day":
      // Day period starts at midnight of current day
      return result;

    case "week": {
      // Week period starts on the same weekday as createdAt
      const createdWeekday = createdAt.getDay();
      const currentWeekday = result.getDay();
      let diff = currentWeekday - createdWeekday;
      if (diff < 0) diff += 7;
      result.setDate(result.getDate() - diff);
      return result;
    }

    case "month": {
      // Month period starts on the same day-of-month as createdAt
      const createdDayOfMonth = createdAt.getDate();
      const currentDayOfMonth = result.getDate();

      if (currentDayOfMonth >= createdDayOfMonth) {
        // Same month period
        result.setDate(createdDayOfMonth);
      } else {
        // Previous month period
        result.setMonth(result.getMonth() - 1);
        result.setDate(createdDayOfMonth);
      }
      return result;
    }
  }
}

/**
 * Check if we've entered a new period using creation-aligned boundaries.
 *
 * Requires the original createdAt to determine alignment.
 *
 * @param lastPeriodStart - When the previous period started (null = first time)
 * @param currentTime - Current time to check against
 * @param period - Period type (day/week/month)
 * @param createdAt - When the task was originally created
 * @returns true if we've crossed into a new creation-aligned period
 */
export function isNewCreationAlignedPeriod(
  lastPeriodStart: Date | null,
  currentTime: Date,
  period: Period,
  createdAt: Date,
): boolean {
  if (!lastPeriodStart) return true;

  const currentPeriodStart = getCreationAlignedPeriodStart(
    createdAt,
    currentTime,
    period,
  );
  const lastPeriodStartNormalized = new Date(lastPeriodStart);
  lastPeriodStartNormalized.setHours(0, 0, 0, 0);

  return currentPeriodStart.getTime() > lastPeriodStartNormalized.getTime();
}

// ============================================================================
// PERIOD ADVANCEMENT
// ============================================================================

/**
 * Advance to the next period start.
 *
 * Works for both calendar-aligned and creation-aligned periods.
 *
 * @param previousPeriodStart - The start of the previous period
 * @param period - Period type (day/week/month)
 * @returns Date representing the start of the next period
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
