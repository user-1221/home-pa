/**
 * Memo Validation Schemas
 *
 * Valibot schemas for memo data validation.
 * Shared by all memo remote functions.
 */
import * as v from "valibot";

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const RecurrenceGoalSchema = v.object({
  count: v.number(),
  period: v.picklist(["day", "week", "month"]),
});

export const MemoStatusSchema = v.object({
  timeSpentMinutes: v.number(),
  timeSpentToday: v.number(),
  completionState: v.picklist(["not_started", "in_progress", "completed"]),
});

// Accepted slot schema (shared by all task types)
export const AcceptedSlotSchema = v.object({
  startTime: v.string(),
  endTime: v.string(),
  duration: v.number(),
  logged: v.optional(v.boolean()), // Track if progress was actually logged (timer/manual)
});

// ============================================================================
// TYPE-SPECIFIC STATE SCHEMAS
// ============================================================================

export const RoutineStateSchema = v.optional(
  v.object({
    acceptedToday: v.boolean(),
    completedToday: v.boolean(),
    completedCountThisPeriod: v.number(),
    lastCompletedDay: v.nullable(v.string()),
    wasCappedThisPeriod: v.boolean(),
    periodStartDate: v.nullable(v.string()),
    rejectedToday: v.boolean(),
    acceptedSlot: v.nullable(AcceptedSlotSchema),
  }),
);

export const BacklogStateSchema = v.optional(
  v.object({
    acceptedToday: v.boolean(),
    lastCompletedDay: v.nullable(v.string()),
    rejectedToday: v.boolean(),
    acceptedSlot: v.nullable(AcceptedSlotSchema),
  }),
);

export const DeadlineStateSchema = v.optional(
  v.object({
    rejectedToday: v.boolean(),
    acceptedSlots: v.array(AcceptedSlotSchema),
    lastCompletedDay: v.nullable(v.string()),
    previousLastCompletedDay: v.nullable(v.string()),
    actualDurations: v.optional(v.array(v.number())),
    expectedDurations: v.optional(v.array(v.number())),
    totalDays: v.optional(v.number()),
  }),
);

// Event link schema for event-tagged deadline tasks
export const EventLinkSchema = v.optional(
  v.object({
    type: v.picklist(["calendar", "timetable"]),
    calendarEventId: v.optional(v.string()),
    timetableCellId: v.optional(v.string()),
    offset: v.picklist(["same_day_after", "1_day_before", "1_day_after"]),
    trackedOccurrenceDate: v.optional(v.string()),
  }),
);

// ============================================================================
// INPUT/UPDATE SCHEMAS
// ============================================================================

export const MemoInputSchema = v.object({
  title: v.string(),
  genre: v.optional(v.string()),
  type: v.picklist(["期限付き", "バックログ", "ルーティン"]),
  createdAt: v.string(),
  deadline: v.optional(v.string()),
  recurrenceGoal: v.optional(RecurrenceGoalSchema),
  locationPreference: v.picklist([
    "home/near_home",
    "workplace/near_workplace",
    "no_preference",
  ]),
  status: MemoStatusSchema,
  sessionDuration: v.optional(v.number()),
  totalDurationExpected: v.optional(v.number()),
  lastActivity: v.optional(v.string()),
  importance: v.optional(v.picklist(["low", "medium", "high"])),
  // Type-specific state
  routineState: RoutineStateSchema,
  backlogState: BacklogStateSchema,
  // Event link (for event-tagged deadline tasks)
  eventLink: EventLinkSchema,
  // Suggestion availability timing (for event-linked tasks)
  suggestionAvailableFrom: v.optional(v.string()),
});

export const MemoUpdateSchema = v.object({
  id: v.string(),
  updates: v.object({
    title: v.optional(v.string()),
    genre: v.optional(v.string()),
    type: v.optional(v.picklist(["期限付き", "バックログ", "ルーティン"])),
    deadline: v.optional(v.string()),
    recurrenceGoal: v.optional(RecurrenceGoalSchema),
    locationPreference: v.optional(
      v.picklist([
        "home/near_home",
        "workplace/near_workplace",
        "no_preference",
      ]),
    ),
    status: v.optional(MemoStatusSchema),
    sessionDuration: v.optional(v.number()),
    totalDurationExpected: v.optional(v.number()),
    lastActivity: v.optional(v.string()),
    importance: v.optional(v.picklist(["low", "medium", "high"])),
    // Type-specific state
    routineState: RoutineStateSchema,
    backlogState: BacklogStateSchema,
    deadlineState: DeadlineStateSchema,
  }),
});
