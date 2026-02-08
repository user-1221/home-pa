/**
 * @fileoverview Centralized store initialization
 */

import { dataState } from "./data.svelte.ts";
import { timezoneState } from "./timezone.svelte.ts";
import { settingsState } from "./settings.svelte.ts";
import { scheduleState } from "../features/assistant/state/schedule.svelte.ts";
import { transitState } from "../features/transit/state/transit.svelte.ts";
import { profileState } from "../features/utilities/state/profile.svelte.ts";
import { initDevConsole } from "./dev-console.ts";

export function initializeStores(): void {
  timezoneState.detect();
  // Initialize selected date to today
  dataState.setSelectedDate(new Date());
  // Initialize dev console (no-op in production)
  initDevConsole();
}

/**
 * Load synced data from server
 * Should be called after user authentication is confirmed
 */
export async function loadSyncedData(): Promise<void> {
  // Load user profile (includes onboarding status) — must load before onboarding guard
  await profileState.loadFromDB();

  // Load user settings (active time, etc.)
  await settingsState.loadFromDB();

  // Load synced schedule data (accepted suggestions, rejected memos)
  await scheduleState.loadSyncedData();

  // Load synced transit cache
  await transitState.loadSyncedTransit();

  // Perform local cleanup of expired data
  scheduleState.cleanupExpiredData();

  console.log("[Bootstrap] Synced data loaded and cleanup completed");
}
