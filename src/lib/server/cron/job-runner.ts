/**
 * Job Runner
 *
 * Executes cron jobs with error handling and logging.
 */
import type { CronJob, JobResult, JobExecution } from "./types.ts";

export async function runJob(job: CronJob): Promise<JobExecution> {
  const startedAt = new Date();
  console.log(`[Cron] Starting: ${job.name}`);

  try {
    const result = await job.handler();
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    console.log(
      `[Cron] Completed: ${job.name} (${durationMs}ms)`,
      result.message ?? "",
    );

    return {
      jobName: job.name,
      startedAt,
      completedAt,
      durationMs,
      result,
    };
  } catch (error) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    console.error(`[Cron] Failed: ${job.name}`, error);

    const result: JobResult = {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };

    return {
      jobName: job.name,
      startedAt,
      completedAt,
      durationMs,
      result,
    };
  }
}
