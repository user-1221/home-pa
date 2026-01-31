/**
 * Cron Job Types
 *
 * Defines the interface for scheduled jobs in the cron pipeline.
 * All jobs should implement the CronJob interface.
 */

export interface CronJob {
  /** Unique job identifier */
  name: string;
  /** Cron expression (e.g., "5 0 * * *" for 00:05 daily) */
  schedule: string;
  /** Timezone for schedule (default: Asia/Tokyo) */
  timezone?: string;
  /** Set to false to disable without removing */
  enabled?: boolean;
  /** Job handler function */
  handler: () => Promise<JobResult>;
}

export interface JobResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  error?: Error;
}

export interface JobExecution {
  jobName: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  result: JobResult;
}
