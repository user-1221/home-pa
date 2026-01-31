/**
 * Report State
 *
 * Manages task completion report data and statistics.
 * @scope page
 * @owner src/lib/features/tasks/components/report/ReportView.svelte
 * @cleanup none - State resets on tab switch
 */
import { getContext, setContext } from "svelte";
import { fetchCompletionLogs } from "./memo.functions.ts";
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

// State class
export class ReportState {
  logs = $state<CompletionLog[]>([]);
  isLoading = $state(false);
  dateFilter = $state<DateFilter>("week");
  error = $state<string | null>(null);

  // Derived: Total completions count
  get totalCompletions(): number {
    return this.logs.length;
  }

  // Derived: Total time spent in minutes
  get totalTimeMinutes(): number {
    return this.logs.reduce((sum, log) => sum + log.timeSpentMinutes, 0);
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

  // Derived: Time spent by task type (for distribution bar)
  get timeByType(): TypeBreakdown {
    const breakdown: TypeBreakdown = {
      期限付き: 0,
      ルーティン: 0,
      バックログ: 0,
    };

    for (const log of this.logs) {
      if (log.taskType in breakdown) {
        breakdown[log.taskType] += log.timeSpentMinutes;
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

  // Derived: Time spent by genre (for genre distribution bar)
  get timeByGenre(): Map<string, number> {
    const breakdown = new Map<string, number>();

    for (const log of this.logs) {
      const genre = log.taskGenre ?? "未分類";
      breakdown.set(genre, (breakdown.get(genre) ?? 0) + log.timeSpentMinutes);
    }

    return breakdown;
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

  // Load completion logs
  async load(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const { startDate, endDate } = this.getDateRange();
      const logs = await fetchCompletionLogs({
        startDate,
        endDate,
        limit: 100,
      });

      this.logs = logs as CompletionLog[];
    } catch (err) {
      console.error("[ReportState] Failed to load logs:", err);
      this.error = "データの読み込みに失敗しました";
      this.logs = [];
    } finally {
      this.isLoading = false;
    }
  }

  // Set filter and reload
  setFilter(filter: DateFilter): void {
    this.dateFilter = filter;
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
