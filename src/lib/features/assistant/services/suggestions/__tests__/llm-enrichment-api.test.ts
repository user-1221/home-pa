/**
 * Client-Side LLM Enrichment API Tests
 *
 * Tests the enrichMemoViaAPI function:
 * - Successful API calls via Remote Functions
 * - Error handling
 * - Fallback behavior
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { enrichMemoViaAPI, getFallbackEnrichment } from "../llm-enrichment.ts";
import type { Memo } from "$lib/types.ts";

// Import the mocked module to customize behavior
import { enrichMemo as enrichMemoRemote } from "../enrich.remote.ts";

describe("enrichMemoViaAPI", () => {
  const createTestMemo = (overrides?: Partial<Memo>): Memo => ({
    id: "test-id",
    title: "数学の勉強",
    type: "期限付き",
    createdAt: new Date(),
    locationPreference: "no_preference",
    status: {
      timeSpentMinutes: 0,
      completionState: "not_started",
      completionsThisPeriod: 0,
      periodStartDate: new Date(),
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully enrich a memo via Remote Function", async () => {
    const mockEnrichment = {
      genre: "勉強",
      importance: "high" as const,
      sessionDuration: 60,
      totalDurationExpected: 120,
    };

    (enrichMemoRemote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockEnrichment,
    );

    const memo = createTestMemo();
    const result = await enrichMemoViaAPI(memo);

    // Verify Remote Function was called
    expect(enrichMemoRemote).toHaveBeenCalled();

    expect(result).toEqual(mockEnrichment);
    expect(result.genre).toBe("勉強");
    expect(result.importance).toBe("high");
    expect(result.sessionDuration).toBe(60);
  });

  it("should use fallback when Remote Function returns error", async () => {
    (enrichMemoRemote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Remote function error"),
    );

    const memo = createTestMemo();
    const result = await enrichMemoViaAPI(memo);

    expect(result).toBeDefined();
    const fallback = getFallbackEnrichment(memo);
    expect(result).toEqual(fallback);
    expect(result.genre).toBe(fallback.genre);
    expect(result.importance).toBe(fallback.importance);
  });

  it("should pass through null when Remote Function returns null", async () => {
    // Note: The function doesn't use fallback for null responses,
    // only for errors. This allows the caller to handle null explicitly.
    (enrichMemoRemote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const memo = createTestMemo();
    const result = await enrichMemoViaAPI(memo);

    // The function returns null directly, not a fallback
    expect(result).toBeNull();
  });

  it("should use fallback when response has invalid format", async () => {
    (enrichMemoRemote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      // Missing required fields
      genre: "勉強",
    });

    const memo = createTestMemo();
    const result = await enrichMemoViaAPI(memo);

    // Should still return something (partial enrichment is valid)
    expect(result).toBeDefined();
    expect(result.genre).toBe("勉強");
  });

  it("should send correct memo data to Remote Function", async () => {
    const mockEnrichment = {
      genre: "その他",
      importance: "medium" as const,
      sessionDuration: 30,
      totalDurationExpected: 60,
    };

    (enrichMemoRemote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockEnrichment,
    );

    const memo = createTestMemo({
      deadline: new Date("2025-12-31"),
      genre: "仕事",
      importance: "high",
    });

    await enrichMemoViaAPI(memo);

    // Verify the data sent to Remote Function
    expect(enrichMemoRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: memo.id,
        title: memo.title,
        type: memo.type,
      }),
    );
  });

  it("should handle empty title gracefully", async () => {
    (enrichMemoRemote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Invalid title"),
    );

    const memo = createTestMemo({ title: "" });
    const result = await enrichMemoViaAPI(memo);

    // Should return fallback
    expect(result).toBeDefined();
    expect(result.genre).toBeDefined();
  });

  it("should handle undefined status gracefully", async () => {
    const mockEnrichment = {
      genre: "その他",
      importance: "medium" as const,
      sessionDuration: 30,
      totalDurationExpected: 60,
    };

    (enrichMemoRemote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockEnrichment,
    );

    // Create memo with minimal required fields
    const memo: Memo = {
      id: "test-id",
      title: "Test",
      type: "バックログ",
      createdAt: new Date(),
      locationPreference: "no_preference",
      status: {
        timeSpentMinutes: 0,
        completionState: "not_started",
      },
    };

    const result = await enrichMemoViaAPI(memo);

    expect(result).toEqual(mockEnrichment);
  });
});

describe("getFallbackEnrichment", () => {
  const createTestMemo = (overrides?: Partial<Memo>): Memo => ({
    id: "test-id",
    title: "Test task",
    type: "バックログ",
    createdAt: new Date(),
    locationPreference: "no_preference",
    status: {
      timeSpentMinutes: 0,
      completionState: "not_started",
    },
    ...overrides,
  });

  it("should return study genre for education-related titles", () => {
    const memo = createTestMemo({ title: "数学の勉強" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.genre).toBe("勉強");
  });

  it("should return exercise genre for workout-related titles", () => {
    const memo = createTestMemo({ title: "ジムでトレーニング" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.genre).toBe("運動");
  });

  it("should return housework genre for cleaning-related titles", () => {
    const memo = createTestMemo({ title: "掃除をする" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.genre).toBe("家事");
  });

  it("should return work genre for meeting-related titles", () => {
    const memo = createTestMemo({ title: "会議の準備" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.genre).toBe("仕事");
  });

  it("should return その他 for unrecognized titles (including games)", () => {
    // Note: The fallback function doesn't recognize game-related keywords
    const memo = createTestMemo({ title: "ゲームをする" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.genre).toBe("その他");
  });

  it("should return その他 for unrecognized English titles", () => {
    const memo = createTestMemo({ title: "something random" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.genre).toBe("その他");
  });

  it("should not preserve existing genre (fallback uses keyword detection)", () => {
    // Note: getFallbackEnrichment only uses title-based keyword detection,
    // it doesn't preserve existing genre values from memo
    const memo = createTestMemo({ title: "Test", genre: "仕事" });
    const fallback = getFallbackEnrichment(memo);
    // "Test" doesn't match any keywords, so defaults to その他
    expect(fallback.genre).toBe("その他");
  });

  it("should not preserve existing importance (uses default based on type)", () => {
    // Note: getFallbackEnrichment doesn't preserve memo.importance,
    // it determines importance based on memo type
    const memo = createTestMemo({ title: "Test", importance: "high" });
    const fallback = getFallbackEnrichment(memo);
    // バックログ type gets "medium" importance by default
    expect(fallback.importance).toBe("medium");
  });

  it("should provide default session duration", () => {
    const memo = createTestMemo({ title: "Test" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.sessionDuration).toBeGreaterThan(0);
    expect(fallback.sessionDuration).toBeLessThanOrEqual(60);
  });

  it("should provide default total duration", () => {
    const memo = createTestMemo({ title: "Test" });
    const fallback = getFallbackEnrichment(memo);
    expect(fallback.totalDurationExpected).toBeGreaterThan(0);
    expect(fallback.totalDurationExpected).toBeGreaterThanOrEqual(
      fallback.sessionDuration,
    );
  });
});
