/**
 * Service for converting timetable cells into timeline events
 */
import { browser } from "$app/environment";
import {
  computeSlotTimes,
  getWeekdayIndex,
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
 */
let cachedConfig: TimetableConfigData | null = null;
let cachedCells: TimetableCellData[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/** Default config when not loaded */
const DEFAULT_CONFIG: TimetableConfigData = {
  dayStartTime: "09:00",
  lunchStartTime: "12:00",
  lunchEndTime: "13:00",
  breakDuration: 10,
  cellDuration: 50,
};

/**
 * Load timetable configuration and cells from the server
 * Only works on the client side - returns defaults during SSR
 */
export async function loadTimetableData(): Promise<{
  config: TimetableConfigData;
  cells: TimetableCellData[];
}> {
  // Skip loading during SSR - remote functions need request context
  if (!browser) {
    return { config: DEFAULT_CONFIG, cells: [] };
  }

  const now = Date.now();

  // Return cached data if still valid
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
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
    };

    cachedCells = cellsResult.map((cell) => ({
      id: cell.id,
      dayOfWeek: cell.dayOfWeek,
      slotIndex: cell.slotIndex,
      title: cell.title,
      attendance: cell.attendance,
      workAllowed: cell.workAllowed,
    }));

    cacheTimestamp = now;
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
  cacheTimestamp = 0;
}

/**
 * Get timetable events for a specific date
 * Returns ALL events where attendance="出席する" (includes both 作業可 and 作業不可)
 */
export function getTimetableEventsForDate(
  targetDate: Date,
  config: TimetableConfigData,
  cells: TimetableCellData[],
): TimetableEvent[] {
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
