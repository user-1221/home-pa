/**
 * Timer utility functions for focus tracking
 */

/**
 * Parse HH:mm time string to Date object for today
 */
export function parseTimeToday(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now;
}

/**
 * Get current time as HH:mm string
 */
export function getCurrentHHmm(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const mins = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

/**
 * Check if current time is within a time range (HH:mm format)
 */
export function isInTimeRange(startTime: string, endTime: string): boolean {
  const now = getCurrentHHmm();
  return now >= startTime && now < endTime;
}

/**
 * Calculate elapsed minutes between two dates, excluding break periods
 */
export function calculateElapsedMinutes(startedAt: Date, now: Date): number {
  const elapsedMs = now.getTime() - startedAt.getTime();
  return Math.floor(elapsedMs / 60000);
}

/**
 * Format minutes as human-readable duration (e.g., "1時間25分" or "25分")
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}時間`;
  }
  return `${hours}時間${mins}分`;
}

/**
 * Format seconds as MM:SS for timer display
 */
export function formatTimerDisplay(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Calculate remaining seconds until a target time
 */
export function secondsUntil(targetTime: string): number {
  const target = parseTimeToday(targetTime);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}
