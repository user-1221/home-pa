/**
 * Event Deadline Service
 *
 * Calculates deadlines for event-linked tasks, handling:
 * - Calendar event occurrences (with EXDATE exclusions)
 * - Timetable cell occurrences (with exception range handling)
 * - Deadline offset calculations
 */

import ICAL from "ical.js";
import type { Event } from "$lib/types";
import type { EventDeadlineOffset } from "../types/event-link";
import {
  isDateInExceptionRange,
  getWeekdayIndex,
  computeSlotTimes,
  type TimetableConfigData,
} from "$lib/features/calendar/utils/timetable-utils";
import type { TimetableCellData } from "$lib/features/calendar/services/timetable-events";

// ============================================================================
// TYPES
// ============================================================================

/** Result from next occurrence calculation */
export interface NextOccurrenceResult {
  startDate: Date;
  endDate: Date;
  skippedDates: Date[]; // Excluded dates that were skipped
}

// ============================================================================
// CALENDAR EVENT OCCURRENCE CALCULATION
// ============================================================================

/**
 * Get the next occurrence for a calendar event after a given date
 * Handles recurring events with EXDATE exclusions
 *
 * @param event - The calendar event
 * @param afterDate - Find occurrence after this date (default: now)
 * @returns Next occurrence or null if none found
 */
export function getNextCalendarOccurrence(
  event: Event,
  afterDate: Date = new Date(),
): NextOccurrenceResult | null {
  const skippedDates: Date[] = [];

  // For non-recurring events
  if (!event.recurrence || event.recurrence.type === "NONE") {
    if (event.start > afterDate) {
      return {
        startDate: event.start,
        endDate: event.end,
        skippedDates: [],
      };
    }
    return null; // Event is in the past
  }

  // For recurring events, use ical.js to expand
  const icalData = event.icalData;
  if (!icalData) {
    // No icalData, try simple calculation
    return getNextOccurrenceSimple(event, afterDate);
  }

  try {
    // Parse VEVENT
    const icsContent = icalData.includes("BEGIN:VCALENDAR")
      ? icalData
      : `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${icalData}\r\nEND:VCALENDAR`;

    const jcalData = ICAL.parse(icsContent);
    const vcalendar = new ICAL.Component(jcalData);
    const vevent = vcalendar.getFirstSubcomponent("vevent");

    if (!vevent) return null;

    const icalEvent = new ICAL.Event(vevent);
    const isAllDay = icalEvent.startDate.isDate;

    // Get EXDATE values for exclusion checking
    const exdates = getExdatesFromVevent(vevent, isAllDay);

    // Calculate event duration
    let durationMs: number;
    if (isAllDay) {
      const startUtc = Date.UTC(
        icalEvent.startDate.year,
        icalEvent.startDate.month - 1,
        icalEvent.startDate.day,
        0,
        0,
        0,
        0,
      );
      const endUtc = icalEvent.endDate
        ? Date.UTC(
            icalEvent.endDate.year,
            icalEvent.endDate.month - 1,
            icalEvent.endDate.day,
            0,
            0,
            0,
            0,
          )
        : startUtc;
      durationMs = endUtc - startUtc;
    } else {
      durationMs = icalEvent.endDate
        ? icalEvent.endDate.toJSDate().getTime() -
          icalEvent.startDate.toJSDate().getTime()
        : 0;
    }

    const iterator = icalEvent.iterator();
    let next = iterator.next();
    let count = 0;
    const maxIterations = 365; // Safety limit

    while (next && count < maxIterations) {
      let occStart: Date;

      if (isAllDay) {
        occStart = new Date(
          Date.UTC(next.year, next.month - 1, next.day, 0, 0, 0, 0),
        );
      } else {
        occStart = next.toJSDate();
      }

      if (occStart > afterDate) {
        // Check if this date is excluded
        const isExcluded = isDateExcluded(occStart, exdates, isAllDay);

        if (isExcluded) {
          skippedDates.push(occStart);
        } else {
          // Calculate end date
          let endDate: Date;
          if (isAllDay) {
            if (durationMs > 0) {
              const exclusiveEnd = new Date(occStart.getTime() + durationMs);
              endDate = new Date(
                Date.UTC(
                  exclusiveEnd.getUTCFullYear(),
                  exclusiveEnd.getUTCMonth(),
                  exclusiveEnd.getUTCDate() - 1,
                  0,
                  0,
                  0,
                  0,
                ),
              );
            } else {
              endDate = occStart;
            }
          } else {
            endDate = new Date(occStart.getTime() + durationMs);
          }

          return {
            startDate: occStart,
            endDate,
            skippedDates,
          };
        }
      }

      next = iterator.next();
      count++;
    }

    return null; // No future occurrence found
  } catch (error) {
    console.error(
      "[event-deadline-service] Failed to calculate next occurrence:",
      error,
    );
    return null;
  }
}

/**
 * Simple occurrence calculation for events without icalData
 */
function getNextOccurrenceSimple(
  event: Event,
  afterDate: Date,
): NextOccurrenceResult | null {
  if (!event.recurrence || event.recurrence.type !== "RRULE") {
    if (event.start > afterDate) {
      return {
        startDate: event.start,
        endDate: event.end,
        skippedDates: [],
      };
    }
    return null;
  }

  // Parse basic RRULE for simple cases
  const _rrule = event.recurrence.rrule;
  const freq = event.recurrence.frequency;

  if (!freq) return null;

  const durationMs = event.end.getTime() - event.start.getTime();
  let candidate = new Date(event.start);
  let count = 0;
  const maxIterations = 365;

  while (candidate <= afterDate && count < maxIterations) {
    switch (freq) {
      case "DAILY":
        candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
        break;
      case "WEEKLY":
        candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case "MONTHLY":
        candidate = new Date(
          candidate.getFullYear(),
          candidate.getMonth() + 1,
          candidate.getDate(),
          candidate.getHours(),
          candidate.getMinutes(),
        );
        break;
      case "YEARLY":
        candidate = new Date(
          candidate.getFullYear() + 1,
          candidate.getMonth(),
          candidate.getDate(),
          candidate.getHours(),
          candidate.getMinutes(),
        );
        break;
    }
    count++;
  }

  if (candidate > afterDate) {
    return {
      startDate: candidate,
      endDate: new Date(candidate.getTime() + durationMs),
      skippedDates: [],
    };
  }

  return null;
}

/**
 * Extract EXDATE values from a VEVENT component
 */
function getExdatesFromVevent(
  vevent: ICAL.Component,
  isAllDay: boolean,
): Date[] {
  const exdates: Date[] = [];
  const exdateProps = vevent.getAllProperties("exdate");

  for (const prop of exdateProps) {
    const values = prop.getValues();
    for (const val of values) {
      const icalTime = val as ICAL.Time;
      if (isAllDay) {
        // For all-day events, create UTC midnight
        exdates.push(
          new Date(
            Date.UTC(
              icalTime.year,
              icalTime.month - 1,
              icalTime.day,
              0,
              0,
              0,
              0,
            ),
          ),
        );
      } else {
        exdates.push(icalTime.toJSDate());
      }
    }
  }

  return exdates;
}

/**
 * Check if a date is in the exclusion list
 */
function isDateExcluded(
  date: Date,
  exdates: Date[],
  isAllDay: boolean,
): boolean {
  for (const exdate of exdates) {
    if (isAllDay) {
      // Compare dates only
      if (
        date.getUTCFullYear() === exdate.getUTCFullYear() &&
        date.getUTCMonth() === exdate.getUTCMonth() &&
        date.getUTCDate() === exdate.getUTCDate()
      ) {
        return true;
      }
    } else {
      // Compare full timestamp (within 1 second tolerance)
      if (Math.abs(date.getTime() - exdate.getTime()) < 1000) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// TIMETABLE OCCURRENCE CALCULATION
// ============================================================================

/**
 * Get the next occurrence for a timetable cell
 * Timetable cells repeat weekly on their dayOfWeek
 * Skips dates within exception ranges (休講期間)
 *
 * @param cell - The timetable cell
 * @param config - Timetable configuration (includes exception ranges)
 * @param afterDate - Find occurrence after this date (default: now)
 * @returns Next occurrence or null if none found within 52 weeks
 */
export function getNextTimetableOccurrence(
  cell: TimetableCellData,
  config: TimetableConfigData,
  afterDate: Date = new Date(),
): NextOccurrenceResult | null {
  const targetDayOfWeek = cell.dayOfWeek; // 0=Mon, 1=Tue, etc.
  const skippedDates: Date[] = [];

  // Start from the day after afterDate
  const candidateDate = new Date(afterDate);
  candidateDate.setDate(candidateDate.getDate() + 1);
  candidateDate.setHours(0, 0, 0, 0);

  // Max 52 weeks to find next valid occurrence
  for (let week = 0; week < 52; week++) {
    // Find next occurrence of target weekday
    const currentDayOfWeek = getWeekdayIndex(candidateDate);

    let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;
    if (daysUntilTarget < 0) {
      daysUntilTarget += 7;
    }

    const targetDate = new Date(candidateDate);
    targetDate.setDate(targetDate.getDate() + daysUntilTarget);

    // Check if this date is in exception range (休講期間)
    if (!isDateInExceptionRange(targetDate, config.exceptionRanges)) {
      // Valid date found! Calculate times
      const { startMinutes, endMinutes } = computeSlotTimes(
        config,
        cell.slotIndex,
      );

      const startDate = new Date(targetDate);
      startDate.setHours(
        Math.floor(startMinutes / 60),
        startMinutes % 60,
        0,
        0,
      );

      const endDate = new Date(targetDate);
      endDate.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

      return {
        startDate,
        endDate,
        skippedDates,
      };
    }

    // This date is in exception range, skip it
    skippedDates.push(new Date(targetDate));

    // Move to next week
    candidateDate.setDate(candidateDate.getDate() + 7);
  }

  return null; // No valid occurrence within 52 weeks
}

// ============================================================================
// DEADLINE CALCULATION
// ============================================================================

/**
 * Calculate when suggestion should become available based on offset type
 *
 * @param occurrenceEnd - When the event occurrence ends
 * @param offset - The offset type
 * @returns Date when suggestion can start appearing, or null for immediate availability
 */
export function calculateSuggestionAvailableFrom(
  occurrenceEnd: Date,
  offset: EventDeadlineOffset,
): Date | null {
  switch (offset) {
    case "1_day_before":
      // Available immediately after task creation
      return null;

    case "same_day_after":
      // Available only after event ends
      return occurrenceEnd;

    case "1_day_after": {
      // Available starting midnight of next day (翌日中)
      // Practical visibility is governed by gap availability,
      // so midnight is just the logical boundary
      const nextDay = new Date(occurrenceEnd);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      return nextDay;
    }
  }
}

/**
 * Calculate deadline from event occurrence and offset
 *
 * @param occurrenceStart - When the event occurrence starts
 * @param occurrenceEnd - When the event occurrence ends
 * @param offset - The offset type
 * @returns The calculated deadline
 */
export function calculateDeadlineFromOccurrence(
  occurrenceStart: Date,
  occurrenceEnd: Date,
  offset: EventDeadlineOffset,
): Date {
  switch (offset) {
    case "same_day_after": {
      // Deadline is end of the day the event ends
      const sameDay = new Date(occurrenceEnd);
      sameDay.setHours(23, 59, 59, 999);
      return sameDay;
    }

    case "1_day_before":
      // Deadline is 24 hours before event starts
      return new Date(occurrenceStart.getTime() - 24 * 60 * 60 * 1000);

    case "1_day_after":
      // Deadline is 24 hours after event ends
      return new Date(occurrenceEnd.getTime() + 24 * 60 * 60 * 1000);
  }
}

/**
 * Calculate the initial deadline for an event-linked task
 *
 * @param eventStart - Event start time
 * @param eventEnd - Event end time
 * @param offset - The offset type
 * @param isRecurring - Whether the event is recurring
 * @param afterDate - For recurring events, find occurrence after this date
 * @returns Object with deadline and tracked occurrence date
 */
export function calculateInitialDeadline(
  eventStart: Date,
  eventEnd: Date,
  offset: EventDeadlineOffset,
  isRecurring: boolean,
  _afterDate: Date = new Date(),
): { deadline: Date; trackedOccurrence: Date } {
  // For non-recurring events, use the event times directly
  if (!isRecurring) {
    const deadline = calculateDeadlineFromOccurrence(
      eventStart,
      eventEnd,
      offset,
    );
    return {
      deadline,
      trackedOccurrence: eventStart,
    };
  }

  // For recurring events, the next occurrence is determined by the caller
  // This function is for simple cases; use getNextCalendarOccurrence for full support
  const deadline = calculateDeadlineFromOccurrence(
    eventStart,
    eventEnd,
    offset,
  );
  return {
    deadline,
    trackedOccurrence: eventStart,
  };
}
