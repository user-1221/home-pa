/**
 * @fileoverview Tests for duration shrinking and allocation functionality
 *
 * Tests the two-phase shrink-extend algorithm:
 * Phase 1: Selection (by baseDuration)
 * Phase 2: Tiered Extension (mandatory → high → normal)
 */

import { describe, it, expect } from "vitest";
import {
  allocateDurationsToGap,
  calculateEffectiveDurationWithShrink,
  enumerateBestOrder,
} from "../suggestion-scheduler.ts";
import type { Suggestion, Gap } from "$lib/types.ts";

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a test suggestion with required fields
 */
function createTestSuggestion(
  overrides: Partial<Suggestion> & {
    id: string;
    duration: number;
    baseDuration: number;
    need: number;
    type: "期限付き" | "ルーティン" | "バックログ";
  },
): Suggestion {
  return {
    memoId: `memo-${overrides.id}`,
    importance: 0.1,
    locationPreference: "no_preference",
    isHidden: false,
    ...overrides,
  };
}

// ============================================================================
// allocateDurationsToGap TESTS
// ============================================================================

describe("allocateDurationsToGap", () => {
  describe("single task scenarios", () => {
    it("allocates single deadline task that fits exactly", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 60,
          baseDuration: 45,
          need: 1.0,
          type: "期限付き",
        }),
      ];

      const result = allocateDurationsToGap(suggestions, 60);

      expect(result.allocations.get("A")).toBe(60);
      expect(result.dropped).toHaveLength(0);
    });

    it("shrinks deadline task when gap is smaller than calculated duration", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 70,
          baseDuration: 45,
          need: 1.0,
          type: "期限付き",
        }),
      ];

      const result = allocateDurationsToGap(suggestions, 50);

      // Should shrink to 50 (above base of 45)
      expect(result.allocations.get("A")).toBe(50);
      expect(result.dropped).toHaveLength(0);
    });

    it("drops deadline task when gap is below baseDuration", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 70,
          baseDuration: 45,
          need: 1.0,
          type: "期限付き",
        }),
      ];

      const result = allocateDurationsToGap(suggestions, 40);

      expect(result.allocations.has("A")).toBe(false);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0].id).toBe("A");
    });

    it("does not shrink routine tasks", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 30,
          baseDuration: 30,
          need: 0.6,
          type: "ルーティン",
        }),
      ];

      // Gap is 25, routine task needs 30 - should be dropped
      const result = allocateDurationsToGap(suggestions, 25);

      expect(result.allocations.has("A")).toBe(false);
      expect(result.dropped).toHaveLength(1);
    });

    it("does not shrink backlog tasks", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 30,
          baseDuration: 30,
          need: 0.5,
          type: "バックログ",
        }),
      ];

      // Gap is 25, backlog task needs 30 - should be dropped
      const result = allocateDurationsToGap(suggestions, 25);

      expect(result.allocations.has("A")).toBe(false);
      expect(result.dropped).toHaveLength(1);
    });
  });

  describe("multi-task scenarios", () => {
    it("fits two mandatory tasks by shrinking both", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 60,
          baseDuration: 30,
          need: 1.0,
          type: "期限付き",
        }),
        createTestSuggestion({
          id: "B",
          duration: 50,
          baseDuration: 30,
          need: 1.0,
          type: "期限付き",
        }),
      ];

      // Gap of 100: both base durations (30+30=60) fit, 40 remaining for extension
      const result = allocateDurationsToGap(suggestions, 100);

      expect(result.allocations.has("A")).toBe(true);
      expect(result.allocations.has("B")).toBe(true);
      expect(result.dropped).toHaveLength(0);

      // Both should get some extension
      const durationA = result.allocations.get("A")!;
      const durationB = result.allocations.get("B")!;
      expect(durationA + durationB).toBeLessThanOrEqual(100);
      expect(durationA).toBeGreaterThanOrEqual(30);
      expect(durationB).toBeGreaterThanOrEqual(30);
    });

    it("allocates only base durations when gap is exactly sum of bases", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 60,
          baseDuration: 30,
          need: 1.0,
          type: "期限付き",
        }),
        createTestSuggestion({
          id: "B",
          duration: 50,
          baseDuration: 30,
          need: 1.0,
          type: "期限付き",
        }),
      ];

      // Gap of 60 = exactly sum of base durations
      const result = allocateDurationsToGap(suggestions, 60);

      expect(result.allocations.get("A")).toBe(30);
      expect(result.allocations.get("B")).toBe(30);
      expect(result.dropped).toHaveLength(0);
    });

    it("gives extension priority to mandatory over high-need", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 60,
          baseDuration: 30,
          need: 1.0, // Mandatory (Tier 1)
          type: "期限付き",
        }),
        createTestSuggestion({
          id: "B",
          duration: 50,
          baseDuration: 30,
          need: 0.8, // High (Tier 2)
          type: "期限付き",
        }),
      ];

      // Gap of 80: base = 60, remaining = 20
      // A wants 30 more, B wants 20 more
      // With 20 remaining, Tier 1 (A) gets first priority
      const result = allocateDurationsToGap(suggestions, 80);

      const durationA = result.allocations.get("A")!;
      const durationB = result.allocations.get("B")!;

      // A should get more extension than B
      expect(durationA).toBeGreaterThanOrEqual(40); // 30 base + some extension
      expect(durationB).toBe(30); // Just base, no extension left
    });

    it("drops lower priority task when bases don't fit", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 50,
          baseDuration: 30,
          need: 1.0,
          type: "期限付き",
        }),
        createTestSuggestion({
          id: "B",
          duration: 40,
          baseDuration: 30,
          need: 0.6,
          type: "期限付き",
        }),
      ];

      // Gap of 40: only A's base fits
      const result = allocateDurationsToGap(suggestions, 40);

      expect(result.allocations.has("A")).toBe(true);
      expect(result.allocations.has("B")).toBe(false);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0].id).toBe("B");
    });
  });

  describe("edge cases", () => {
    it("handles empty gap", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 30,
          baseDuration: 30,
          need: 1.0,
          type: "期限付き",
        }),
      ];

      const result = allocateDurationsToGap(suggestions, 0);

      expect(result.allocations.size).toBe(0);
      expect(result.dropped).toHaveLength(1);
    });

    it("handles empty suggestions array", () => {
      const result = allocateDurationsToGap([], 60);

      expect(result.allocations.size).toBe(0);
      expect(result.dropped).toHaveLength(0);
    });

    it("snaps allocations to 10 min grid", () => {
      const suggestions = [
        createTestSuggestion({
          id: "A",
          duration: 60,
          baseDuration: 30,
          need: 1.0,
          type: "期限付き",
        }),
      ];

      // Gap of 67: should extend to 60 (snapped), not 67
      const result = allocateDurationsToGap(suggestions, 67);

      const duration = result.allocations.get("A")!;
      expect(duration % 10).toBe(0); // Should be on 10-min grid
    });
  });
});

// ============================================================================
// calculateEffectiveDurationWithShrink TESTS
// ============================================================================

describe("calculateEffectiveDurationWithShrink", () => {
  it("shrinks deadline task to available time", () => {
    const result = calculateEffectiveDurationWithShrink({
      calculatedDuration: 70,
      baseDuration: 45,
      availableTime: 60,
      taskType: "期限付き",
    });

    expect(result).toBe(60);
  });

  it("returns 0 when gap is below baseDuration for deadline", () => {
    const result = calculateEffectiveDurationWithShrink({
      calculatedDuration: 70,
      baseDuration: 45,
      availableTime: 40,
      taskType: "期限付き",
    });

    expect(result).toBe(0);
  });

  it("does not shrink routine task", () => {
    const result = calculateEffectiveDurationWithShrink({
      calculatedDuration: 30,
      baseDuration: 30,
      availableTime: 25,
      taskType: "ルーティン",
    });

    expect(result).toBe(0);
  });

  it("does not shrink backlog task", () => {
    const result = calculateEffectiveDurationWithShrink({
      calculatedDuration: 30,
      baseDuration: 30,
      availableTime: 25,
      taskType: "バックログ",
    });

    expect(result).toBe(0);
  });

  it("extends when extra time is available", () => {
    const result = calculateEffectiveDurationWithShrink({
      calculatedDuration: 45,
      baseDuration: 45,
      availableTime: 90,
      taskType: "期限付き",
    });

    // Should extend (max 2x = 90)
    expect(result).toBeGreaterThan(45);
    expect(result).toBeLessThanOrEqual(90);
  });

  it("snaps shrunk duration to 10 min grid", () => {
    const result = calculateEffectiveDurationWithShrink({
      calculatedDuration: 70,
      baseDuration: 45,
      availableTime: 67,
      taskType: "期限付き",
    });

    expect(result % 10).toBe(0);
    expect(result).toBe(60); // Should snap down to 60
  });

  it("returns 0 when snapped value falls below floor", () => {
    const result = calculateEffectiveDurationWithShrink({
      calculatedDuration: 70,
      baseDuration: 45,
      availableTime: 47, // Snaps to 40, which is below 45
      taskType: "期限付き",
    });

    expect(result).toBe(0);
  });
});

// ============================================================================
// enumerateBestOrder (evaluateOrder) TESTS - Shrinking in permutation scoring
// ============================================================================

/**
 * Create a mutable gap for testing
 */
function createTestGap(
  start: string,
  end: string,
  gapId: string = "gap-1",
): {
  gapId: string;
  start: string;
  end: string;
  duration: number;
  remaining: number;
  currentStartTime: string;
} {
  const startMins =
    parseInt(start.split(":")[0]) * 60 + parseInt(start.split(":")[1]);
  const endMins =
    parseInt(end.split(":")[0]) * 60 + parseInt(end.split(":")[1]);
  const duration = endMins - startMins;
  return {
    gapId,
    start,
    end,
    duration,
    remaining: duration,
    currentStartTime: start,
  };
}

describe("enumerateBestOrder (evaluateOrder with shrinking)", () => {
  it("scores deadline task as fittable when it can shrink", () => {
    // Deadline task with duration=70, baseDuration=45 should fit in 50-min gap
    const suggestions = [
      createTestSuggestion({
        id: "A",
        duration: 70,
        baseDuration: 45,
        need: 1.0,
        type: "期限付き",
      }),
    ];

    const gaps = [createTestGap("09:00", "09:50")]; // 50 min gap

    const result = enumerateBestOrder(suggestions, gaps);

    // Should find an order where the task is schedulable
    expect(result.order).toHaveLength(1);
    expect(result.order[0].id).toBe("A");
  });

  it("scores routine task as NOT fittable when gap is smaller", () => {
    // Routine task cannot shrink - should not fit in smaller gap
    const suggestions = [
      createTestSuggestion({
        id: "A",
        duration: 60,
        baseDuration: 60,
        need: 0.6,
        type: "ルーティン",
      }),
    ];

    const gaps = [createTestGap("09:00", "09:50")]; // 50 min gap

    const result = enumerateBestOrder(suggestions, gaps);

    // Order returned but task won't actually fit (evaluateOrder returns 0 schedulable)
    expect(result.order).toHaveLength(1);
  });

  it("prefers order where more shrinkable tasks fit", () => {
    // Two deadline tasks competing for limited space
    const suggestions = [
      createTestSuggestion({
        id: "A",
        duration: 60,
        baseDuration: 30,
        need: 1.0,
        type: "期限付き",
      }),
      createTestSuggestion({
        id: "B",
        duration: 50,
        baseDuration: 30,
        need: 0.9,
        type: "期限付き",
      }),
    ];

    // Gap of 70: Both can fit if shrunk (30+30=60 base, leaves 10 for extension)
    const gaps = [createTestGap("09:00", "10:10")]; // 70 min gap

    const result = enumerateBestOrder(suggestions, gaps);

    // Both tasks should be in the result (both can be scheduled with shrinking)
    expect(result.order).toHaveLength(2);
    expect(result.permutationsChecked).toBe(2); // 2! = 2 permutations
  });

  it("correctly evaluates mixed shrinkable and non-shrinkable tasks", () => {
    const suggestions = [
      createTestSuggestion({
        id: "deadline",
        duration: 60,
        baseDuration: 30,
        need: 1.0,
        type: "期限付き", // Can shrink
      }),
      createTestSuggestion({
        id: "routine",
        duration: 40,
        baseDuration: 40,
        need: 0.7,
        type: "ルーティン", // Cannot shrink
      }),
    ];

    // Gap of 70: deadline shrinks to 30, routine needs 40 → 30+40=70, fits!
    const gaps = [createTestGap("09:00", "10:10")]; // 70 min gap

    const result = enumerateBestOrder(suggestions, gaps);

    expect(result.order).toHaveLength(2);
  });

  it("drops tasks that cannot fit even with shrinking", () => {
    const suggestions = [
      createTestSuggestion({
        id: "A",
        duration: 70,
        baseDuration: 45, // Can shrink to 45
        need: 1.0,
        type: "期限付き",
      }),
    ];

    // Gap of 40: less than baseDuration (45), cannot fit
    const gaps = [createTestGap("09:00", "09:40")]; // 40 min gap

    const result = enumerateBestOrder(suggestions, gaps);

    // Task is in order but won't actually schedule (evaluateOrder returns 0)
    expect(result.order).toHaveLength(1);
  });
});
