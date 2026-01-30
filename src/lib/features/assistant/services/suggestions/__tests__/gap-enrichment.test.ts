/**
 * @fileoverview Tests for gap-enrichment module
 *
 * Tests the layer-based location system:
 * - Home is base layer (infinite duration)
 * - Timetable events create "workplace" spans
 * - Calendar events create "other" spans
 * - Same-location events merge into continuous spans
 * - Shorter duration spans have higher priority
 */

import { describe, it, expect } from "vitest";
import {
  buildLocationSpans,
  getLocationForGap,
  enrichGapsWithLocation,
  type EnrichableEvent,
} from "../gap-enrichment.ts";
import type { Gap } from "$lib/types.ts";

// ============================================================================
// Test Helpers
// ============================================================================

function createEvent(
  id: string,
  start: string,
  end: string,
  source: "timetable" | "calendar",
): EnrichableEvent {
  return { id, title: `Event ${id}`, start, end, source };
}

function createGap(id: string, start: string, end: string): Gap {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const duration = endH * 60 + endM - (startH * 60 + startM);
  return { gapId: id, start, end, duration };
}

// ============================================================================
// buildLocationSpans Tests
// ============================================================================

describe("buildLocationSpans", () => {
  it("returns only home span when no events", () => {
    const spans = buildLocationSpans([]);

    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual({
      location: "home",
      start: 0,
      end: 1440,
      duration: Infinity,
    });
  });

  it("creates workplace span from timetable events", () => {
    const events = [createEvent("1", "09:00", "10:00", "timetable")];

    const spans = buildLocationSpans(events);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({
      location: "workplace",
      start: 540, // 9:00
      end: 600, // 10:00
      duration: 60,
    });
  });

  it("creates other span from calendar events", () => {
    const events = [createEvent("1", "14:00", "15:30", "calendar")];

    const spans = buildLocationSpans(events);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({
      location: "other",
      start: 840, // 14:00
      end: 930, // 15:30
      duration: 90,
    });
  });

  it("merges multiple timetable events into one workplace span", () => {
    const events = [
      createEvent("1", "09:00", "10:00", "timetable"),
      createEvent("2", "11:00", "12:00", "timetable"),
      createEvent("3", "14:00", "15:00", "timetable"),
    ];

    const spans = buildLocationSpans(events);

    // Should have workplace (merged) + home
    const workplaceSpan = spans.find((s) => s.location === "workplace");
    expect(workplaceSpan).toEqual({
      location: "workplace",
      start: 540, // 9:00 (earliest)
      end: 900, // 15:00 (latest)
      duration: 360, // 6 hours
    });
  });

  it("merges multiple calendar events into one other span", () => {
    const events = [
      createEvent("1", "10:00", "11:00", "calendar"),
      createEvent("2", "16:00", "17:00", "calendar"),
    ];

    const spans = buildLocationSpans(events);

    const otherSpan = spans.find((s) => s.location === "other");
    expect(otherSpan).toEqual({
      location: "other",
      start: 600, // 10:00
      end: 1020, // 17:00
      duration: 420, // 7 hours
    });
  });

  it("creates both workplace and other spans when both event types exist", () => {
    const events = [
      createEvent("1", "09:00", "12:00", "timetable"),
      createEvent("2", "10:30", "11:30", "calendar"),
    ];

    const spans = buildLocationSpans(events);

    expect(spans).toHaveLength(3);

    const workplaceSpan = spans.find((s) => s.location === "workplace");
    const otherSpan = spans.find((s) => s.location === "other");
    const homeSpan = spans.find((s) => s.location === "home");

    expect(workplaceSpan?.duration).toBe(180); // 3 hours
    expect(otherSpan?.duration).toBe(60); // 1 hour
    expect(homeSpan?.duration).toBe(Infinity);
  });
});

// ============================================================================
// getLocationForGap Tests
// ============================================================================

describe("getLocationForGap", () => {
  it("returns home when only home span exists", () => {
    const spans = buildLocationSpans([]);
    const gap = createGap("1", "10:00", "11:00");

    const location = getLocationForGap(gap, spans);

    expect(location).toBe("home");
  });

  it("returns workplace when gap is within workplace span", () => {
    const events = [createEvent("1", "09:00", "12:00", "timetable")];
    const spans = buildLocationSpans(events);
    const gap = createGap("1", "10:00", "11:00");

    const location = getLocationForGap(gap, spans);

    expect(location).toBe("workplace");
  });

  it("returns other when gap is within other span", () => {
    const events = [createEvent("1", "14:00", "16:00", "calendar")];
    const spans = buildLocationSpans(events);
    const gap = createGap("1", "14:30", "15:30");

    const location = getLocationForGap(gap, spans);

    expect(location).toBe("other");
  });

  it("returns home when gap is outside all non-home spans", () => {
    const events = [createEvent("1", "09:00", "12:00", "timetable")];
    const spans = buildLocationSpans(events);
    const gap = createGap("1", "07:00", "08:00");

    const location = getLocationForGap(gap, spans);

    expect(location).toBe("home");
  });

  it("returns shorter span when multiple spans overlap (other < workplace)", () => {
    // Workplace: 9:00-15:00 (6 hours)
    // Other: 10:30-11:30 (1 hour)
    // Gap at 10:45 should return "other" (shorter)
    const events = [
      createEvent("1", "09:00", "10:00", "timetable"),
      createEvent("2", "14:00", "15:00", "timetable"),
      createEvent("3", "10:30", "11:30", "calendar"),
    ];
    const spans = buildLocationSpans(events);
    const gap = createGap("1", "10:45", "11:15");

    const location = getLocationForGap(gap, spans);

    expect(location).toBe("other");
  });

  it("returns shorter span when multiple spans overlap (workplace < other)", () => {
    // Other: 08:00-18:00 (10 hours) - one long appointment
    // Workplace: 10:00-11:00 (1 hour) - short class
    // Gap at 10:30 should return "workplace" (shorter)
    const events = [
      createEvent("1", "08:00", "18:00", "calendar"),
      createEvent("2", "10:00", "11:00", "timetable"),
    ];
    const spans = buildLocationSpans(events);
    const gap = createGap("1", "10:15", "10:45");

    const location = getLocationForGap(gap, spans);

    expect(location).toBe("workplace");
  });

  it("handles gap partially overlapping span", () => {
    // Workplace: 09:00-12:00
    // Gap: 11:30-13:00 (partially overlaps)
    const events = [createEvent("1", "09:00", "12:00", "timetable")];
    const spans = buildLocationSpans(events);
    const gap = createGap("1", "11:30", "13:00");

    const location = getLocationForGap(gap, spans);

    // Gap partially overlaps workplace, so workplace is considered
    expect(location).toBe("workplace");
  });

  it("handles gap at exact span boundaries", () => {
    // Workplace: 09:00-12:00
    // Gap: 12:00-13:00 (starts exactly when workplace ends)
    const events = [createEvent("1", "09:00", "12:00", "timetable")];
    const spans = buildLocationSpans(events);
    const gap = createGap("1", "12:00", "13:00");

    const location = getLocationForGap(gap, spans);

    // Gap starts at workplace end, no overlap
    expect(location).toBe("home");
  });
});

// ============================================================================
// enrichGapsWithLocation Tests
// ============================================================================

describe("enrichGapsWithLocation", () => {
  it("enriches all gaps with location labels", () => {
    const events = [
      createEvent("1", "09:00", "12:00", "timetable"),
      createEvent("2", "10:30", "11:30", "calendar"),
    ];
    const gaps = [
      createGap("1", "07:00", "09:00"), // Before work
      createGap("2", "10:00", "10:30"), // During work, before calendar
      createGap("3", "10:45", "11:15"), // During both (calendar shorter)
      createGap("4", "11:30", "12:00"), // During work, after calendar
      createGap("5", "12:00", "18:00"), // After work
    ];

    const enriched = enrichGapsWithLocation(gaps, events);

    expect(enriched[0].locationLabel).toBe("home");
    expect(enriched[1].locationLabel).toBe("workplace");
    expect(enriched[2].locationLabel).toBe("other");
    expect(enriched[3].locationLabel).toBe("workplace");
    expect(enriched[4].locationLabel).toBe("home");
  });

  it("preserves original gap properties", () => {
    const events = [createEvent("1", "09:00", "10:00", "timetable")];
    const gaps = [createGap("g1", "09:15", "09:45")];

    const enriched = enrichGapsWithLocation(gaps, events);

    expect(enriched[0].gapId).toBe("g1");
    expect(enriched[0].start).toBe("09:15");
    expect(enriched[0].end).toBe("09:45");
    expect(enriched[0].duration).toBe(30);
    expect(enriched[0].locationLabel).toBe("workplace");
  });

  it("handles empty gaps array", () => {
    const events = [createEvent("1", "09:00", "10:00", "timetable")];

    const enriched = enrichGapsWithLocation([], events);

    expect(enriched).toEqual([]);
  });

  it("handles empty events array", () => {
    const gaps = [createGap("1", "10:00", "11:00")];

    const enriched = enrichGapsWithLocation(gaps, []);

    expect(enriched[0].locationLabel).toBe("home");
  });
});

// ============================================================================
// Integration-style Tests (Real-world Scenarios)
// ============================================================================

describe("real-world scenarios", () => {
  it("typical school day with classes and appointment", () => {
    // Classes: 9-10, 11-12, 14-15
    // Doctor appointment: 10:30-11:30 (other)
    const events = [
      createEvent("class1", "09:00", "10:00", "timetable"),
      createEvent("class2", "11:00", "12:00", "timetable"),
      createEvent("class3", "14:00", "15:00", "timetable"),
      createEvent("doctor", "10:30", "11:30", "calendar"),
    ];

    // Work span: 09:00-15:00 (6 hours)
    // Other span: 10:30-11:30 (1 hour)
    const gaps = [
      createGap("morning", "07:00", "09:00"),
      createGap("break1", "10:00", "10:30"),
      createGap("during-appt", "10:45", "11:00"),
      createGap("lunch", "12:00", "14:00"),
      createGap("evening", "15:00", "22:00"),
    ];

    const enriched = enrichGapsWithLocation(gaps, events);

    expect(enriched[0].locationLabel).toBe("home"); // Before school
    expect(enriched[1].locationLabel).toBe("workplace"); // Between classes
    expect(enriched[2].locationLabel).toBe("other"); // During appointment
    expect(enriched[3].locationLabel).toBe("workplace"); // Lunch at school
    expect(enriched[4].locationLabel).toBe("home"); // After school
  });

  it("work from home day with short errand", () => {
    // No timetable events (WFH)
    // Short errand: 11:00-11:30
    const events = [createEvent("errand", "11:00", "11:30", "calendar")];

    const gaps = [
      createGap("morning", "08:00", "11:00"),
      createGap("during-errand", "11:15", "11:20"),
      createGap("afternoon", "11:30", "18:00"),
    ];

    const enriched = enrichGapsWithLocation(gaps, events);

    expect(enriched[0].locationLabel).toBe("home");
    expect(enriched[1].locationLabel).toBe("other");
    expect(enriched[2].locationLabel).toBe("home");
  });

  it("all day at office with no calendar events", () => {
    const events = [
      createEvent("class1", "09:00", "10:30", "timetable"),
      createEvent("class2", "13:00", "14:30", "timetable"),
      createEvent("class3", "15:00", "16:30", "timetable"),
    ];

    const gaps = [
      createGap("break1", "10:30", "13:00"),
      createGap("break2", "14:30", "15:00"),
    ];

    const enriched = enrichGapsWithLocation(gaps, events);

    // All gaps during work hours should be workplace
    expect(enriched[0].locationLabel).toBe("workplace");
    expect(enriched[1].locationLabel).toBe("workplace");
  });
});
