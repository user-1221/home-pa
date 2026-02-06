// Core data models for M1 specification

import type { EventLinkData } from "$lib/features/tasks/types/event-link";

// Recurrence types for recurring events
export interface RecurrenceRuleRFC {
  rrule: string;
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  until?: Date | null;
  count?: number | null;
}

export type Recurrence =
  | { type: "NONE" }
  | ({ type: "RRULE" } & RecurrenceRuleRFC);

export interface Event {
  id: string;
  title: string;
  // For timed events: actual start/end times
  // For all-day events: date only (start = end = date at 00:00 UTC)
  start: Date;
  end: Date;
  description?: string;
  address?: string;
  importance?: ImportanceLevel;
  timeLabel?: "all-day" | "timed"; // Event timing type
  tzid?: string; // IANA timezone, defaults to system timezone
  recurrence?: Recurrence;
  rdateUtc?: Date[]; // Additional occurrence dates
  exdateUtc?: Date[]; // Excluded occurrence dates
  color?: string; // User-selected color (CSS color value or palette key)

  // New sliding window fields
  recurrenceGroupId?: string; // Links events across time windows
  isDuplicate?: boolean; // True for auto-generated duplicates
  originalEventId?: string; // Reference to original event for duplicates
  isForever?: boolean; // True for events with no end date
  icalData?: string; // Raw iCalendar VEVENT component string for recurrence expansion
  calendarId?: string; // External calendar ID (e.g., Google Calendar ID for synced events)
}

/** JSON-serialized Event (dates as ISO strings) */
export type EventJSON = Omit<
  Event,
  "start" | "end" | "rdateUtc" | "exdateUtc"
> & {
  start: string;
  end: string;
  rdateUtc?: string[];
  exdateUtc?: string[];
};

// ============================================================================
// MEMO SYSTEM TYPES (Suggestion Engine)
// ============================================================================

/**
 * Recurrence goal for routine tasks
 * e.g., { count: 3, period: "week" } = "3 times per week"
 */
export interface RecurrenceGoal {
  count: number;
  period: "day" | "week" | "month";
}

/**
 * Memo completion and progress status
 */
export interface MemoStatus {
  timeSpentMinutes: number; // Total time user has spent on this memo
  timeSpentToday: number; // Time spent today (resets daily)
  completionState: "not_started" | "in_progress" | "completed";
}

// ============================================================================
// EXPLICIT STATE FLAGS (Required for new scoring system)
// ============================================================================

/**
 * Explicit state flags for Routine tasks
 * No inference from floating values allowed
 */
export interface RoutineState {
  acceptedToday: boolean; // If true, task is done for the day (unless missed)
  completedToday: boolean; // Actually completed (not just accepted)
  completedCountThisPeriod: number; // Count of completions this period (day/week/month)
  lastCompletedDay: Date | null; // Date of last completion
  previousLastCompletedDay: Date | null; // Saved value before acceptance (for undo)
  wasCappedThisPeriod: boolean; // True if display cap was ever active this period
  periodStartDate: Date | null; // Start of current tracking period
  rejectedToday: boolean; // If true, task cannot be regenerated today
  acceptedSlot: AcceptedSlot | null; // Time slot info for today's accepted suggestion
  lastAcceptedDuration: number | null; // Duration from last accepted suggestion (for adaptive ideal)
}

/**
 * Duration data point for adaptive deadline duration curve
 */
export interface DurationPoint {
  day: Date;
  duration: number; // minutes
}

/**
 * Accepted time slot info for deadline tasks
 */
export interface AcceptedSlot {
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  duration: number; // minutes
  logged?: boolean; // Track if progress was actually logged (timer/manual)
}

/**
 * Explicit state flags for Deadline tasks
 * Uses fixed-length arrays for linear regression-based duration prediction
 */
export interface DeadlineState {
  createdDay: Date;
  deadlineDay: Date;
  lastCompletedDay: Date | null;
  previousLastCompletedDay: Date | null; // Saved value before acceptance (for undo)
  // Fixed-length arrays indexed by day offset from createdDay (day 0 = createdDay)
  actualDurations: number[]; // Summed durations per day, 0 = no session
  expectedDurations: number[]; // Linear curve from base to 5x base
  totalDays: number; // Array length (deadline - created + 1)
  rejectedToday: boolean; // If true, task cannot be regenerated today
  acceptedSlots: AcceptedSlot[]; // Time slots where this task is accepted
}

/**
 * Explicit state flags for Backlog tasks
 */
export interface BacklogState {
  acceptedToday: boolean; // If true, task is treated as done for the day (unless missed)
  lastCompletedDay: Date | null;
  previousLastCompletedDay: Date | null; // Saved value before acceptance (for undo)
  rejectedToday: boolean; // If true, task cannot be regenerated today
  acceptedSlot: AcceptedSlot | null; // Time slot info for today's accepted suggestion
  lastAcceptedDuration: number | null; // Duration from last accepted suggestion (for adaptive ideal)
}

/**
 * Location preference for where a memo/task can be done
 */
export type LocationPreference =
  | "home/near_home"
  | "workplace/near_workplace"
  | "no_preference";

/**
 * Location label for gaps (derived from surrounding events)
 */
export type LocationLabel = "home" | "workplace" | "other" | "unknown";

/**
 * Importance level for memos
 */
export type ImportanceLevel = "low" | "medium" | "high";

/**
 * Memo type classification
 */
export type MemoType = "期限付き" | "バックログ" | "ルーティン";

/**
 * Rich memo structure for task-oriented suggestions
 * Replaces the old simple { id, text } Memo
 */
export interface Memo {
  id: string;
  title: string;
  genre?: string; // System/LLM-filled (e.g., "勉強", "運動", "家事")
  type: MemoType;
  createdAt: Date; // When the memo was created (for need gradient)
  deadline?: Date; // Required for 期限付き type
  recurrenceGoal?: RecurrenceGoal; // For ルーティン, structured goal
  locationPreference: LocationPreference;
  status: MemoStatus;
  sessionDuration?: number; // 1回のセッションの時間 (minutes) - LLM-suggested (min_duration)
  totalDurationExpected?: number; // Total expected time (minutes) - LLM-suggested
  /**
   * Last suggestion-related activity timestamp.
   *
   * Updated when:
   * - Suggestion is accepted
   * - Suggestion is rejected (skipped)
   * - Progress is logged (completion)
   *
   * NOT updated when:
   * - Task is edited (title, deadline, etc.)
   * - Suggestion is dragged/moved (local-only)
   *
   * Used by resetPeriodIfNeeded() to detect day boundaries
   * for resetting daily flags (acceptedToday, rejectedToday, acceptedSlot).
   */
  lastActivity?: Date;
  importance?: ImportanceLevel; // LLM-suggested if not provided

  // ============================================================================
  // EXPLICIT STATE FLAGS (New scoring system - type-specific)
  // ============================================================================
  routineState?: RoutineState; // Only for ルーティン type
  deadlineState?: DeadlineState; // Only for 期限付き type
  backlogState?: BacklogState; // Only for バックログ type

  // ============================================================================
  // EVENT LINK (for event-tagged deadline tasks)
  // ============================================================================
  eventLink?: EventLinkData; // Links task to calendar event or timetable cell
  suggestionAvailableFrom?: Date; // When suggestion can start appearing (null = immediately)
}

/**
 * Suggestion output from scoring system
 * Used by scheduler to assign tasks to gaps
 */
export interface Suggestion {
  id: string;
  memoId: string; // Reference to source memo
  need: number; // 0.0–1.0 (≥1.0 = mandatory, <0.5 = hidden)
  importance: number; // Discrete: 0.0, 0.2, or 0.4
  duration: number; // Calculated duration in minutes (may be extended by regression for deadline tasks)
  baseDuration: number; // Original sessionDuration - shrink floor for deadline tasks
  type: MemoType; // Task type - determines shrink eligibility
  locationPreference: LocationPreference;
  isHidden?: boolean; // True if need < 0.5 (should not be displayed)
}

/**
 * Gap interface representing free time slots
 * Used by scheduler to match suggestions to available time
 */
export interface Gap {
  gapId: string; // Unique identifier for scheduling reference
  start: string; // HH:mm format
  end: string; // HH:mm format
  duration: number; // in minutes
  locationLabel?: LocationLabel; // Derived from surrounding events (Phase 2)
}

export type ViewMode = "day" | "list";
export type ReactionType = "accepted" | "rejected" | "later";
