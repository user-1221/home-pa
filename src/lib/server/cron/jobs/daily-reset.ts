/**
 * Daily Reset Job
 *
 * Runs at 00:01 JST daily (BEFORE daily-activity-log at 00:05) to reset
 * daily flags for memos where lastActivity is from a previous day.
 *
 * This ensures accurate daily stats even if users don't log in.
 */
import { prisma } from "$lib/server/prisma.ts";
import { DateTime } from "luxon";
import type { CronJob, JobResult } from "../types.ts";

export const dailyResetJob: CronJob = {
  name: "daily-reset",
  schedule: "1 0 * * *", // 00:01 JST daily - BEFORE daily-activity-log
  timezone: "Asia/Tokyo",
  enabled: true,

  async handler(): Promise<JobResult> {
    const startOfToday = DateTime.now()
      .setZone("Asia/Tokyo")
      .startOf("day")
      .toJSDate();

    const resetCount = await resetDailyFlagsForStaleMemos(startOfToday);

    return {
      success: true,
      message: `Reset daily flags for ${resetCount} memos`,
      data: { resetCount, date: startOfToday.toISOString() },
    };
  },
};

async function resetDailyFlagsForStaleMemos(
  startOfToday: Date,
): Promise<number> {
  // Find all memos where lastActivity is before today (stale daily data)
  // OR where daily flags are set but lastActivity is null (edge case)
  const staleMemos = await prisma.memo.findMany({
    where: {
      OR: [
        // lastActivity is from a previous day
        { lastActivity: { lt: startOfToday } },
        // Edge case: daily flags set but no lastActivity
        {
          lastActivity: null,
          OR: [
            { timeSpentToday: { gt: 0 } },
            { routineAcceptedToday: true },
            { routineCompletedToday: true },
            { routineRejectedToday: true },
            { backlogAcceptedToday: true },
            { backlogRejectedToday: true },
            { deadlineRejectedToday: true },
          ],
        },
      ],
    },
    select: {
      id: true,
      type: true,
      timeSpentToday: true,
      routineAcceptedToday: true,
      routineCompletedToday: true,
      routineRejectedToday: true,
      routineAcceptedSlot: true,
      backlogAcceptedToday: true,
      backlogRejectedToday: true,
      backlogAcceptedSlot: true,
      deadlineRejectedToday: true,
      deadlineAcceptedSlots: true,
    },
  });

  let resetCount = 0;

  for (const memo of staleMemos) {
    if (!checkNeedsReset(memo)) continue;

    const updateData = buildResetUpdateData(memo.type);

    await prisma.memo.update({
      where: { id: memo.id },
      data: updateData,
    });

    resetCount++;
  }

  return resetCount;
}

function checkNeedsReset(memo: {
  timeSpentToday: number;
  routineAcceptedToday: boolean | null;
  routineCompletedToday: boolean | null;
  routineRejectedToday: boolean | null;
  routineAcceptedSlot: unknown;
  backlogAcceptedToday: boolean | null;
  backlogRejectedToday: boolean | null;
  backlogAcceptedSlot: unknown;
  deadlineRejectedToday: boolean | null;
  deadlineAcceptedSlots: unknown;
}): boolean {
  // Check if any daily values need resetting
  if (memo.timeSpentToday > 0) return true;
  if (memo.routineAcceptedToday) return true;
  if (memo.routineCompletedToday) return true;
  if (memo.routineRejectedToday) return true;
  if (memo.routineAcceptedSlot) return true;
  if (memo.backlogAcceptedToday) return true;
  if (memo.backlogRejectedToday) return true;
  if (memo.backlogAcceptedSlot) return true;
  if (memo.deadlineRejectedToday) return true;
  if (
    Array.isArray(memo.deadlineAcceptedSlots) &&
    memo.deadlineAcceptedSlots.length > 0
  ) {
    return true;
  }
  return false;
}

function buildResetUpdateData(type: string) {
  const baseUpdate = {
    timeSpentToday: 0,
  };

  switch (type) {
    case "ルーティン":
      return {
        ...baseUpdate,
        routineAcceptedToday: false,
        routineCompletedToday: false,
        routineRejectedToday: false,
        routineAcceptedSlot: null,
      };
    case "バックログ":
      return {
        ...baseUpdate,
        backlogAcceptedToday: false,
        backlogRejectedToday: false,
        backlogAcceptedSlot: null,
      };
    case "期限付き":
      return {
        ...baseUpdate,
        deadlineRejectedToday: false,
        deadlineAcceptedSlots: [],
      };
    default:
      return baseUpdate;
  }
}
