/**
 * @fileoverview Gap Enrichment Module
 *
 * Derives location labels for gaps using a layer-based system:
 * - Home is the base layer (always present, lowest priority)
 * - Timetable events create "work" location layers
 * - Calendar events create "other" location layers
 * - Same-location events merge into continuous spans
 * - Shorter duration spans have higher priority (come on top)
 *
 * @author Personal Assistant Team
 * @version 2.0.0
 */

import type { Gap, LocationLabel } from "$lib/types.ts";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Event source type for location classification
 */
export type EventSource = "timetable" | "calendar";

/**
 * Event with source info for location enrichment
 */
export interface EnrichableEvent {
  id: string;
  title: string;
  start: string; // HH:mm format
  end: string; // HH:mm format
  source: EventSource;
}

/**
 * A location span representing a continuous period at a location
 */
interface LocationSpan {
  location: LocationLabel;
  start: number; // minutes from midnight
  end: number; // minutes from midnight
  duration: number; // end - start (Infinity for home)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert time string (HH:mm) to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Build location spans from events
 *
 * Same-location events are merged into one continuous span
 * from the earliest start to the latest end.
 */
export function buildLocationSpans(events: EnrichableEvent[]): LocationSpan[] {
  const spans: LocationSpan[] = [];

  // Group events by location type
  const workEvents = events.filter((e) => e.source === "timetable");
  const otherEvents = events.filter((e) => e.source === "calendar");

  // Create work span (merge all timetable events)
  if (workEvents.length > 0) {
    const start = Math.min(...workEvents.map((e) => timeToMinutes(e.start)));
    const end = Math.max(...workEvents.map((e) => timeToMinutes(e.end)));
    spans.push({
      location: "workplace",
      start,
      end,
      duration: end - start,
    });
  }

  // Create other span (merge all calendar events)
  if (otherEvents.length > 0) {
    const start = Math.min(...otherEvents.map((e) => timeToMinutes(e.start)));
    const end = Math.max(...otherEvents.map((e) => timeToMinutes(e.end)));
    spans.push({
      location: "other",
      start,
      end,
      duration: end - start,
    });
  }

  // Home is implicit base layer (infinite duration, always loses to others)
  spans.push({
    location: "home",
    start: 0,
    end: 1440,
    duration: Infinity,
  });

  return spans;
}

/**
 * Get the location for a gap based on overlapping spans
 *
 * The span with the shortest duration wins (higher priority).
 */
export function getLocationForGap(
  gap: Gap,
  spans: LocationSpan[],
): LocationLabel {
  const gapStart = timeToMinutes(gap.start);
  const gapEnd = timeToMinutes(gap.end);

  // Find spans that overlap with this gap
  const overlapping = spans.filter(
    (span) => span.start < gapEnd && span.end > gapStart,
  );

  // Sort by duration (shortest wins)
  overlapping.sort((a, b) => a.duration - b.duration);

  return overlapping[0]?.location ?? "home";
}

// ============================================================================
// MAIN ENRICHMENT FUNCTION
// ============================================================================

/**
 * Enrich gaps with location labels using the layer-based system
 *
 * @param gaps - Gaps to enrich (from GapFinder)
 * @param events - Events with source info for location classification
 * @returns New array of gaps with locationLabel set
 */
export function enrichGapsWithLocation(
  gaps: Gap[],
  events: EnrichableEvent[],
): Gap[] {
  // Build location spans once for all gaps
  const spans = buildLocationSpans(events);

  return gaps.map((gap) => ({
    ...gap,
    locationLabel: getLocationForGap(gap, spans),
  }));
}
