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

// Schedule state
export {
  scheduleState,
  type AcceptedMemoInfo,
  type PendingSuggestion,
  type MovedSuggestion,
} from "../features/assistant/state/schedule.svelte.ts";

// Focus state (Pomodoro & real-time tracking)
export {
  focusState,
  type FocusSession,
  type PomodoroState,
} from "../features/focus/state/index.ts";

// Task state
export {
  taskState,
  // Legacy exports for backwards compatibility
  taskActions,
  tasks,
  isTasksLoading,
  enrichingTaskIds,
  hasEnrichingTasks,
  loadTasks,
  isTaskEnriching,
} from "../features/tasks/state/taskActions.svelte.ts";

// Task form
export {
  taskFormState,
  // Legacy exports for backwards compatibility
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
} from "../features/tasks/state/taskForm.svelte.ts";

// ============================================================================
// Utility Exports
// ============================================================================

// Timezone state (Svelte 5)
export {
  timezoneState,
  // Legacy backwards compatibility
  timezone,
  timezoneActions,
  timezoneLabel,
} from "./timezone.svelte.ts";

// Devtools state (Svelte 5)
export {
  devtoolsState,
  // Legacy backwards compatibility
  devtools,
  devtoolsEnabled,
} from "./devtools.svelte.ts";

export { formatDate, formatDateTime } from "../utils/date-utils.ts";

// Bootstrap functions
export { initializeStores, loadSyncedData } from "./bootstrap.ts";

// Note: isSyncLoaded and isSyncing are now accessible via scheduleState.isSyncLoaded and scheduleState.isSyncing
