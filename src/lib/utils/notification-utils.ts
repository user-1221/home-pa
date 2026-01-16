/**
 * @fileoverview Notification Utilities
 *
 * Provides debouncing and retry logic for error notifications to prevent spam.
 */

import { toastState } from "$lib/bootstrap/toast.svelte.ts";

export type NotificationCategory =
  | "sync"
  | "geocoding"
  | "timetable"
  | "transit";

const COOLDOWN_MS = 30_000; // 30 seconds between same-category notifications
const lastNotified = new Map<NotificationCategory, number>();

/**
 * Check if we should show a notification for this category.
 * Returns true if enough time has passed since last notification.
 * Also marks the category as notified if returning true.
 */
export function shouldNotify(category: NotificationCategory): boolean {
  const now = Date.now();
  const last = lastNotified.get(category) ?? 0;

  if (now - last > COOLDOWN_MS) {
    lastNotified.set(category, now);
    return true;
  }

  return false;
}

/**
 * Show a warning toast if the category hasn't been notified recently.
 * Useful for degraded-but-functional states.
 */
export function notifyWarning(
  category: NotificationCategory,
  message: string,
): void {
  if (shouldNotify(category)) {
    toastState.warning(message);
  }
}

/**
 * Show an error toast if the category hasn't been notified recently.
 */
export function notifyError(
  category: NotificationCategory,
  message: string,
): void {
  if (shouldNotify(category)) {
    toastState.error(message);
  }
}

/**
 * Retry a function once with a short delay.
 * Returns the result or throws if both attempts fail.
 */
export async function retryOnce<T>(
  fn: () => Promise<T>,
  delayMs = 1000,
): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return await fn();
  }
}

/**
 * Reset notification cooldown for testing purposes.
 */
export function resetNotificationCooldown(
  category?: NotificationCategory,
): void {
  if (category) {
    lastNotified.delete(category);
  } else {
    lastNotified.clear();
  }
}
