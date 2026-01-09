/**
 * @fileoverview Gap Modifier Service
 *
 * Provides functions to modify gaps based on blockers (accepted memos, moved suggestions).
 * This centralizes gap modification logic that was previously duplicated across
 * schedule.ts and PersonalAssistantView.svelte.
 */

import type { Gap } from "$lib/types.ts";
import { timeToMinutes, minutesToTime } from "../suggestion-drag.ts";

/**
 * A time blocker with start/end times
 */
export interface TimeBlocker {
  startTime: string;
  endTime: string;
}

/**
 * Subtract blockers from gaps to find truly available time slots.
 *
 * This ensures:
 * - Accepted suggestions block their time slots
 * - Moved suggestions block their new positions
 * - New suggestions only fill truly available gaps
 *
 * @param gaps - The base gaps to subtract from
 * @param accepted - Map of accepted memo info (memoId -> AcceptedMemoInfo)
 * @param moved - Array of moved suggestions
 * @returns New gaps with all occupied slots removed
 */
export function subtractBlockersFromGaps(
  gaps: Gap[],
  accepted: Map<string, TimeBlocker>,
  moved: TimeBlocker[],
): Gap[] {
  // Combine all blockers into a single array
  const allBlockers: TimeBlocker[] = [
    ...Array.from(accepted.values()),
    ...moved.map((m) => ({ startTime: m.startTime, endTime: m.endTime })),
  ];

  if (allBlockers.length === 0) return gaps;

  const result: Gap[] = [];
  let gapCounter = 0;

  for (const gap of gaps) {
    const gapStart = timeToMinutes(gap.start);
    const gapEnd = timeToMinutes(gap.end);

    // Find blockers that overlap with this gap
    const overlappingBlockers = allBlockers.filter((b) => {
      const blockerStart = timeToMinutes(b.startTime);
      const blockerEnd = timeToMinutes(b.endTime);
      return blockerStart < gapEnd && blockerEnd > gapStart;
    });

    if (overlappingBlockers.length === 0) {
      result.push(gap);
      continue;
    }

    // Sort blockers by start time
    const sortedBlockers = [...overlappingBlockers].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );

    // Find remaining gaps between/around blockers
    let currentStart = gapStart;

    for (const blocker of sortedBlockers) {
      const blockerStart = Math.max(timeToMinutes(blocker.startTime), gapStart);
      const blockerEnd = Math.min(timeToMinutes(blocker.endTime), gapEnd);

      // Gap before this blocker
      if (blockerStart > currentStart) {
        const duration = blockerStart - currentStart;
        if (duration >= 5) {
          result.push({
            gapId: `${gap.gapId}-sub-${gapCounter++}`,
            start: minutesToTime(currentStart),
            end: minutesToTime(blockerStart),
            duration,
            locationLabel: gap.locationLabel,
          });
        }
      }
      currentStart = Math.max(currentStart, blockerEnd);
    }

    // Gap after all blockers
    if (currentStart < gapEnd) {
      const duration = gapEnd - currentStart;
      if (duration >= 5) {
        result.push({
          gapId: `${gap.gapId}-sub-${gapCounter++}`,
          start: minutesToTime(currentStart),
          end: minutesToTime(gapEnd),
          duration,
          locationLabel: gap.locationLabel,
        });
      }
    }
  }

  return result;
}
