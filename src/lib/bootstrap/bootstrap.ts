/**
 * @fileoverview Centralized store initialization
 */

import { uiActions } from "./uiActions.ts";
import { timezoneActions } from "./timezone.ts";

export function initializeStores(): void {
  timezoneActions.detect();
  uiActions.initialize();
}
