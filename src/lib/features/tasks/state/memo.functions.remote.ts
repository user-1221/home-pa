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

// Type-specific state schemas
const RoutineStateSchema = v.optional(
  v.object({
    acceptedToday: v.boolean(),
    completedToday: v.boolean(),
    completedCountThisPeriod: v.number(),
    lastCompletedDay: v.nullable(v.string()),
    wasCappedThisPeriod: v.boolean(),
    periodStartDate: v.nullable(v.string()),
  }),
);

const BacklogStateSchema = v.optional(
  v.object({
    acceptedToday: v.boolean(),
    lastCompletedDay: v.nullable(v.string()),
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
      routineState:
        memo.type === "ルーティン" && memo.routineWeekStartDate !== null
          ? {
              acceptedToday: memo.routineAcceptedToday ?? false,
              completedToday: memo.routineCompletedToday ?? false,
              completedCountThisPeriod: memo.routineCompletedCountWeek ?? 0,
              lastCompletedDay:
                memo.routineLastCompletedDay?.toISOString() ?? null,
              wasCappedThisPeriod: memo.routineWasCappedThisWeek ?? false,
              periodStartDate: memo.routineWeekStartDate?.toISOString() ?? null,
            }
          : undefined,
      backlogState:
        memo.type === "バックログ"
          ? {
              acceptedToday: memo.backlogAcceptedToday ?? false,
              lastCompletedDay:
                memo.backlogLastCompletedDay?.toISOString() ?? null,
            }
          : undefined,
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
    const created = await prisma.memo.create({
      data: {
        userId,
        title: input.title,
        genre: input.genre,
        type: input.type,
        createdAt: new Date(input.createdAt),
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
        routineLastCompletedDay: input.routineState?.lastCompletedDay
          ? new Date(input.routineState.lastCompletedDay)
          : undefined,
        routineWasCappedThisWeek: input.routineState?.wasCappedThisPeriod,
        routineWeekStartDate: input.routineState?.periodStartDate
          ? new Date(input.routineState.periodStartDate)
          : undefined,
        // Backlog state
        backlogAcceptedToday: input.backlogState?.acceptedToday,
        backlogLastCompletedDay: input.backlogState?.lastCompletedDay
          ? new Date(input.backlogState.lastCompletedDay)
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
      routineState:
        created.type === "ルーティン" && created.routineWeekStartDate !== null
          ? {
              acceptedToday: created.routineAcceptedToday ?? false,
              completedToday: created.routineCompletedToday ?? false,
              completedCountThisPeriod: created.routineCompletedCountWeek ?? 0,
              lastCompletedDay:
                created.routineLastCompletedDay?.toISOString() ?? null,
              wasCappedThisPeriod: created.routineWasCappedThisWeek ?? false,
              periodStartDate:
                created.routineWeekStartDate?.toISOString() ?? null,
            }
          : undefined,
      backlogState:
        created.type === "バックログ"
          ? {
              acceptedToday: created.backlogAcceptedToday ?? false,
              lastCompletedDay:
                created.backlogLastCompletedDay?.toISOString() ?? null,
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
    }
    // Backlog state
    if (input.updates.backlogState !== undefined) {
      updateData.backlogAcceptedToday =
        input.updates.backlogState.acceptedToday;
      updateData.backlogLastCompletedDay = input.updates.backlogState
        .lastCompletedDay
        ? new Date(input.updates.backlogState.lastCompletedDay)
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
        completionsThisPeriod: updated.completionsThisPeriod ?? undefined,
        periodStartDate: updated.periodStartDate?.toISOString(),
      },
      sessionDuration: updated.sessionDuration ?? undefined,
      totalDurationExpected: updated.totalDurationExpected ?? undefined,
      lastActivity: updated.lastActivity?.toISOString(),
      importance: updated.importance as "low" | "medium" | "high" | undefined,
      // Type-specific state (DB uses week-based naming, app uses period-based)
      routineState:
        updated.type === "ルーティン" && updated.routineWeekStartDate !== null
          ? {
              acceptedToday: updated.routineAcceptedToday ?? false,
              completedToday: updated.routineCompletedToday ?? false,
              completedCountThisPeriod: updated.routineCompletedCountWeek ?? 0,
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
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = true;
        updateData.backlogLastCompletedDay = now;
      }

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
 */
export const markMemoAccepted = command(
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
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = false;
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
