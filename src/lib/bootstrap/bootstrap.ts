/**
 * @fileoverview Centralized store initialization
 */

import { dataState } from "./data.svelte.ts";
import { timezoneActions } from "./timezone.ts";

export function initializeStores(): void {
  timezoneActions.detect();
  // Initialize selected date to today
  dataState.setSelectedDate(new Date());
}
