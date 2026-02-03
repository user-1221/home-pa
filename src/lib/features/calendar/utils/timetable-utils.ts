/**
 * Timetable utility functions
 * Shared between client and server
 */

/**
 * Date range for timetable exceptions (e.g., holidays, vacations)
 */
export interface TimetableExceptionRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export interface TimetableConfigData {
  dayStartTime: string; // "HH:mm"
  lunchStartTime: string;
  lunchEndTime: string;
  breakDuration: number; // minutes
  cellDuration: number; // minutes
  exceptionRanges?: TimetableExceptionRange[]; // Date ranges where timetable is ignored
  daysPerWeek: number; // 5 = Mon-Fri, 6 = Mon-Sat
  slotsPerDay: number; // 5 or 6 periods per day
}

/**
 * Parse a time string "HH:mm" to total minutes from midnight
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes from midnight to "HH:mm" string
 */
export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Compute the start and end times for a specific slot
 * Returns minutes from midnight
 */
export function computeSlotTimes(
  config: TimetableConfigData,
  slotIndex: number,
): { startMinutes: number; endMinutes: number } {
  const dayStart = parseTimeToMinutes(config.dayStartTime);
  const lunchStart = parseTimeToMinutes(config.lunchStartTime);
  const lunchEnd = parseTimeToMinutes(config.lunchEndTime);

  let currentMinutes = dayStart;

  for (let i = 0; i < slotIndex; i++) {
    // Add cell duration
    currentMinutes += config.cellDuration;

    // Add break duration
    currentMinutes += config.breakDuration;

    // Skip lunch if we hit it
    if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
      currentMinutes = lunchEnd;
    }
  }

  // Skip lunch for current slot if needed
  if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
    currentMinutes = lunchEnd;
  }

  const startMinutes = currentMinutes;
  const endMinutes = currentMinutes + config.cellDuration;

  return { startMinutes, endMinutes };
}

/**
 * Convert slot times to Date objects for a specific date
 */
export function getSlotDateRange(
  config: TimetableConfigData,
  slotIndex: number,
  targetDate: Date,
): { start: Date; end: Date } {
  const { startMinutes, endMinutes } = computeSlotTimes(config, slotIndex);

  const start = new Date(targetDate);
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  const end = new Date(targetDate);
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

  return { start, end };
}

/**
 * Get the day of week index (0=Mon, 1=Tue, etc.) from a Date
 * JavaScript Date.getDay() returns 0=Sun, so we convert
 */
export function getWeekdayIndex(date: Date): number {
  const jsDay = date.getDay();
  // Convert: Sun=0 -> -1 (not used), Mon=1 -> 0, Tue=2 -> 1, etc.
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Check if a date falls within any exception range
 * @param date - The date to check
 * @param exceptionRanges - Array of exception date ranges
 * @returns true if the date is within an exception range
 */
export function isDateInExceptionRange(
  date: Date,
  exceptionRanges: TimetableExceptionRange[] | undefined,
): boolean {
  if (!exceptionRanges || exceptionRanges.length === 0) {
    return false;
  }

  const dateStr = formatDateToYMD(date);

  for (const range of exceptionRanges) {
    if (dateStr >= range.start && dateStr <= range.end) {
      return true;
    }
  }

  return false;
}

/**
 * Format a Date to YYYY-MM-DD string
 */
export function formatDateToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
