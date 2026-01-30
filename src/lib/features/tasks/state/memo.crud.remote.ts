/**
 * Memo CRUD Remote Functions
 *
 * Server-side Remote Functions for memo CRUD operations.
 * fetch, create, update, delete
 */
import { query, command } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";
import { getAuthenticatedUser } from "./memo.utils.ts";
import { MemoInputSchema, MemoUpdateSchema } from "./memo.schemas.ts";

// ============================================================================
// FETCH
// ============================================================================

/**
 * Fetch all memos for the authenticated user
 */
export const fetchMemos = query(v.optional(v.object({})), async () => {
  const userId = getAuthenticatedUser();

  try {
    const dbMemos = await prisma.memo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Convert DB flat fields to app nested structure
    return dbMemos.map((memo) => ({
      id: memo.id,
      title: memo.title,
      genre: memo.genre ?? undefined,
      type: memo.type as "期限付き" | "バックログ" | "ルーティン",
      createdAt: memo.createdAt.toISOString(),
      deadline: memo.deadline?.toISOString(),
      recurrenceGoal:
        memo.recurrenceGoalCount && memo.recurrenceGoalPeriod
          ? {
              count: memo.recurrenceGoalCount,
              period: memo.recurrenceGoalPeriod as "day" | "week" | "month",
            }
          : undefined,
      locationPreference: memo.locationPreference as
        | "home/near_home"
        | "workplace/near_workplace"
        | "no_preference",
      status: {
        timeSpentMinutes: memo.timeSpentMinutes,
        completionState: memo.completionState as
          | "not_started"
          | "in_progress"
          | "completed",
      },
      sessionDuration: memo.sessionDuration ?? undefined,
      totalDurationExpected: memo.totalDurationExpected ?? undefined,
      lastActivity: memo.lastActivity?.toISOString(),
      importance: memo.importance as "low" | "medium" | "high" | undefined,
      // Type-specific state
      // Note: DB still uses week-based fields, but we map to period-based fields for the app
      // Always return routineState for routine tasks (even with defaults) to support accepted slot persistence
      routineState:
        memo.type === "ルーティン"
          ? {
              acceptedToday: memo.routineAcceptedToday ?? false,
              completedToday: memo.routineCompletedToday ?? false,
              completedCountThisPeriod: memo.routineCompletedCountWeek ?? 0,
              lastCompletedDay:
                memo.routineLastCompletedDay?.toISOString() ?? null,
              previousLastCompletedDay:
                memo.routinePreviousLastCompletedDay?.toISOString() ?? null,
              wasCappedThisPeriod: memo.routineWasCappedThisWeek ?? false,
              periodStartDate: memo.routineWeekStartDate?.toISOString() ?? null,
              rejectedToday: memo.routineRejectedToday ?? false,
              acceptedSlot:
                (memo.routineAcceptedSlot as {
                  startTime: string;
                  endTime: string;
                  duration: number;
                } | null) ?? null,
            }
          : undefined,
      backlogState:
        memo.type === "バックログ"
          ? {
              acceptedToday: memo.backlogAcceptedToday ?? false,
              lastCompletedDay:
                memo.backlogLastCompletedDay?.toISOString() ?? null,
              previousLastCompletedDay:
                memo.backlogPreviousLastCompletedDay?.toISOString() ?? null,
              rejectedToday: memo.backlogRejectedToday ?? false,
              acceptedSlot:
                (memo.backlogAcceptedSlot as {
                  startTime: string;
                  endTime: string;
                  duration: number;
                } | null) ?? null,
            }
          : undefined,
      deadlineState:
        memo.type === "期限付き"
          ? {
              rejectedToday: memo.deadlineRejectedToday ?? false,
              acceptedSlots:
                (memo.deadlineAcceptedSlots as Array<{
                  startTime: string;
                  endTime: string;
                  duration: number;
                  logged?: boolean;
                }>) ?? [],
              lastCompletedDay:
                memo.deadlineLastCompletedDay?.toISOString() ?? null,
              previousLastCompletedDay:
                memo.deadlinePreviousLastCompletedDay?.toISOString() ?? null,
              actualDurations:
                (memo.deadlineActualDurations as number[]) ?? undefined,
            }
          : undefined,
      // Event link (for event-tagged deadline tasks)
      eventLink: memo.eventLinkType
        ? {
            type: memo.eventLinkType as "calendar" | "timetable",
            calendarEventId: memo.linkedCalendarEventId ?? undefined,
            timetableCellId: memo.linkedTimetableCellId ?? undefined,
            offset: memo.eventDeadlineOffset as
              | "same_day_after"
              | "1_day_before"
              | "1_day_after",
            trackedOccurrenceDate:
              memo.trackedOccurrenceDate?.toISOString() ?? undefined,
          }
        : undefined,
      // Suggestion availability timing
      suggestionAvailableFrom:
        memo.suggestionAvailableFrom?.toISOString() ?? undefined,
    }));
  } catch (err) {
    console.error("[fetchMemos] Error:", err);
    throw new Error(
      `Failed to fetch memos: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
});

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new memo
 */
export const createMemo = command(MemoInputSchema, async (input) => {
  const userId = getAuthenticatedUser();

  try {
    const createdAt = new Date(input.createdAt);

    // For routine tasks, set lastCompletedDay to previous day so they appear immediately
    // This gives daily tasks a score of ~0.9 on creation day (natural scoring behavior)
    let routineLastCompletedDay: Date | undefined;
    if (input.type === "ルーティン") {
      if (input.routineState?.lastCompletedDay) {
        routineLastCompletedDay = new Date(input.routineState.lastCompletedDay);
      } else {
        // Set to previous day (createdAt - 1 day)
        routineLastCompletedDay = new Date(
          createdAt.getTime() - 24 * 60 * 60 * 1000,
        );
      }
    }

    const created = await prisma.memo.create({
      data: {
        userId,
        title: input.title,
        genre: input.genre,
        type: input.type,
        createdAt,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
        recurrenceGoalCount: input.recurrenceGoal?.count,
        recurrenceGoalPeriod: input.recurrenceGoal?.period,
        locationPreference: input.locationPreference,
        timeSpentMinutes: input.status.timeSpentMinutes,
        completionState: input.status.completionState,
        sessionDuration: input.sessionDuration,
        totalDurationExpected: input.totalDurationExpected,
        lastActivity: input.lastActivity
          ? new Date(input.lastActivity)
          : undefined,
        importance: input.importance,
        // Routine state (app uses period-based fields, DB uses week-based naming)
        routineAcceptedToday: input.routineState?.acceptedToday,
        routineCompletedToday: input.routineState?.completedToday,
        routineCompletedCountWeek: input.routineState?.completedCountThisPeriod,
        routineLastCompletedDay,
        routineWasCappedThisWeek: input.routineState?.wasCappedThisPeriod,
        routineWeekStartDate: input.routineState?.periodStartDate
          ? new Date(input.routineState.periodStartDate)
          : undefined,
        // Backlog state
        backlogAcceptedToday: input.backlogState?.acceptedToday,
        backlogLastCompletedDay: input.backlogState?.lastCompletedDay
          ? new Date(input.backlogState.lastCompletedDay)
          : undefined,
        // Event link
        eventLinkType: input.eventLink?.type,
        linkedCalendarEventId: input.eventLink?.calendarEventId,
        linkedTimetableCellId: input.eventLink?.timetableCellId,
        eventDeadlineOffset: input.eventLink?.offset,
        trackedOccurrenceDate: input.eventLink?.trackedOccurrenceDate
          ? new Date(input.eventLink.trackedOccurrenceDate)
          : undefined,
        // Suggestion availability timing
        suggestionAvailableFrom: input.suggestionAvailableFrom
          ? new Date(input.suggestionAvailableFrom)
          : undefined,
      },
    });

    return {
      id: created.id,
      title: created.title,
      genre: created.genre ?? undefined,
      type: created.type as "期限付き" | "バックログ" | "ルーティン",
      createdAt: created.createdAt.toISOString(),
      deadline: created.deadline?.toISOString(),
      recurrenceGoal:
        created.recurrenceGoalCount && created.recurrenceGoalPeriod
          ? {
              count: created.recurrenceGoalCount,
              period: created.recurrenceGoalPeriod as "day" | "week" | "month",
            }
          : undefined,
      locationPreference: created.locationPreference as
        | "home/near_home"
        | "workplace/near_workplace"
        | "no_preference",
      status: {
        timeSpentMinutes: created.timeSpentMinutes,
        completionState: created.completionState as
          | "not_started"
          | "in_progress"
          | "completed",
      },
      sessionDuration: created.sessionDuration ?? undefined,
      totalDurationExpected: created.totalDurationExpected ?? undefined,
      lastActivity: created.lastActivity?.toISOString(),
      importance: created.importance as "low" | "medium" | "high" | undefined,
      // Type-specific state (DB uses week-based naming, app uses period-based)
      // Always return routineState for routine tasks to support accepted slot persistence
      routineState:
        created.type === "ルーティン"
          ? {
              acceptedToday: created.routineAcceptedToday ?? false,
              completedToday: created.routineCompletedToday ?? false,
              completedCountThisPeriod: created.routineCompletedCountWeek ?? 0,
              lastCompletedDay:
                created.routineLastCompletedDay?.toISOString() ?? null,
              wasCappedThisPeriod: created.routineWasCappedThisWeek ?? false,
              periodStartDate:
                created.routineWeekStartDate?.toISOString() ?? null,
              rejectedToday: created.routineRejectedToday ?? false,
              acceptedSlot:
                (created.routineAcceptedSlot as {
                  startTime: string;
                  endTime: string;
                  duration: number;
                } | null) ?? null,
            }
          : undefined,
      backlogState:
        created.type === "バックログ"
          ? {
              acceptedToday: created.backlogAcceptedToday ?? false,
              lastCompletedDay:
                created.backlogLastCompletedDay?.toISOString() ?? null,
              rejectedToday: created.backlogRejectedToday ?? false,
              acceptedSlot:
                (created.backlogAcceptedSlot as {
                  startTime: string;
                  endTime: string;
                  duration: number;
                } | null) ?? null,
            }
          : undefined,
      // Deadline state
      deadlineState:
        created.type === "期限付き"
          ? {
              rejectedToday: created.deadlineRejectedToday ?? false,
              acceptedSlots:
                (created.deadlineAcceptedSlots as Array<{
                  startTime: string;
                  endTime: string;
                  duration: number;
                  logged?: boolean;
                }>) ?? [],
              lastCompletedDay:
                created.deadlineLastCompletedDay?.toISOString() ?? null,
              previousLastCompletedDay:
                created.deadlinePreviousLastCompletedDay?.toISOString() ?? null,
            }
          : undefined,
      // Event link
      eventLink: created.eventLinkType
        ? {
            type: created.eventLinkType as "calendar" | "timetable",
            calendarEventId: created.linkedCalendarEventId ?? undefined,
            timetableCellId: created.linkedTimetableCellId ?? undefined,
            offset: created.eventDeadlineOffset as
              | "same_day_after"
              | "1_day_before"
              | "1_day_after",
            trackedOccurrenceDate:
              created.trackedOccurrenceDate?.toISOString() ?? undefined,
          }
        : undefined,
    };
  } catch (err) {
    console.error("[createMemo] Error:", err);
    throw new Error("Failed to create memo");
  }
});

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update an existing memo
 */
export const updateMemo = command(MemoUpdateSchema, async (input) => {
  const userId = getAuthenticatedUser();

  try {
    // Verify ownership
    const existing = await prisma.memo.findFirst({
      where: {
        id: input.id,
        userId,
      },
    });

    if (!existing) {
      throw new Error("Memo not found");
    }

    // Build update data (flat fields for Prisma)
    const updateData: Record<string, unknown> = {};
    if (input.updates.title !== undefined)
      updateData.title = input.updates.title;
    if (input.updates.genre !== undefined)
      updateData.genre = input.updates.genre;
    if (input.updates.type !== undefined) updateData.type = input.updates.type;
    if (input.updates.deadline !== undefined)
      updateData.deadline = input.updates.deadline
        ? new Date(input.updates.deadline)
        : null;
    if (input.updates.recurrenceGoal !== undefined) {
      updateData.recurrenceGoalCount =
        input.updates.recurrenceGoal?.count ?? null;
      updateData.recurrenceGoalPeriod =
        input.updates.recurrenceGoal?.period ?? null;
    }
    if (input.updates.locationPreference !== undefined)
      updateData.locationPreference = input.updates.locationPreference;
    if (input.updates.status !== undefined) {
      updateData.timeSpentMinutes = input.updates.status.timeSpentMinutes;
      updateData.completionState = input.updates.status.completionState;
    }
    if (input.updates.sessionDuration !== undefined)
      updateData.sessionDuration = input.updates.sessionDuration;
    if (input.updates.totalDurationExpected !== undefined)
      updateData.totalDurationExpected = input.updates.totalDurationExpected;
    if (input.updates.lastActivity !== undefined)
      updateData.lastActivity = input.updates.lastActivity
        ? new Date(input.updates.lastActivity)
        : null;
    if (input.updates.importance !== undefined)
      updateData.importance = input.updates.importance;
    // Routine state (app uses period-based fields, DB uses week-based naming)
    if (input.updates.routineState !== undefined) {
      updateData.routineAcceptedToday =
        input.updates.routineState.acceptedToday;
      updateData.routineCompletedToday =
        input.updates.routineState.completedToday;
      updateData.routineCompletedCountWeek =
        input.updates.routineState.completedCountThisPeriod;
      updateData.routineLastCompletedDay = input.updates.routineState
        .lastCompletedDay
        ? new Date(input.updates.routineState.lastCompletedDay)
        : null;
      updateData.routineWasCappedThisWeek =
        input.updates.routineState.wasCappedThisPeriod;
      updateData.routineWeekStartDate = input.updates.routineState
        .periodStartDate
        ? new Date(input.updates.routineState.periodStartDate)
        : null;
      updateData.routineAcceptedSlot = input.updates.routineState.acceptedSlot;
    }
    // Backlog state
    if (input.updates.backlogState !== undefined) {
      updateData.backlogAcceptedToday =
        input.updates.backlogState.acceptedToday;
      updateData.backlogLastCompletedDay = input.updates.backlogState
        .lastCompletedDay
        ? new Date(input.updates.backlogState.lastCompletedDay)
        : null;
      updateData.backlogAcceptedSlot = input.updates.backlogState.acceptedSlot;
    }
    // Deadline state
    if (input.updates.deadlineState !== undefined) {
      updateData.deadlineRejectedToday =
        input.updates.deadlineState.rejectedToday;
      updateData.deadlineAcceptedSlots =
        input.updates.deadlineState.acceptedSlots;
      updateData.deadlineLastCompletedDay = input.updates.deadlineState
        .lastCompletedDay
        ? new Date(input.updates.deadlineState.lastCompletedDay)
        : null;
      updateData.deadlinePreviousLastCompletedDay = input.updates.deadlineState
        .previousLastCompletedDay
        ? new Date(input.updates.deadlineState.previousLastCompletedDay)
        : null;
    }

    const updated = await prisma.memo.update({
      where: { id: input.id },
      data: updateData,
    });

    return {
      id: updated.id,
      title: updated.title,
      genre: updated.genre ?? undefined,
      type: updated.type as "期限付き" | "バックログ" | "ルーティン",
      createdAt: updated.createdAt.toISOString(),
      deadline: updated.deadline?.toISOString(),
      recurrenceGoal:
        updated.recurrenceGoalCount && updated.recurrenceGoalPeriod
          ? {
              count: updated.recurrenceGoalCount,
              period: updated.recurrenceGoalPeriod as "day" | "week" | "month",
            }
          : undefined,
      locationPreference: updated.locationPreference as
        | "home/near_home"
        | "workplace/near_workplace"
        | "no_preference",
      status: {
        timeSpentMinutes: updated.timeSpentMinutes,
        completionState: updated.completionState as
          | "not_started"
          | "in_progress"
          | "completed",
      },
      sessionDuration: updated.sessionDuration ?? undefined,
      totalDurationExpected: updated.totalDurationExpected ?? undefined,
      lastActivity: updated.lastActivity?.toISOString(),
      importance: updated.importance as "low" | "medium" | "high" | undefined,
      // Type-specific state (DB uses week-based naming, app uses period-based)
      // Always return routineState for routine tasks to support accepted slot persistence
      routineState:
        updated.type === "ルーティン"
          ? {
              acceptedToday: updated.routineAcceptedToday ?? false,
              completedToday: updated.routineCompletedToday ?? false,
              completedCountThisPeriod: updated.routineCompletedCountWeek ?? 0,
              lastCompletedDay:
                updated.routineLastCompletedDay?.toISOString() ?? null,
              wasCappedThisPeriod: updated.routineWasCappedThisWeek ?? false,
              periodStartDate:
                updated.routineWeekStartDate?.toISOString() ?? null,
              rejectedToday: updated.routineRejectedToday ?? false,
              acceptedSlot:
                (updated.routineAcceptedSlot as {
                  startTime: string;
                  endTime: string;
                  duration: number;
                } | null) ?? null,
            }
          : undefined,
      backlogState:
        updated.type === "バックログ"
          ? {
              acceptedToday: updated.backlogAcceptedToday ?? false,
              lastCompletedDay:
                updated.backlogLastCompletedDay?.toISOString() ?? null,
              rejectedToday: updated.backlogRejectedToday ?? false,
              acceptedSlot:
                (updated.backlogAcceptedSlot as {
                  startTime: string;
                  endTime: string;
                  duration: number;
                } | null) ?? null,
            }
          : undefined,
      // Deadline state
      deadlineState:
        updated.type === "期限付き"
          ? {
              rejectedToday: updated.deadlineRejectedToday ?? false,
              acceptedSlots:
                (updated.deadlineAcceptedSlots as Array<{
                  startTime: string;
                  endTime: string;
                  duration: number;
                  logged?: boolean;
                }>) ?? [],
              lastCompletedDay:
                updated.deadlineLastCompletedDay?.toISOString() ?? null,
              previousLastCompletedDay:
                updated.deadlinePreviousLastCompletedDay?.toISOString() ?? null,
              actualDurations:
                (updated.deadlineActualDurations as number[]) ?? [],
            }
          : undefined,
      // Event link (for event-tagged deadline tasks)
      eventLink: updated.eventLinkType
        ? {
            type: updated.eventLinkType as "calendar" | "timetable",
            calendarEventId: updated.linkedCalendarEventId ?? undefined,
            timetableCellId: updated.linkedTimetableCellId ?? undefined,
            offset: updated.eventDeadlineOffset as
              | "same_day_after"
              | "1_day_before"
              | "1_day_after",
            trackedOccurrenceDate:
              updated.trackedOccurrenceDate?.toISOString() ?? undefined,
          }
        : undefined,
      suggestionAvailableFrom:
        updated.suggestionAvailableFrom?.toISOString() ?? undefined,
    };
  } catch (err) {
    console.error("[updateMemo] Error:", err);
    throw new Error("Failed to update memo");
  }
});

// ============================================================================
// DELETE
// ============================================================================

/**
 * Delete a memo
 */
export const deleteMemo = command(
  v.object({ id: v.string() }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      // Verify ownership
      const existing = await prisma.memo.findFirst({
        where: {
          id: input.id,
          userId,
        },
      });

      if (!existing) {
        throw new Error("Memo not found");
      }

      // Delete
      await prisma.memo.delete({
        where: { id: input.id },
      });

      return { success: true };
    } catch (err) {
      console.error("[deleteMemo] Error:", err);
      throw new Error("Failed to delete memo");
    }
  },
);
