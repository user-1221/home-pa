/**
 * Cron Job Registry
 *
 * All cron jobs should be registered here.
 * The scheduler will automatically pick up and schedule all jobs in this array.
 */
import { dailyActivityLogJob } from "./daily-activity-log.ts";
import type { CronJob } from "../types.ts";

// Register all jobs here
export const jobs: CronJob[] = [
  dailyActivityLogJob,
  // Future jobs:
  // weeklyReportJob,
  // cacheCleanupJob,
  // reminderNotificationJob,
];
