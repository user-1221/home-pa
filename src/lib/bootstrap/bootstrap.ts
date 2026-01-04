/**
 * @fileoverview Centralized store initialization
 */

import { dataState } from "./data.svelte.ts";
import { timezoneActions } from "./timezone.ts";
import { scheduleActions } from "../features/assistant/state/schedule.ts";
import { transitState } from "../features/transit/state/transit.svelte.ts";

export function initializeStores(): void {
  timezoneActions.detect();
  // Initialize selected date to today
  dataState.setSelectedDate(new Date());
}

/**
 * Load synced data from server
 * Should be called after user authentication is confirmed
 */
export async function loadSyncedData(): Promise<void> {
  // Load synced schedule data (accepted suggestions, rejected memos)
  await scheduleActions.loadSyncedData();

  // Load synced transit cache
  await transitState.loadSyncedTransit();

  // Perform local cleanup of expired data
  scheduleActions.cleanupExpiredData();

  console.log("[Bootstrap] Synced data loaded and cleanup completed");
}
