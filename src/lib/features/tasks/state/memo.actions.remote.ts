/**
 * Memo Actions Remote Functions
 *
 * Server-side Remote Functions for memo action handlers:
 * - Progress logging
 * - Accept/reject/reset operations
 */
import { command } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";
import { getAuthenticatedUser } from "./memo.utils.ts";
import { AcceptedSlotSchema } from "./memo.schemas.ts";
import {
  getCreationAlignedPeriodStart,
  isNewCreationAlignedPeriod,
} from "$lib/utils/period-utils.ts";

// ============================================================================
// PROGRESS LOGGING
// ============================================================================

/**
 * Log progress for a completed suggestion session
 * Updates timeSpentMinutes, lastActivity, and type-specific state (including period counter)
 */
export const logSuggestionComplete = command(
  v.object({
    memoId: v.string(),
    durationMinutes: v.number(),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      // Verify ownership and get current state
      const existing = await prisma.memo.findFirst({
        where: {
          id: input.memoId,
          userId,
        },
      });

      if (!existing) {
        throw new Error("Memo not found");
      }

      // Calculate updates
      const newTimeSpent = existing.timeSpentMinutes + input.durationMinutes;
      const now = new Date();

      // Build update data
      const newTimeSpentToday =
        (existing.timeSpentToday ?? 0) + input.durationMinutes;
      const updateData: Record<string, unknown> = {
        timeSpentMinutes: newTimeSpent,
        timeSpentToday: newTimeSpentToday,
        lastActivity: now,
        // Update completionState if significant progress
        completionState:
          existing.completionState === "not_started"
            ? "in_progress"
            : existing.completionState,
      };

      // Type-specific state updates
      if (existing.type === "ルーティン") {
        // Get period type from recurrence goal (default to "week" for backwards compatibility)
        const period =
          (existing.recurrenceGoalPeriod as "day" | "week" | "month") ?? "week";
        const createdAt = new Date(existing.createdAt);

        // Check if we need to reset period counter (creation-date-aligned)
        const existingPeriodStart = existing.routineWeekStartDate
          ? new Date(existing.routineWeekStartDate)
          : null;
        const needsPeriodReset = isNewCreationAlignedPeriod(
          existingPeriodStart,
          now,
          period,
          createdAt,
        );

        // Calculate new period start if reset needed
        const newPeriodStart = needsPeriodReset
          ? getCreationAlignedPeriodStart(createdAt, now, period)
          : existingPeriodStart;

        const baseCount = needsPeriodReset
          ? 0
          : (existing.routineCompletedCountWeek ?? 0);
        const newCount = baseCount + 1;

        // Check if goal is now met
        const goalCount = existing.recurrenceGoalCount ?? 3;
        const shouldCap = newCount >= goalCount;

        updateData.routineAcceptedToday = true;
        updateData.routineCompletedToday = true;
        updateData.routineCompletedCountWeek = newCount;
        updateData.routineLastCompletedDay = now;
        updateData.routineWasCappedThisWeek = needsPeriodReset
          ? shouldCap
          : (existing.routineWasCappedThisWeek ?? false) || shouldCap;
        updateData.routineWeekStartDate = newPeriodStart;
        // Mark acceptedSlot as logged
        if (existing.routineAcceptedSlot) {
          updateData.routineAcceptedSlot = {
            ...(existing.routineAcceptedSlot as object),
            logged: true,
          };
        }
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = true;
        updateData.backlogLastCompletedDay = now;
        // Mark acceptedSlot as logged
        if (existing.backlogAcceptedSlot) {
          updateData.backlogAcceptedSlot = {
            ...(existing.backlogAcceptedSlot as object),
            logged: true,
          };
        }
      } else if (existing.type === "期限付き") {
        // Mark the first accepted slot as logged
        const currentSlots =
          (existing.deadlineAcceptedSlots as Array<{
            startTime: string;
            endTime: string;
            duration: number;
            logged?: boolean;
          }>) ?? [];
        if (currentSlots.length > 0) {
          updateData.deadlineAcceptedSlots = currentSlots.map((slot, index) =>
            index === 0 ? { ...slot, logged: true } : slot,
          );
        }

        // Add timer duration to actualDurations for linear regression
        const createdDay = new Date(existing.createdAt);
        createdDay.setHours(0, 0, 0, 0);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const dayIndex = Math.floor(
          (today.getTime() - createdDay.getTime()) / (24 * 60 * 60 * 1000),
        );

        // Calculate total days for array size
        const deadlineDay = existing.deadline
          ? new Date(existing.deadline)
          : createdDay;
        deadlineDay.setHours(0, 0, 0, 0);
        const totalDays = Math.max(
          1,
          Math.ceil(
            (deadlineDay.getTime() - createdDay.getTime()) /
              (24 * 60 * 60 * 1000),
          ) + 1,
        );

        // Get or initialize actualDurations array
        let actualDurations =
          (existing.deadlineActualDurations as number[]) ?? [];
        if (actualDurations.length < totalDays) {
          actualDurations = [
            ...actualDurations,
            ...new Array(totalDays - actualDurations.length).fill(0),
          ];
        }

        // Sum duration to today's index (if within bounds)
        if (dayIndex >= 0 && dayIndex < totalDays) {
          actualDurations[dayIndex] =
            (actualDurations[dayIndex] ?? 0) + input.durationMinutes;
        }

        updateData.deadlineActualDurations = actualDurations;
      }

      // Update memo with progress
      const updated = await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(
        `[logSuggestionComplete] Logged ${input.durationMinutes}min for memo ${input.memoId}. Total: ${newTimeSpent}min`,
      );

      return {
        id: updated.id,
        timeSpentMinutes: updated.timeSpentMinutes,
        lastActivity: updated.lastActivity?.toISOString(),
        // Return routine state if applicable (DB uses week-based naming, app uses period-based)
        routineState:
          updated.type === "ルーティン"
            ? {
                acceptedToday: updated.routineAcceptedToday ?? false,
                completedToday: updated.routineCompletedToday ?? false,
                completedCountThisPeriod:
                  updated.routineCompletedCountWeek ?? 0,
                lastCompletedDay:
                  updated.routineLastCompletedDay?.toISOString() ?? null,
                wasCappedThisPeriod: updated.routineWasCappedThisWeek ?? false,
                periodStartDate:
                  updated.routineWeekStartDate?.toISOString() ?? null,
              }
            : undefined,
        backlogState:
          updated.type === "バックログ"
            ? {
                acceptedToday: updated.backlogAcceptedToday ?? false,
                lastCompletedDay:
                  updated.backlogLastCompletedDay?.toISOString() ?? null,
              }
            : undefined,
      };
    } catch (err) {
      console.error("[logSuggestionComplete] Error:", err);
      throw new Error("Failed to log progress");
    }
  },
);

// ============================================================================
// ACCEPTANCE/REJECTION/RESET
// ============================================================================

/**
 * Mark a memo as accepted (for routine/backlog - sets acceptedToday = true)
 * This is called when a user accepts a suggestion without completing it yet.
 * The acceptedToday flag causes the scoring function to treat the task as
 * "done for today" (score drops to ~0), preventing duplicate suggestions.
 *
 * Also stores the accepted time slot for persistence across page reloads.
 */
export const markMemoAccepted = command(
  v.object({
    memoId: v.string(),
    slot: v.optional(AcceptedSlotSchema),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      const existing = await prisma.memo.findFirst({
        where: {
          id: input.memoId,
          userId,
        },
      });

      if (!existing) {
        throw new Error("Memo not found");
      }

      const now = new Date();
      const updateData: Record<string, unknown> = {
        lastActivity: now,
      };

      // Only update daily flags for routine and backlog tasks
      // Note: Period counter reset is handled in logSuggestionComplete() when task is actually completed
      if (existing.type === "ルーティン") {
        updateData.routineAcceptedToday = true;
        updateData.routineAcceptedSlot = input.slot ?? null;
        updateData.routineRejectedToday = false; // Clear rejected state when accepting
        // Save original lastCompletedDay before overwriting (for undo on delete)
        updateData.routinePreviousLastCompletedDay =
          existing.routineLastCompletedDay;
        updateData.routineLastCompletedDay = now; // Treat as completed for scoring
        // Capture duration for adaptive ideal calculation
        updateData.routineLastAcceptedDuration = input.slot?.duration ?? null;
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = true;
        updateData.backlogAcceptedSlot = input.slot ?? null;
        updateData.backlogRejectedToday = false; // Clear rejected state when accepting
        // Save original lastCompletedDay before overwriting (for undo on delete)
        updateData.backlogPreviousLastCompletedDay =
          existing.backlogLastCompletedDay;
        updateData.backlogLastCompletedDay = now; // Treat as completed for scoring
        // Capture duration for adaptive ideal calculation
        updateData.backlogLastAcceptedDuration = input.slot?.duration ?? null;
      }
      // Deadline tasks don't have acceptedToday - they use a different mechanism

      const updated = await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(`[markMemoAccepted] Marked memo ${input.memoId} as accepted`);

      return {
        id: updated.id,
        type: updated.type,
        // DB uses week-based naming, app uses period-based
        routineState:
          updated.type === "ルーティン"
            ? {
                acceptedToday: updated.routineAcceptedToday ?? false,
                completedToday: updated.routineCompletedToday ?? false,
                completedCountThisPeriod:
                  updated.routineCompletedCountWeek ?? 0,
                lastCompletedDay:
                  updated.routineLastCompletedDay?.toISOString() ?? null,
                previousLastCompletedDay:
                  updated.routinePreviousLastCompletedDay?.toISOString() ??
                  null,
                wasCappedThisPeriod: updated.routineWasCappedThisWeek ?? false,
                periodStartDate:
                  updated.routineWeekStartDate?.toISOString() ?? null,
                rejectedToday: updated.routineRejectedToday ?? false,
                acceptedSlot:
                  (updated.routineAcceptedSlot as {
                    startTime: string;
                    endTime: string;
                    duration: number;
                  } | null) ?? null,
                lastAcceptedDuration:
                  updated.routineLastAcceptedDuration ?? null,
              }
            : undefined,
        backlogState:
          updated.type === "バックログ"
            ? {
                acceptedToday: updated.backlogAcceptedToday ?? false,
                lastCompletedDay:
                  updated.backlogLastCompletedDay?.toISOString() ?? null,
                previousLastCompletedDay:
                  updated.backlogPreviousLastCompletedDay?.toISOString() ??
                  null,
                rejectedToday: updated.backlogRejectedToday ?? false,
                acceptedSlot:
                  (updated.backlogAcceptedSlot as {
                    startTime: string;
                    endTime: string;
                    duration: number;
                  } | null) ?? null,
                lastAcceptedDuration:
                  updated.backlogLastAcceptedDuration ?? null,
              }
            : undefined,
      };
    } catch (err) {
      console.error("[markMemoAccepted] Error:", err);
      throw new Error("Failed to mark memo as accepted");
    }
  },
);

/**
 * Reset acceptedToday flag for a memo (when user marks as "missed")
 * This allows the task to reappear in suggestions
 */
export const resetMemoAcceptedToday = command(
  v.object({
    memoId: v.string(),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      const existing = await prisma.memo.findFirst({
        where: {
          id: input.memoId,
          userId,
        },
      });

      if (!existing) {
        throw new Error("Memo not found");
      }

      const updateData: Record<string, unknown> = {};

      if (existing.type === "ルーティン") {
        updateData.routineAcceptedToday = false;
        updateData.routineCompletedToday = false;
        updateData.routineAcceptedSlot = null;
        // Restore lastCompletedDay from saved value (undo the acceptance)
        updateData.routineLastCompletedDay =
          existing.routinePreviousLastCompletedDay;
        updateData.routinePreviousLastCompletedDay = null;
      } else if (existing.type === "バックログ") {
        updateData.backlogAcceptedToday = false;
        updateData.backlogAcceptedSlot = null;
        // Restore lastCompletedDay from saved value (undo the acceptance)
        updateData.backlogLastCompletedDay =
          existing.backlogPreviousLastCompletedDay;
        updateData.backlogPreviousLastCompletedDay = null;
      } else if (existing.type === "期限付き") {
        updateData.deadlineAcceptedSlots = [];
        // Restore lastCompletedDay from saved value (undo the acceptance)
        updateData.deadlineLastCompletedDay =
          existing.deadlinePreviousLastCompletedDay;
        updateData.deadlinePreviousLastCompletedDay = null;
      }

      if (Object.keys(updateData).length === 0) {
        return { id: existing.id, success: true };
      }

      await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(
        `[resetMemoAcceptedToday] Reset acceptedToday for memo ${input.memoId}`,
      );

      return { id: input.memoId, success: true };
    } catch (err) {
      console.error("[resetMemoAcceptedToday] Error:", err);
      throw new Error("Failed to reset memo accepted state");
    }
  },
);

/**
 * Mark a memo as rejected (sets rejectedToday = true for all task types)
 * This prevents the task from reappearing in suggestions for today.
 */
export const markMemoRejected = command(
  v.object({
    memoId: v.string(),
  }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      const existing = await prisma.memo.findFirst({
        where: {
          id: input.memoId,
          userId,
        },
      });

      if (!existing) {
        throw new Error("Memo not found");
      }

      const updateData: Record<string, unknown> = {
        lastActivity: new Date(), // Track rejection for day boundary detection
      };

      if (existing.type === "ルーティン") {
        updateData.routineRejectedToday = true;
      } else if (existing.type === "バックログ") {
        updateData.backlogRejectedToday = true;
      } else if (existing.type === "期限付き") {
        updateData.deadlineRejectedToday = true;
      }

      await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(`[markMemoRejected] Marked memo ${input.memoId} as rejected`);

      return { id: input.memoId, success: true };
    } catch (err) {
      console.error("[markMemoRejected] Error:", err);
      throw new Error("Failed to mark memo as rejected");
    }
  },
);
