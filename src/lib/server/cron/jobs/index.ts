/**
 * Cron Job Registry
 *
 * All cron jobs should be registered here.
 * The scheduler will automatically pick up and schedule all jobs in this array.
 */
import { dailyResetJob } from "./daily-reset.ts";
import { dailyActivityLogJob } from "./daily-activity-log.ts";
import type { CronJob } from "../types.ts";

// Register all jobs here
// NOTE: daily-activity-log runs FIRST at 00:01 to capture timeSpentToday, then daily-reset at 00:05 clears it.
export const jobs: CronJob[] = [
  dailyActivityLogJob, // 00:01 - Log yesterday's activity (reads timeSpentToday BEFORE reset)
  dailyResetJob, // 00:05 - Reset daily flags (clears timeSpentToday)
  // Future jobs:
  // weeklyReportJob,
  // cacheCleanupJob,
  // reminderNotificationJob,
];
