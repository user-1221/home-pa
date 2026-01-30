/**
 * Memo Deadline Slots Remote Functions
 *
 * Server-side Remote Functions for deadline task slot operations:
 * - Add/remove accepted slots
 * - Update slot durations
 */
import { command } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";
import { getAuthenticatedUser } from "./memo.utils.ts";
import { AcceptedSlotSchema } from "./memo.schemas.ts";

// ============================================================================
// ADD DEADLINE SLOT
// ============================================================================

/**
 * Add an accepted time slot to a deadline task
 * This is called when a deadline suggestion is accepted with time slot info.
 * Also records the duration in actualDurations array for linear regression.
 */
export const addDeadlineAcceptedSlot = command(
  v.object({
    memoId: v.string(),
    slot: AcceptedSlotSchema,
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

      if (existing.type !== "期限付き") {
        throw new Error("Memo is not a deadline task");
      }

      // Get current slots or initialize empty array
      const currentSlots =
        (existing.deadlineAcceptedSlots as Array<{
          startTime: string;
          endTime: string;
          duration: number;
        }>) ?? [];

      // Add new slot
      const newSlots = [...currentSlots, input.slot];

      // Save previous lastCompletedDay only when adding first slot (for undo)
      const isFirstSlot = currentSlots.length === 0;

      // Update actualDurations array for linear regression
      const now = new Date();
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
        // Extend array with zeros if needed
        actualDurations = [
          ...actualDurations,
          ...new Array(totalDays - actualDurations.length).fill(0),
        ];
      }

      // Sum duration to today's index (if within bounds)
      if (dayIndex >= 0 && dayIndex < totalDays) {
        actualDurations[dayIndex] =
          (actualDurations[dayIndex] ?? 0) + input.slot.duration;
      }

      await prisma.memo.update({
        where: { id: input.memoId },
        data: {
          deadlineAcceptedSlots: newSlots,
          deadlineActualDurations: actualDurations,
          deadlineLastCompletedDay: now,
          deadlineRejectedToday: false, // Clear rejected state when accepting
          ...(isFirstSlot && {
            deadlinePreviousLastCompletedDay: existing.deadlineLastCompletedDay,
          }),
          lastActivity: now,
        },
      });

      console.log(
        `[addDeadlineAcceptedSlot] Added slot to memo ${input.memoId}:`,
        input.slot,
        `actualDurations[${dayIndex}] = ${actualDurations[dayIndex]}`,
      );

      return {
        id: input.memoId,
        acceptedSlots: newSlots,
        actualDurations,
      };
    } catch (err) {
      console.error("[addDeadlineAcceptedSlot] Error:", err);
      throw new Error("Failed to add accepted slot");
    }
  },
);

// ============================================================================
// REMOVE DEADLINE SLOT
// ============================================================================

/**
 * Remove an accepted time slot from a deadline task
 * Called when user deletes/cancels an accepted deadline suggestion.
 */
export const removeDeadlineAcceptedSlot = command(
  v.object({
    memoId: v.string(),
    startTime: v.string(), // Used to identify the slot to remove
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

      if (existing.type !== "期限付き") {
        throw new Error("Memo is not a deadline task");
      }

      // Get current slots
      const currentSlots =
        (existing.deadlineAcceptedSlots as Array<{
          startTime: string;
          endTime: string;
          duration: number;
        }>) ?? [];

      // Remove the slot with matching startTime
      const newSlots = currentSlots.filter(
        (slot) => slot.startTime !== input.startTime,
      );

      // Restore previous lastCompletedDay when removing last slot (undo)
      const isLastSlot = newSlots.length === 0;

      await prisma.memo.update({
        where: { id: input.memoId },
        data: {
          deadlineAcceptedSlots: newSlots,
          ...(isLastSlot && {
            deadlineLastCompletedDay: existing.deadlinePreviousLastCompletedDay,
            deadlinePreviousLastCompletedDay: null,
          }),
        },
      });

      console.log(
        `[removeDeadlineAcceptedSlot] Removed slot ${input.startTime} from memo ${input.memoId}`,
      );

      return {
        id: input.memoId,
        acceptedSlots: newSlots,
      };
    } catch (err) {
      console.error("[removeDeadlineAcceptedSlot] Error:", err);
      throw new Error("Failed to remove accepted slot");
    }
  },
);

// ============================================================================
// UPDATE SLOT DURATION
// ============================================================================

/**
 * Update the duration of an accepted time slot
 * Called when user adjusts the duration slider on an accepted suggestion.
 * Works for all task types (routine, backlog, deadline).
 */
export const updateAcceptedSlotDuration = command(
  v.object({
    memoId: v.string(),
    startTime: v.string(), // Used to identify which slot to update (for deadline tasks with multiple slots)
    newDuration: v.number(),
    newEndTime: v.string(),
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
        // Update routine's single acceptedSlot
        const currentSlot = existing.routineAcceptedSlot as {
          startTime: string;
          endTime: string;
          duration: number;
        } | null;

        if (currentSlot) {
          updateData.routineAcceptedSlot = {
            ...currentSlot,
            duration: input.newDuration,
            endTime: input.newEndTime,
          };
        }
      } else if (existing.type === "バックログ") {
        // Update backlog's single acceptedSlot
        const currentSlot = existing.backlogAcceptedSlot as {
          startTime: string;
          endTime: string;
          duration: number;
        } | null;

        if (currentSlot) {
          updateData.backlogAcceptedSlot = {
            ...currentSlot,
            duration: input.newDuration,
            endTime: input.newEndTime,
          };
        }
      } else if (existing.type === "期限付き") {
        // Update the matching slot in deadline's acceptedSlots array
        const currentSlots =
          (existing.deadlineAcceptedSlots as Array<{
            startTime: string;
            endTime: string;
            duration: number;
          }>) ?? [];

        const updatedSlots = currentSlots.map((slot) =>
          slot.startTime === input.startTime
            ? {
                ...slot,
                duration: input.newDuration,
                endTime: input.newEndTime,
              }
            : slot,
        );

        updateData.deadlineAcceptedSlots = updatedSlots;
      }

      if (Object.keys(updateData).length === 0) {
        return { id: input.memoId, success: false };
      }

      await prisma.memo.update({
        where: { id: input.memoId },
        data: updateData,
      });

      console.log(
        `[updateAcceptedSlotDuration] Updated slot duration for memo ${input.memoId}: ${input.newDuration}min`,
      );

      return { id: input.memoId, success: true };
    } catch (err) {
      console.error("[updateAcceptedSlotDuration] Error:", err);
      throw new Error("Failed to update slot duration");
    }
  },
);
