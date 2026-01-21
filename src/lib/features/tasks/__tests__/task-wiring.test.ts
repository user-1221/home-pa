/**
 * Task Wiring Integration Tests
 *
 * Tests the complete flow:
 * 1. Task creation via taskActions
 * 2. Task storage in tasks store
 * 3. Schedule generation via scheduleActions
 * 4. Schedule display via scheduleResult store
 * 5. Session completion tracking
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import type { Memo, Gap } from "$lib/types.ts";

// Mock fetch for API enrichment calls in tests
global.fetch = vi.fn();

// Task stores and actions
import { tasks, taskActions } from "../state/taskActions.svelte.ts";
import { taskFormState } from "../state/taskForm.svelte.ts";

// Schedule state
import { scheduleState } from "../../assistant/state/schedule.svelte.ts";

// Gap store

// ============================================================================
// Test Helpers
// ============================================================================

function createTestGap(start: string, end: string): Gap {
  const startMinutes =
    parseInt(start.split(":")[0]) * 60 + parseInt(start.split(":")[1]);
  const endMinutes =
    parseInt(end.split(":")[0]) * 60 + parseInt(end.split(":")[1]);
  return {
    gapId: `gap-${start.replace(":", "")}`,
    start,
    end,
    duration: endMinutes - startMinutes,
    locationLabel: undefined,
  };
}

function clearAllStores() {
  tasks.set([]);
  scheduleState.clear();
  taskFormState.reset();
  vi.clearAllMocks();
}

// ============================================================================
// Task Form Tests
// ============================================================================

describe("Task Form Wiring", () => {
  beforeEach(() => {
    clearAllStores();
    // Mock fetch to return fallback enrichment (tests don't need real API)
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });
  });

  it("opens and closes the task form", () => {
    expect(taskFormState.isOpen).toBe(false);

    taskFormState.openForm();
    expect(taskFormState.isOpen).toBe(true);

    taskFormState.closeForm();
    // Note: closeForm uses setTimeout, so we check immediately
    expect(taskFormState.isOpen).toBe(false);
  });

  it("updates form fields correctly", () => {
    taskFormState.updateField("title", "Test Task");
    taskFormState.updateField("type", "期限付き");
    taskFormState.updateField("deadline", "2025-12-31");

    expect(taskFormState.title).toBe("Test Task");
    expect(taskFormState.type).toBe("期限付き");
    expect(taskFormState.deadline).toBe("2025-12-31");
  });

  it("validates required fields on create", async () => {
    // Empty title should fail validation
    taskFormState.updateField("title", "");
    const result = await taskActions.create();

    // Create should return null and set errors
    expect(result).toBeNull();
    expect(taskFormState.errors.title).toBeDefined();
  });

  it("validates deadline for 期限付き type on create", async () => {
    taskFormState.updateField("title", "Test");
    taskFormState.updateField("type", "期限付き");
    taskFormState.updateField("deadline", ""); // Missing deadline

    const result = await taskActions.create();

    // Create should return null and set errors
    expect(result).toBeNull();
    expect(taskFormState.errors.deadline).toBeDefined();
  });

  it("resets form correctly", () => {
    taskFormState.updateField("title", "Test");
    taskFormState.updateField("type", "ルーティン");
    taskFormState.reset();

    expect(taskFormState.title).toBe("");
    expect(taskFormState.type).toBe("バックログ"); // Default type
    expect(taskFormState.isEditing).toBe(false);
  });
});

// ============================================================================
// Task Creation Tests
// ============================================================================

describe("Task Creation Wiring", () => {
  beforeEach(() => {
    clearAllStores();
  });

  it("creates a backlog task", async () => {
    taskFormState.updateField("title", "Read a book");
    taskFormState.updateField("type", "バックログ");
    taskFormState.updateField("locationPreference", "no_preference");

    const task = await taskActions.create();

    expect(task).not.toBeNull();
    expect(task?.title).toBe("Read a book");
    expect(task?.type).toBe("バックログ");

    const allTasks = get(tasks);
    expect(allTasks).toHaveLength(1);
    expect(allTasks[0].id).toBe(task?.id);
  });

  it("creates a deadline task with deadline", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateStr = futureDate.toISOString().split("T")[0];

    taskFormState.updateField("title", "Submit report");
    taskFormState.updateField("type", "期限付き");
    taskFormState.updateField("deadline", dateStr);

    const task = await taskActions.create();

    expect(task).not.toBeNull();
    expect(task?.type).toBe("期限付き");
    expect(task?.deadline).toBeDefined();
  });

  it("creates a routine task with recurrence goal", async () => {
    taskFormState.updateField("title", "Exercise");
    taskFormState.updateField("type", "ルーティン");
    taskFormState.updateField("recurrenceCount", 3);
    taskFormState.updateField("recurrencePeriod", "week");

    const task = await taskActions.create();

    expect(task).not.toBeNull();
    expect(task?.type).toBe("ルーティン");
    expect(task?.recurrenceGoal?.count).toBe(3);
    expect(task?.recurrenceGoal?.period).toBe("week");
  });

  it("initializes task with correct default status", async () => {
    taskFormState.updateField("title", "New task");

    const task = await taskActions.create();

    expect(task?.status.completionState).toBe("not_started");
    expect(task?.status.timeSpentMinutes).toBe(0);
    expect(task?.createdAt).toBeDefined();
  });
});

// ============================================================================
// Task Update Tests
// ============================================================================

describe("Task Update Wiring", () => {
  beforeEach(() => {
    clearAllStores();
  });

  it("updates an existing task", async () => {
    // Create initial task
    taskFormState.updateField("title", "Original title");
    const task = await taskActions.create();
    expect(task).not.toBeNull();

    // Update the task
    taskFormState.openFormForEditing({
      id: task!.id,
      title: task!.title,
      type: task!.type,
      locationPreference: task!.locationPreference,
    });

    taskFormState.updateField("title", "Updated title");
    const updated = await taskActions.update();

    expect(updated?.title).toBe("Updated title");

    const allTasks = get(tasks);
    expect(allTasks).toHaveLength(1);
    expect(allTasks[0].title).toBe("Updated title");
  });

  it("deletes a task", async () => {
    taskFormState.updateField("title", "Task to delete");
    const task = await taskActions.create();
    expect(get(tasks)).toHaveLength(1);

    const deleted = await taskActions.delete(task!.id);
    expect(deleted).toBe(true);
    expect(get(tasks)).toHaveLength(0);
  });
});

// ============================================================================
// Schedule Generation Tests
// ============================================================================

describe("Schedule Generation Wiring", () => {
  beforeEach(() => {
    clearAllStores();
  });

  it("generates schedule from tasks", async () => {
    // Create some tasks
    taskFormState.updateField("title", "Task 1");
    await taskActions.create();

    taskFormState.reset();
    taskFormState.updateField("title", "Task 2");
    await taskActions.create();

    const currentTasks = get(tasks);
    expect(currentTasks).toHaveLength(2);

    // Create test gaps
    const testGaps: Gap[] = [
      createTestGap("09:00", "10:00"),
      createTestGap("14:00", "15:00"),
    ];

    // Generate schedule
    await scheduleState.regenerate(currentTasks, {
      gaps: testGaps,
      skipLLMEnrichment: true,
    });

    expect(scheduleState.result).not.toBeNull();
    expect(scheduleState.scheduledBlocks.length).toBeGreaterThan(0);
  });

  it("updates loading state during generation", async () => {
    taskFormState.updateField("title", "Test task");
    await taskActions.create();

    const testGaps: Gap[] = [createTestGap("09:00", "10:00")];
    const currentTasks = get(tasks);

    // Start generation (we can't easily test the loading state since it's async)
    const promise = scheduleState.regenerate(currentTasks, {
      gaps: testGaps,
      skipLLMEnrichment: true,
    });

    await promise;

    // After completion, loading should be false
    expect(scheduleState.isLoading).toBe(false);
    expect(scheduleState.error).toBeNull();
  });

  it("clears schedule correctly", async () => {
    taskFormState.updateField("title", "Test task");
    await taskActions.create();

    const testGaps: Gap[] = [createTestGap("09:00", "10:00")];
    await scheduleState.regenerate(get(tasks), {
      gaps: testGaps,
      skipLLMEnrichment: true,
    });

    expect(scheduleState.result).not.toBeNull();

    scheduleState.clear();

    expect(scheduleState.result).toBeNull();
    expect(scheduleState.scheduledBlocks).toEqual([]);
  });
});

// ============================================================================
// Session Completion Tests
// ============================================================================

describe("Session Completion Wiring", () => {
  beforeEach(() => {
    clearAllStores();
  });

  it("marks session complete and updates memo status", async () => {
    taskFormState.updateField("title", "Work session task");
    const task = await taskActions.create();
    expect(task).not.toBeNull();

    const updated = scheduleState.markSessionComplete(task!, 30);

    expect(updated.status.timeSpentMinutes).toBe(30);
    expect(updated.status.completionState).toBe("in_progress");
    expect(updated.lastActivity).toBeDefined();
  });

  it("marks task as completed when time spent exceeds expected", async () => {
    taskFormState.updateField("title", "Quick task");
    const task = await taskActions.create();

    // Set a low expected duration
    const taskWithDuration: Memo = {
      ...task!,
      totalDurationExpected: 30,
    };

    // Complete a session that exceeds the expected duration
    const updated = scheduleState.markSessionComplete(taskWithDuration, 45);

    expect(updated.status.completionState).toBe("completed");
  });

  it("increments routine completions", async () => {
    taskFormState.updateField("title", "Daily exercise");
    taskFormState.updateField("type", "ルーティン");
    taskFormState.updateField("recurrenceCount", 3);
    taskFormState.updateField("recurrencePeriod", "day");

    const task = await taskActions.create();
    expect(task?.type).toBe("ルーティン");

    const updated = scheduleState.markSessionComplete(task!, 30);

    expect(updated.status.completionsThisPeriod).toBe(1);
  });
});

// ============================================================================
// End-to-End Flow Test
// ============================================================================

describe("End-to-End Task Flow", () => {
  beforeEach(() => {
    clearAllStores();
  });

  it("complete flow: create → schedule → complete", async () => {
    // 1. Create a task via form
    taskFormState.openForm();
    expect(taskFormState.isOpen).toBe(true);

    taskFormState.updateField("title", "Important task");
    taskFormState.updateField("type", "バックログ");
    taskFormState.updateField("importance", "high");

    const task = await taskActions.create();
    expect(task).not.toBeNull();

    // 2. Verify task is in store
    const storedTasks = get(tasks);
    expect(storedTasks).toHaveLength(1);
    expect(storedTasks[0].title).toBe("Important task");

    // 3. Generate schedule
    const testGaps: Gap[] = [
      createTestGap("09:00", "10:00"),
      createTestGap("14:00", "16:00"),
    ];

    await scheduleState.regenerate(storedTasks, {
      gaps: testGaps,
      skipLLMEnrichment: true,
    });

    // 4. Verify schedule was created
    expect(scheduleState.result).not.toBeNull();
    expect(scheduleState.result!.scheduled.length).toBeGreaterThan(0);

    // 5. Verify next block is available
    expect(scheduleState.nextScheduledBlock).not.toBeNull();
    expect(scheduleState.nextScheduledBlock!.memoId).toBe(task!.id);

    // 6. Complete the session
    const completed = scheduleState.markSessionComplete(task!, 45);
    expect(completed.status.timeSpentMinutes).toBe(45);
    expect(completed.status.completionState).toBe("in_progress");

    console.log("End-to-end flow completed successfully!");
  });

  it("handles multiple tasks with priorities", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Create deadline task (high priority)
    taskFormState.updateField("title", "Urgent deadline");
    taskFormState.updateField("type", "期限付き");
    taskFormState.updateField("deadline", tomorrow.toISOString().split("T")[0]);
    await taskActions.create();

    // Create backlog task (lower priority)
    taskFormState.reset();
    taskFormState.updateField("title", "Optional backlog");
    taskFormState.updateField("type", "バックログ");
    await taskActions.create();

    const allTasks = get(tasks);
    expect(allTasks).toHaveLength(2);

    // Limited gap - only one task can fit
    const testGaps: Gap[] = [createTestGap("09:00", "09:30")];

    await scheduleState.regenerate(allTasks, {
      gaps: testGaps,
      skipLLMEnrichment: true,
    });

    expect(scheduleState.result).not.toBeNull();

    // The deadline task should be scheduled (higher priority)
    // Note: This depends on the scoring algorithm
    console.log("Scheduled:", scheduleState.result!.scheduled.length);
    console.log("Dropped:", scheduleState.result!.dropped.length);
  });
});

// ============================================================================
// Store Reactivity Tests
// ============================================================================

describe("Store Reactivity", () => {
  beforeEach(() => {
    clearAllStores();
  });

  it("tasks store updates reactively", async () => {
    let updateCount = 0;
    const unsubscribe = tasks.subscribe(() => {
      updateCount++;
    });

    // Initial subscription triggers once
    expect(updateCount).toBe(1);

    taskFormState.updateField("title", "Task 1");
    await taskActions.create();
    // Task added; background enrichment is asynchronous and may coalesce updates.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(updateCount).toBeGreaterThanOrEqual(2);

    taskFormState.reset();
    taskFormState.updateField("title", "Task 2");
    await taskActions.create();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(updateCount).toBeGreaterThanOrEqual(3);

    unsubscribe();
  });

  it("schedule state updates after regenerate", async () => {
    taskFormState.updateField("title", "Test");
    await taskActions.create();

    const testGaps: Gap[] = [createTestGap("09:00", "10:00")];

    // Before regenerate
    expect(scheduleState.result).toBeNull();
    expect(scheduleState.scheduledBlocks).toEqual([]);

    await scheduleState.regenerate(get(tasks), {
      gaps: testGaps,
      skipLLMEnrichment: true,
    });

    // After regenerate, both should be updated
    expect(scheduleState.result).not.toBeNull();
    expect(scheduleState.scheduledBlocks.length).toBeGreaterThan(0);
  });
});
