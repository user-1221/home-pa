/**
 * Memo Remote Functions (Server-side)
 *
 * Server-side Remote Functions for memo operations.
 * These run on the server and are callable from client with type safety.
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";

// ============================================================================
// HELPER - Get authenticated user
// ============================================================================

function getAuthenticatedUser(): string {
  const event = getRequestEvent();
  if (!event.locals.user?.id) {
    throw new Error("Unauthorized");
  }
  return event.locals.user.id;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const RecurrenceGoalSchema = v.object({
  count: v.number(),
  period: v.picklist(["day", "week", "month"]),
});

const MemoStatusSchema = v.object({
  timeSpentMinutes: v.number(),
  completionState: v.picklist(["not_started", "in_progress", "completed"]),
  completionsThisPeriod: v.optional(v.number()),
  periodStartDate: v.optional(v.string()),
});

// Accepted slot schema (shared by all task types)
const AcceptedSlotSchema = v.object({
  startTime: v.string(),
  endTime: v.string(),
  duration: v.number(),
});

// Type-specific state schemas
const RoutineStateSchema = v.optional(
  v.object({
    acceptedToday: v.boolean(),
    completedToday: v.boolean(),
    completedCountThisPeriod: v.number(),
    lastCompletedDay: v.nullable(v.string()),
    wasCappedThisPeriod: v.boolean(),
    periodStartDate: v.nullable(v.string()),
    rejectedToday: v.boolean(),
    acceptedSlot: v.nullable(AcceptedSlotSchema),
  }),
);

const BacklogStateSchema = v.optional(
  v.object({
    acceptedToday: v.boolean(),
    lastCompletedDay: v.nullable(v.string()),
    rejectedToday: v.boolean(),
    acceptedSlot: v.nullable(AcceptedSlotSchema),
  }),
);

const _DeadlineStateSchema = v.optional(
  v.object({
    rejectedToday: v.boolean(),
    acceptedSlots: v.array(AcceptedSlotSchema),
  }),
);

// Event link schema for event-tagged deadline tasks
const EventLinkSchema = v.optional(
  v.object({
    type: v.picklist(["calendar", "timetable"]),
    calendarEventId: v.optional(v.string()),
    timetableCellId: v.optional(v.string()),
    offset: v.picklist(["same_day_after", "1_day_before", "1_day_after"]),
    trackedOccurrenceDate: v.optional(v.string()),
  }),
);

const MemoInputSchema = v.object({
  title: v.string(),
  genre: v.optional(v.string()),
  type: v.picklist(["期限付き", "バックログ", "ルーティン"]),
  createdAt: v.string(),
  deadline: v.optional(v.string()),
  recurrenceGoal: v.optional(RecurrenceGoalSchema),
  locationPreference: v.picklist([
    "home/near_home",
    "workplace/near_workplace",
    "no_preference",
  ]),
  status: MemoStatusSchema,
  sessionDuration: v.optional(v.number()),
  totalDurationExpected: v.optional(v.number()),
  lastActivity: v.optional(v.string()),
  importance: v.optional(v.picklist(["low", "medium", "high"])),
  // Type-specific state
  routineState: RoutineStateSchema,
  backlogState: BacklogStateSchema,
  // Event link (for event-tagged deadline tasks)
  eventLink: EventLinkSchema,
  // Suggestion availability timing (for event-linked tasks)
  suggestionAvailableFrom: v.optional(v.string()),
});

const MemoUpdateSchema = v.object({
  id: v.string(),
  updates: v.object({
    title: v.optional(v.string()),
    genre: v.optional(v.string()),
    type: v.optional(v.picklist(["期限付き", "バックログ", "ルーティン"])),
    deadline: v.optional(v.string()),
    recurrenceGoal: v.optional(RecurrenceGoalSchema),
    locationPreference: v.optional(
      v.picklist([
        "home/near_home",
        "workplace/near_workplace",
        "no_preference",
      ]),
    ),
    status: v.optional(MemoStatusSchema),
    sessionDuration: v.optional(v.number()),
    totalDurationExpected: v.optional(v.number()),
    lastActivity: v.optional(v.string()),
    importance: v.optional(v.picklist(["low", "medium", "high"])),
    // Type-specific state
    routineState: RoutineStateSchema,
    backlogState: BacklogStateSchema,
  }),
});

// ============================================================================
// REMOTE FUNCTIONS
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
        completionsThisPeriod: memo.completionsThisPeriod ?? undefined,
        periodStartDate: memo.periodStartDate?.toISOString(),
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
                }>) ?? [],
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
        completionsThisPeriod: input.status.completionsThisPeriod,
        periodStartDate: input.status.periodStartDate
          ? new Date(input.status.periodStartDate)
          : undefined,
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
        completionsThisPeriod: created.completionsThisPeriod ?? undefined,
        periodStartDate: created.periodStartDate?.toISOString(),
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
      updateData.completionsThisPeriod =
        input.updates.status.completionsThisPeriod;
      updateData.periodStartDate = input.updates.status.periodStartDate
        ? new Date(input.updates.status.periodStartDate)
        : null;
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
        completionsThisPeriod: updated.completionsThisPeriod ?? undefined,
        periodStartDate: updated.periodStartDate?.toISOString(),
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
    };
  } catch (err) {
    console.error("[updateMemo] Error:", err);
    throw new Error("Failed to update memo");
  }
});

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

/**
 * Log progress for a completed suggestion session
 * Updates timeSpentMinutes, lastActivity, completionsThisPeriod, and type-specific state
 */
export const logSuggestionComplete = command(
  v.object({
    memoId: v.string(),
    durationMinutes: v.number(),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      // Verify ownership and get current state
      const existing = await prisma.memo.findFirst({
        where: {
          id: input.memoId,
          userId,
        },
      });

      if (!existing) {
        throw new Error("Memo not found");
      }

      // Calculate updates
      const newTimeSpent = existing.timeSpentMinutes + input.durationMinutes;
      const newCompletions = (existing.completionsThisPeriod ?? 0) + 1;
      const now = new Date();

      // Build update data
      const updateData: Record<string, unknown> = {
        timeSpentMinutes: newTimeSpent,
        completionsThisPeriod: newCompletions,
        lastActivity: now,
        // Update completionState if significant progress
        completionState:
          existing.completionState === "not_started"
            ? "in_progress"
            : existing.completionState,
      };

      // Type-specific state updates
      if (existing.type === "ルーティン") {
        // Calculate week start (Monday)
        const weekStart = getWeekStart(now);
        const existingWeekStart = existing.routineWeekStartDate
          ? new Date(existing.routineWeekStartDate)
          : null;

        // Check if we need to reset week counter
        const needsWeekReset =
          !existingWeekStart || !isSameWeek(existingWeekStart, now);

        const baseCount = needsWeekReset
          ? 0
          : (existing.routineCompletedCountWeek ?? 0);
        const newCount = baseCount + 1;

        // Check if goal is now met
        const goalCount = existing.recurrenceGoalCount ?? 3;
        const shouldCap = newCount >= goalCount;

        updateData.routineAcceptedToday = true;
        updateData.routineCompletedToday = true;
        updateData.routineCompletedCountWeek = newCount;
        updateData.routineLastCompletedDay = now;
        updateData.routineWasCappedThisWeek = needsWeekReset
          ? shouldCap
          : (existing.routineWasCappedThisWeek ?? false) || shouldCap;
        updateData.routineWeekStartDate = needsWeekReset
          ? weekStart
          : existingWeekStart;
        // Keep acceptedSlot - task stays "accepted" until user marks missed/deletes
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = true;
        updateData.backlogLastCompletedDay = now;
        // Keep acceptedSlot - task stays "accepted" until user marks missed/deletes
      }
      // Deadline tasks: keep acceptedSlots - task stays "accepted" until user marks missed/deletes

      // Update memo with progress
      const updated = await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(
        `[logSuggestionComplete] Logged ${input.durationMinutes}min for memo ${input.memoId}. Total: ${newTimeSpent}min, Completions: ${newCompletions}`,
      );

      return {
        id: updated.id,
        timeSpentMinutes: updated.timeSpentMinutes,
        completionsThisPeriod: updated.completionsThisPeriod ?? 0,
        lastActivity: updated.lastActivity?.toISOString(),
        // Return routine state if applicable (DB uses week-based naming, app uses period-based)
        routineState:
          updated.type === "ルーティン"
            ? {
                acceptedToday: updated.routineAcceptedToday ?? false,
                completedToday: updated.routineCompletedToday ?? false,
                completedCountThisPeriod:
                  updated.routineCompletedCountWeek ?? 0,
                lastCompletedDay:
                  updated.routineLastCompletedDay?.toISOString() ?? null,
                wasCappedThisPeriod: updated.routineWasCappedThisWeek ?? false,
                periodStartDate:
                  updated.routineWeekStartDate?.toISOString() ?? null,
              }
            : undefined,
        backlogState:
          updated.type === "バックログ"
            ? {
                acceptedToday: updated.backlogAcceptedToday ?? false,
                lastCompletedDay:
                  updated.backlogLastCompletedDay?.toISOString() ?? null,
              }
            : undefined,
      };
    } catch (err) {
      console.error("[logSuggestionComplete] Error:", err);
      throw new Error("Failed to log progress");
    }
  },
);

/**
 * Mark a memo as accepted (for routine/backlog - sets acceptedToday = true)
 * This is called when a user accepts a suggestion without completing it yet.
 * The acceptedToday flag causes the scoring function to treat the task as
 * "done for today" (score drops to ~0), preventing duplicate suggestions.
 *
 * Also stores the accepted time slot for persistence across page reloads.
 */
export const markMemoAccepted = command(
  v.object({
    memoId: v.string(),
    slot: v.optional(AcceptedSlotSchema),
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

      const now = new Date();
      const updateData: Record<string, unknown> = {
        lastActivity: now,
      };

      // Only update acceptedToday for routine and backlog tasks
      if (existing.type === "ルーティン") {
        const weekStart = getWeekStart(now);
        const existingWeekStart = existing.routineWeekStartDate
          ? new Date(existing.routineWeekStartDate)
          : null;
        const needsWeekReset =
          !existingWeekStart || !isSameWeek(existingWeekStart, now);

        updateData.routineAcceptedToday = true;
        updateData.routineAcceptedSlot = input.slot ?? null;
        // Save original lastCompletedDay before overwriting (for undo on delete)
        updateData.routinePreviousLastCompletedDay =
          existing.routineLastCompletedDay;
        updateData.routineLastCompletedDay = now; // Treat as completed for scoring
        updateData.routineWeekStartDate = needsWeekReset
          ? weekStart
          : existingWeekStart;
        // Reset week counter if needed
        if (needsWeekReset) {
          updateData.routineCompletedCountWeek = 0;
          updateData.routineWasCappedThisWeek = false;
        }
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = true;
        updateData.backlogAcceptedSlot = input.slot ?? null;
        // Save original lastCompletedDay before overwriting (for undo on delete)
        updateData.backlogPreviousLastCompletedDay =
          existing.backlogLastCompletedDay;
        updateData.backlogLastCompletedDay = now; // Treat as completed for scoring
      }
      // Deadline tasks don't have acceptedToday - they use a different mechanism

      const updated = await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(`[markMemoAccepted] Marked memo ${input.memoId} as accepted`);

      return {
        id: updated.id,
        type: updated.type,
        // DB uses week-based naming, app uses period-based
        routineState:
          updated.type === "ルーティン"
            ? {
                acceptedToday: updated.routineAcceptedToday ?? false,
                completedToday: updated.routineCompletedToday ?? false,
                completedCountThisPeriod:
                  updated.routineCompletedCountWeek ?? 0,
                lastCompletedDay:
                  updated.routineLastCompletedDay?.toISOString() ?? null,
                previousLastCompletedDay:
                  updated.routinePreviousLastCompletedDay?.toISOString() ??
                  null,
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
                previousLastCompletedDay:
                  updated.backlogPreviousLastCompletedDay?.toISOString() ??
                  null,
                rejectedToday: updated.backlogRejectedToday ?? false,
                acceptedSlot:
                  (updated.backlogAcceptedSlot as {
                    startTime: string;
                    endTime: string;
                    duration: number;
                  } | null) ?? null,
              }
            : undefined,
      };
    } catch (err) {
      console.error("[markMemoAccepted] Error:", err);
      throw new Error("Failed to mark memo as accepted");
    }
  },
);

/**
 * Reset acceptedToday flag for a memo (when user marks as "missed")
 * This allows the task to reappear in suggestions
 */
export const resetMemoAcceptedToday = command(
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

      const updateData: Record<string, unknown> = {};

      if (existing.type === "ルーティン") {
        updateData.routineAcceptedToday = false;
        updateData.routineCompletedToday = false;
        updateData.routineAcceptedSlot = null;
        // Restore lastCompletedDay from saved value (undo the acceptance)
        updateData.routineLastCompletedDay =
          existing.routinePreviousLastCompletedDay;
        updateData.routinePreviousLastCompletedDay = null;
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = false;
        updateData.backlogAcceptedSlot = null;
        // Restore lastCompletedDay from saved value (undo the acceptance)
        updateData.backlogLastCompletedDay =
          existing.backlogPreviousLastCompletedDay;
        updateData.backlogPreviousLastCompletedDay = null;
      }

      if (Object.keys(updateData).length === 0) {
        return { id: existing.id, success: true };
      }

      await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(
        `[resetMemoAcceptedToday] Reset acceptedToday for memo ${input.memoId}`,
      );

      return { id: input.memoId, success: true };
    } catch (err) {
      console.error("[resetMemoAcceptedToday] Error:", err);
      throw new Error("Failed to reset memo accepted state");
    }
  },
);

/**
 * Mark a memo as rejected (sets rejectedToday = true for all task types)
 * This prevents the task from reappearing in suggestions for today.
 */
export const markMemoRejected = command(
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

      const updateData: Record<string, unknown> = {};

      if (existing.type === "ルーティン") {
        updateData.routineRejectedToday = true;
      } else if (existing.type === "バックログ") {
        updateData.backlogRejectedToday = true;
      } else if (existing.type === "期限付き") {
        updateData.deadlineRejectedToday = true;
      }

      if (Object.keys(updateData).length === 0) {
        return { id: existing.id, success: true };
      }

      await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(`[markMemoRejected] Marked memo ${input.memoId} as rejected`);

      return { id: input.memoId, success: true };
    } catch (err) {
      console.error("[markMemoRejected] Error:", err);
      throw new Error("Failed to mark memo as rejected");
    }
  },
);

/**
 * Add an accepted time slot to a deadline task
 * This is called when a deadline suggestion is accepted with time slot info.
 */
export const addDeadlineAcceptedSlot = command(
  v.object({
    memoId: v.string(),
    slot: AcceptedSlotSchema,
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

      if (existing.type !== "期限付き") {
        throw new Error("Memo is not a deadline task");
      }

      // Get current slots or initialize empty array
      const currentSlots =
        (existing.deadlineAcceptedSlots as Array<{
          startTime: string;
          endTime: string;
          duration: number;
        }>) ?? [];

      // Add new slot
      const newSlots = [...currentSlots, input.slot];

      await prisma.memo.update({
        where: { id: input.memoId },
        data: {
          deadlineAcceptedSlots: newSlots,
          lastActivity: new Date(),
        },
      });

      console.log(
        `[addDeadlineAcceptedSlot] Added slot to memo ${input.memoId}:`,
        input.slot,
      );

      return {
        id: input.memoId,
        acceptedSlots: newSlots,
      };
    } catch (err) {
      console.error("[addDeadlineAcceptedSlot] Error:", err);
      throw new Error("Failed to add accepted slot");
    }
  },
);

/**
 * Remove an accepted time slot from a deadline task
 * Called when user deletes/cancels an accepted deadline suggestion.
 */
export const removeDeadlineAcceptedSlot = command(
  v.object({
    memoId: v.string(),
    startTime: v.string(), // Used to identify the slot to remove
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

      if (existing.type !== "期限付き") {
        throw new Error("Memo is not a deadline task");
      }

      // Get current slots
      const currentSlots =
        (existing.deadlineAcceptedSlots as Array<{
          startTime: string;
          endTime: string;
          duration: number;
        }>) ?? [];

      // Remove the slot with matching startTime
      const newSlots = currentSlots.filter(
        (slot) => slot.startTime !== input.startTime,
      );

      await prisma.memo.update({
        where: { id: input.memoId },
        data: {
          deadlineAcceptedSlots: newSlots,
        },
      });

      console.log(
        `[removeDeadlineAcceptedSlot] Removed slot ${input.startTime} from memo ${input.memoId}`,
      );

      return {
        id: input.memoId,
        acceptedSlots: newSlots,
      };
    } catch (err) {
      console.error("[removeDeadlineAcceptedSlot] Error:", err);
      throw new Error("Failed to remove accepted slot");
    }
  },
);

/**
 * Update the duration of an accepted time slot
 * Called when user adjusts the duration slider on an accepted suggestion.
 * Works for all task types (routine, backlog, deadline).
 */
export const updateAcceptedSlotDuration = command(
  v.object({
    memoId: v.string(),
    startTime: v.string(), // Used to identify which slot to update (for deadline tasks with multiple slots)
    newDuration: v.number(),
    newEndTime: v.string(),
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

      const updateData: Record<string, unknown> = {};

      if (existing.type === "ルーティン") {
        // Update routine's single acceptedSlot
        const currentSlot = existing.routineAcceptedSlot as {
          startTime: string;
          endTime: string;
          duration: number;
        } | null;

        if (currentSlot) {
          updateData.routineAcceptedSlot = {
            ...currentSlot,
            duration: input.newDuration,
            endTime: input.newEndTime,
          };
        }
      } else if (existing.type === "バックログ") {
        // Update backlog's single acceptedSlot
        const currentSlot = existing.backlogAcceptedSlot as {
          startTime: string;
          endTime: string;
          duration: number;
        } | null;

        if (currentSlot) {
          updateData.backlogAcceptedSlot = {
            ...currentSlot,
            duration: input.newDuration,
            endTime: input.newEndTime,
          };
        }
      } else if (existing.type === "期限付き") {
        // Update the matching slot in deadline's acceptedSlots array
        const currentSlots =
          (existing.deadlineAcceptedSlots as Array<{
            startTime: string;
            endTime: string;
            duration: number;
          }>) ?? [];

        const updatedSlots = currentSlots.map((slot) =>
          slot.startTime === input.startTime
            ? {
                ...slot,
                duration: input.newDuration,
                endTime: input.newEndTime,
              }
            : slot,
        );

        updateData.deadlineAcceptedSlots = updatedSlots;
      }

      if (Object.keys(updateData).length === 0) {
        return { id: input.memoId, success: false };
      }

      await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(
        `[updateAcceptedSlotDuration] Updated slot duration for memo ${input.memoId}: ${input.newDuration}min`,
      );

      return { id: input.memoId, success: true };
    } catch (err) {
      console.error("[updateAcceptedSlotDuration] Error:", err);
      throw new Error("Failed to update slot duration");
    }
  },
);

// Helper functions for date calculations
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  return new Date(d.setDate(diff));
}

function isSameWeek(date1: Date, date2: Date): boolean {
  const week1 = getWeekNumber(date1);
  const week2 = getWeekNumber(date2);
  return date1.getFullYear() === date2.getFullYear() && week1 === week2;
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor(
    (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

// ============================================================================
// EVENT-LINKED DEADLINE FUNCTIONS
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
