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
// NOTE: Order matters for same-minute jobs. daily-reset runs at 00:01, before daily-activity-log at 00:05.
export const jobs: CronJob[] = [
  dailyResetJob, // 00:01 - Reset daily flags
  dailyActivityLogJob, // 00:05 - Log yesterday's activity
  // Future jobs:
  // weeklyReportJob,
  // cacheCleanupJob,
  // reminderNotificationJob,
];
