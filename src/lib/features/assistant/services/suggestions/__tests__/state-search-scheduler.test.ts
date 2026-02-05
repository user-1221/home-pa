/**
 * @fileoverview Tests for the state-space search scheduler algorithm
 *
 * Tests various scenarios:
 * - Multiple mandatory tasks in one gap
 * - Priority mix (mandatory + high + normal)
 * - Task type mix (deadline + routine + backlog)
 * - Multiple gaps with spreading
 * - Tight fit scenarios
 * - Large gap expansion
 */

import { describe, it, expect } from "vitest";
import {
  scheduleSuggestions,
  scheduleWithStateSearch,
} from "../suggestion-scheduler.ts";
import type { Suggestion, Gap } from "$lib/types.ts";

// Helper to create a suggestion
function createSuggestion(
  id: string,
  need: number,
  importance: number,
  duration: number,
  baseDuration: number,
  type: "期限付き" | "ルーティン" | "バックログ" = "期限付き",
): Suggestion {
  return {
    id,
    memoId: id,
    need,
    importance,
    duration,
    baseDuration,
    type,
    locationPreference: "no_preference",
    isHidden: false,
  };
}

// Helper to create a gap
function createGap(
  gapId: string,
  start: string,
  end: string,
  duration: number,
): Gap {
  return { gapId, start, end, duration };
}

describe("scheduleWithStateSearch", () => {
  describe("mandatory task handling", () => {
    it("should schedule two mandatory tasks in one 60min gap (both shrunk to baseDuration)", () => {
      // Test 1: Two mandatory deadlines - should both fit when shrunk
      const suggestions = [
        createSuggestion("A", 1.0, 0.2, 45, 30, "期限付き"),
        createSuggestion("B", 1.0, 0.1, 40, 30, "期限付き"),
      ];
      const gaps = [createGap("gap1", "09:00", "10:00", 60)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Both should be scheduled (30 + 30 = 60min fits exactly)
      expect(result.scheduled.length).toBe(2);
      expect(result.mandatoryDropped.length).toBe(0);

      // Check total duration doesn't exceed gap
      const totalScheduled = result.scheduled.reduce(
        (sum, b) => sum + b.duration,
        0,
      );
      expect(totalScheduled).toBeLessThanOrEqual(60);

      // Both A and B should be scheduled
      const scheduledIds = result.scheduled.map((b) => b.suggestionId);
      expect(scheduledIds).toContain("A");
      expect(scheduledIds).toContain("B");
    });

    it("should not exceed gap duration (no duration overrun)", () => {
      // Test 2: Mandatory + High + Normal priority mix
      const suggestions = [
        createSuggestion("Mand", 1.0, 0.1, 40, 30, "期限付き"),
        createSuggestion("High", 0.85, 0.1, 35, 30, "期限付き"),
        createSuggestion("Norm", 0.6, 0.0, 30, 30, "期限付き"),
      ];
      const gaps = [createGap("gap1", "09:00", "10:30", 90)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Total scheduled must not exceed gap duration
      const totalScheduled = result.scheduled.reduce(
        (sum, b) => sum + b.duration,
        0,
      );
      expect(totalScheduled).toBeLessThanOrEqual(90);

      // Verify blocks don't overlap
      for (const block of result.scheduled) {
        const [startH, startM] = block.startTime.split(":").map(Number);
        const [endH, endM] = block.endTime.split(":").map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        expect(endMin - startMin).toBe(block.duration);
      }
    });
  });

  describe("task type mix", () => {
    it("should handle deadline + routine + backlog mix", () => {
      // Test 3: Mix of task types
      const suggestions = [
        createSuggestion("Deadline", 0.8, 0.1, 40, 30, "期限付き"),
        createSuggestion("Routine", 0.7, 0.1, 45, 30, "ルーティン"),
        createSuggestion("Backlog", 0.55, 0.0, 45, 30, "バックログ"),
      ];
      const gaps = [createGap("gap1", "09:00", "10:30", 90)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Should schedule in priority order (Deadline > Routine > Backlog)
      expect(result.scheduled.length).toBeGreaterThanOrEqual(2);

      // Deadline should definitely be scheduled (highest need)
      const scheduledIds = result.scheduled.map((b) => b.suggestionId);
      expect(scheduledIds).toContain("Deadline");
    });
  });

  describe("multiple gaps", () => {
    it("should spread mandatory tasks across multiple gaps", () => {
      // Test 4: Multiple gaps - should spread mandatory across gaps
      const suggestions = [
        createSuggestion("M1", 1.0, 0.2, 45, 30, "期限付き"),
        createSuggestion("M2", 1.0, 0.1, 40, 30, "期限付き"),
        createSuggestion("Opt", 0.7, 0.0, 30, 30, "期限付き"),
      ];
      const gaps = [
        createGap("morning", "09:00", "10:00", 60),
        createGap("afternoon", "14:00", "15:00", 60),
      ];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Both mandatory should be scheduled
      const mandatoryScheduled = result.scheduled.filter(
        (b) => b.suggestionId === "M1" || b.suggestionId === "M2",
      );
      expect(mandatoryScheduled.length).toBe(2);
      expect(result.mandatoryDropped.length).toBe(0);

      // Total duration in each gap should not exceed gap duration
      const morningBlocks = result.scheduled.filter(
        (b) => b.gapId === "morning",
      );
      const afternoonBlocks = result.scheduled.filter(
        (b) => b.gapId === "afternoon",
      );
      const morningTotal = morningBlocks.reduce(
        (sum, b) => sum + b.duration,
        0,
      );
      const afternoonTotal = afternoonBlocks.reduce(
        (sum, b) => sum + b.duration,
        0,
      );
      expect(morningTotal).toBeLessThanOrEqual(60);
      expect(afternoonTotal).toBeLessThanOrEqual(60);
    });
  });

  describe("tight fit scenarios", () => {
    it("should shrink two high-need tasks to fit in tight gap", () => {
      // Test 5: Two tasks that want more time but must shrink to fit
      const suggestions = [
        createSuggestion("A", 0.9, 0.1, 60, 30, "期限付き"),
        createSuggestion("B", 0.8, 0.1, 50, 30, "期限付き"),
      ];
      const gaps = [createGap("gap1", "09:00", "10:00", 60)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Both should be scheduled (shrunk to 30 each = 60 total)
      expect(result.scheduled.length).toBe(2);

      const scheduledIds = result.scheduled.map((b) => b.suggestionId);
      expect(scheduledIds).toContain("A");
      expect(scheduledIds).toContain("B");

      // Total should not exceed gap
      const totalScheduled = result.scheduled.reduce(
        (sum, b) => sum + b.duration,
        0,
      );
      expect(totalScheduled).toBeLessThanOrEqual(60);
    });

    it("should respect routine's non-shrinkable constraint", () => {
      // Test 6: Routine can't shrink, deadline can
      const suggestions = [
        createSuggestion("Routine", 0.8, 0.1, 45, 30, "ルーティン"), // Can't shrink
        createSuggestion("Deadline", 0.75, 0.1, 60, 30, "期限付き"), // Can shrink
      ];
      const gaps = [createGap("gap1", "09:00", "10:00", 60)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Routine should be scheduled because it has higher need
      // Deadline may or may not fit depending on Routine's size
      expect(result.scheduled.length).toBeGreaterThanOrEqual(1);

      // If both scheduled, check Routine keeps its full duration
      const routineBlock = result.scheduled.find(
        (b) => b.suggestionId === "Routine",
      );
      if (routineBlock) {
        expect(routineBlock.duration).toBe(45);
      }
    });
  });

  describe("expansion in large gaps", () => {
    it("should expand task toward ideal duration in large gap", () => {
      // Test 7: Large gap - task should expand toward ideal
      const suggestions = [
        createSuggestion("Small", 0.7, 0.1, 60, 30, "期限付き"), // Wants 60min
      ];
      const gaps = [createGap("gap1", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      expect(result.scheduled.length).toBe(1);

      // Should expand toward the ideal duration (60), not stay at base (30)
      const block = result.scheduled[0];
      expect(block.duration).toBeGreaterThan(30);
      // Should reach ideal duration if gap allows
      expect(block.duration).toBe(60);
    });
  });

  describe("many tasks competing", () => {
    it("should schedule optimal subset when many tasks compete", () => {
      // Test 8: Many tasks competing for limited space
      const suggestions = [
        createSuggestion("A", 1.0, 0.2, 30, 20, "期限付き"),
        createSuggestion("B", 0.9, 0.1, 30, 20, "期限付き"),
        createSuggestion("C", 0.8, 0.1, 30, 20, "期限付き"),
        createSuggestion("D", 0.7, 0.0, 30, 20, "期限付き"),
        createSuggestion("E", 0.6, 0.0, 30, 20, "期限付き"),
      ];
      const gaps = [createGap("gap1", "09:00", "10:30", 90)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Should schedule as many as possible without exceeding gap
      const totalScheduled = result.scheduled.reduce(
        (sum, b) => sum + b.duration,
        0,
      );
      expect(totalScheduled).toBeLessThanOrEqual(90);

      // Mandatory task A should definitely be scheduled
      const scheduledIds = result.scheduled.map((b) => b.suggestionId);
      expect(scheduledIds).toContain("A");

      // Should schedule at least 3 tasks (3*20=60 at minimum, or 3*30=90 at max)
      expect(result.scheduled.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("integration with main scheduler", () => {
    it("should use state search by default", () => {
      const suggestions = [createSuggestion("A", 0.8, 0.1, 30, 30, "期限付き")];
      const gaps = [createGap("gap1", "09:00", "10:00", 60)];

      // useStateSearch defaults to true
      const result = scheduleSuggestions(suggestions, gaps);

      expect(result.scheduled.length).toBe(1);
    });

    it("should fall back to legacy when useStateSearch=false", () => {
      const suggestions = [createSuggestion("A", 0.8, 0.1, 30, 30, "期限付き")];
      const gaps = [createGap("gap1", "09:00", "10:00", 60)];

      const result = scheduleSuggestions(suggestions, gaps, {
        useStateSearch: false,
      });

      expect(result.scheduled.length).toBe(1);
    });
  });

  // ===========================================================================
  // EXTENDED TESTS: Long duration scenarios (base ~60min)
  // ===========================================================================

  describe("long duration tasks (base ~60min)", () => {
    it("Test 1: Single mandatory (ideal=120, base=60) in 180min gap", () => {
      const suggestions = [
        createSuggestion("BigProject", 1.0, 0.2, 120, 60, "期限付き"),
      ];
      const gaps = [createGap("morning", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      expect(result.scheduled.length).toBe(1);
      expect(result.scheduled[0].duration).toBe(120); // Gets ideal duration
    });

    it("Test 2: Two mandatory (120+90 ideal, both base=60) in 180min gap", () => {
      const suggestions = [
        createSuggestion("Project1", 1.0, 0.2, 120, 60, "期限付き"),
        createSuggestion("Project2", 1.0, 0.1, 90, 60, "期限付き"),
      ];
      const gaps = [createGap("morning", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      expect(result.scheduled.length).toBe(2);
      expect(result.mandatoryDropped.length).toBe(0);
      const total = result.scheduled.reduce((sum, b) => sum + b.duration, 0);
      expect(total).toBeLessThanOrEqual(180);
    });

    it("Test 3: Urgent+Important+Normal (120+90+60) in 240min gap", () => {
      const suggestions = [
        createSuggestion("Urgent", 1.0, 0.2, 120, 60, "期限付き"),
        createSuggestion("Important", 0.85, 0.1, 90, 60, "期限付き"),
        createSuggestion("Normal", 0.6, 0.0, 60, 60, "期限付き"),
      ];
      const gaps = [createGap("day", "09:00", "13:00", 240)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Urgent (mandatory) should get its ideal duration
      const urgentBlock = result.scheduled.find(
        (b) => b.suggestionId === "Urgent",
      );
      expect(urgentBlock).toBeDefined();
      expect(urgentBlock!.duration).toBe(120);

      const total = result.scheduled.reduce((sum, b) => sum + b.duration, 0);
      expect(total).toBeLessThanOrEqual(240);
    });

    it("Test 4: Routine(90 fixed) vs Deadline(120→60) in 180min gap", () => {
      const suggestions = [
        createSuggestion("Routine", 0.85, 0.1, 90, 60, "ルーティン"),
        createSuggestion("Deadline", 0.8, 0.1, 120, 60, "期限付き"),
      ];
      const gaps = [createGap("morning", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Both should fit
      expect(result.scheduled.length).toBe(2);
      const total = result.scheduled.reduce((sum, b) => sum + b.duration, 0);
      expect(total).toBeLessThanOrEqual(180);

      // Routine must not exceed its ideal duration (90min)
      const routineBlock = result.scheduled.find(
        (b) => b.suggestionId === "Routine",
      );
      expect(routineBlock).toBeDefined();
      expect(routineBlock!.duration).toBeLessThanOrEqual(90);
    });

    it("Test 5: Three mandatory across 3 gaps (120min each)", () => {
      const suggestions = [
        createSuggestion("M1", 1.0, 0.2, 120, 60, "期限付き"),
        createSuggestion("M2", 1.0, 0.1, 90, 60, "期限付き"),
        createSuggestion("M3", 1.0, 0.0, 80, 60, "期限付き"),
      ];
      const gaps = [
        createGap("morning", "09:00", "11:00", 120),
        createGap("afternoon", "14:00", "16:00", 120),
        createGap("evening", "19:00", "21:00", 120),
      ];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All mandatory should be scheduled
      expect(result.scheduled.length).toBe(3);
      expect(result.mandatoryDropped.length).toBe(0);
    });

    it("Test 6: Two tasks (both base=60) in 60min gap - only one fits", () => {
      const suggestions = [
        createSuggestion("A", 0.9, 0.1, 120, 60, "期限付き"),
        createSuggestion("B", 0.85, 0.1, 100, 60, "期限付き"),
      ];
      const gaps = [createGap("gap1", "09:00", "10:00", 60)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Only one fits
      expect(result.scheduled.length).toBe(1);
      expect(result.dropped.length).toBe(1);
    });

    it("Test 7: Four tasks (base=45 each) in 300min gap", () => {
      const suggestions = [
        createSuggestion("A", 1.0, 0.2, 90, 45, "期限付き"),
        createSuggestion("B", 0.9, 0.1, 80, 45, "期限付き"),
        createSuggestion("C", 0.8, 0.1, 70, 45, "期限付き"),
        createSuggestion("D", 0.7, 0.0, 60, 45, "期限付き"),
      ];
      const gaps = [createGap("day", "09:00", "14:00", 300)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All should fit with ideal durations (90+80+70+60=300)
      expect(result.scheduled.length).toBe(4);
      const total = result.scheduled.reduce((sum, b) => sum + b.duration, 0);
      expect(total).toBeLessThanOrEqual(300);
    });

    it("Test 8: 2 Deadline + 1 Routine + 1 Backlog in 300min gap", () => {
      const suggestions = [
        createSuggestion("Deadline1", 1.0, 0.1, 120, 60, "期限付き"),
        createSuggestion("Deadline2", 0.85, 0.1, 90, 60, "期限付き"),
        createSuggestion("Routine1", 0.8, 0.1, 60, 45, "ルーティン"),
        createSuggestion("Backlog1", 0.6, 0.0, 60, 45, "バックログ"),
      ];
      const gaps = [createGap("day", "09:00", "14:00", 300)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Deadline1 (mandatory) should get its ideal
      const deadline1 = result.scheduled.find(
        (b) => b.suggestionId === "Deadline1",
      );
      expect(deadline1).toBeDefined();
      expect(deadline1!.duration).toBe(120);

      // Routine must not exceed its ideal duration (60min)
      const routine1 = result.scheduled.find(
        (b) => b.suggestionId === "Routine1",
      );
      if (routine1) {
        expect(routine1.duration).toBeLessThanOrEqual(60);
      }
    });

    it("Test 9: Four mandatory (150+120+100+80) in 480min gap", () => {
      const suggestions = [
        createSuggestion("M1", 1.0, 0.2, 150, 60, "期限付き"),
        createSuggestion("M2", 1.0, 0.2, 120, 60, "期限付き"),
        createSuggestion("M3", 1.0, 0.1, 100, 60, "期限付き"),
        createSuggestion("M4", 1.0, 0.0, 80, 60, "期限付き"),
      ];
      const gaps = [createGap("fullday", "08:00", "16:00", 480)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All mandatory should be scheduled
      expect(result.scheduled.length).toBe(4);
      expect(result.mandatoryDropped.length).toBe(0);

      // All should get their ideal durations (150+120+100+80=450 < 480)
      const m1 = result.scheduled.find((b) => b.suggestionId === "M1");
      expect(m1?.duration).toBe(150);
    });

    it("Test 10: Marathon(240) + Sprint(60) in 360min gap", () => {
      const suggestions = [
        createSuggestion("Marathon", 1.0, 0.2, 240, 90, "期限付き"),
        createSuggestion("Sprint", 0.9, 0.1, 60, 45, "期限付き"),
      ];
      const gaps = [createGap("day", "09:00", "15:00", 360)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      expect(result.scheduled.length).toBe(2);
      const marathon = result.scheduled.find(
        (b) => b.suggestionId === "Marathon",
      );
      expect(marathon?.duration).toBe(240);
    });
  });

  describe("equal priority and edge cases", () => {
    it("Test 11: Three equal-priority tasks in 300min gap", () => {
      const suggestions = [
        createSuggestion("Task1", 0.8, 0.1, 90, 60, "期限付き"),
        createSuggestion("Task2", 0.8, 0.1, 90, 60, "期限付き"),
        createSuggestion("Task3", 0.8, 0.1, 90, 60, "期限付き"),
      ];
      const gaps = [createGap("day", "09:00", "14:00", 300)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All three should get their ideal (90*3=270 < 300)
      expect(result.scheduled.length).toBe(3);
      for (const block of result.scheduled) {
        expect(block.duration).toBe(90);
      }
    });

    it("Test 12: Mandatory in 60min gap, optionals in 240min gap", () => {
      const suggestions = [
        createSuggestion("Mandatory", 1.0, 0.2, 120, 60, "期限付き"),
        createSuggestion("Optional1", 0.7, 0.1, 90, 60, "期限付き"),
        createSuggestion("Optional2", 0.6, 0.0, 60, 60, "期限付き"),
      ];
      const gaps = [
        createGap("small", "09:00", "10:00", 60),
        createGap("large", "14:00", "18:00", 240),
      ];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Mandatory should be scheduled
      const mandatoryScheduled = result.scheduled.find(
        (b) => b.suggestionId === "Mandatory",
      );
      expect(mandatoryScheduled).toBeDefined();
    });

    it("Test 13: Three backlog tasks (cannot shrink) in 180min gap", () => {
      const suggestions = [
        createSuggestion("B1", 0.7, 0.0, 90, 60, "バックログ"),
        createSuggestion("B2", 0.65, 0.0, 80, 60, "バックログ"),
        createSuggestion("B3", 0.6, 0.0, 70, 60, "バックログ"),
      ];
      const gaps = [createGap("day", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // At least 2 should fit (backlogs can't shrink below base=60)
      expect(result.scheduled.length).toBeGreaterThanOrEqual(2);
    });

    it("Test 14: Three routines (90+60+45 fixed) in 240min gap", () => {
      const suggestions = [
        createSuggestion("R1", 0.85, 0.1, 90, 60, "ルーティン"),
        createSuggestion("R2", 0.8, 0.1, 60, 45, "ルーティン"),
        createSuggestion("R3", 0.7, 0.0, 45, 30, "ルーティン"),
      ];
      const gaps = [createGap("morning", "08:00", "12:00", 240)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All should fit (90+60+45=195 < 240)
      expect(result.scheduled.length).toBe(3);

      // Each routine must not exceed its ideal duration
      for (const block of result.scheduled) {
        const sug = suggestions.find((s) => s.id === block.suggestionId);
        expect(block.duration).toBeLessThanOrEqual(sug!.duration);
      }
    });

    it("Test 15: Priority comparison - need+importance", () => {
      const suggestions = [
        createSuggestion("HighImp", 0.8, 0.2, 90, 60, "期限付き"), // priority=1.0
        createSuggestion("HighNeed", 0.9, 0.0, 90, 60, "期限付き"), // priority=0.9
      ];
      const gaps = [createGap("gap1", "09:00", "11:00", 120)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // HighImp has higher total priority (need+importance)
      const scheduledIds = result.scheduled.map((b) => b.suggestionId);
      expect(scheduledIds).toContain("HighImp");
    });

    it("Test 16: Three mandatory in tight 180min gap - all shrink", () => {
      const suggestions = [
        createSuggestion("Big1", 1.0, 0.2, 180, 60, "期限付き"),
        createSuggestion("Big2", 1.0, 0.1, 150, 60, "期限付き"),
        createSuggestion("Big3", 1.0, 0.0, 120, 60, "期限付き"),
      ];
      const gaps = [createGap("gap1", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All mandatory should fit at base (60*3=180)
      expect(result.scheduled.length).toBe(3);
      expect(result.mandatoryDropped.length).toBe(0);
    });
  });

  describe("multiple small gaps and spreading", () => {
    it("Test 17: Three tasks across 4 small gaps (60min each)", () => {
      const suggestions = [
        createSuggestion("Task1", 1.0, 0.1, 90, 45, "期限付き"),
        createSuggestion("Task2", 0.9, 0.1, 80, 45, "期限付き"),
        createSuggestion("Task3", 0.8, 0.1, 70, 45, "期限付き"),
      ];
      const gaps = [
        createGap("gap1", "09:00", "10:00", 60),
        createGap("gap2", "11:00", "12:00", 60),
        createGap("gap3", "14:00", "15:00", 60),
        createGap("gap4", "16:00", "17:00", 60),
      ];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All 3 should be scheduled across the gaps
      expect(result.scheduled.length).toBe(3);
    });

    it("Test 18: One huge task (ideal=300, base=120) in 540min gap", () => {
      const suggestions = [
        createSuggestion("Huge", 1.0, 0.2, 300, 120, "期限付き"),
      ];
      const gaps = [createGap("day", "08:00", "17:00", 540)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      expect(result.scheduled.length).toBe(1);
      expect(result.scheduled[0].duration).toBe(300); // Gets ideal, not overfilled
    });

    it("Test 19: 1 mandatory + 4 low-priority in 240min gap", () => {
      const suggestions = [
        createSuggestion("High1", 1.0, 0.1, 90, 60, "期限付き"),
        createSuggestion("Low1", 0.55, 0.0, 60, 60, "期限付き"),
        createSuggestion("Low2", 0.55, 0.0, 60, 60, "期限付き"),
        createSuggestion("Low3", 0.55, 0.0, 60, 60, "期限付き"),
        createSuggestion("Low4", 0.55, 0.0, 60, 60, "期限付き"),
      ];
      const gaps = [createGap("day", "09:00", "13:00", 240)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Mandatory should get its ideal
      const high1 = result.scheduled.find((b) => b.suggestionId === "High1");
      expect(high1?.duration).toBe(90);
    });

    it("Test 20: Four mandatory (crunch time) in 180min gap", () => {
      const suggestions = [
        createSuggestion("Due1", 1.0, 0.2, 60, 45, "期限付き"),
        createSuggestion("Due2", 1.0, 0.2, 60, 45, "期限付き"),
        createSuggestion("Due3", 1.0, 0.1, 60, 45, "期限付き"),
        createSuggestion("Due4", 1.0, 0.0, 60, 45, "期限付き"),
      ];
      const gaps = [createGap("crunch", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All 4 mandatory should fit at base (45*4=180)
      expect(result.scheduled.length).toBe(4);
      expect(result.mandatoryDropped.length).toBe(0);
    });
  });

  describe("extension and realistic scenarios", () => {
    it("Test 21: Two small tasks in huge gap - no over-extension", () => {
      const suggestions = [
        createSuggestion("Small1", 0.9, 0.1, 60, 30, "期限付き"),
        createSuggestion("Small2", 0.85, 0.1, 50, 30, "期限付き"),
      ];
      const gaps = [createGap("huge", "08:00", "18:00", 600)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      expect(result.scheduled.length).toBe(2);
      // Should get ideal durations, not extend beyond
      const small1 = result.scheduled.find((b) => b.suggestionId === "Small1");
      expect(small1?.duration).toBe(60);
    });

    it("Test 22: Realistic work day - 4 tasks across morning + afternoon", () => {
      const suggestions = [
        createSuggestion("MeetingPrep", 1.0, 0.2, 60, 30, "期限付き"),
        createSuggestion("DeepWork", 0.9, 0.1, 120, 60, "期限付き"),
        createSuggestion("EmailReview", 0.7, 0.1, 45, 30, "ルーティン"),
        createSuggestion("AdminTasks", 0.6, 0.0, 45, 30, "バックログ"),
      ];
      const gaps = [
        createGap("morning", "09:00", "12:00", 180),
        createGap("afternoon", "13:00", "17:00", 240),
      ];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All should fit (60+120+45+30=255 < 420 total)
      expect(result.scheduled.length).toBe(4);
    });

    it("Test 23: Four mandatory + 1 optional in 480min gap", () => {
      const suggestions = [
        createSuggestion("Critical1", 1.0, 0.2, 90, 60, "期限付き"),
        createSuggestion("Critical2", 1.0, 0.2, 90, 60, "期限付き"),
        createSuggestion("Critical3", 1.0, 0.1, 90, 60, "期限付き"),
        createSuggestion("Critical4", 1.0, 0.0, 90, 60, "期限付き"),
        createSuggestion("Optional", 0.7, 0.0, 60, 60, "期限付き"),
      ];
      const gaps = [createGap("fullday", "08:00", "16:00", 480)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // All 4 mandatory should be scheduled with ideal durations
      const mandatoryScheduled = result.scheduled.filter((b) =>
        b.suggestionId.startsWith("Critical"),
      );
      expect(mandatoryScheduled.length).toBe(4);
      for (const block of mandatoryScheduled) {
        expect(block.duration).toBe(90);
      }
    });

    it("Test 24: Two mandatory exactly fill gap, optional dropped", () => {
      const suggestions = [
        createSuggestion("M1", 1.0, 0.1, 90, 90, "期限付き"),
        createSuggestion("M2", 1.0, 0.0, 90, 90, "期限付き"),
        createSuggestion("Opt", 0.7, 0.0, 60, 60, "期限付き"),
      ];
      const gaps = [createGap("exact", "09:00", "12:00", 180)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Both mandatory scheduled
      expect(result.scheduled.length).toBe(2);
      expect(result.mandatoryDropped.length).toBe(0);

      // Optional dropped
      const scheduledIds = result.scheduled.map((b) => b.suggestionId);
      expect(scheduledIds).not.toContain("Opt");
    });

    it("Test 25: Priority calculation - need + importance combined", () => {
      const suggestions = [
        createSuggestion("LowNeedHighImp", 0.8, 0.2, 60, 60, "期限付き"), // priority=1.0
        createSuggestion("HighNeedLowImp", 0.9, 0.0, 60, 60, "期限付き"), // priority=0.9
        createSuggestion("Balanced", 0.7, 0.2, 60, 60, "期限付き"), // priority=0.9
      ];
      const gaps = [createGap("gap1", "09:00", "11:00", 120)];

      const result = scheduleWithStateSearch(suggestions, gaps);

      // Should schedule top 2 by priority
      expect(result.scheduled.length).toBe(2);
      expect(result.dropped.length).toBe(1);
    });
  });

  describe("duration-need bonus", () => {
    it("should give longer-ideal mandatory task more time than shorter-ideal", () => {
      const suggestions = [
        createSuggestion("Short", 1.0, 0.1, 60, 60, "期限付き"),
        createSuggestion("Long", 1.0, 0.1, 180, 60, "期限付き"),
      ];
      const gaps = [
        createGap("small", "09:00", "10:00", 60),
        createGap("big", "14:00", "15:30", 90),
      ];

      const result = scheduleWithStateSearch(suggestions, gaps);

      expect(result.scheduled.length).toBe(2);
      const longBlock = result.scheduled.find((b) => b.suggestionId === "Long");
      const shortBlock = result.scheduled.find(
        (b) => b.suggestionId === "Short",
      );
      expect(longBlock).toBeDefined();
      expect(shortBlock).toBeDefined();
      expect(longBlock!.duration).toBeGreaterThan(shortBlock!.duration);
    });
  });
});
