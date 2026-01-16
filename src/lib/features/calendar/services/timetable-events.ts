/**
 * Service for converting timetable cells into timeline events
 */
import { browser } from "$app/environment";
import {
  computeSlotTimes,
  getWeekdayIndex,
  isDateInExceptionRange,
  type TimetableConfigData,
} from "../utils/timetable-utils";

/**
 * Timetable cell data from the database
 */
export interface TimetableCellData {
  id: string;
  dayOfWeek: number;
  slotIndex: number;
  title: string;
  attendance: string;
  workAllowed: string;
}

/**
 * A timetable event for rendering on timelines
 */
export interface TimetableEvent {
  id: string;
  cellId: string;
  title: string;
  start: Date;
  end: Date;
  workAllowed: string;
  attendance: string;
}

/**
 * Cached timetable data to avoid repeated fetches
 * Cache is long-lived and only invalidated explicitly (e.g., after editing timetable)
 */
let cachedConfig: TimetableConfigData | null = null;
let cachedCells: TimetableCellData[] = [];
let cacheLoaded = false;

/** Default config when not loaded */
const DEFAULT_CONFIG: TimetableConfigData = {
  dayStartTime: "09:00",
  lunchStartTime: "12:00",
  lunchEndTime: "13:00",
  breakDuration: 10,
  cellDuration: 50,
};

/**
 * Check if timetable data is already cached (synchronous)
 * Use this to determine if data is available immediately without async loading
 */
export function isTimetableCached(): boolean {
  return cacheLoaded && cachedConfig !== null;
}

/**
 * Get cached timetable data synchronously (returns null if not cached)
 * Use after checking isTimetableCached() to get data without async loading
 */
export function getCachedTimetableData(): {
  config: TimetableConfigData;
  cells: TimetableCellData[];
} | null {
  if (!cacheLoaded || !cachedConfig) {
    return null;
  }
  return { config: cachedConfig, cells: cachedCells };
}

/**
 * Load timetable configuration and cells from the server
 * Only works on the client side - returns defaults during SSR
 * Data is cached until explicitly invalidated via invalidateTimetableCache()
 */
export async function loadTimetableData(): Promise<{
  config: TimetableConfigData;
  cells: TimetableCellData[];
}> {
  // Skip loading during SSR - remote functions need request context
  if (!browser) {
    return { config: DEFAULT_CONFIG, cells: [] };
  }

  // Return cached data if available
  if (cacheLoaded && cachedConfig) {
    return { config: cachedConfig, cells: cachedCells };
  }

  try {
    // Dynamic import to avoid SSR issues
    const { fetchTimetableConfig, fetchTimetableCells } = await import(
      "../state/timetable.functions.remote"
    );

    const [configResult, cellsResult] = await Promise.all([
      fetchTimetableConfig({}),
      fetchTimetableCells({}),
    ]);

    cachedConfig = {
      dayStartTime: configResult.dayStartTime,
      lunchStartTime: configResult.lunchStartTime,
      lunchEndTime: configResult.lunchEndTime,
      breakDuration: configResult.breakDuration,
      cellDuration: configResult.cellDuration,
      exceptionRanges: configResult.exceptionRanges ?? [],
    };

    cachedCells = cellsResult.map((cell) => ({
      id: cell.id,
      dayOfWeek: cell.dayOfWeek,
      slotIndex: cell.slotIndex,
      title: cell.title,
      attendance: cell.attendance,
      workAllowed: cell.workAllowed,
    }));

    cacheLoaded = true;
    return { config: cachedConfig, cells: cachedCells };
  } catch (error) {
    console.error("[timetable-events] Failed to load timetable data:", error);
    // Return defaults if fetch fails
    return { config: DEFAULT_CONFIG, cells: [] };
  }
}

/**
 * Invalidate the cache (call after saving changes)
 */
export function invalidateTimetableCache(): void {
  cacheLoaded = false;
  cachedConfig = null;
  cachedCells = [];
}

/**
 * Get timetable events for a specific date
 * Returns ALL events where attendance="出席する" (includes both 作業可 and 作業不可)
 * Returns empty if the date falls within an exception range (e.g., holidays, vacations)
 */
export function getTimetableEventsForDate(
  targetDate: Date,
  config: TimetableConfigData,
  cells: TimetableCellData[],
): TimetableEvent[] {
  // Check if this date is within an exception range
  if (isDateInExceptionRange(targetDate, config.exceptionRanges)) {
    return [];
  }

  const dayOfWeek = getWeekdayIndex(targetDate);

  // Only Mon-Fri (0-4 in our mapping)
  if (dayOfWeek < 0 || dayOfWeek > 4) {
    return [];
  }

  const events: TimetableEvent[] = [];

  // Filter cells for this day that are 出席する
  const dayCells = cells.filter(
    (cell) => cell.dayOfWeek === dayOfWeek && cell.attendance === "出席する",
  );

  for (const cell of dayCells) {
    const { startMinutes, endMinutes } = computeSlotTimes(
      config,
      cell.slotIndex,
    );

    const start = new Date(targetDate);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

    const end = new Date(targetDate);
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

    events.push({
      id: `timetable-${cell.id}`,
      cellId: cell.id,
      title: cell.title || "授業",
      start,
      end,
      workAllowed: cell.workAllowed,
      attendance: cell.attendance,
    });
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Filter timetable events to only those that should be visible in timeline
 * (作業不可 events that block time)
 */
export function getVisibleTimetableEvents(
  events: TimetableEvent[],
): TimetableEvent[] {
  // Show all attending events in the timetable lane
  return events;
}

/**
 * Get blocking timetable events (作業不可 only)
 * These block time in gap calculations
 */
export function getBlockingTimetableEvents(
  events: TimetableEvent[],
): TimetableEvent[] {
  return events.filter((e) => e.workAllowed === "作業不可");
}

/**
 * Convert timetable events to time ranges for gap calculation
 * Returns array of { startMinutes, endMinutes } in minutes from midnight
 */
export function timetableEventsToTimeRanges(
  events: TimetableEvent[],
): { startMinutes: number; endMinutes: number }[] {
  return events.map((event) => ({
    startMinutes: event.start.getHours() * 60 + event.start.getMinutes(),
    endMinutes: event.end.getHours() * 60 + event.end.getMinutes(),
  }));
}
