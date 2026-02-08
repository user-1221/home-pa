/**
 * Report State
 *
 * Manages task completion report data and statistics.
 * @scope page
 * @owner src/lib/features/tasks/components/report/ReportView.svelte
 * @cleanup none - State resets on tab switch
 */
import { getContext, setContext } from "svelte";
import {
  fetchCompletionLogs,
  fetchDailyActivityLogs,
} from "./memo.functions.ts";
import { DateTime } from "luxon";
import type { MemoType } from "$lib/types.ts";

// Types
export type DateFilter = "week" | "month" | "all";

export interface CompletionLog {
  id: string;
  memoId: string;
  taskTitle: string;
  taskType: MemoType;
  taskGenre: string | null;
  completedAt: string;
  timeSpentMinutes: number;
  totalTimeSpentMinutes: number;
  completionsThisPeriod: number | null;
  recurrenceGoal: { count: number; period: string } | null;
  linkedEventTitle: string | null;
  linkedEventType: string | null;
  actionType: "delete" | "advance" | "increment";
}

export interface TypeBreakdown {
  期限付き: number;
  ルーティン: number;
  バックログ: number;
}

export interface TaskActivity {
  memoId: string;
  taskTitle: string;
  taskType: string;
  taskGenre: string | null;
  timeSpentMinutes: number;
  wasAccepted: boolean;
  wasRejected: boolean;
  wasCompleted: boolean;
}

export interface DailyActivityLog {
  id: string;
  date: string;
  totalTimeMinutes: number;
  tasksWorkedOn: number;
  suggestionsAccepted: number;
  suggestionsRejected: number;
  tasksCompleted: number;
  taskActivities: TaskActivity[] | null;
}

// Utility: Smart time formatting
export function formatDuration(minutes: number): string {
  if (minutes === 0) return "0分";
  if (minutes < 60) return `${minutes}分`;
  if (minutes < 120) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}時間 ${mins}分` : `${hours}時間`;
  }
  return `${(minutes / 60).toFixed(1)}時間`;
}

// Utility: Relative date formatting
export function formatRelativeDate(isoDate: string): string {
  const date = DateTime.fromISO(isoDate);
  const now = DateTime.now();
  const diff = now.startOf("day").diff(date.startOf("day"), "days").days;

  if (diff === 0) return "今日";
  if (diff === 1) return "昨日";
  if (diff < 7) return `${Math.floor(diff)}日前`;
  if (diff < 30) return `${Math.floor(diff / 7)}週間前`;
  return date.toFormat("M/d");
}

// Cache entry type
interface CacheEntry {
  logs: CompletionLog[];
  dailyLogs: DailyActivityLog[];
  loadedAt: number;
}

// State class
export class ReportState {
  logs = $state<CompletionLog[]>([]);
  dailyLogs = $state<DailyActivityLog[]>([]);
  isLoading = $state(false);
  dateFilter = $state<DateFilter>("week");
  error = $state<string | null>(null);

  // Cache per filter period for instant switching
  private cache: Record<DateFilter, CacheEntry | null> = {
    week: null,
    month: null,
    all: null,
  };

  // Derived: Total completions count
  get totalCompletions(): number {
    return this.logs.length;
  }

  // Derived: Total time spent in minutes (from DailyActivityLog, which captures all work including focus timer)
  get totalTimeMinutes(): number {
    return this.dailyLogs.reduce((sum, log) => sum + log.totalTimeMinutes, 0);
  }

  // Derived: Breakdown by task type
  get byType(): TypeBreakdown {
    const breakdown: TypeBreakdown = {
      期限付き: 0,
      ルーティン: 0,
      バックログ: 0,
    };

    for (const log of this.logs) {
      if (log.taskType in breakdown) {
        breakdown[log.taskType]++;
      }
    }

    return breakdown;
  }

  // Derived: Time spent by task type (from DailyActivityLog taskActivities)
  get timeByType(): TypeBreakdown {
    const breakdown: TypeBreakdown = {
      期限付き: 0,
      ルーティン: 0,
      バックログ: 0,
    };

    for (const dailyLog of this.dailyLogs) {
      if (dailyLog.taskActivities) {
        for (const activity of dailyLog.taskActivities) {
          if (activity.taskType in breakdown) {
            breakdown[activity.taskType as keyof TypeBreakdown] +=
              activity.timeSpentMinutes;
          }
        }
      }
    }

    return breakdown;
  }

  // Derived: Most active genre
  get topGenre(): string | null {
    const genreCounts = new Map<string, number>();

    for (const log of this.logs) {
      if (log.taskGenre) {
        genreCounts.set(
          log.taskGenre,
          (genreCounts.get(log.taskGenre) ?? 0) + 1,
        );
      }
    }

    if (genreCounts.size === 0) return null;

    let topGenre = "";
    let maxCount = 0;

    for (const [genre, count] of genreCounts) {
      if (count > maxCount) {
        maxCount = count;
        topGenre = genre;
      }
    }

    return topGenre;
  }

  // Derived: Time spent by genre (from DailyActivityLog taskActivities)
  get timeByGenre(): Map<string, number> {
    const breakdown = new Map<string, number>();

    for (const dailyLog of this.dailyLogs) {
      if (dailyLog.taskActivities) {
        for (const activity of dailyLog.taskActivities) {
          const genre = activity.taskGenre ?? "未分類";
          breakdown.set(
            genre,
            (breakdown.get(genre) ?? 0) + activity.timeSpentMinutes,
          );
        }
      }
    }

    return breakdown;
  }

  // Derived: Suggestion acceptance rate (from DailyActivityLog)
  get suggestionAcceptanceRate(): number {
    const total = this.dailyLogs.reduce(
      (sum, log) => sum + log.suggestionsAccepted + log.suggestionsRejected,
      0,
    );
    if (total === 0) return 0;
    const accepted = this.dailyLogs.reduce(
      (sum, log) => sum + log.suggestionsAccepted,
      0,
    );
    return Math.round((accepted / total) * 100);
  }

  // Derived: Total suggestions accepted/rejected
  get suggestionStats(): { accepted: number; rejected: number } {
    return {
      accepted: this.dailyLogs.reduce(
        (sum, log) => sum + log.suggestionsAccepted,
        0,
      ),
      rejected: this.dailyLogs.reduce(
        (sum, log) => sum + log.suggestionsRejected,
        0,
      ),
    };
  }

  // Derived: Count of tasks that were accepted but not completed (missed)
  get missedTaskCount(): number {
    let count = 0;
    for (const log of this.dailyLogs) {
      if (log.taskActivities) {
        for (const activity of log.taskActivities) {
          if (activity.wasAccepted && !activity.wasCompleted) {
            count++;
          }
        }
      }
    }
    return count;
  }

  // Derived: Average daily time (from DailyActivityLog)
  get averageDailyMinutes(): number {
    if (this.dailyLogs.length === 0) return 0;
    const total = this.dailyLogs.reduce(
      (sum, log) => sum + log.totalTimeMinutes,
      0,
    );
    return Math.round(total / this.dailyLogs.length);
  }

  // Derived: Daily trend data for visualization
  get dailyTrend(): Array<{
    date: string;
    minutes: number;
    tasks: number;
    taskActivities: TaskActivity[] | null;
  }> {
    return this.dailyLogs
      .slice()
      .reverse() // Chronological order for chart
      .map((log) => ({
        date: log.date,
        minutes: log.totalTimeMinutes,
        tasks: log.tasksCompleted,
        taskActivities: log.taskActivities,
      }));
  }

  // Calculate date range based on filter
  private getDateRange(): { startDate?: string; endDate?: string } {
    const now = DateTime.now();

    switch (this.dateFilter) {
      case "week":
        return {
          startDate: now.startOf("week").toISO() ?? undefined,
          endDate: now.endOf("day").toISO() ?? undefined,
        };
      case "month":
        return {
          startDate: now.startOf("month").toISO() ?? undefined,
          endDate: now.endOf("day").toISO() ?? undefined,
        };
      case "all":
      default:
        return {};
    }
  }

  // Load completion logs and daily activity logs
  async load(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const { startDate, endDate } = this.getDateRange();

      // Fetch both datasets in parallel
      const [completionLogs, dailyLogs] = await Promise.all([
        fetchCompletionLogs({
          startDate,
          endDate,
          limit: 100,
        }),
        fetchDailyActivityLogs({
          startDate,
          endDate,
          limit: 30,
        }),
      ]);

      this.logs = completionLogs as CompletionLog[];
      this.dailyLogs = dailyLogs as DailyActivityLog[];

      // Store in cache for instant switching
      this.cache[this.dateFilter] = {
        logs: this.logs,
        dailyLogs: this.dailyLogs,
        loadedAt: Date.now(),
      };
    } catch (err) {
      console.error("[ReportState] Failed to load logs:", err);
      this.error = "データの読み込みに失敗しました";
      this.logs = [];
      this.dailyLogs = [];
    } finally {
      this.isLoading = false;
    }
  }

  // Set filter - use cache if available, otherwise load
  setFilter(filter: DateFilter): void {
    this.dateFilter = filter;

    // Use cached data if available for instant switching
    const cached = this.cache[filter];
    if (cached) {
      this.logs = cached.logs;
      this.dailyLogs = cached.dailyLogs;
      return;
    }

    // No cache - fetch fresh data
    this.load();
  }

  // Force refresh current period (invalidates cache)
  refresh(): void {
    this.cache[this.dateFilter] = null;
    this.load();
  }
}

// Context
const REPORT_STATE_KEY = Symbol("report-state");

export function setReportState(state: ReportState): void {
  setContext(REPORT_STATE_KEY, state);
}

export function getReportState(): ReportState {
  const state = getContext<ReportState | undefined>(REPORT_STATE_KEY);
  if (!state) {
    throw new Error("ReportState not found in context.");
  }
  return state;
}
