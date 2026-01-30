/**
 * Memo Remote Functions (Server-side)
 *
 * Barrel re-export for all memo remote functions.
 * These run on the server and are callable from client with type safety.
 *
 * This file maintains backward compatibility by re-exporting all functions
 * from their split module files.
 */

// CRUD operations
export {
  fetchMemos,
  createMemo,
  updateMemo,
  deleteMemo,
} from "./memo.crud.remote.ts";

// Progress and action handlers
export {
  logSuggestionComplete,
  markMemoAccepted,
  resetMemoAcceptedToday,
  markMemoRejected,
} from "./memo.actions.remote.ts";

// Deadline slot operations
export {
  addDeadlineAcceptedSlot,
  removeDeadlineAcceptedSlot,
  updateAcceptedSlotDuration,
} from "./memo.deadline-slots.remote.ts";

// Event-linked deadline functions
export {
  advanceEventLinkedDeadline,
  recalculateEventLinkedDeadlines,
} from "./memo.event-link.remote.ts";

// Reporting functions
export {
  logTaskCompletion,
  fetchCompletionLogs,
} from "./memo.reporting.remote.ts";
