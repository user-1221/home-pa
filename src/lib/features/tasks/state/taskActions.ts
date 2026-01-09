/**
 * Task Actions
 *
 * CRUD operations for rich Memo objects (tasks).
 * These memos have type, deadline, recurrence, location, etc.
 * All operations persist to database via Remote Functions.
 */

import { writable, derived, get } from "svelte/store";
import type {
  Memo,
  ImportanceLevel,
  RecurrenceGoal,
  MemoStatus,
} from "../../../types.ts";
import {
  taskForm,
  taskFormActions,
  type TaskFormData,
  type TaskFormErrors,
} from "./taskForm.ts";
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
} from "./memo.functions.remote.ts";

// ============================================================================
// Tasks Store (Rich Memos)
// ============================================================================

/**
 * Store for rich Memo objects (tasks)
 * Persisted to database via Remote Functions.
 */
export const tasks = writable<Memo[]>([]);

/**
 * Whether tasks are currently being loaded from DB
 */
export const isTasksLoading = writable<boolean>(false);

/**
 * Set of task IDs currently being enriched by LLM
 */
export const enrichingTaskIds = writable<Set<string>>(new Set());

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
  // Note: These fields may be partial from server responses that haven't been updated yet
  routineState?: {
    acceptedToday: boolean;
    completedToday: boolean;
    completedCountThisPeriod: number;
    lastCompletedDay: string | null;
    wasCappedThisPeriod: boolean;
    periodStartDate: string | null;
    rejectedToday?: boolean; // Optional for backwards compat with server responses
  };
  backlogState?: {
    acceptedToday: boolean;
    lastCompletedDay: string | null;
    rejectedToday?: boolean; // Optional for backwards compat with server responses
  };
  deadlineState?: {
    rejectedToday: boolean;
    acceptedSlots: Array<{
      startTime: string;
      endTime: string;
      duration: number;
    }>;
  };
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
          wasCappedThisPeriod: json.routineState.wasCappedThisPeriod,
          periodStartDate: json.routineState.periodStartDate
            ? new Date(json.routineState.periodStartDate)
            : null,
          rejectedToday: json.routineState.rejectedToday ?? false,
        }
      : undefined,
    backlogState: json.backlogState
      ? {
          acceptedToday: json.backlogState.acceptedToday,
          lastCompletedDay: json.backlogState.lastCompletedDay
            ? new Date(json.backlogState.lastCompletedDay)
            : null,
          rejectedToday: json.backlogState.rejectedToday ?? false,
        }
      : undefined,
    deadlineState: json.deadlineState
      ? {
          createdDay: new Date(json.createdAt),
          deadlineDay: json.deadline ? new Date(json.deadline) : new Date(),
          lastCompletedDay: null,
          actualDurationPoints: [],
          expectedDurationPoints: [],
          smoothedMultiplier: 1.0,
          rejectedToday: json.deadlineState.rejectedToday ?? false,
          acceptedSlots: json.deadlineState.acceptedSlots ?? [],
        }
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
  };
}

/**
 * Load all tasks from database
 * Also checks for period resets and persists them to the database
 */
export async function loadTasks(): Promise<void> {
  isTasksLoading.set(true);
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

      if (periodReset || routineStateReset || backlogStateReset) {
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
          };
          backlogState?: {
            acceptedToday: boolean;
            lastCompletedDay: string | null;
            rejectedToday: boolean;
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
          };
        }

        if (backlogStateReset && reset.backlogState) {
          updateData.backlogState = {
            acceptedToday: reset.backlogState.acceptedToday,
            lastCompletedDay:
              reset.backlogState.lastCompletedDay?.toISOString() ?? null,
            rejectedToday: reset.backlogState.rejectedToday,
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
          `[loadTasks] Period reset detected for task ${reset.id}:`,
          updateData,
        );
      }
    }

    // Wait for all updates to complete
    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(
        `[loadTasks] Persisted ${updates.length} period reset(s) to database`,
      );
    }

    // Use the reset memos for the store
    tasks.set(memosWithResets);
  } catch (err) {
    console.error("[loadTasks] Failed to load tasks:", err);
    toastState.error("タスクの読み込みに失敗しました");
  } finally {
    isTasksLoading.set(false);
  }
}

/**
 * Check if a specific task is being enriched
 */
export function isTaskEnriching(taskId: string): boolean {
  return get(enrichingTaskIds).has(taskId);
}

/**
 * Derived store: is any task being enriched?
 */
export const hasEnrichingTasks = derived(
  enrichingTaskIds,
  ($ids) => $ids.size > 0,
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new Memo from form data
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

  // Parse deadline if deadline type
  let deadline: Date | undefined;
  if (formData.type === "期限付き" && formData.deadline) {
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
  };
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

  // Deadline required for 期限付き
  if (formData.type === "期限付き" && !formData.deadline) {
    errors.deadline = "期限を設定してください";
  }

  // Validate deadline is not in the past
  if (formData.type === "期限付き" && formData.deadline) {
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

/**
 * Enrich a task with LLM in background
 * Updates the task in store and DB when complete
 */
async function enrichTaskInBackground(taskId: string): Promise<void> {
  // Mark as enriching
  enrichingTaskIds.update((ids) => {
    const newSet = new Set(ids);
    newSet.add(taskId);
    return newSet;
  });

  try {
    // Get the task from store (get fresh copy to ensure we have latest values)
    const currentTasks = get(tasks);
    const task = currentTasks.find((t) => t.id === taskId);
    if (!task) {
      console.warn(`[Enrichment] Task ${taskId} not found`);
      return;
    }

    // Call LLM enrichment via API
    const enrichment = await enrichMemoViaAPI(task);

    // Edge case: If enrichment is undefined/null, use fallback
    if (!enrichment) {
      console.warn(
        `[Enrichment] Received undefined enrichment for task ${taskId}, skipping update`,
      );
      return;
    }

    // Get fresh task copy again (in case it was updated while enrichment was running)
    const latestTasks = get(tasks);
    const latestTask = latestTasks.find((t) => t.id === taskId);
    if (!latestTask) {
      console.warn(`[Enrichment] Task ${taskId} was deleted during enrichment`);
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
    if (!latestTask.totalDurationExpected && enrichment.totalDurationExpected) {
      enrichmentUpdates.totalDurationExpected =
        enrichment.totalDurationExpected;
    }

    // Skip if nothing to update
    if (Object.keys(enrichmentUpdates).length === 0) {
      console.log(`[Enrichment] No fields to update for task ${taskId}`);
      return;
    }

    // Update in DB
    const updatedJson = await updateMemo({
      id: taskId,
      updates: enrichmentUpdates,
    });
    const enrichedTask = jsonToMemo(updatedJson);

    // Update task in store with enriched data
    tasks.update((currentTasks) => {
      const index = currentTasks.findIndex((t) => t.id === taskId);
      if (index === -1) return currentTasks;

      const newTasks = [...currentTasks];
      newTasks[index] = enrichedTask;
      return newTasks;
    });

    console.log(`[Enrichment] Task "${enrichedTask.title}" enriched:`, {
      genre: enrichedTask.genre,
      importance: enrichedTask.importance,
      sessionDuration: enrichedTask.sessionDuration,
      totalDurationExpected: enrichedTask.totalDurationExpected,
    });
  } catch (error) {
    console.error(`[Enrichment] Failed to enrich task ${taskId}:`, error);
  } finally {
    // Remove from enriching set
    enrichingTaskIds.update((ids) => {
      const newSet = new Set(ids);
      newSet.delete(taskId);
      return newSet;
    });
  }
}

// ============================================================================
// Actions
// ============================================================================

export const taskActions = {
  /**
   * Create a new task from the current form data
   * Task is saved to DB, added to store, then enriched by LLM in background
   */
  async create(): Promise<Memo | null> {
    const formData = get(taskForm);

    // Clear previous errors
    taskFormActions.clearAllErrors();

    // Validate
    const validation = validateTaskForm(formData);
    if (!validation.isValid) {
      Object.entries(validation.errors).forEach(([field, error]) => {
        taskFormActions.setFieldError(field as keyof TaskFormErrors, error);
      });
      return null;
    }

    try {
      taskFormActions.setSubmitting(true);

      // Create the memo (without enrichment fields)
      const newMemo = createMemoFromForm(formData);

      // Save to DB
      const savedJson = await createMemo(memoToJson(newMemo));
      const savedMemo = jsonToMemo(savedJson);

      // Add to store
      tasks.update((currentTasks) => [...currentTasks, savedMemo]);

      // Close form and show success
      taskFormActions.closeForm();
      toastState.show("タスクを作成しました", "success");

      // Start LLM enrichment in background
      enrichTaskInBackground(savedMemo.id);

      return savedMemo;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "タスクの作成に失敗しました";
      taskFormActions.setGeneralError(message);
      return null;
    } finally {
      taskFormActions.setSubmitting(false);
    }
  },

  /**
   * Update an existing task from the current form data
   */
  async update(): Promise<Memo | null> {
    const formData = get(taskForm);

    if (!formData.editingId) {
      taskFormActions.setGeneralError("編集するタスクが選択されていません");
      return null;
    }

    // Clear previous errors
    taskFormActions.clearAllErrors();

    // Validate
    const validation = validateTaskForm(formData);
    if (!validation.isValid) {
      Object.entries(validation.errors).forEach(([field, error]) => {
        taskFormActions.setFieldError(field as keyof TaskFormErrors, error);
      });
      return null;
    }

    try {
      taskFormActions.setSubmitting(true);

      const currentTasks = get(tasks);
      const existing = currentTasks.find((t) => t.id === formData.editingId);
      if (!existing) {
        taskFormActions.setGeneralError("タスクが見つかりません");
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
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex(
          (t) => t.id === formData.editingId,
        );
        if (index === -1) return currentTasks;
        const newTasks = [...currentTasks];
        newTasks[index] = updatedMemo;
        return newTasks;
      });

      // Close form and show success
      taskFormActions.closeForm();
      toastState.show("タスクを更新しました", "success");

      return updatedMemo;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "タスクの更新に失敗しました";
      taskFormActions.setGeneralError(message);
      return null;
    } finally {
      taskFormActions.setSubmitting(false);
    }
  },

  /**
   * Delete a task by ID
   */
  async delete(taskId: string): Promise<boolean> {
    try {
      // Delete from DB
      await deleteMemo({ id: taskId });

      // Remove from store
      tasks.update((currentTasks) => {
        return currentTasks.filter((t) => t.id !== taskId);
      });

      toastState.show("タスクを削除しました", "success");
      return true;
    } catch (err) {
      console.error("[delete] Failed:", err);
      toastState.show("タスクの削除に失敗しました", "error");
      return false;
    }
  },

  /**
   * Mark a task as complete
   */
  async markComplete(taskId: string): Promise<Memo | null> {
    try {
      const currentTasks = get(tasks);
      const existing = currentTasks.find((t) => t.id === taskId);
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
      const updatedMemo = jsonToMemo(updatedJson);

      // Update store
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex((t) => t.id === taskId);
        if (index === -1) return currentTasks;
        const newTasks = [...currentTasks];
        newTasks[index] = updatedMemo;
        return newTasks;
      });

      toastState.show("タスクを完了しました", "success");
      return updatedMemo;
    } catch (err) {
      console.error("[markComplete] Failed:", err);
      toastState.show("タスクの更新に失敗しました", "error");
      return null;
    }
  },

  /**
   * Get active tasks (not completed)
   */
  getActive(): Memo[] {
    return get(tasks).filter((t) => t.status.completionState !== "completed");
  },

  /**
   * Get all tasks
   */
  getAll(): Memo[] {
    return get(tasks);
  },

  /**
   * Submit the form (create or update based on editing state)
   */
  async submit(): Promise<Memo | null> {
    const formData = get(taskForm);
    if (formData.isEditing) {
      return this.update();
    } else {
      return this.create();
    }
  },

  /**
   * Start editing a task
   */
  edit(task: Memo): void {
    taskFormActions.openFormForEditing({
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
    });
  },

  /**
   * Open form for creating new task
   */
  startCreate(): void {
    taskFormActions.openForm();
  },

  /**
   * Cancel form
   */
  cancel(): void {
    taskFormActions.closeForm();
  },

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
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex((t) => t.id === memoId);
        if (index === -1) return currentTasks;

        const task = currentTasks[index];
        const newTasks = [...currentTasks];
        newTasks[index] = {
          ...task,
          status: {
            ...task.status,
            timeSpentMinutes: result.timeSpentMinutes,
            completionsThisPeriod: result.completionsThisPeriod,
          },
          lastActivity: result.lastActivity
            ? new Date(result.lastActivity)
            : task.lastActivity,
          // Update type-specific state (preserve rejectedToday from existing state)
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
                wasCappedThisPeriod: result.routineState.wasCappedThisPeriod,
                periodStartDate: result.routineState.periodStartDate
                  ? new Date(result.routineState.periodStartDate)
                  : null,
                rejectedToday: task.routineState?.rejectedToday ?? false,
              }
            : task.routineState,
          backlogState: result.backlogState
            ? {
                ...task.backlogState,
                acceptedToday: result.backlogState.acceptedToday,
                lastCompletedDay: result.backlogState.lastCompletedDay
                  ? new Date(result.backlogState.lastCompletedDay)
                  : null,
                rejectedToday: task.backlogState?.rejectedToday ?? false,
              }
            : task.backlogState,
        };
        return newTasks;
      });

      console.log(
        `[taskActions.logProgress] Updated task ${memoId}: ${result.timeSpentMinutes}min total, ${result.completionsThisPeriod} completions`,
      );

      return result;
    } catch (err) {
      console.error("[taskActions.logProgress] Failed:", err);
      toastState.show("進捗の記録に失敗しました", "error");
      return null;
    }
  },

  /**
   * Mark a task as accepted (sets acceptedToday = true)
   * This causes the scoring function to treat the task as "done for today",
   * preventing duplicate suggestions from appearing.
   *
   * Called when user accepts a suggestion (before completion).
   */
  async markAccepted(memoId: string): Promise<boolean> {
    try {
      const result = await markMemoAccepted({ memoId });

      // Update local store
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex((t) => t.id === memoId);
        if (index === -1) return currentTasks;

        const task = currentTasks[index];
        const newTasks = [...currentTasks];
        newTasks[index] = {
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
                wasCappedThisPeriod: result.routineState.wasCappedThisPeriod,
                periodStartDate: result.routineState.periodStartDate
                  ? new Date(result.routineState.periodStartDate)
                  : null,
                rejectedToday: task.routineState?.rejectedToday ?? false,
              }
            : task.routineState,
          backlogState: result.backlogState
            ? {
                ...task.backlogState,
                acceptedToday: result.backlogState.acceptedToday,
                lastCompletedDay: result.backlogState.lastCompletedDay
                  ? new Date(result.backlogState.lastCompletedDay)
                  : null,
                rejectedToday: task.backlogState?.rejectedToday ?? false,
              }
            : task.backlogState,
        };
        return newTasks;
      });

      console.log(
        `[taskActions.markAccepted] Marked task ${memoId} as accepted`,
      );
      return true;
    } catch (err) {
      console.error("[taskActions.markAccepted] Failed:", err);
      return false;
    }
  },

  /**
   * Reset acceptedToday flag for a task (when user marks as "missed")
   * This allows the task to reappear in suggestions.
   */
  async resetAccepted(memoId: string): Promise<boolean> {
    try {
      await resetMemoAcceptedToday({ memoId });

      // Update local store
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex((t) => t.id === memoId);
        if (index === -1) return currentTasks;

        const task = currentTasks[index];
        const newTasks = [...currentTasks];

        if (task.type === "ルーティン" && task.routineState) {
          newTasks[index] = {
            ...task,
            routineState: {
              ...task.routineState,
              acceptedToday: false,
              completedToday: false,
            },
          };
        } else if (task.type === "バックログ" && task.backlogState) {
          newTasks[index] = {
            ...task,
            backlogState: {
              ...task.backlogState,
              acceptedToday: false,
            },
          };
        }

        return newTasks;
      });

      console.log(
        `[taskActions.resetAccepted] Reset acceptedToday for task ${memoId}`,
      );
      return true;
    } catch (err) {
      console.error("[taskActions.resetAccepted] Failed:", err);
      return false;
    }
  },

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
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex((t) => t.id === memoId);
        if (index === -1) return currentTasks;

        const task = currentTasks[index];
        const newTasks = [...currentTasks];

        if (task.type === "ルーティン" && task.routineState) {
          newTasks[index] = {
            ...task,
            routineState: {
              ...task.routineState,
              rejectedToday: true,
            },
          };
        } else if (task.type === "バックログ" && task.backlogState) {
          newTasks[index] = {
            ...task,
            backlogState: {
              ...task.backlogState,
              rejectedToday: true,
            },
          };
        } else if (task.type === "期限付き" && task.deadlineState) {
          newTasks[index] = {
            ...task,
            deadlineState: {
              ...task.deadlineState,
              rejectedToday: true,
            },
          };
        }

        return newTasks;
      });

      console.log(
        `[taskActions.markRejected] Marked task ${memoId} as rejected`,
      );
      return true;
    } catch (err) {
      console.error("[taskActions.markRejected] Failed:", err);
      return false;
    }
  },

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
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex((t) => t.id === memoId);
        if (index === -1) return currentTasks;

        const task = currentTasks[index];
        if (task.type !== "期限付き" || !task.deadlineState)
          return currentTasks;

        const newTasks = [...currentTasks];
        newTasks[index] = {
          ...task,
          deadlineState: {
            ...task.deadlineState,
            acceptedSlots: result.acceptedSlots,
          },
          lastActivity: new Date(),
        };

        return newTasks;
      });

      console.log(
        `[taskActions.addAcceptedSlot] Added slot to task ${memoId}:`,
        slot,
      );
      return true;
    } catch (err) {
      console.error("[taskActions.addAcceptedSlot] Failed:", err);
      return false;
    }
  },

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
      tasks.update((currentTasks) => {
        const index = currentTasks.findIndex((t) => t.id === memoId);
        if (index === -1) return currentTasks;

        const task = currentTasks[index];
        if (task.type !== "期限付き" || !task.deadlineState)
          return currentTasks;

        const newTasks = [...currentTasks];
        newTasks[index] = {
          ...task,
          deadlineState: {
            ...task.deadlineState,
            acceptedSlots: result.acceptedSlots,
          },
        };

        return newTasks;
      });

      console.log(
        `[taskActions.removeAcceptedSlot] Removed slot ${startTime} from task ${memoId}`,
      );
      return true;
    } catch (err) {
      console.error("[taskActions.removeAcceptedSlot] Failed:", err);
      return false;
    }
  },
};
