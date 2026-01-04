/**
 * Suggestion Drag Logic Service
 *
 * Handles constraint calculation and gap snapping for dragging suggestions
 * on the circular timeline.
 *
 * Key concepts:
 * - Midpoint-based dragging: User drags the center of a suggestion
 * - Gap constraints: Suggestions must stay within valid gaps
 * - Cross-gap snapping: When dragged past gap boundary, snap to next valid gap
 * - Duration extension: Symmetric-first, then one-sided
 * - Overlap detection: Find suggestions that overlap with a time range
 * - Dot-based containment: Min 5 dots required to drag into a gap
 * - 5-minute snap: Dial-like motion with 5-min increments
 */

import type { Gap } from "$lib/types.ts";
import {
  MIN_DOTS_FOR_DRAG,
  calculateMinDurationForDots,
  snapToIncrement,
} from "./suggestions/suggestion-scheduler.ts";

// ============================================================================
// Overlap Detection
// ============================================================================

/**
 * Check if two time ranges overlap
 *
 * @param start1 - Start time of first range (minutes from midnight)
 * @param end1 - End time of first range (minutes from midnight)
 * @param start2 - Start time of second range (minutes from midnight)
 * @param end2 - End time of second range (minutes from midnight)
 * @returns true if ranges overlap
 */
export function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  // Ranges overlap if one starts before the other ends
  return start1 < end2 && start2 < end1;
}

/**
 * Find suggestion IDs that overlap with a given time range
 *
 * @param blocks - Array of blocks with startTime, endTime, and suggestionId
 * @param startTime - Start time in HH:mm format
 * @param endTime - End time in HH:mm format
 * @param excludeId - Suggestion ID to exclude from check (the one being moved)
 * @returns Array of overlapping suggestion IDs
 */
export function findOverlappingSuggestions(
  blocks: Array<{
    suggestionId: string;
    startTime: string;
    endTime: string;
  }>,
  startTime: string,
  endTime: string,
  excludeId: string,
): string[] {
  const targetStart = timeToMinutes(startTime);
  const targetEnd = timeToMinutes(endTime);

  return blocks
    .filter((block) => {
      if (block.suggestionId === excludeId) return false;

      const blockStart = timeToMinutes(block.startTime);
      const blockEnd = timeToMinutes(block.endTime);

      return timeRangesOverlap(targetStart, targetEnd, blockStart, blockEnd);
    })
    .map((block) => block.suggestionId);
}

// ============================================================================
// Types
// ============================================================================

/**
 * Result of snapping to a gap
 */
export interface SnapResult {
  /** New start time in HH:mm format */
  newStartTime: string;
  /** New end time in HH:mm format */
  newEndTime: string;
  /** The gap the suggestion snapped to */
  targetGap: Gap;
  /** Whether the suggestion jumped to a different gap */
  snapped: boolean;
}

/**
 * Result of duration extension calculation
 */
export interface ExtensionResult {
  /** New duration in minutes */
  newDuration: number;
  /** New start time in HH:mm format */
  newStartTime: string;
  /** New end time in HH:mm format */
  newEndTime: string;
  /** Maximum allowed duration given constraints */
  maxAllowedDuration: number;
  /** Whether extension is blocked */
  blocked: boolean;
  /** Reason if blocked */
  blockReason?: string;
}

/**
 * A time range blocker (event or accepted suggestion)
 */
export interface TimeBlocker {
  startMinutes: number;
  endMinutes: number;
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Convert HH:mm time string to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HH:mm time string
 */
export function minutesToTime(minutes: number): string {
  const normalizedMinutes = ((minutes % 1440) + 1440) % 1440; // Handle negative and >24h
  const hours = Math.floor(normalizedMinutes / 60);
  const mins = Math.floor(normalizedMinutes % 60);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Check if a suggestion with given duration can fully fit in a gap
 * (Used for automatic scheduling)
 */
export function canFitInGap(gap: Gap, duration: number): boolean {
  return gap.duration >= duration;
}

// ============================================================================
// Gap Snapping - Cursor-Based with Shrinking
// ============================================================================

/**
 * Minimum duration for dragging (5 dots = 45 min)
 */
const MIN_DRAG_DURATION = calculateMinDurationForDots(MIN_DOTS_FOR_DRAG);

/**
 * Position arc in a gap with SHRINKING at edges.
 *
 * Behavior:
 * 1. Center arc on cursor
 * 2. If arc extends past gap edge, SHRINK from that side
 * 3. Minimum shrink is 45 min
 * 4. Return null if can't fit 45 min at this cursor position
 */
function positionArcWithShrink(
  cursor: number,
  originalDuration: number,
  gapStart: number,
  gapEnd: number,
): { start: number; end: number } | null {
  const gapDuration = gapEnd - gapStart;

  // Gap too small for minimum
  if (gapDuration < MIN_DRAG_DURATION) {
    return null;
  }

  // Cap duration at gap size
  const maxDuration = Math.min(originalDuration, gapDuration);
  const halfDuration = maxDuration / 2;

  // Calculate ideal arc centered on cursor
  let start = cursor - halfDuration;
  let end = cursor + halfDuration;

  // SHRINK at edges (not slide!)
  // If start is before gap, pin start to gap start (shrinks from left)
  if (start < gapStart) {
    start = gapStart;
    // end stays where cursor put it, creating a shorter arc
  }

  // If end is after gap, pin end to gap end (shrinks from right)
  if (end > gapEnd) {
    end = gapEnd;
    // start stays where cursor put it, creating a shorter arc
  }

  // Snap to 5-min increments
  start = snapToIncrement(Math.max(start, gapStart));
  end = snapToIncrement(Math.min(end, gapEnd));

  // Check final duration
  const finalDuration = end - start;
  if (finalDuration < MIN_DRAG_DURATION) {
    return null; // Too shrunk, need to jump to another gap
  }

  return { start, end };
}

/**
 * Find the gap the cursor is in, or the appropriate next/previous gap.
 *
 * Directional jump logic for better UX:
 * - If cursor is past the END of a gap → return NEXT gap
 * - If cursor is before the START of a gap → return PREVIOUS gap
 * - This makes dragging feel natural and predictable
 */
function findGapForCursorDirectional(
  cursor: number,
  gaps: Gap[],
  currentGapId?: string,
): { gap: Gap; gapStart: number; gapEnd: number } | null {
  if (gaps.length === 0) return null;

  // Sort by start time
  const sorted = [...gaps].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
  );

  // Filter to gaps that can hold minimum duration
  const valid = sorted.filter((g) => g.duration >= MIN_DRAG_DURATION);
  if (valid.length === 0) return null;

  // Check if cursor is INSIDE any gap
  for (const gap of valid) {
    const gapStart = timeToMinutes(gap.start);
    const gapEnd = timeToMinutes(gap.end);

    if (cursor >= gapStart && cursor <= gapEnd) {
      return { gap, gapStart, gapEnd };
    }
  }

  // Cursor is OUTSIDE all gaps - find directional target
  // Find where cursor is relative to gaps

  // Find current gap index if we have a currentGapId
  let currentIdx = -1;
  if (currentGapId) {
    currentIdx = valid.findIndex((g) => g.gapId === currentGapId);
  }

  // If we have a current gap, use directional logic
  if (currentIdx >= 0) {
    const currentGap = valid[currentIdx];
    const currentStart = timeToMinutes(currentGap.start);
    const currentEnd = timeToMinutes(currentGap.end);

    if (cursor > currentEnd) {
      // Cursor moved past end → go to NEXT gap
      const nextIdx = currentIdx + 1;
      if (nextIdx < valid.length) {
        const nextGap = valid[nextIdx];
        return {
          gap: nextGap,
          gapStart: timeToMinutes(nextGap.start),
          gapEnd: timeToMinutes(nextGap.end),
        };
      }
      // No next gap, stay in current
      return { gap: currentGap, gapStart: currentStart, gapEnd: currentEnd };
    } else if (cursor < currentStart) {
      // Cursor moved before start → go to PREVIOUS gap
      const prevIdx = currentIdx - 1;
      if (prevIdx >= 0) {
        const prevGap = valid[prevIdx];
        return {
          gap: prevGap,
          gapStart: timeToMinutes(prevGap.start),
          gapEnd: timeToMinutes(prevGap.end),
        };
      }
      // No previous gap, stay in current
      return { gap: currentGap, gapStart: currentStart, gapEnd: currentEnd };
    }
  }

  // No current gap context - find gap that cursor is closest to entering
  for (let i = 0; i < valid.length; i++) {
    const gap = valid[i];
    const gapStart = timeToMinutes(gap.start);
    const gapEnd = timeToMinutes(gap.end);

    // Check if cursor is before this gap
    if (cursor < gapStart) {
      // Return this gap (first gap after cursor)
      return { gap, gapStart, gapEnd };
    }

    // Check if cursor is between this gap and next
    if (cursor > gapEnd) {
      const nextGap = valid[i + 1];
      if (nextGap) {
        const nextStart = timeToMinutes(nextGap.start);
        if (cursor < nextStart) {
          // Cursor is between gap[i] and gap[i+1]
          // Return whichever is closer
          const distToCurrent = cursor - gapEnd;
          const distToNext = nextStart - cursor;
          if (distToNext < distToCurrent) {
            return {
              gap: nextGap,
              gapStart: nextStart,
              gapEnd: timeToMinutes(nextGap.end),
            };
          } else {
            return { gap, gapStart, gapEnd };
          }
        }
      } else {
        // Last gap and cursor is after it
        return { gap, gapStart, gapEnd };
      }
    }
  }

  // Fallback to first valid gap
  const first = valid[0];
  return {
    gap: first,
    gapStart: timeToMinutes(first.start),
    gapEnd: timeToMinutes(first.end),
  };
}

/**
 * Snap cursor to gap and position arc with shrinking behavior.
 *
 * Key behaviors:
 * 1. 5-minute snap increments (dial-like motion)
 * 2. Arc SHRINKS at gap edges (not slides)
 * 3. Minimum 45 min - when arc would be smaller, jump to next gap
 * 4. Directional jumping - cross end → next gap, cross start → prev gap
 * 5. When jumping to new gap, KEEP the shrunk duration (don't reset to original)
 */
export function snapToGap(
  cursorMinutes: number,
  duration: number,
  gaps: Gap[],
  currentGapId?: string,
): SnapResult | null {
  if (gaps.length === 0) return null;

  // Snap cursor to 5-minute increment
  const cursor = snapToIncrement(cursorMinutes);

  // Find the gap for this cursor (with directional logic)
  const gapInfo = findGapForCursorDirectional(cursor, gaps, currentGapId);
  if (!gapInfo) return null;

  const { gap, gapStart, gapEnd } = gapInfo;

  // Try to position arc with shrinking in the current gap
  let position = positionArcWithShrink(cursor, duration, gapStart, gapEnd);

  // If can't fit (too shrunk), we jumped to a new gap
  // Keep the MINIMUM duration, don't reset to original
  if (!position) {
    // Use minimum duration when jumping to new gap
    const jumpDuration = Math.min(MIN_DRAG_DURATION, gap.duration);

    if (cursor <= gapStart) {
      // Entering from before - position at start of gap
      const start = snapToIncrement(gapStart);
      const end = snapToIncrement(gapStart + jumpDuration);
      position = { start, end };
    } else {
      // Entering from after - position at end of gap
      const end = snapToIncrement(gapEnd);
      const start = snapToIncrement(gapEnd - jumpDuration);
      position = { start, end };
    }
  }

  return {
    newStartTime: minutesToTime(position.start),
    newEndTime: minutesToTime(position.end),
    targetGap: gap,
    snapped: gap.gapId !== currentGapId,
  };
}

// ============================================================================
// Duration Extension Utilities
// ============================================================================

/**
 * Calculate the maximum duration a suggestion can extend to.
 *
 * Constraints:
 * - Gap end is the hard limit
 * - Start time is fixed (extend from end only)
 * - Other pending suggestions are NOT considered blockers
 *
 * @param startTime - Fixed start time (HH:mm)
 * @param gapEnd - End time of the gap (HH:mm)
 * @returns Maximum duration in minutes
 */
export function calculateMaxDuration(
  startTime: string,
  gapEnd: string,
): number {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(gapEnd);
  return Math.max(0, endMinutes - startMinutes);
}

/**
 * Extend or shrink duration in 10-min increments.
 *
 * @param currentDuration - Current duration in minutes
 * @param direction - 'extend' (+10) or 'shrink' (-10)
 * @param maxDuration - Maximum allowed duration
 * @param minDuration - Minimum allowed duration (default: MIN_DRAG_DURATION)
 * @returns New duration in minutes
 */
export function adjustDuration(
  currentDuration: number,
  direction: "extend" | "shrink",
  maxDuration: number,
  minDuration: number = MIN_DRAG_DURATION,
): number {
  const DURATION_INCREMENT = 10;

  if (direction === "extend") {
    const newDuration = currentDuration + DURATION_INCREMENT;
    return Math.min(newDuration, maxDuration);
  } else {
    const newDuration = currentDuration - DURATION_INCREMENT;
    return Math.max(newDuration, minDuration);
  }
}

/**
 * Calculate new end time after duration change.
 * Start time stays fixed, only end time moves.
 *
 * @param startTime - Fixed start time (HH:mm)
 * @param newDuration - New duration in minutes
 * @returns New end time (HH:mm)
 */
export function calculateNewEndTime(
  startTime: string,
  newDuration: number,
): string {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = startMinutes + newDuration;
  return minutesToTime(endMinutes);
}

// ============================================================================
// Duration Extension
// ============================================================================

/**
 * Calculate symmetric duration extension
 *
 * Tries to extend equally in both directions from the midpoint.
 * If symmetric extension isn't possible, extends in one direction.
 *
 * @param currentMidpoint - Current midpoint in minutes
 * @param currentDuration - Current duration in minutes
 * @param targetDuration - Desired duration in minutes
 * @param gapStart - Gap start in minutes
 * @param gapEnd - Gap end in minutes
 * @param blockers - Other time blockers (accepted suggestions, events)
 * @returns Extension result
 */
export function calculateExtension(
  currentMidpoint: number,
  currentDuration: number,
  targetDuration: number,
  gapStart: number,
  gapEnd: number,
  blockers: TimeBlocker[] = [],
): ExtensionResult {
  // Sort blockers
  const sortedBlockers = [...blockers].sort(
    (a, b) => a.startMinutes - b.startMinutes,
  );

  // Find constraints from blockers
  let maxStartBound = gapStart;
  let maxEndBound = gapEnd;

  for (const blocker of sortedBlockers) {
    // Blocker before midpoint - constrains how far back we can extend
    if (blocker.endMinutes <= currentMidpoint) {
      maxStartBound = Math.max(maxStartBound, blocker.endMinutes);
    }
    // Blocker after midpoint - constrains how far forward we can extend
    if (blocker.startMinutes >= currentMidpoint) {
      maxEndBound = Math.min(maxEndBound, blocker.startMinutes);
      break; // No need to check further blockers
    }
  }

  // Calculate available space in each direction
  const availableBackward = currentMidpoint - maxStartBound;
  const availableForward = maxEndBound - currentMidpoint;
  const maxPossibleDuration = availableBackward + availableForward;

  // Clamp target duration
  const clampedTarget = Math.min(targetDuration, maxPossibleDuration);

  if (clampedTarget <= currentDuration) {
    // Shrinking - always allowed
    const halfDuration = Math.ceil(clampedTarget / 2);
    return {
      newDuration: clampedTarget,
      newStartTime: minutesToTime(currentMidpoint - halfDuration),
      newEndTime: minutesToTime(
        currentMidpoint + (clampedTarget - halfDuration),
      ),
      maxAllowedDuration: maxPossibleDuration,
      blocked: false,
    };
  }

  // Try symmetric extension first
  const halfTarget = Math.ceil(clampedTarget / 2);
  const canExtendSymmetric =
    availableBackward >= halfTarget && availableForward >= halfTarget;

  let newStart: number;
  let newEnd: number;

  if (canExtendSymmetric) {
    // Symmetric extension
    newStart = currentMidpoint - halfTarget;
    newEnd = currentMidpoint + (clampedTarget - halfTarget);
  } else {
    // Asymmetric extension - extend more in the direction with room
    if (availableBackward > availableForward) {
      // Extend more backward
      newEnd = Math.min(currentMidpoint + availableForward, maxEndBound);
      newStart = newEnd - clampedTarget;
    } else {
      // Extend more forward
      newStart = Math.max(currentMidpoint - availableBackward, maxStartBound);
      newEnd = newStart + clampedTarget;
    }
  }

  // Final clamp to gap boundaries
  newStart = Math.max(newStart, gapStart);
  newEnd = Math.min(newEnd, gapEnd);
  const actualDuration = newEnd - newStart;

  return {
    newDuration: actualDuration,
    newStartTime: minutesToTime(newStart),
    newEndTime: minutesToTime(newEnd),
    maxAllowedDuration: maxPossibleDuration,
    blocked:
      actualDuration < targetDuration && actualDuration === currentDuration,
    blockReason:
      actualDuration < targetDuration
        ? `Limited by ${availableBackward < availableForward ? "previous" : "next"} block`
        : undefined,
  };
}

/**
 * Get blockers from accepted suggestions
 */
export function getBlockersFromAccepted(
  accepted: Array<{ startTime: string; endTime: string; suggestionId: string }>,
  excludeId?: string,
): TimeBlocker[] {
  return accepted
    .filter((a) => a.suggestionId !== excludeId)
    .map((a) => ({
      startMinutes: timeToMinutes(a.startTime),
      endMinutes: timeToMinutes(a.endTime),
    }));
}

// ============================================================================
// Angle/Time Conversion for Circular Timeline
// ============================================================================

const TWO_PI = Math.PI * 2;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Convert an angle (radians, 0 at top) to minutes since midnight
 */
export function angleToMinutes(angle: number): number {
  // Normalize angle to [0, 2π)
  const normalizedAngle = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  // Convert to minutes (0 radians = 00:00, 2π = 24:00)
  return Math.round((normalizedAngle / TWO_PI) * MINUTES_PER_DAY);
}

/**
 * Convert SVG coordinates to angle
 * Assumes SVG viewBox centered at (50, 50)
 */
export function svgCoordsToAngle(
  x: number,
  y: number,
  centerX = 50,
  centerY = 50,
): number {
  // Calculate angle from center, with 0 at top (12 o'clock)
  const dx = x - centerX;
  const dy = y - centerY;
  // atan2 gives angle from positive x-axis, counterclockwise
  // We want angle from top (negative y-axis), clockwise
  let angle = Math.atan2(dx, -dy);
  // Normalize to [0, 2π)
  if (angle < 0) angle += TWO_PI;
  return angle;
}

// clientToSvgCoords moved to $lib/utils/pointer-drag.ts
