/**
 * @fileoverview Bootstrap - State & Actions Index
 *
 * Central export file for all state classes.
 * This provides a single import point for components to access state.
 *
 * Usage:
 *   import { uiState, dataState, calendarState } from "$lib/bootstrap/index.svelte.ts";
 *   import { toastState, eventFormState } from "$lib/bootstrap/index.svelte.ts";
 */

// ============================================================================
// Core State Classes
// ============================================================================

// UI State
export { uiState } from "./ui.svelte.ts";

// Data State (selected date)
export { dataState } from "./data.svelte.ts";

// Toast State
export { toastState, type Toast, type ToastType } from "./toast.svelte.ts";

// Settings State
export { settingsState } from "./settings.svelte.ts";

// Calendar State
export {
  calendarState,
  type ExpandedOccurrence,
} from "../features/calendar/state/calendar.svelte.ts";

// Event Form State
export {
  eventFormState,
  type EventFormData,
  type EventFormErrors,
} from "../features/calendar/state/eventForm.svelte.ts";

// Event actions
export { eventActions } from "../features/calendar/state/eventActions.ts";

// ============================================================================
// Utility Functions
// ============================================================================

import { uiState } from "./ui.svelte.ts";
import { dataState } from "./data.svelte.ts";
import { calendarState } from "../features/calendar/state/calendar.svelte.ts";

// Clear all data
export const clearAllData = () => {
  dataState.reset();
  calendarState.clear();
  uiState.reset();
};

// ============================================================================
// Feature State Re-exports
// ============================================================================

// Unified Gap State - single source of truth for gaps
export { unifiedGapState } from "../features/assistant/state/unified-gaps.svelte.ts";

// Schedule store
export {
  scheduleResult,
  isScheduleLoading,
  scheduleError,
  lastPipelineSummary,
  lastScheduleTime,
  scheduledBlocks,
  pendingSuggestions,
  acceptedSuggestions,
  skippedSuggestionIds,
  droppedSuggestions,
  droppedMandatory,
  nextScheduledBlock,
  hasScheduledTasks,
  totalScheduledMinutes,
  hasMandatoryDropped,
  scheduleActions,
  findBlockByMemoId,
  isMemoScheduled,
  getBlocksForGap,
  type AcceptedSuggestion,
  type PendingSuggestion,
} from "../features/assistant/state/schedule.ts";

// Task state
export { taskActions, tasks } from "../features/tasks/state/taskActions.ts";

// Task form
export {
  taskForm,
  taskFormErrors,
  isTaskFormSubmitting,
  isTaskFormOpen,
  isTaskFormValid,
  showDeadlineField,
  showRecurrenceFields,
  taskFormActions,
  type TaskFormData,
  type TaskFormErrors as TaskFormErrorsType,
} from "../features/tasks/state/taskForm.ts";

// ============================================================================
// Utility Exports
// ============================================================================

export { timezone, timezoneActions, timezoneLabel } from "./timezone.ts";
export { devtools, devtoolsEnabled } from "./devtools.ts";
export { formatDate, formatDateTime } from "../utils/date-utils.ts";

// Bootstrap functions
export { initializeStores, loadSyncedData } from "./bootstrap.ts";

// Sync stores
export {
  isSyncLoaded,
  isSyncing,
} from "../features/assistant/state/schedule.ts";
