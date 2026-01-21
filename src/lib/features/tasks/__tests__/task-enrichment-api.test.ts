/**
 * Task Enrichment API Integration Tests
 *
 * Tests the integration between taskActions and the LLM enrichment API:
 * - Task creation triggers API enrichment
 * - Enrichment state tracking
 * - Fallback behavior when API fails
 * - Enriched fields are applied correctly
 * - Edge cases for concurrent operations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { taskState } from "../state/taskActions.svelte.ts";
import { taskFormState } from "../state/taskForm.svelte.ts";
import { clearMemoStore } from "$lib/test/vitest-setup.ts";
import type { Memo } from "$lib/types.ts";
import type { EnrichmentResult } from "$lib/features/assistant/services/suggestions/llm-enrichment.ts";

// Mock the API function
vi.mock(
  "$lib/features/assistant/services/suggestions/llm-enrichment.ts",
  () => {
    return {
      enrichMemoViaAPI: vi.fn(),
    };
  },
);

describe("Task Enrichment API Integration", () => {
  beforeEach(async () => {
    taskState.set([]);
    taskFormState.reset();
    clearMemoStore();
    vi.clearAllMocks();

    // Reset the enrichMemoViaAPI mock to default behavior between tests
    // This ensures mockRejectedValueOnce doesn't persist
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockReset();
  });

  it("should trigger API enrichment when creating a task", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    const mockEnrichment = {
      genre: "勉強",
      importance: "high" as const,
      sessionDuration: 60,
      totalDurationExpected: 120,
    };

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockEnrichment,
    );

    // Use a future date to pass validation
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    taskFormState.updateField("title", "数学の勉強");
    taskFormState.updateField("type", "期限付き");
    taskFormState.updateField("deadline", futureDateStr);

    const createdTask = await taskState.create();

    expect(createdTask).not.toBeNull();
    expect(enrichMemoViaAPI).toHaveBeenCalled();

    // Wait for enrichment to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const enrichedTask = taskState.items.find((t) => t.id === createdTask!.id);

    expect(enrichedTask).toBeDefined();
    expect(enrichedTask?.genre).toBe("勉強");
    expect(enrichedTask?.importance).toBe("high");
    expect(enrichedTask?.sessionDuration).toBe(60);
  });

  it("should track enriching state during API call", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    // Create a promise that we can control
    let resolveEnrichment: (value: EnrichmentResult) => void;
    const enrichmentPromise = new Promise<EnrichmentResult>((resolve) => {
      resolveEnrichment = resolve;
    });

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      enrichmentPromise,
    );

    taskFormState.updateField("title", "Test task");
    const createPromise = taskState.create();

    // Wait a bit for the enrichment to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    const createdTask = await createPromise;

    // Check that task is marked as enriching
    expect(taskState.enrichingIds.has(createdTask!.id)).toBe(true);
    expect(taskState.hasEnriching).toBe(true);

    // Resolve the enrichment
    resolveEnrichment!({
      genre: "その他",
      importance: "medium" as const,
      sessionDuration: 30,
      totalDurationExpected: 60,
    });

    await enrichmentPromise;
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check that enriching state is cleared
    expect(taskState.enrichingIds.has(createdTask!.id)).toBe(false);
    expect(taskState.hasEnriching).toBe(false);
  });

  it("should use fallback enrichment when API fails", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    // Mock API to fail
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error"),
    );

    taskFormState.updateField("title", "Test task");
    const createdTask = await taskState.create();

    // Wait for enrichment attempt
    await new Promise((resolve) => setTimeout(resolve, 100));

    const task = taskState.items.find((t) => t.id === createdTask!.id);

    // Task should still exist, but enrichment should have failed gracefully
    expect(task).toBeDefined();
    // Enriching state should be cleared even on error
    expect(taskState.enrichingIds.has(createdTask!.id)).toBe(false);
  });

  it("should preserve existing fields when enriching", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    const mockEnrichment = {
      genre: "勉強",
      importance: "high" as const,
      sessionDuration: 60,
      totalDurationExpected: 120,
    };

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockEnrichment,
    );

    // Use a future date to pass validation
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    taskFormState.updateField("title", "Test task");
    taskFormState.updateField("type", "期限付き");
    taskFormState.updateField("deadline", futureDateStr);
    taskFormState.updateField("importance", "low"); // User-set importance

    // Verify form has the importance set
    expect(taskFormState.importance).toBe("low");

    const createdTask = await taskState.create();

    // Check that task was created with user-set importance
    expect(createdTask?.importance).toBe("low");

    await new Promise((resolve) => setTimeout(resolve, 150));

    const enrichedTask = taskState.items.find((t) => t.id === createdTask!.id);

    // User-set importance should be preserved (nullish coalescing)
    // Since user set it, it won't be overridden by enrichment
    expect(enrichedTask?.importance).toBe("low");
    // But other fields should be enriched
    expect(enrichedTask?.genre).toBe("勉強");
  });

  it("should handle multiple concurrent enrichments", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    const mockEnrichment1 = {
      genre: "勉強",
      importance: "high" as const,
      sessionDuration: 60,
      totalDurationExpected: 120,
    };

    const mockEnrichment2 = {
      genre: "運動",
      importance: "medium" as const,
      sessionDuration: 45,
      totalDurationExpected: 90,
    };

    // Track calls by memo title to ensure correct enrichment is returned
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockImplementation(
      (memo: Memo) => {
        // Use memo title to determine which enrichment to return
        if (memo.title === "Task 1") {
          return Promise.resolve(mockEnrichment1);
        } else if (memo.title === "Task 2") {
          return Promise.resolve(mockEnrichment2);
        }
        // Default fallback
        return Promise.resolve(mockEnrichment1);
      },
    );

    // Create first task
    taskFormState.updateField("title", "Task 1");
    const task1 = await taskState.create();

    // Wait a bit to ensure first enrichment starts
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Create second task
    taskFormState.updateField("title", "Task 2");
    const task2 = await taskState.create();

    // Wait for both enrichments to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const enrichedTask1 = taskState.items.find((t) => t.id === task1!.id);
    const enrichedTask2 = taskState.items.find((t) => t.id === task2!.id);

    expect(enrichedTask1?.genre).toBe("勉強");
    expect(enrichedTask2?.genre).toBe("運動");
    expect(taskState.enrichingIds.size).toBe(0);
  });

  it("should handle task deletion gracefully during enrichment", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    // Use a delayed enrichment to simulate real API call
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              genre: "その他",
              importance: "medium" as const,
              sessionDuration: 30,
              totalDurationExpected: 60,
            });
          }, 50);
        }),
    );

    taskFormState.updateField("title", "Test task");
    const createdTask = await taskState.create();

    // Delete task while enriching (enrichment is async)
    taskState.delete(createdTask!.id);

    // Wait for enrichment to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Enriching state should be cleared (even if task was deleted)
    expect(taskState.enrichingIds.size).toBe(0);
    // Task should be deleted
    expect(
      taskState.items.find((t) => t.id === createdTask!.id),
    ).toBeUndefined();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases - Task Enrichment", () => {
  beforeEach(async () => {
    taskState.set([]);
    taskFormState.reset();
    clearMemoStore();
    vi.clearAllMocks();

    // Reset the enrichMemoViaAPI mock to default behavior between tests
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockReset();
  });

  it("handles rapid create-delete cycles", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      genre: "その他",
      importance: "medium" as const,
      sessionDuration: 30,
      totalDurationExpected: 60,
    });

    for (let i = 0; i < 5; i++) {
      taskFormState.updateField("title", `Task ${i}`);
      const task = await taskState.create();
      await taskState.delete(task!.id);
    }

    // Wait for any pending enrichments
    await new Promise((r) => setTimeout(r, 200));

    expect(taskState.items).toHaveLength(0);
    expect(taskState.enrichingIds.size).toBe(0);
  });

  it("handles empty title after trim", async () => {
    taskFormState.updateField("title", "   ");
    const result = await taskState.create();
    expect(result).toBeNull();
    expect(taskFormState.errors.title).toBeDefined();
  });

  it("handles API timeout gracefully", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    // Mock slow API that rejects after delay
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 100),
        ),
    );

    taskFormState.updateField("title", "Slow task");
    const task = await taskState.create();

    // Should create task even if enrichment times out
    expect(task).not.toBeNull();
    expect(taskState.items.find((t) => t.id === task!.id)).toBeDefined();

    // Wait for timeout to occur
    await new Promise((r) => setTimeout(r, 200));

    // Enriching state should be cleared after timeout
    expect(taskState.enrichingIds.has(task!.id)).toBe(false);
  });

  it("handles task modified during enrichment", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    // Slow enrichment
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                genre: "勉強",
                importance: "high" as const,
                sessionDuration: 60,
                totalDurationExpected: 120,
              }),
            100,
          ),
        ),
    );

    // Create task
    taskFormState.updateField("title", "Original title");
    const task = await taskState.create();

    // Modify task before enrichment completes
    taskState.edit(task!);
    taskFormState.updateField("title", "Modified title");
    await taskState.update();

    // Wait for enrichment to complete
    await new Promise((r) => setTimeout(r, 200));

    const updated = taskState.items.find((t) => t.id === task!.id);
    // Title should be the updated one, not original
    expect(updated?.title).toBe("Modified title");
  });

  it("preserves user-set genre over enrichment", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      genre: "勉強",
      importance: "high" as const,
      sessionDuration: 60,
      totalDurationExpected: 120,
    });

    taskFormState.updateField("title", "Test");
    taskFormState.updateField("genre", "運動"); // User explicitly sets genre

    const task = await taskState.create();
    await new Promise((r) => setTimeout(r, 150));

    const updated = taskState.items.find((t) => t.id === task!.id);
    expect(updated?.genre).toBe("運動"); // User value preserved
  });

  it("handles enrichment with partial data", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    // Only return some fields
    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      genre: "勉強",
      // Missing importance, sessionDuration, totalDurationExpected
    });

    taskFormState.updateField("title", "Partial enrichment");
    const task = await taskState.create();
    await new Promise((r) => setTimeout(r, 150));

    const updated = taskState.items.find((t) => t.id === task!.id);
    expect(updated?.genre).toBe("勉強");
    // Other fields should remain undefined or default
    expect(updated?.importance).toBeUndefined();
  });

  it("handles null/undefined enrichment response", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    taskFormState.updateField("title", "Null enrichment");
    const task = await taskState.create();
    await new Promise((r) => setTimeout(r, 150));

    // Task should still exist
    const updated = taskState.items.find((t) => t.id === task!.id);
    expect(updated).toBeDefined();
    expect(taskState.enrichingIds.has(task!.id)).toBe(false);
  });

  it("handles special characters in title", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      genre: "その他",
    });

    taskFormState.updateField(
      "title",
      "Test <script>alert('xss')</script> 日本語 🎉",
    );
    const task = await taskState.create();

    expect(task).not.toBeNull();
    expect(task?.title).toBe("Test <script>alert('xss')</script> 日本語 🎉");
  });

  it("handles very long title", async () => {
    const { enrichMemoViaAPI } = await import(
      "$lib/features/assistant/services/suggestions/llm-enrichment.ts"
    );

    (enrichMemoViaAPI as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      genre: "その他",
    });

    const longTitle = "A".repeat(1000);
    taskFormState.updateField("title", longTitle);
    const task = await taskState.create();

    expect(task).not.toBeNull();
    expect(task?.title).toBe(longTitle);
  });
});
