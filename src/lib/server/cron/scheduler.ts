/**
 * Cron Scheduler
 *
 * Main scheduler that initializes and manages all cron jobs.
 * Jobs are registered via the jobs/index.ts registry.
 */
import cron, { type ScheduledTask } from "node-cron";
import { jobs } from "./jobs/index.ts";
import { runJob } from "./job-runner.ts";

let initialized = false;
const scheduledTasks: ScheduledTask[] = [];

/**
 * Initialize all registered cron jobs.
 * Should be called once on server startup.
 */
export function initializeCronJobs(): void {
  if (initialized) {
    console.log("[Cron] Already initialized, skipping");
    return;
  }
  initialized = true;

  for (const job of jobs) {
    if (job.enabled === false) {
      console.log(`[Cron] Skipped (disabled): ${job.name}`);
      continue;
    }

    const task = cron.schedule(job.schedule, () => runJob(job), {
      timezone: job.timezone ?? "Asia/Tokyo",
    });

    scheduledTasks.push(task);
    console.log(`[Cron] Registered: ${job.name} (${job.schedule})`);
  }

  console.log(`[Cron] Initialized ${scheduledTasks.length} jobs`);
}

/**
 * Stop all running cron jobs.
 * Call on graceful shutdown.
 */
export function shutdownCronJobs(): void {
  scheduledTasks.forEach((task) => task.stop());
  scheduledTasks.length = 0;
  initialized = false;
  console.log("[Cron] All jobs stopped");
}

/**
 * Check if scheduler is initialized.
 */
export function isInitialized(): boolean {
  return initialized;
}
