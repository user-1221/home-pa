# Cron System

Background job scheduling system for Home-PA using node-cron.

## Architecture Overview

The cron system uses **node-cron** (v4.2.1) for scheduling background jobs. Jobs are defined as modules, registered in a central registry, and initialized on server startup.

```
hooks.server.ts (server startup)
    └─> initializeCronJobs()
         └─> scheduler.ts (schedules jobs)
              └─> job-runner.ts (executes jobs)
```

**Key characteristics:**

- Jobs only run in **production** (`!building && !dev`)
- Timezone defaults to `Asia/Tokyo`
- Jobs are idempotent (initialization protected by flag)

## Job Configuration

### CronJob Interface

```typescript
interface CronJob {
  name: string; // Unique job identifier
  schedule: string; // Cron expression (e.g., "5 0 * * *")
  timezone?: string; // Default: "Asia/Tokyo"
  enabled?: boolean; // Set to false to disable
  handler: () => Promise<JobResult>; // Async job handler
}

interface JobResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: Error;
}
```

### Cron Expression Syntax

Standard cron syntax (5 fields):

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *
```

Examples:

- `5 0 * * *` - Daily at 00:05
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1` - Every Monday at 09:00

## Current Jobs

### daily-activity-log

| Property | Value                         |
| -------- | ----------------------------- |
| Schedule | `5 0 * * *` (00:05 JST daily) |
| Timezone | Asia/Tokyo                    |
| Status   | Enabled                       |

**Purpose:** Aggregates daily activity data for all users from the previous day.

**Actions:**

1. Queries all memos with activity on the previous day
2. For each user:
   - Extracts task activities by type (routine, backlog, deadline)
   - Counts accepted/rejected suggestions
   - Fetches task completions from `TaskCompletionLog`
3. Creates/updates `DailyActivityLog` entry with:
   - Total time worked (minutes)
   - Number of tasks worked on
   - Suggestion acceptance/rejection counts
   - Detailed task activity array (JSON)

**Database tables used:**

- Input: `Memo`, `TaskCompletionLog`
- Output: `DailyActivityLog`

## Key Files

| File                                             | Purpose                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `src/lib/server/cron/types.ts`                   | Type definitions (CronJob, JobResult, JobExecution) |
| `src/lib/server/cron/scheduler.ts`               | Initializes and manages job lifecycle               |
| `src/lib/server/cron/job-runner.ts`              | Executes jobs with error handling and timing        |
| `src/lib/server/cron/jobs/index.ts`              | Job registry - all jobs registered here             |
| `src/lib/server/cron/jobs/daily-activity-log.ts` | Daily activity aggregation logic                    |
| `src/hooks.server.ts`                            | Server entry point - triggers initialization        |

## Adding New Jobs

### Step 1: Create Job Module

Create a new file in `src/lib/server/cron/jobs/`:

```typescript
// src/lib/server/cron/jobs/my-job.ts
import type { CronJob } from "../types";
import { prisma } from "$lib/server/prisma";

export const myJob: CronJob = {
  name: "my-job",
  schedule: "0 */6 * * *", // Every 6 hours
  timezone: "Asia/Tokyo",
  enabled: true,
  handler: async () => {
    try {
      // Job logic here
      const result = await doSomething();

      return {
        success: true,
        message: `Processed ${result.count} items`,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};
```

### Step 2: Register Job

Add to `src/lib/server/cron/jobs/index.ts`:

```typescript
import { dailyActivityLogJob } from "./daily-activity-log";
import { myJob } from "./my-job";

export const jobs = [
  dailyActivityLogJob,
  myJob, // Add new job here
];
```

### Step 3: Test Locally

Jobs don't run in dev mode. To test:

1. Call the handler function directly in a test
2. Or temporarily remove the `!dev` check in `hooks.server.ts`

## Execution Details

### Job Runner

The job runner (`job-runner.ts`) provides:

- Execution timing (start, end, duration)
- Error capture and logging
- Return value wrapping in `JobExecution` object

```typescript
interface JobExecution {
  jobName: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  result: JobResult;
}
```

### Scheduler

The scheduler (`scheduler.ts`):

- Filters out disabled jobs
- Schedules jobs with node-cron
- Stores `ScheduledTask` references for shutdown
- Provides `shutdownCronJobs()` for graceful shutdown

## Production Notes

### Environment Requirements

- No cron-specific environment variables needed
- Timezone is hardcoded to `Asia/Tokyo` in scheduler
- Jobs require database access via Prisma

### Logging

Jobs log to console:

- Job start: `[CRON] Starting job: {name}`
- Job complete: `[CRON] Job {name} completed in {duration}ms`
- Job error: `[CRON] Job {name} failed: {error}`

### Known Limitations

1. **No graceful shutdown**: `shutdownCronJobs()` exists but is not called on server termination
2. **No persistent execution log**: Job results only logged to console
3. **Single process**: No distributed job coordination
4. **No retry mechanism**: Failed jobs are not automatically retried

### Commented Out Jobs

Architecture is ready for future jobs (in `jobs/index.ts`):

```typescript
// weeklyReportJob,
// cacheCleanupJob,
// reminderNotificationJob,
```
