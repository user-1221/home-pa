/**
 * Memo Event-Link Remote Functions
 *
 * Server-side Remote Functions for event-linked deadline tasks:
 * - Advance to next occurrence
 * - Recalculate deadlines when source event changes
 */
import { command } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";
import { getAuthenticatedUser } from "./memo.utils.ts";

// ============================================================================
// ADVANCE EVENT-LINKED DEADLINE
// ============================================================================

/**
 * Advance an event-linked deadline task to the next occurrence
 * Called when the task is marked complete (rolling deadline)
 */
export const advanceEventLinkedDeadline = command(
  v.object({
    memoId: v.string(),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      const existing = await prisma.memo.findFirst({
        where: {
          id: input.memoId,
          userId,
        },
      });

      if (!existing) {
        throw new Error("Memo not found");
      }

      // Only process event-linked deadline tasks
      if (!existing.eventLinkType || existing.type !== "期限付き") {
        return { id: input.memoId, advanced: false };
      }

      const offset = existing.eventDeadlineOffset as
        | "same_day_after"
        | "1_day_before"
        | "1_day_after";
      const currentTracked = existing.trackedOccurrenceDate ?? new Date();

      let newDeadline: Date | null = null;
      let newTrackedOccurrence: Date | null = null;
      let newOccurrenceEnd: Date | null = null;

      if (
        existing.eventLinkType === "calendar" &&
        existing.linkedCalendarEventId
      ) {
        // Fetch the linked calendar event
        const calendarEvent = await prisma.calendarEvent.findFirst({
          where: { id: existing.linkedCalendarEventId },
        });

        if (calendarEvent && calendarEvent.icalData) {
          // Dynamic import to avoid circular dependencies
          const { getNextCalendarOccurrence, calculateDeadlineFromOccurrence } =
            await import("../services/event-deadline-service");

          // Build Event object for the service
          const eventForCalc = {
            id: calendarEvent.id,
            title: calendarEvent.summary,
            start: calendarEvent.dtstart,
            end: calendarEvent.dtend ?? calendarEvent.dtstart,
            icalData: calendarEvent.icalData,
            recurrence: calendarEvent.hasRecurrence
              ? { type: "RRULE" as const, rrule: calendarEvent.rrule ?? "" }
              : { type: "NONE" as const },
          };

          const nextOcc = getNextCalendarOccurrence(
            eventForCalc,
            currentTracked,
          );
          if (nextOcc) {
            newDeadline = calculateDeadlineFromOccurrence(
              nextOcc.startDate,
              nextOcc.endDate,
              offset,
            );
            newTrackedOccurrence = nextOcc.startDate;
            newOccurrenceEnd = nextOcc.endDate;
          }
        }
      } else if (
        existing.eventLinkType === "timetable" &&
        existing.linkedTimetableCellId
      ) {
        // Fetch timetable cell and config
        const cell = await prisma.timetableCell.findFirst({
          where: { id: existing.linkedTimetableCellId },
        });
        const config = await prisma.timetableConfig.findFirst({
          where: { userId },
        });

        if (cell && config) {
          const {
            getNextTimetableOccurrence,
            calculateDeadlineFromOccurrence,
          } = await import("../services/event-deadline-service");

          const timetableConfig = {
            dayStartTime: config.dayStartTime,
            lunchStartTime: config.lunchStartTime,
            lunchEndTime: config.lunchEndTime,
            breakDuration: config.breakDuration,
            cellDuration: config.cellDuration,
            exceptionRanges:
              (config.exceptionRanges as Array<{
                start: string;
                end: string;
              }>) ?? [],
          };

          const cellData = {
            id: cell.id,
            dayOfWeek: cell.dayOfWeek,
            slotIndex: cell.slotIndex,
            title: cell.title,
            attendance: cell.attendance,
            workAllowed: cell.workAllowed,
          };

          const nextOcc = getNextTimetableOccurrence(
            cellData,
            timetableConfig,
            currentTracked,
          );
          if (nextOcc) {
            newDeadline = calculateDeadlineFromOccurrence(
              nextOcc.startDate,
              nextOcc.endDate,
              offset,
            );
            newTrackedOccurrence = nextOcc.startDate;
            newOccurrenceEnd = nextOcc.endDate;
          }
        }
      }

      if (newDeadline && newTrackedOccurrence && newOccurrenceEnd) {
        // Calculate new suggestionAvailableFrom for the next occurrence
        const { calculateSuggestionAvailableFrom } = await import(
          "../services/event-deadline-service"
        );
        const newSuggestionAvailableFrom = calculateSuggestionAvailableFrom(
          newOccurrenceEnd,
          offset,
        );

        await prisma.memo.update({
          where: { id: input.memoId },
          data: {
            deadline: newDeadline,
            trackedOccurrenceDate: newTrackedOccurrence,
            suggestionAvailableFrom: newSuggestionAvailableFrom,
            // Reset completion state for next cycle
            completionState: "not_started",
            deadlineAcceptedSlots: [], // Clear accepted slots
            deadlineRejectedToday: false,
            // Reset deadline tracking state for new cycle
            deadlineLastCompletedDay: null,
            deadlinePreviousLastCompletedDay: null,
            deadlineActualDurations: [], // Reset duration tracking array
          },
        });

        console.log(
          `[advanceEventLinkedDeadline] Advanced memo ${input.memoId} to next occurrence: ${newTrackedOccurrence.toISOString()}`,
        );

        return {
          id: input.memoId,
          advanced: true,
          newDeadline: newDeadline.toISOString(),
          newTrackedOccurrence: newTrackedOccurrence.toISOString(),
          newSuggestionAvailableFrom: newSuggestionAvailableFrom?.toISOString(),
        };
      }

      // No next occurrence found
      console.log(
        `[advanceEventLinkedDeadline] No next occurrence found for memo ${input.memoId}`,
      );
      return { id: input.memoId, advanced: false };
    } catch (err) {
      console.error("[advanceEventLinkedDeadline] Error:", err);
      throw new Error("Failed to advance deadline");
    }
  },
);

// ============================================================================
// RECALCULATE EVENT-LINKED DEADLINES
// ============================================================================

/**
 * Recalculate deadline for all event-linked memos linked to a specific calendar event
 * Called when the source event is updated/moved
 */
export const recalculateEventLinkedDeadlines = command(
  v.object({
    calendarEventId: v.string(),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      // Find all memos linked to this calendar event
      const linkedMemos = await prisma.memo.findMany({
        where: {
          userId,
          linkedCalendarEventId: input.calendarEventId,
          completionState: { not: "completed" },
        },
      });

      if (linkedMemos.length === 0) {
        return { updated: 0 };
      }

      // Fetch the calendar event
      const calendarEvent = await prisma.calendarEvent.findFirst({
        where: { id: input.calendarEventId },
      });

      if (!calendarEvent) {
        // Event was deleted - orphan the linked tasks
        await prisma.memo.updateMany({
          where: {
            userId,
            linkedCalendarEventId: input.calendarEventId,
          },
          data: {
            eventLinkType: null,
            linkedCalendarEventId: null,
            eventDeadlineOffset: null,
            trackedOccurrenceDate: null,
          },
        });
        console.log(
          `[recalculateEventLinkedDeadlines] Orphaned ${linkedMemos.length} memos - source event deleted`,
        );
        return { updated: linkedMemos.length, orphaned: true };
      }

      const { getNextCalendarOccurrence, calculateDeadlineFromOccurrence } =
        await import("../services/event-deadline-service");

      let updatedCount = 0;

      for (const memo of linkedMemos) {
        const offset = memo.eventDeadlineOffset as
          | "same_day_after"
          | "1_day_before"
          | "1_day_after";

        // Use the currently tracked occurrence as reference point
        // If the event moved, we recalculate from where we were tracking
        const referenceDate = memo.trackedOccurrenceDate
          ? new Date(memo.trackedOccurrenceDate.getTime() - 24 * 60 * 60 * 1000) // Day before tracked
          : new Date();

        const eventForCalc = {
          id: calendarEvent.id,
          title: calendarEvent.summary,
          start: calendarEvent.dtstart,
          end: calendarEvent.dtend ?? calendarEvent.dtstart,
          icalData: calendarEvent.icalData,
          recurrence: calendarEvent.hasRecurrence
            ? { type: "RRULE" as const, rrule: calendarEvent.rrule ?? "" }
            : { type: "NONE" as const },
        };

        const nextOcc = getNextCalendarOccurrence(eventForCalc, referenceDate);
        if (nextOcc) {
          const newDeadline = calculateDeadlineFromOccurrence(
            nextOcc.startDate,
            nextOcc.endDate,
            offset,
          );

          await prisma.memo.update({
            where: { id: memo.id },
            data: {
              deadline: newDeadline,
              trackedOccurrenceDate: nextOcc.startDate,
            },
          });

          updatedCount++;
        }
      }

      console.log(
        `[recalculateEventLinkedDeadlines] Updated ${updatedCount} memos for event ${input.calendarEventId}`,
      );

      return { updated: updatedCount };
    } catch (err) {
      console.error("[recalculateEventLinkedDeadlines] Error:", err);
      throw new Error("Failed to recalculate deadlines");
    }
  },
);
