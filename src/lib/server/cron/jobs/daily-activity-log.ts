/**
 * Daily Activity Log Job
 *
 * Runs at 00:05 JST daily to log yesterday's activity for all users.
 * Creates a DailyActivityLog entry with detailed per-task breakdown.
 */
import { prisma } from "$lib/server/prisma.ts";
import { DateTime } from "luxon";
import type { CronJob, JobResult } from "../types.ts";
import type { Memo, Prisma } from "@prisma/client";

interface TaskActivity {
  memoId: string;
  taskTitle: string;
  taskType: string;
  taskGenre: string | null;
  timeSpentMinutes: number;
  wasAccepted: boolean;
  wasRejected: boolean;
  acceptedSlot?: {
    startTime: string;
    endTime: string;
    plannedDuration: number;
    actualDuration?: number;
  };
  wasCompleted: boolean;
  completionAction?: string;
}

export const dailyActivityLogJob: CronJob = {
  name: "daily-activity-log",
  schedule: "1 0 * * *", // 00:01 JST daily - BEFORE daily-reset to capture timeSpentToday
  timezone: "Asia/Tokyo",
  enabled: true,

  async handler(): Promise<JobResult> {
    const yesterday = DateTime.now()
      .setZone("Asia/Tokyo")
      .minus({ days: 1 })
      .startOf("day");

    const usersLogged = await logDailyActivityForAllUsers(yesterday.toJSDate());

    return {
      success: true,
      message: `Logged activity for ${usersLogged} users`,
      data: { usersLogged, date: yesterday.toISODate() },
    };
  },
};

async function logDailyActivityForAllUsers(date: Date): Promise<number> {
  // Get all users (for "log zeros" requirement)
  const allUsers = await prisma.memo.findMany({
    select: { userId: true },
    distinct: ["userId"],
  });

  let count = 0;
  for (const { userId } of allUsers) {
    try {
      await createDailyLogForUser(userId, date);
      count++;
    } catch (error) {
      console.error(`[DailyActivityLog] Failed for user ${userId}:`, error);
    }
  }
  return count;
}

async function createDailyLogForUser(
  userId: string,
  date: Date,
): Promise<void> {
  const startOfDay = date;
  const endOfDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  // Only get memos with activity ON that specific date
  // This prevents duplicate logging if user doesn't log in for days
  const memos = await prisma.memo.findMany({
    where: {
      userId,
      lastActivity: { gte: startOfDay, lt: endOfDay },
    },
  });

  const taskActivities: TaskActivity[] = [];
  let totalTime = 0;
  let accepted = 0;
  let rejected = 0;

  for (const memo of memos) {
    const timeToday = memo.timeSpentToday ?? 0;
    const wasAccepted = getAcceptedFlag(memo);
    const wasRejected = getRejectedFlag(memo);

    // Skip if no activity
    if (timeToday === 0 && !wasAccepted && !wasRejected) continue;

    totalTime += timeToday;

    taskActivities.push({
      memoId: memo.id,
      taskTitle: memo.title,
      taskType: memo.type,
      taskGenre: memo.genre,
      timeSpentMinutes: timeToday,
      wasAccepted,
      wasRejected,
      acceptedSlot: getAcceptedSlot(memo),
      wasCompleted: false, // Will be updated from TaskCompletionLog
    });

    if (wasAccepted) accepted++;
    if (wasRejected) rejected++;
  }

  // Check TaskCompletionLog for completions that day
  const completions = await prisma.taskCompletionLog.findMany({
    where: {
      userId,
      completedAt: { gte: startOfDay, lt: endOfDay },
    },
  });

  // Mark completed tasks and add completion action
  for (const completion of completions) {
    const activity = taskActivities.find((a) => a.memoId === completion.memoId);
    if (activity) {
      activity.wasCompleted = true;
      activity.completionAction = completion.actionType;
    } else {
      // Task was completed but not in our activity list (edge case)
      taskActivities.push({
        memoId: completion.memoId,
        taskTitle: completion.taskTitle,
        taskType: completion.taskType,
        taskGenre: completion.taskGenre,
        timeSpentMinutes: completion.timeSpentMinutes,
        wasAccepted: true, // Must have been accepted to complete
        wasRejected: false,
        wasCompleted: true,
        completionAction: completion.actionType,
      });
    }
  }

  const tasksCompleted = completions.length;

  // Upsert daily log (handles re-runs safely)
  await prisma.dailyActivityLog.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      totalTimeMinutes: totalTime,
      tasksWorkedOn: taskActivities.length,
      suggestionsAccepted: accepted,
      suggestionsRejected: rejected,
      tasksCompleted,
      taskActivities: taskActivities as unknown as Prisma.InputJsonValue,
    },
    update: {
      totalTimeMinutes: totalTime,
      tasksWorkedOn: taskActivities.length,
      suggestionsAccepted: accepted,
      suggestionsRejected: rejected,
      tasksCompleted,
      taskActivities: taskActivities as unknown as Prisma.InputJsonValue,
    },
  });
}

// Helper functions to extract type-specific flags
function getAcceptedFlag(memo: Memo): boolean {
  switch (memo.type) {
    case "ルーティン":
      return memo.routineAcceptedToday ?? false;
    case "バックログ":
      return memo.backlogAcceptedToday ?? false;
    case "期限付き":
      // Deadline tasks use acceptedSlots array
      return Array.isArray(memo.deadlineAcceptedSlots)
        ? memo.deadlineAcceptedSlots.length > 0
        : false;
    default:
      return false;
  }
}

function getRejectedFlag(memo: Memo): boolean {
  switch (memo.type) {
    case "ルーティン":
      return memo.routineRejectedToday ?? false;
    case "バックログ":
      return memo.backlogRejectedToday ?? false;
    case "期限付き":
      return memo.deadlineRejectedToday ?? false;
    default:
      return false;
  }
}

interface AcceptedSlotData {
  startTime: string;
  endTime: string;
  plannedDuration: number;
  actualDuration?: number;
}

function getAcceptedSlot(memo: Memo): AcceptedSlotData | undefined {
  let slot: unknown;

  switch (memo.type) {
    case "ルーティン":
      slot = memo.routineAcceptedSlot;
      break;
    case "バックログ":
      slot = memo.backlogAcceptedSlot;
      break;
    case "期限付き":
      // Get the most recent slot from the array
      if (Array.isArray(memo.deadlineAcceptedSlots)) {
        slot =
          memo.deadlineAcceptedSlots[memo.deadlineAcceptedSlots.length - 1];
      }
      break;
  }

  if (!slot || typeof slot !== "object") return undefined;

  const s = slot as Record<string, unknown>;
  return {
    startTime: String(s.startTime ?? ""),
    endTime: String(s.endTime ?? ""),
    plannedDuration: Number(s.duration ?? 0),
    actualDuration: s.logged ? (memo.timeSpentToday ?? undefined) : undefined,
  };
}
