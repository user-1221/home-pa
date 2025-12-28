/**
 * @fileoverview Bootstrap - State & Actions Index
 *
 * Central export file for all state classes and action wrappers.
 * This provides a single import point for components to access state.
 *
 * Usage:
 *   import { uiState, dataState, calendarState } from "$lib/bootstrap/index.svelte.ts";
 *   import { calendarActions, toasts } from "$lib/bootstrap/index.svelte.ts";
 */

import type { EventFormData } from "../features/calendar/state/eventForm.svelte.ts";
import { addDays } from "../utils/date-utils.ts";

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

// ============================================================================
// Action Wrappers (for legacy compatibility during migration)
// ============================================================================

import { uiState } from "./ui.svelte.ts";
import { dataState } from "./data.svelte.ts";
import { calendarState } from "../features/calendar/state/calendar.svelte.ts";
import { toastState } from "./toast.svelte.ts";
import { eventFormState } from "../features/calendar/state/eventForm.svelte.ts";

// Calendar actions wrapper
export const calendarActions = {
  fetchEvents: calendarState.fetchEvents.bind(calendarState),
  createEvent: calendarState.createEvent.bind(calendarState),
  updateEvent: calendarState.updateEvent.bind(calendarState),
  deleteEvent: calendarState.deleteEvent.bind(calendarState),
  importICS: calendarState.importICS.bind(calendarState),
  getExportUrl: calendarState.getExportUrl.bind(calendarState),
  expandRecurringEvents:
    calendarState.expandRecurringEvents.bind(calendarState),
  clear: calendarState.clear.bind(calendarState),
};

// Event form actions wrapper
export const eventFormActions = {
  updateField: eventFormState.updateField.bind(eventFormState),
  updateFields: (updates: Partial<EventFormData>) => {
    for (const [key, value] of Object.entries(updates)) {
      eventFormState.updateField(
        key as keyof EventFormData,
        value as EventFormData[keyof EventFormData],
      );
    }
  },
  setFormForEditing: eventFormState.setForEditing.bind(eventFormState),
  resetForm: eventFormState.reset.bind(eventFormState),
  setCreateMode: eventFormState.setCreateMode.bind(eventFormState),
  initializeForNewEvent:
    eventFormState.initializeForNewEvent.bind(eventFormState),
  validate: eventFormState.validate.bind(eventFormState),
  setFieldError: eventFormState.setFieldError.bind(eventFormState),
  clearFieldError: eventFormState.clearFieldError.bind(eventFormState),
  clearAllErrors: eventFormState.clearAllErrors.bind(eventFormState),
  setGeneralError: eventFormState.setGeneralError.bind(eventFormState),
  setSubmitting: eventFormState.setSubmitting.bind(eventFormState),
  switchTimeLabel: eventFormState.switchTimeLabel.bind(eventFormState),
};

// UI actions wrapper
export const uiActions = {
  setViewMode: uiState.setViewMode.bind(uiState),
  setLoading: uiState.setLoading.bind(uiState),
  setError: uiState.setError.bind(uiState),
  clearError: uiState.clearError.bind(uiState),
  setSelectedDate: dataState.setSelectedDate.bind(dataState),
  navigateToToday: dataState.goToToday.bind(dataState),
  navigateDate: (days: number) => {
    const current = dataState.selectedDate;
    const newDate = addDays(current, days);
    dataState.setSelectedDate(newDate);
  },
};

// Event actions
export { eventActions } from "../features/calendar/state/eventActions.ts";

// Toast actions wrapper
export const toasts = {
  show: toastState.show.bind(toastState),
  success: toastState.success.bind(toastState),
  error: toastState.error.bind(toastState),
  info: toastState.info.bind(toastState),
  dismiss: toastState.dismiss.bind(toastState),
  clear: toastState.clear.bind(toastState),
};

// Clear all data
export const clearAllData = () => {
  dataState.reset();
  calendarState.clear();
  uiState.reset();
};

// ============================================================================
// Feature State Re-exports
// ============================================================================

// Gap stores
export {
  dayBoundaries,
  events as gapEvents,
  gapFinder,
  gaps,
  gapStats,
  dayBoundaryActions,
} from "../features/assistant/state/gaps.svelte.ts";

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
