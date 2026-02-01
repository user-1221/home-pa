/**
 * Memo Reporting Remote Functions
 *
 * Server-side Remote Functions for task completion logging (Report feature):
 * - Log task completion
 * - Fetch completion logs
 */
import { query, command } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";
import { getAuthenticatedUser } from "./memo.utils.ts";

// ============================================================================
// LOG TASK COMPLETION
// ============================================================================

/**
 * Log a task completion for the Report feature
 * Creates a snapshot of task state at completion time
 */
export const logTaskCompletion = command(
  v.object({
    memoId: v.string(),
    timeSpentMinutes: v.number(),
    actionType: v.picklist(["delete", "advance", "increment"]),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      // Fetch current memo state for snapshot
      const memo = await prisma.memo.findFirst({
        where: { id: input.memoId, userId },
      });

      if (!memo) {
        throw new Error("Memo not found");
      }

      // Fetch linked event title if event-linked
      let linkedEventTitle: string | undefined;
      if (memo.eventLinkType === "calendar" && memo.linkedCalendarEventId) {
        const event = await prisma.calendarEvent.findFirst({
          where: { id: memo.linkedCalendarEventId },
        });
        linkedEventTitle = event?.summary;
      } else if (
        memo.eventLinkType === "timetable" &&
        memo.linkedTimetableCellId
      ) {
        const cell = await prisma.timetableCell.findFirst({
          where: { id: memo.linkedTimetableCellId },
        });
        linkedEventTitle = cell?.title;
      }

      // Create completion log
      const log = await prisma.taskCompletionLog.create({
        data: {
          userId,
          memoId: input.memoId,
          taskTitle: memo.title,
          taskType: memo.type,
          taskGenre: memo.genre,
          timeSpentMinutes: input.timeSpentMinutes,
          totalTimeSpentMinutes: memo.timeSpentMinutes + input.timeSpentMinutes,
          completionsThisPeriod:
            memo.type === "ルーティン"
              ? (memo.routineCompletedCountWeek ?? 0) + 1
              : undefined,
          recurrenceGoal:
            memo.recurrenceGoalCount && memo.recurrenceGoalPeriod
              ? {
                  count: memo.recurrenceGoalCount,
                  period: memo.recurrenceGoalPeriod,
                }
              : undefined,
          linkedEventTitle,
          linkedEventType: memo.eventLinkType ?? undefined,
          actionType: input.actionType,
        },
      });

      console.log(
        `[logTaskCompletion] Logged completion for memo ${input.memoId}: action=${input.actionType}`,
      );

      return {
        id: log.id,
        completedAt: log.completedAt.toISOString(),
      };
    } catch (err) {
      console.error("[logTaskCompletion] Error:", err);
      throw new Error("Failed to log task completion");
    }
  },
);

// ============================================================================
// FETCH COMPLETION LOGS
// ============================================================================

/**
 * Fetch completion logs for Report (paginated)
 */
export const fetchCompletionLogs = query(
  v.object({
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    interface DateFilter {
      gte?: Date;
      lte?: Date;
    }

    interface WhereClause {
      userId: string;
      completedAt?: DateFilter;
    }

    const where: WhereClause = { userId };

    if (input.startDate || input.endDate) {
      where.completedAt = {};
      if (input.startDate) {
        where.completedAt.gte = new Date(input.startDate);
      }
      if (input.endDate) {
        where.completedAt.lte = new Date(input.endDate);
      }
    }

    const logs = await prisma.taskCompletionLog.findMany({
      where,
      orderBy: { completedAt: "desc" },
      take: input.limit ?? 50,
      skip: input.offset ?? 0,
    });

    return logs.map((log) => ({
      id: log.id,
      memoId: log.memoId,
      taskTitle: log.taskTitle,
      taskType: log.taskType,
      taskGenre: log.taskGenre,
      completedAt: log.completedAt.toISOString(),
      timeSpentMinutes: log.timeSpentMinutes,
      totalTimeSpentMinutes: log.totalTimeSpentMinutes,
      completionsThisPeriod: log.completionsThisPeriod,
      recurrenceGoal: log.recurrenceGoal as {
        count: number;
        period: string;
      } | null,
      linkedEventTitle: log.linkedEventTitle,
      linkedEventType: log.linkedEventType,
      actionType: log.actionType,
    }));
  },
);

// ============================================================================
// FETCH DAILY ACTIVITY LOGS
// ============================================================================

/**
 * Fetch aggregated daily activity logs (created by cron job)
 */
export const fetchDailyActivityLogs = query(
  v.object({
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    interface DateFilter {
      gte?: Date;
      lte?: Date;
    }

    interface WhereClause {
      userId: string;
      date?: DateFilter;
    }

    const where: WhereClause = { userId };

    if (input.startDate || input.endDate) {
      where.date = {};
      if (input.startDate) {
        where.date.gte = new Date(input.startDate);
      }
      if (input.endDate) {
        where.date.lte = new Date(input.endDate);
      }
    }

    const logs = await prisma.dailyActivityLog.findMany({
      where,
      orderBy: { date: "desc" },
      take: input.limit ?? 30,
    });

    return logs.map((log) => ({
      id: log.id,
      date: log.date.toISOString(),
      totalTimeMinutes: log.totalTimeMinutes,
      tasksWorkedOn: log.tasksWorkedOn,
      suggestionsAccepted: log.suggestionsAccepted,
      suggestionsRejected: log.suggestionsRejected,
      tasksCompleted: log.tasksCompleted,
    }));
  },
);
