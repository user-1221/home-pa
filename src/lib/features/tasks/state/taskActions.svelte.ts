/**
 * Task Actions - Svelte 5 Reactive Class
 *
 * CRUD operations for rich Memo objects (tasks).
 * These memos have type, deadline, recurrence, location, etc.
 * All operations persist to database via Remote Functions.
 *
 * Migrated from writable stores to Svelte 5 reactive class ($state).
 */

import type {
  Memo,
  ImportanceLevel,
  RecurrenceGoal,
  MemoStatus,
} from "../../../types.ts";
import type { EventLinkData } from "../types/event-link.ts";
import {
  taskFormState,
  type TaskFormData,
  type TaskFormErrors,
} from "./taskForm.svelte.ts";
import { toastState } from "../../../bootstrap/toast.svelte.ts";
import { enrichMemoViaAPI } from "../../assistant/services/suggestions/llm-enrichment.ts";
import { resetPeriodIfNeeded } from "../../assistant/services/suggestions/period-utils.ts";
import {
  fetchMemos,
  createMemo,
  updateMemo,
  deleteMemo,
  logSuggestionComplete,
  markMemoAccepted,
  resetMemoAcceptedToday,
  markMemoRejected,
  addDeadlineAcceptedSlot,
  removeDeadlineAcceptedSlot,
  updateAcceptedSlotDuration,
  advanceEventLinkedDeadline,
} from "./memo.functions.remote.ts";

// ============================================================================
// DB Sync Helpers
// ============================================================================

/**
 * Convert JSON response to Memo (parse date strings)
 */
function jsonToMemo(json: {
  id: string;
  title: string;
  genre?: string;
  type: string;
  createdAt: string;
  deadline?: string;
  recurrenceGoal?: { count: number; period: "day" | "week" | "month" };
  locationPreference: string;
  status: {
    timeSpentMinutes: number;
    completionState: string;
    completionsThisPeriod?: number;
    periodStartDate?: string;
  };
  sessionDuration?: number;
  totalDurationExpected?: number;
  lastActivity?: string;
  importance?: string;
  routineState?: {
    acceptedToday: boolean;
    completedToday: boolean;
    completedCountThisPeriod: number;
    lastCompletedDay: string | null;
    previousLastCompletedDay?: string | null;
    wasCappedThisPeriod: boolean;
    periodStartDate: string | null;
    rejectedToday?: boolean;
    acceptedSlot?: {
      startTime: string;
      endTime: string;
      duration: number;
      logged?: boolean;
    } | null;
  };
  backlogState?: {
    acceptedToday: boolean;
    lastCompletedDay: string | null;
    previousLastCompletedDay?: string | null;
    rejectedToday?: boolean;
    acceptedSlot?: {
      startTime: string;
      endTime: string;
      duration: number;
      logged?: boolean;
    } | null;
  };
  deadlineState?: {
    rejectedToday: boolean;
    acceptedSlots: Array<{
      startTime: string;
      endTime: string;
      duration: number;
      logged?: boolean;
    }>;
    lastCompletedDay: string | null;
  };
  eventLink?: {
    type: "calendar" | "timetable";
    calendarEventId?: string;
    timetableCellId?: string;
    offset: "same_day_after" | "1_day_before" | "1_day_after";
    trackedOccurrenceDate?: string;
  };
  suggestionAvailableFrom?: string;
}): Memo {
  return {
    id: json.id,
    title: json.title,
    genre: json.genre,
    type: json.type as Memo["type"],
    createdAt: new Date(json.createdAt),
    deadline: json.deadline ? new Date(json.deadline) : undefined,
    recurrenceGoal: json.recurrenceGoal,
    locationPreference: json.locationPreference as Memo["locationPreference"],
    status: {
      timeSpentMinutes: json.status.timeSpentMinutes,
      completionState: json.status
        .completionState as MemoStatus["completionState"],
      completionsThisPeriod: json.status.completionsThisPeriod,
      periodStartDate: json.status.periodStartDate
        ? new Date(json.status.periodStartDate)
        : undefined,
    },
    sessionDuration: json.sessionDuration,
    totalDurationExpected: json.totalDurationExpected,
    lastActivity: json.lastActivity ? new Date(json.lastActivity) : undefined,
    importance: json.importance as ImportanceLevel | undefined,
    routineState: json.routineState
      ? {
          acceptedToday: json.routineState.acceptedToday,
          completedToday: json.routineState.completedToday,
          completedCountThisPeriod: json.routineState.completedCountThisPeriod,
          lastCompletedDay: json.routineState.lastCompletedDay
            ? new Date(json.routineState.lastCompletedDay)
            : null,
          previousLastCompletedDay: json.routineState.previousLastCompletedDay
            ? new Date(json.routineState.previousLastCompletedDay)
            : null,
          wasCappedThisPeriod: json.routineState.wasCappedThisPeriod,
          periodStartDate: json.routineState.periodStartDate
            ? new Date(json.routineState.periodStartDate)
            : null,
          rejectedToday: json.routineState.rejectedToday ?? false,
          acceptedSlot: json.routineState.acceptedSlot ?? null,
        }
      : undefined,
    backlogState: json.backlogState
      ? {
          acceptedToday: json.backlogState.acceptedToday,
          lastCompletedDay: json.backlogState.lastCompletedDay
            ? new Date(json.backlogState.lastCompletedDay)
            : null,
          previousLastCompletedDay: json.backlogState.previousLastCompletedDay
            ? new Date(json.backlogState.previousLastCompletedDay)
            : null,
          rejectedToday: json.backlogState.rejectedToday ?? false,
          acceptedSlot: json.backlogState.acceptedSlot ?? null,
        }
      : undefined,
    deadlineState: json.deadlineState
      ? {
          createdDay: new Date(json.createdAt),
          deadlineDay: json.deadline ? new Date(json.deadline) : new Date(),
          lastCompletedDay: json.deadlineState.lastCompletedDay
            ? new Date(json.deadlineState.lastCompletedDay)
            : null,
          actualDurationPoints: [],
          expectedDurationPoints: [],
          smoothedMultiplier: 1.0,
          rejectedToday: json.deadlineState.rejectedToday ?? false,
          acceptedSlots: json.deadlineState.acceptedSlots ?? [],
        }
      : undefined,
    eventLink: json.eventLink
      ? {
          type: json.eventLink.type,
          calendarEventId: json.eventLink.calendarEventId,
          timetableCellId: json.eventLink.timetableCellId,
          offset: json.eventLink.offset,
          trackedOccurrenceDate: json.eventLink.trackedOccurrenceDate
            ? new Date(json.eventLink.trackedOccurrenceDate)
            : undefined,
        }
      : undefined,
    suggestionAvailableFrom: json.suggestionAvailableFrom
      ? new Date(json.suggestionAvailableFrom)
      : undefined,
  };
}

/**
 * Convert Memo to JSON for API (serialize dates)
 */
function memoToJson(memo: Memo) {
  return {
    title: memo.title,
    genre: memo.genre,
    type: memo.type,
    createdAt: memo.createdAt.toISOString(),
    deadline: memo.deadline?.toISOString(),
    recurrenceGoal: memo.recurrenceGoal,
    locationPreference: memo.locationPreference,
    status: {
      timeSpentMinutes: memo.status.timeSpentMinutes,
      completionState: memo.status.completionState,
      completionsThisPeriod: memo.status.completionsThisPeriod,
      periodStartDate: memo.status.periodStartDate?.toISOString(),
    },
    sessionDuration: memo.sessionDuration,
    totalDurationExpected: memo.totalDurationExpected,
    lastActivity: memo.lastActivity?.toISOString(),
    importance: memo.importance,
    // Event link for deadline tasks linked to calendar events or timetable
    eventLink: memo.eventLink
      ? {
          type: memo.eventLink.type,
          calendarEventId: memo.eventLink.calendarEventId,
          timetableCellId: memo.eventLink.timetableCellId,
          offset: memo.eventLink.offset,
          trackedOccurrenceDate:
            memo.eventLink.trackedOccurrenceDate?.toISOString(),
        }
      : undefined,
    // Suggestion availability timing (for event-linked tasks)
    suggestionAvailableFrom: memo.suggestionAvailableFrom?.toISOString(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new Memo from form data
 * Note: For event-linked tasks, deadline must be calculated separately via createMemoFromFormAsync
 */
function createMemoFromForm(formData: TaskFormData): Memo {
  const now = new Date();

  // Build recurrence goal if routine
  let recurrenceGoal: RecurrenceGoal | undefined;
  if (formData.type === "ルーティン") {
    recurrenceGoal = {
      count: formData.recurrenceCount,
      period: formData.recurrencePeriod,
    };
  }

  // Parse deadline if deadline type (for non-event-linked tasks)
  let deadline: Date | undefined;
  if (
    formData.type === "期限付き" &&
    formData.deadline &&
    !formData.eventLink
  ) {
    deadline = new Date(formData.deadline);
    // Set to end of day
    deadline.setHours(23, 59, 59, 999);
  }

  // Initial status
  const status: MemoStatus = {
    timeSpentMinutes: 0,
    completionState: "not_started",
    completionsThisPeriod: 0,
    periodStartDate: now,
  };

  // Build event link if present (deadline will be calculated in createMemoFromFormAsync)
  let eventLink: EventLinkData | undefined;
  if (formData.eventLink) {
    eventLink = {
      type: formData.eventLink.type,
      calendarEventId: formData.eventLink.calendarEventId,
      timetableCellId: formData.eventLink.timetableCellId,
      offset: formData.eventLink.offset,
    };
  }

  return {
    id: crypto.randomUUID(),
    title: formData.title.trim(),
    type: formData.type,
    createdAt: now,
    deadline,
    recurrenceGoal,
    locationPreference: formData.locationPreference,
    status,
    // Preserve importance if set (empty string becomes undefined, but valid values are preserved)
    importance:
      formData.importance && formData.importance.length > 0
        ? (formData.importance as ImportanceLevel)
        : undefined,
    // Preserve genre if manually set (otherwise LLM will fill)
    genre: formData.genre.trim() || undefined,
    // LLM will fill sessionDuration, totalDurationExpected later
    // Event link for deadline tasks linked to calendar events
    eventLink,
  };
}

/**
 * Create a new Memo from form data with async deadline calculation for event-linked tasks
 */
async function createMemoFromFormAsync(formData: TaskFormData): Promise<{
  memo: Memo;
  suggestionAvailableFrom?: Date;
}> {
  const baseMemo = createMemoFromForm(formData);

  // For event-linked tasks, calculate deadline from event occurrence
  if (formData.eventLink && formData.type === "期限付き") {
    const {
      getNextCalendarOccurrence,
      getNextTimetableOccurrence,
      calculateDeadlineFromOccurrence,
      calculateSuggestionAvailableFrom,
    } = await import("../services/event-deadline-service");

    let deadline: Date | undefined;
    let trackedOccurrenceDate: Date | undefined;
    let suggestionAvailableFrom: Date | undefined;

    if (
      formData.eventLink.type === "calendar" &&
      formData.eventLink.calendarEventId
    ) {
      // Fetch calendar event and calculate deadline
      const { getEvent } = await import(
        "$lib/features/calendar/state/calendar.functions.remote"
      );
      const eventJson = await getEvent({
        id: formData.eventLink.calendarEventId,
      });
      // Convert JSON to Event format
      const event = {
        ...eventJson,
        start: new Date(eventJson.start),
        end: new Date(eventJson.end),
      };
      const nextOcc = getNextCalendarOccurrence(
        event as import("$lib/types").Event,
      );
      if (nextOcc) {
        trackedOccurrenceDate = nextOcc.startDate;
        deadline = calculateDeadlineFromOccurrence(
          nextOcc.startDate,
          nextOcc.endDate,
          formData.eventLink.offset,
        );
        suggestionAvailableFrom =
          calculateSuggestionAvailableFrom(
            nextOcc.endDate,
            formData.eventLink.offset,
          ) ?? undefined;
      }
    } else if (
      formData.eventLink.type === "timetable" &&
      formData.eventLink.timetableCellId
    ) {
      // Fetch timetable cell and calculate deadline
      const { loadTimetableData } = await import(
        "$lib/features/calendar/services/timetable-events"
      );
      const { config, cells } = await loadTimetableData();
      const cell = cells.find(
        (c) => c.id === formData.eventLink?.timetableCellId,
      );
      if (cell) {
        const nextOcc = getNextTimetableOccurrence(cell, config);
        if (nextOcc) {
          trackedOccurrenceDate = nextOcc.startDate;
          deadline = calculateDeadlineFromOccurrence(
            nextOcc.startDate,
            nextOcc.endDate,
            formData.eventLink.offset,
          );
          suggestionAvailableFrom =
            calculateSuggestionAvailableFrom(
              nextOcc.endDate,
              formData.eventLink.offset,
            ) ?? undefined;
        }
      }
    }

    // Update memo with calculated values
    return {
      memo: {
        ...baseMemo,
        deadline,
        eventLink: baseMemo.eventLink
          ? {
              ...baseMemo.eventLink,
              trackedOccurrenceDate,
            }
          : undefined,
      },
      suggestionAvailableFrom,
    };
  }

  return { memo: baseMemo };
}

/**
 * Validate form data
 */
function validateTaskForm(formData: TaskFormData): {
  isValid: boolean;
  errors: TaskFormErrors;
} {
  const errors: TaskFormErrors = {};

  // Title is required
  if (!formData.title.trim()) {
    errors.title = "タスク名を入力してください";
  }

  // Deadline required for 期限付き (unless eventLink is set - deadline will be calculated from event)
  if (
    formData.type === "期限付き" &&
    !formData.deadline &&
    !formData.eventLink
  ) {
    errors.deadline = "期限を設定してください";
  }

  // Validate deadline is not in the past (only when manually set, not for event links)
  if (
    formData.type === "期限付き" &&
    formData.deadline &&
    !formData.eventLink
  ) {
    const deadline = new Date(formData.deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (deadline < today) {
      errors.deadline = "過去の日付は設定できません";
    }
  }

  // Recurrence count must be positive
  if (formData.type === "ルーティン" && formData.recurrenceCount < 1) {
    errors.recurrence = "回数は1以上を設定してください";
  }

  // Check if LLM-enriched fields have been cleared (only during edit)
  if (formData.isEditing) {
    const clearedFields: string[] = [];

    // Check genre - was set, now empty
    if (formData.originalGenre && !formData.genre.trim()) {
      clearedFields.push("ジャンル");
    }

    // Check sessionDuration - was set, now null/0
    if (formData.originalSessionDuration && !formData.sessionDuration) {
      clearedFields.push("セッション時間");
    }

    // Check totalDurationExpected - was set, now null/0
    if (
      formData.originalTotalDurationExpected &&
      !formData.totalDurationExpected
    ) {
      clearedFields.push("合計時間");
    }

    if (clearedFields.length > 0) {
      errors.enrichedFieldsCleared = `以下のAI推定値がクリアされています: ${clearedFields.join("、")}。編集を完了するには値を設定してください。`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// ============================================================================
// Task State Class
// ============================================================================

/**
 * Task state reactive class
 */
class TaskState {
  // ============================================================================
  // Reactive State
  // ============================================================================

  /** Store for rich Memo objects (tasks) */
  items = $state<Memo[]>([]);

  /** Whether tasks are currently being loaded from DB */
  isLoading = $state(false);

  /** Set of task IDs currently being enriched by LLM */
  enrichingIds = $state<Set<string>>(new Set());

  // ============================================================================
  // Derived State (getters)
  // ============================================================================

  /** Is any task being enriched? */
  get hasEnriching(): boolean {
    return this.enrichingIds.size > 0;
  }

  /** Get active tasks (not completed) */
  get active(): Memo[] {
    return this.items.filter((t) => t.status.completionState !== "completed");
  }

  // ============================================================================
  // Loading Methods
  // ============================================================================

  /**
   * Load all tasks from database
   * Also checks for period resets and persists them to the database
   */
  async load(): Promise<void> {
    this.isLoading = true;
    try {
      const memosJson = await fetchMemos({});
      const memos = memosJson.map(jsonToMemo);

      // Check for period resets and persist changes
      const currentTime = new Date();
      const memosWithResets = memos.map((memo) =>
        resetPeriodIfNeeded(memo, currentTime),
      );

      // Check if any memos were reset and need to be saved
      const updates: Array<Promise<unknown>> = [];
      for (let i = 0; i < memos.length; i++) {
        const original = memos[i];
        const reset = memosWithResets[i];

        // Check if period was reset (completionsThisPeriod or periodStartDate changed)
        const periodReset =
          original.status.completionsThisPeriod !==
            reset.status.completionsThisPeriod ||
          original.status.periodStartDate?.getTime() !==
            reset.status.periodStartDate?.getTime();

        // Check if daily flags were reset (routineState or backlogState changed)
        const routineStateReset =
          original.routineState?.acceptedToday !==
            reset.routineState?.acceptedToday ||
          original.routineState?.completedToday !==
            reset.routineState?.completedToday;

        const backlogStateReset =
          original.backlogState?.acceptedToday !==
          reset.backlogState?.acceptedToday;

        // Check if deadline state was reset (acceptedSlots cleared or rejectedToday changed)
        const deadlineStateReset =
          (original.deadlineState?.acceptedSlots?.length ?? 0) !==
            (reset.deadlineState?.acceptedSlots?.length ?? 0) ||
          original.deadlineState?.rejectedToday !==
            reset.deadlineState?.rejectedToday;

        if (
          periodReset ||
          routineStateReset ||
          backlogStateReset ||
          deadlineStateReset
        ) {
          // Build update object matching MemoUpdateSchema
          const updateData: {
            status?: {
              timeSpentMinutes: number;
              completionState: "not_started" | "in_progress" | "completed";
              completionsThisPeriod?: number;
              periodStartDate?: string;
            };
            routineState?: {
              acceptedToday: boolean;
              completedToday: boolean;
              completedCountThisPeriod: number;
              lastCompletedDay: string | null;
              wasCappedThisPeriod: boolean;
              periodStartDate: string | null;
              rejectedToday: boolean;
              acceptedSlot: {
                startTime: string;
                endTime: string;
                duration: number;
                logged?: boolean;
              } | null;
            };
            backlogState?: {
              acceptedToday: boolean;
              lastCompletedDay: string | null;
              rejectedToday: boolean;
              acceptedSlot: {
                startTime: string;
                endTime: string;
                duration: number;
                logged?: boolean;
              } | null;
            };
            deadlineState?: {
              rejectedToday: boolean;
              acceptedSlots: {
                startTime: string;
                endTime: string;
                duration: number;
                logged?: boolean;
              }[];
              lastCompletedDay: string | null;
            };
          } = {};

          if (periodReset) {
            // Include all status fields to preserve existing values
            updateData.status = {
              timeSpentMinutes: reset.status.timeSpentMinutes,
              completionState: reset.status.completionState,
              completionsThisPeriod: reset.status.completionsThisPeriod,
              periodStartDate: reset.status.periodStartDate?.toISOString(),
            };
          }

          if (routineStateReset && reset.routineState) {
            updateData.routineState = {
              acceptedToday: reset.routineState.acceptedToday,
              completedToday: reset.routineState.completedToday,
              completedCountThisPeriod:
                reset.routineState.completedCountThisPeriod,
              lastCompletedDay:
                reset.routineState.lastCompletedDay?.toISOString() ?? null,
              wasCappedThisPeriod: reset.routineState.wasCappedThisPeriod,
              periodStartDate:
                reset.routineState.periodStartDate?.toISOString() ?? null,
              rejectedToday: reset.routineState.rejectedToday,
              acceptedSlot: reset.routineState.acceptedSlot,
            };
          }

          if (backlogStateReset && reset.backlogState) {
            updateData.backlogState = {
              acceptedToday: reset.backlogState.acceptedToday,
              lastCompletedDay:
                reset.backlogState.lastCompletedDay?.toISOString() ?? null,
              rejectedToday: reset.backlogState.rejectedToday,
              acceptedSlot: reset.backlogState.acceptedSlot,
            };
          }

          if (deadlineStateReset && reset.deadlineState) {
            updateData.deadlineState = {
              rejectedToday: reset.deadlineState.rejectedToday,
              acceptedSlots: reset.deadlineState.acceptedSlots,
              lastCompletedDay:
                reset.deadlineState.lastCompletedDay?.toISOString() ?? null,
            };
          }

          // Persist to database
          updates.push(
            updateMemo({
              id: reset.id,
              updates: updateData,
            }),
          );

          console.log(
            `[TaskState.load] Period reset detected for task ${reset.id}:`,
            updateData,
          );
        }
      }

      // Wait for all updates to complete
      if (updates.length > 0) {
        await Promise.all(updates);
        console.log(
          `[TaskState.load] Persisted ${updates.length} period reset(s) to database`,
        );
      }

      // Use the reset memos for the store
      this.items = memosWithResets;
    } catch (err) {
      console.error("[TaskState.load] Failed to load tasks:", err);
      toastState.error("タスクの読み込みに失敗しました");
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Check if a specific task is being enriched
   */
  isEnriching(taskId: string): boolean {
    return this.enrichingIds.has(taskId);
  }

  // ============================================================================
  // CRUD Methods
  // ============================================================================

  /**
   * Create a new task from the current form data
   * Task is saved to DB, added to store, then enriched by LLM in background
   * For event-linked tasks, deadline is calculated from the linked event occurrence
   */
  async create(): Promise<Memo | null> {
    const formData = taskFormState.formData;

    // Clear previous errors
    taskFormState.clearAllErrors();

    // Validate
    const validation = validateTaskForm(formData);
    if (!validation.isValid) {
      Object.entries(validation.errors).forEach(([field, error]) => {
        taskFormState.setFieldError(field as keyof TaskFormErrors, error);
      });
      return null;
    }

    try {
      taskFormState.setSubmitting(true);

      // Create the memo (with deadline calculation for event-linked tasks)
      const { memo: newMemo, suggestionAvailableFrom } =
        await createMemoFromFormAsync(formData);

      // Add suggestionAvailableFrom to memo for serialization
      const memoWithSuggestion: Memo = {
        ...newMemo,
        suggestionAvailableFrom,
      };

      // Save to DB
      const savedJson = await createMemo(memoToJson(memoWithSuggestion));
      const savedMemo = jsonToMemo(savedJson);

      // Add to store
      this.items = [...this.items, savedMemo];

      // Close form and show success
      taskFormState.closeForm();
      toastState.show("タスクを作成しました", "success");

      // Start LLM enrichment in background
      this.enrichInBackground(savedMemo.id);

      return savedMemo;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "タスクの作成に失敗しました";
      taskFormState.setGeneralError(message);
      return null;
    } finally {
      taskFormState.setSubmitting(false);
    }
  }

  /**
   * Update an existing task from the current form data
   */
  async update(): Promise<Memo | null> {
    const formData = taskFormState.formData;

    if (!formData.editingId) {
      taskFormState.setGeneralError("編集するタスクが選択されていません");
      return null;
    }

    // Clear previous errors
    taskFormState.clearAllErrors();

    // Validate
    const validation = validateTaskForm(formData);
    if (!validation.isValid) {
      Object.entries(validation.errors).forEach(([field, error]) => {
        taskFormState.setFieldError(field as keyof TaskFormErrors, error);
      });
      return null;
    }

    try {
      taskFormState.setSubmitting(true);

      const existing = this.items.find((t) => t.id === formData.editingId);
      if (!existing) {
        taskFormState.setGeneralError("タスクが見つかりません");
        return null;
      }

      // Build updates
      const updates = {
        title: formData.title.trim(),
        type: formData.type,
        deadline:
          formData.type === "期限付き" && formData.deadline
            ? new Date(formData.deadline).toISOString()
            : undefined,
        recurrenceGoal:
          formData.type === "ルーティン"
            ? {
                count: formData.recurrenceCount,
                period: formData.recurrencePeriod,
              }
            : undefined,
        locationPreference: formData.locationPreference,
        importance:
          formData.importance && formData.importance.length > 0
            ? (formData.importance as ImportanceLevel)
            : undefined,
        // User-editable LLM-enriched fields
        genre: formData.genre.trim() || undefined,
        sessionDuration: formData.sessionDuration ?? undefined,
        totalDurationExpected: formData.totalDurationExpected ?? undefined,
      };

      // Update in DB
      const updatedJson = await updateMemo({
        id: formData.editingId,
        updates,
      });
      const updatedMemo = jsonToMemo(updatedJson);

      // Update store
      const index = this.items.findIndex((t) => t.id === formData.editingId);
      if (index !== -1) {
        const newItems = [...this.items];
        newItems[index] = updatedMemo;
        this.items = newItems;
      }

      // Close form and show success
      taskFormState.closeForm();
      toastState.show("タスクを更新しました", "success");

      return updatedMemo;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "タスクの更新に失敗しました";
      taskFormState.setGeneralError(message);
      return null;
    } finally {
      taskFormState.setSubmitting(false);
    }
  }

  /**
   * Delete a task by ID
   */
  async delete(taskId: string): Promise<boolean> {
    try {
      // Delete from DB
      await deleteMemo({ id: taskId });

      // Remove from store
      this.items = this.items.filter((t) => t.id !== taskId);

      toastState.show("タスクを削除しました", "success");
      return true;
    } catch (err) {
      console.error("[TaskState.delete] Failed:", err);
      toastState.show("タスクの削除に失敗しました", "error");
      return false;
    }
  }

  /**
   * Mark a task as complete
   */
  async markComplete(taskId: string): Promise<Memo | null> {
    try {
      const existing = this.items.find((t) => t.id === taskId);
      if (!existing) return null;

      const newStatus = {
        ...existing.status,
        completionState: "completed" as const,
      };

      // Update in DB
      const updatedJson = await updateMemo({
        id: taskId,
        updates: {
          status: {
            timeSpentMinutes: newStatus.timeSpentMinutes,
            completionState: newStatus.completionState,
            completionsThisPeriod: newStatus.completionsThisPeriod,
            periodStartDate: newStatus.periodStartDate?.toISOString(),
          },
        },
      });
      let updatedMemo = jsonToMemo(updatedJson);

      // For event-linked deadline tasks, advance to next occurrence (rolling deadline)
      if (existing.eventLink && existing.type === "期限付き") {
        try {
          const advanceResult = await advanceEventLinkedDeadline({
            memoId: taskId,
          });
          if (advanceResult.advanced) {
            // Refetch the updated memo to get new deadline
            await this.load();
            const refreshed = this.items.find((t) => t.id === taskId);
            if (refreshed) {
              updatedMemo = refreshed;
              toastState.show(
                "タスクを完了し、次の締切に更新しました",
                "success",
              );
              return updatedMemo;
            }
          }
        } catch (advanceErr) {
          console.warn(
            "[TaskState.markComplete] Failed to advance deadline:",
            advanceErr,
          );
        }
      }

      // Update store
      const index = this.items.findIndex((t) => t.id === taskId);
      if (index !== -1) {
        const newItems = [...this.items];
        newItems[index] = updatedMemo;
        this.items = newItems;
      }

      toastState.show("タスクを完了しました", "success");
      return updatedMemo;
    } catch (err) {
      console.error("[TaskState.markComplete] Failed:", err);
      toastState.show("タスクの更新に失敗しました", "error");
      return null;
    }
  }

  // ============================================================================
  // Form Methods
  // ============================================================================

  /**
   * Submit the form (create or update based on editing state)
   */
  async submit(): Promise<Memo | null> {
    const formData = taskFormState.formData;
    if (formData.isEditing) {
      return this.update();
    } else {
      return this.create();
    }
  }

  /**
   * Start editing a task
   * If the task has an eventLink, fetches the linked event title for display
   */
  async edit(task: Memo): Promise<void> {
    // Build the edit data
    const editData: Parameters<typeof taskFormState.openFormForEditing>[0] = {
      id: task.id,
      title: task.title,
      type: task.type,
      deadline: task.deadline,
      recurrenceGoal: task.recurrenceGoal,
      locationPreference: task.locationPreference,
      importance: task.importance,
      genre: task.genre,
      sessionDuration: task.sessionDuration,
      totalDurationExpected: task.totalDurationExpected,
    };

    // If task has an event link, fetch the event title
    if (task.eventLink) {
      let eventTitle = "リンク先イベント"; // Default fallback

      try {
        if (
          task.eventLink.type === "calendar" &&
          task.eventLink.calendarEventId
        ) {
          // Fetch calendar event
          const { getEvent } = await import(
            "$lib/features/calendar/state/calendar.functions.remote"
          );
          const event = await getEvent({ id: task.eventLink.calendarEventId });
          eventTitle = event.title;
        } else if (
          task.eventLink.type === "timetable" &&
          task.eventLink.timetableCellId
        ) {
          // Fetch timetable cell
          const { loadTimetableData } = await import(
            "$lib/features/calendar/services/timetable-events"
          );
          const { cells } = await loadTimetableData();
          const cell = cells.find(
            (c) => c.id === task.eventLink?.timetableCellId,
          );
          if (cell) {
            eventTitle = cell.title;
          }
        }
      } catch (err) {
        console.warn("[TaskState.edit] Failed to fetch event title:", err);
      }

      editData.eventLink = {
        type: task.eventLink.type,
        calendarEventId: task.eventLink.calendarEventId,
        timetableCellId: task.eventLink.timetableCellId,
        offset: task.eventLink.offset,
        eventTitle,
      };
    }

    taskFormState.openFormForEditing(editData);
  }

  /**
   * Open form for creating new task
   */
  startCreate(): void {
    taskFormState.openForm();
  }

  /**
   * Cancel form
   */
  cancel(): void {
    taskFormState.closeForm();
  }

  // ============================================================================
  // Progress & Status Methods
  // ============================================================================

  /**
   * Log progress for a task session (updates DB and store reactively)
   * This is the preferred method for logging session completions.
   *
   * @param memoId - The task ID
   * @param durationMinutes - Duration of the session
   * @returns Updated status or null on error
   */
  async logProgress(
    memoId: string,
    durationMinutes: number,
  ): Promise<{
    timeSpentMinutes: number;
    completionsThisPeriod: number;
    lastActivity: string | undefined;
  } | null> {
    try {
      // Call remote function to update DB
      const result = await logSuggestionComplete({ memoId, durationMinutes });

      // Update store reactively
      const index = this.items.findIndex((t) => t.id === memoId);
      if (index !== -1) {
        const task = this.items[index];
        const newItems = [...this.items];
        newItems[index] = {
          ...task,
          status: {
            ...task.status,
            timeSpentMinutes: result.timeSpentMinutes,
            completionsThisPeriod: result.completionsThisPeriod,
          },
          lastActivity: result.lastActivity
            ? new Date(result.lastActivity)
            : task.lastActivity,
          // Update type-specific state (keep acceptedSlot - task stays "accepted" until user marks missed/deletes)
          routineState: result.routineState
            ? {
                ...task.routineState,
                acceptedToday: result.routineState.acceptedToday,
                completedToday: result.routineState.completedToday,
                completedCountThisPeriod:
                  result.routineState.completedCountThisPeriod,
                lastCompletedDay: result.routineState.lastCompletedDay
                  ? new Date(result.routineState.lastCompletedDay)
                  : null,
                previousLastCompletedDay:
                  task.routineState?.previousLastCompletedDay ?? null,
                wasCappedThisPeriod: result.routineState.wasCappedThisPeriod,
                periodStartDate: result.routineState.periodStartDate
                  ? new Date(result.routineState.periodStartDate)
                  : null,
                rejectedToday: task.routineState?.rejectedToday ?? false,
                acceptedSlot: task.routineState?.acceptedSlot
                  ? { ...task.routineState.acceptedSlot, logged: true }
                  : null,
              }
            : task.routineState,
          backlogState: result.backlogState
            ? {
                ...task.backlogState,
                acceptedToday: result.backlogState.acceptedToday,
                lastCompletedDay: result.backlogState.lastCompletedDay
                  ? new Date(result.backlogState.lastCompletedDay)
                  : null,
                previousLastCompletedDay:
                  task.backlogState?.previousLastCompletedDay ?? null,
                rejectedToday: task.backlogState?.rejectedToday ?? false,
                acceptedSlot: task.backlogState?.acceptedSlot
                  ? { ...task.backlogState.acceptedSlot, logged: true }
                  : null,
              }
            : task.backlogState,
          // Keep deadline acceptedSlots - task stays "accepted" until user marks missed/deletes
        };
        this.items = newItems;
      }

      console.log(
        `[TaskState.logProgress] Updated task ${memoId}: ${result.timeSpentMinutes}min total, ${result.completionsThisPeriod} completions`,
      );

      return result;
    } catch (err) {
      console.error("[TaskState.logProgress] Failed:", err);
      toastState.show("進捗の記録に失敗しました", "error");
      return null;
    }
  }

  /**
   * Mark a task as accepted (sets acceptedToday = true)
   * This causes the scoring function to treat the task as "done for today",
   * preventing duplicate suggestions from appearing.
   *
   * Called when user accepts a suggestion (before completion).
   *
   * @param memoId - ID of the task to mark as accepted
   * @param slot - Optional time slot info for persistence across reloads
   */
  async markAccepted(
    memoId: string,
    slot?: { startTime: string; endTime: string; duration: number },
  ): Promise<boolean> {
    try {
      const result = await markMemoAccepted({ memoId, slot });

      // Update local store
      const index = this.items.findIndex((t) => t.id === memoId);
      if (index !== -1) {
        const task = this.items[index];
        const newItems = [...this.items];
        newItems[index] = {
          ...task,
          lastActivity: new Date(),
          routineState: result.routineState
            ? {
                ...task.routineState,
                acceptedToday: result.routineState.acceptedToday,
                completedToday: result.routineState.completedToday,
                completedCountThisPeriod:
                  result.routineState.completedCountThisPeriod,
                lastCompletedDay: result.routineState.lastCompletedDay
                  ? new Date(result.routineState.lastCompletedDay)
                  : null,
                previousLastCompletedDay: result.routineState
                  .previousLastCompletedDay
                  ? new Date(result.routineState.previousLastCompletedDay)
                  : null,
                wasCappedThisPeriod: result.routineState.wasCappedThisPeriod,
                periodStartDate: result.routineState.periodStartDate
                  ? new Date(result.routineState.periodStartDate)
                  : null,
                rejectedToday: task.routineState?.rejectedToday ?? false,
                acceptedSlot: result.routineState.acceptedSlot ?? null,
              }
            : task.routineState,
          backlogState: result.backlogState
            ? {
                ...task.backlogState,
                acceptedToday: result.backlogState.acceptedToday,
                lastCompletedDay: result.backlogState.lastCompletedDay
                  ? new Date(result.backlogState.lastCompletedDay)
                  : null,
                previousLastCompletedDay: result.backlogState
                  .previousLastCompletedDay
                  ? new Date(result.backlogState.previousLastCompletedDay)
                  : null,
                rejectedToday: task.backlogState?.rejectedToday ?? false,
                acceptedSlot: result.backlogState.acceptedSlot ?? null,
              }
            : task.backlogState,
        };
        this.items = newItems;
      }

      console.log(`[TaskState.markAccepted] Marked task ${memoId} as accepted`);
      return true;
    } catch (err) {
      console.error("[TaskState.markAccepted] Failed:", err);
      return false;
    }
  }

  /**
   * Reset acceptedToday flag for a task (when user marks as "missed")
   * This allows the task to reappear in suggestions.
   */
  async resetAccepted(memoId: string): Promise<boolean> {
    try {
      await resetMemoAcceptedToday({ memoId });

      // Update local store
      const index = this.items.findIndex((t) => t.id === memoId);
      if (index !== -1) {
        const task = this.items[index];
        const newItems = [...this.items];

        if (task.type === "ルーティン" && task.routineState) {
          newItems[index] = {
            ...task,
            routineState: {
              ...task.routineState,
              acceptedToday: false,
              completedToday: false,
              acceptedSlot: null,
              // Restore lastCompletedDay from saved value (undo the acceptance)
              lastCompletedDay: task.routineState.previousLastCompletedDay,
              previousLastCompletedDay: null,
            },
          };
        } else if (task.type === "バックログ" && task.backlogState) {
          newItems[index] = {
            ...task,
            backlogState: {
              ...task.backlogState,
              acceptedToday: false,
              acceptedSlot: null,
              // Restore lastCompletedDay from saved value (undo the acceptance)
              lastCompletedDay: task.backlogState.previousLastCompletedDay,
              previousLastCompletedDay: null,
            },
          };
        }

        this.items = newItems;
      }

      console.log(
        `[TaskState.resetAccepted] Reset acceptedToday for task ${memoId}`,
      );
      return true;
    } catch (err) {
      console.error("[TaskState.resetAccepted] Failed:", err);
      return false;
    }
  }

  /**
   * Mark a task as rejected (sets rejectedToday = true)
   * This prevents the task from reappearing in suggestions for today.
   *
   * Called when user skips/rejects a suggestion.
   */
  async markRejected(memoId: string): Promise<boolean> {
    try {
      await markMemoRejected({ memoId });

      // Update local store
      const index = this.items.findIndex((t) => t.id === memoId);
      if (index !== -1) {
        const task = this.items[index];
        const newItems = [...this.items];

        if (task.type === "ルーティン" && task.routineState) {
          newItems[index] = {
            ...task,
            routineState: {
              ...task.routineState,
              rejectedToday: true,
            },
          };
        } else if (task.type === "バックログ" && task.backlogState) {
          newItems[index] = {
            ...task,
            backlogState: {
              ...task.backlogState,
              rejectedToday: true,
            },
          };
        } else if (task.type === "期限付き" && task.deadlineState) {
          newItems[index] = {
            ...task,
            deadlineState: {
              ...task.deadlineState,
              rejectedToday: true,
            },
          };
        }

        this.items = newItems;
      }

      console.log(`[TaskState.markRejected] Marked task ${memoId} as rejected`);
      return true;
    } catch (err) {
      console.error("[TaskState.markRejected] Failed:", err);
      return false;
    }
  }

  /**
   * Add an accepted time slot for a deadline task
   * Called when user accepts a deadline suggestion with specific time slot.
   *
   * @param memoId - ID of the deadline task
   * @param slot - Time slot info (startTime, endTime, duration)
   */
  async addAcceptedSlot(
    memoId: string,
    slot: { startTime: string; endTime: string; duration: number },
  ): Promise<boolean> {
    try {
      const result = await addDeadlineAcceptedSlot({ memoId, slot });

      // Update local store
      const index = this.items.findIndex((t) => t.id === memoId);
      if (index !== -1) {
        const task = this.items[index];
        if (task.type === "期限付き") {
          const newItems = [...this.items];
          newItems[index] = {
            ...task,
            deadlineState: {
              // Initialize with defaults if deadlineState was missing
              createdDay: task.deadlineState?.createdDay ?? task.createdAt,
              deadlineDay:
                task.deadlineState?.deadlineDay ?? task.deadline ?? new Date(),
              lastCompletedDay: task.deadlineState?.lastCompletedDay ?? null,
              actualDurationPoints:
                task.deadlineState?.actualDurationPoints ?? [],
              expectedDurationPoints:
                task.deadlineState?.expectedDurationPoints ?? [],
              smoothedMultiplier: task.deadlineState?.smoothedMultiplier ?? 1.0,
              rejectedToday: task.deadlineState?.rejectedToday ?? false,
              acceptedSlots: result.acceptedSlots,
            },
            lastActivity: new Date(),
          };
          this.items = newItems;
        }
      }

      console.log(
        `[TaskState.addAcceptedSlot] Added slot to task ${memoId}:`,
        slot,
      );
      return true;
    } catch (err) {
      console.error("[TaskState.addAcceptedSlot] Failed:", err);
      return false;
    }
  }

  /**
   * Remove an accepted time slot from a deadline task
   * Called when user cancels/deletes an accepted deadline suggestion.
   *
   * @param memoId - ID of the deadline task
   * @param startTime - Start time of the slot to remove (used as identifier)
   */
  async removeAcceptedSlot(
    memoId: string,
    startTime: string,
  ): Promise<boolean> {
    try {
      const result = await removeDeadlineAcceptedSlot({ memoId, startTime });

      // Update local store
      const index = this.items.findIndex((t) => t.id === memoId);
      if (index !== -1) {
        const task = this.items[index];
        if (task.type === "期限付き" && task.deadlineState) {
          const newItems = [...this.items];
          newItems[index] = {
            ...task,
            deadlineState: {
              ...task.deadlineState,
              acceptedSlots: result.acceptedSlots,
            },
          };
          this.items = newItems;
        }
      }

      console.log(
        `[TaskState.removeAcceptedSlot] Removed slot ${startTime} from task ${memoId}`,
      );
      return true;
    } catch (err) {
      console.error("[TaskState.removeAcceptedSlot] Failed:", err);
      return false;
    }
  }

  /**
   * Update the duration of an accepted time slot
   * Called when user adjusts the duration slider on an accepted suggestion.
   * Works for all task types (routine, backlog, deadline).
   *
   * @param memoId - ID of the task
   * @param startTime - Start time of the slot (used as identifier for deadline tasks)
   * @param newDuration - New duration in minutes
   * @param newEndTime - New end time string
   */
  async updateAcceptedSlotDuration(
    memoId: string,
    startTime: string,
    newDuration: number,
    newEndTime: string,
  ): Promise<boolean> {
    try {
      await updateAcceptedSlotDuration({
        memoId,
        startTime,
        newDuration,
        newEndTime,
      });

      // Update local store
      const index = this.items.findIndex((t) => t.id === memoId);
      if (index !== -1) {
        const task = this.items[index];
        const newItems = [...this.items];

        if (task.type === "ルーティン" && task.routineState?.acceptedSlot) {
          newItems[index] = {
            ...task,
            routineState: {
              ...task.routineState,
              acceptedSlot: {
                ...task.routineState.acceptedSlot,
                duration: newDuration,
                endTime: newEndTime,
              },
            },
          };
        } else if (
          task.type === "バックログ" &&
          task.backlogState?.acceptedSlot
        ) {
          newItems[index] = {
            ...task,
            backlogState: {
              ...task.backlogState,
              acceptedSlot: {
                ...task.backlogState.acceptedSlot,
                duration: newDuration,
                endTime: newEndTime,
              },
            },
          };
        } else if (task.type === "期限付き" && task.deadlineState) {
          newItems[index] = {
            ...task,
            deadlineState: {
              ...task.deadlineState,
              acceptedSlots: task.deadlineState.acceptedSlots.map((slot) =>
                slot.startTime === startTime
                  ? { ...slot, duration: newDuration, endTime: newEndTime }
                  : slot,
              ),
            },
          };
        }

        this.items = newItems;
      }

      console.log(
        `[TaskState.updateAcceptedSlotDuration] Updated duration for task ${memoId}: ${newDuration}min`,
      );
      return true;
    } catch (err) {
      console.error("[TaskState.updateAcceptedSlotDuration] Failed:", err);
      return false;
    }
  }

  // ============================================================================
  // Enrichment Methods
  // ============================================================================

  /**
   * Enrich a task with LLM in background
   * Updates the task in store and DB when complete
   */
  private async enrichInBackground(taskId: string): Promise<void> {
    // Mark as enriching
    const newSet = new Set(this.enrichingIds);
    newSet.add(taskId);
    this.enrichingIds = newSet;

    try {
      // Get the task from store (get fresh copy to ensure we have latest values)
      const task = this.items.find((t) => t.id === taskId);
      if (!task) {
        console.warn(`[TaskState.enrichInBackground] Task ${taskId} not found`);
        return;
      }

      // Call LLM enrichment via API
      const enrichment = await enrichMemoViaAPI(task);

      // Edge case: If enrichment is undefined/null, use fallback
      if (!enrichment) {
        console.warn(
          `[TaskState.enrichInBackground] Received undefined enrichment for task ${taskId}, skipping update`,
        );
        return;
      }

      // Get fresh task copy again (in case it was updated while enrichment was running)
      const latestTask = this.items.find((t) => t.id === taskId);
      if (!latestTask) {
        console.warn(
          `[TaskState.enrichInBackground] Task ${taskId} was deleted during enrichment`,
        );
        return;
      }

      // Build enrichment updates (only fill missing fields)
      const enrichmentUpdates: Record<string, unknown> = {};
      if (!latestTask.genre && enrichment.genre) {
        enrichmentUpdates.genre = enrichment.genre;
      }
      if (!latestTask.importance && enrichment.importance) {
        enrichmentUpdates.importance = enrichment.importance;
      }
      if (!latestTask.sessionDuration && enrichment.sessionDuration) {
        enrichmentUpdates.sessionDuration = enrichment.sessionDuration;
      }
      if (
        !latestTask.totalDurationExpected &&
        enrichment.totalDurationExpected
      ) {
        enrichmentUpdates.totalDurationExpected =
          enrichment.totalDurationExpected;
      }

      // Skip if nothing to update
      if (Object.keys(enrichmentUpdates).length === 0) {
        console.log(
          `[TaskState.enrichInBackground] No fields to update for task ${taskId}`,
        );
        return;
      }

      // Update in DB
      const updatedJson = await updateMemo({
        id: taskId,
        updates: enrichmentUpdates,
      });
      const enrichedTask = jsonToMemo(updatedJson);

      // Update task in store with enriched data
      const index = this.items.findIndex((t) => t.id === taskId);
      if (index !== -1) {
        const newItems = [...this.items];
        newItems[index] = enrichedTask;
        this.items = newItems;
      }

      console.log(
        `[TaskState.enrichInBackground] Task "${enrichedTask.title}" enriched:`,
        {
          genre: enrichedTask.genre,
          importance: enrichedTask.importance,
          sessionDuration: enrichedTask.sessionDuration,
          totalDurationExpected: enrichedTask.totalDurationExpected,
        },
      );
    } catch (error) {
      console.error(
        `[TaskState.enrichInBackground] Failed to enrich task ${taskId}:`,
        error,
      );
    } finally {
      // Remove from enriching set
      const newSet = new Set(this.enrichingIds);
      newSet.delete(taskId);
      this.enrichingIds = newSet;
    }
  }

  // ============================================================================
  // Legacy Getter Methods (for backwards compatibility)
  // ============================================================================

  /**
   * Get active tasks (not completed)
   * @deprecated Use taskState.active getter instead
   */
  getActive(): Memo[] {
    return this.active;
  }

  /**
   * Get all tasks
   * @deprecated Use taskState.items directly instead
   */
  getAll(): Memo[] {
    return this.items;
  }

  /**
   * Set items directly (for test compatibility)
   */
  set(items: Memo[]): void {
    this.items = items;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global task state instance
 */
export const taskState = new TaskState();

// ============================================================================
// Backwards Compatibility Exports
// ============================================================================

// Note: writable/derived imports removed - backwards compat exports use manual subscribe pattern

/**
 * @deprecated Use taskState.items directly instead
 * Legacy store for backwards compatibility
 */
export const tasks = {
  subscribe(callback: (value: Memo[]) => void) {
    callback(taskState.items);
    return () => {};
  },
  set(value: Memo[]) {
    taskState.items = value;
  },
  update(fn: (value: Memo[]) => Memo[]) {
    taskState.items = fn(taskState.items);
  },
};

/**
 * @deprecated Use taskState.isLoading directly instead
 */
export const isTasksLoading = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskState.isLoading);
    return () => {};
  },
  set(value: boolean) {
    taskState.isLoading = value;
  },
};

/**
 * @deprecated Use taskState.enrichingIds directly instead
 */
export const enrichingTaskIds = {
  subscribe(callback: (value: Set<string>) => void) {
    callback(taskState.enrichingIds);
    return () => {};
  },
  update(fn: (value: Set<string>) => Set<string>) {
    taskState.enrichingIds = fn(taskState.enrichingIds);
  },
};

/**
 * @deprecated Use taskState.hasEnriching directly instead
 */
export const hasEnrichingTasks = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskState.hasEnriching);
    return () => {};
  },
};

/**
 * @deprecated Use taskState.load() instead
 */
export async function loadTasks(): Promise<void> {
  return taskState.load();
}

/**
 * @deprecated Use taskState.isEnriching() instead
 */
export function isTaskEnriching(taskId: string): boolean {
  return taskState.isEnriching(taskId);
}

/**
 * @deprecated Use taskState methods directly instead
 * Legacy actions object for backwards compatibility
 */
export const taskActions = {
  create: () => taskState.create(),
  update: () => taskState.update(),
  delete: (taskId: string) => taskState.delete(taskId),
  markComplete: (taskId: string) => taskState.markComplete(taskId),
  getActive: () => taskState.getActive(),
  getAll: () => taskState.getAll(),
  submit: () => taskState.submit(),
  edit: (task: Memo) => taskState.edit(task),
  startCreate: () => taskState.startCreate(),
  cancel: () => taskState.cancel(),
  logProgress: (memoId: string, durationMinutes: number) =>
    taskState.logProgress(memoId, durationMinutes),
  markAccepted: (
    memoId: string,
    slot?: { startTime: string; endTime: string; duration: number },
  ) => taskState.markAccepted(memoId, slot),
  resetAccepted: (memoId: string) => taskState.resetAccepted(memoId),
  markRejected: (memoId: string) => taskState.markRejected(memoId),
  addAcceptedSlot: (
    memoId: string,
    slot: { startTime: string; endTime: string; duration: number },
  ) => taskState.addAcceptedSlot(memoId, slot),
  removeAcceptedSlot: (memoId: string, startTime: string) =>
    taskState.removeAcceptedSlot(memoId, startTime),
  updateAcceptedSlotDuration: (
    memoId: string,
    startTime: string,
    newDuration: number,
    newEndTime: string,
  ) =>
    taskState.updateAcceptedSlotDuration(
      memoId,
      startTime,
      newDuration,
      newEndTime,
    ),
};
