/**
 * Focus Timer Remote Functions (Server-side)
 *
 * Server-side Remote Functions for cross-device timer synchronization.
 * Ensures only one active timer per user across all devices.
 *
 * Features:
 * - Start/end timer sessions with device identification
 * - Move timer between devices while preserving progress
 * - 24-hour cap: sessions older than 24h are auto-discarded
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";
import { sseHub } from "$lib/server/sse/hub";
import { createSSEEvent } from "$lib/server/sse/types";

// ============================================================================
// HELPER - Get authenticated user
// ============================================================================

function getAuthenticatedUser(): string {
  const event = getRequestEvent();
  if (!event.locals.user?.id) {
    throw new Error("Unauthorized");
  }
  return event.locals.user.id;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_SESSION_HOURS = 24;

// ============================================================================
// SCHEMAS
// ============================================================================

const PomodoroStateSchema = v.object({
  phase: v.picklist(["work", "break"]),
  cycleNumber: v.number(),
  phaseStartedAt: v.string(),
  workDuration: v.number(),
  breakDuration: v.number(),
  totalWorkTime: v.number(),
});

const StartTimerSchema = v.object({
  memoId: v.string(),
  taskTitle: v.string(),
  startedAt: v.string(), // ISO string
  plannedEndTime: v.optional(v.string()), // HH:mm (undefined = open-ended)
  mode: v.picklist(["normal", "pomodoro"]),
  pomodoroState: v.optional(PomodoroStateSchema),
  deviceId: v.string(),
  deviceName: v.optional(v.string()),
});

const EndTimerSchema = v.object({
  deviceId: v.string(),
});

const UpdateTimerSchema = v.object({
  pomodoroState: v.optional(PomodoroStateSchema),
  isPaused: v.optional(v.boolean()),
  pausedAt: v.optional(v.nullable(v.string())), // ISO string or null
  pausedDuration: v.optional(v.number()),
  deviceId: v.string(),
});

const MoveTimerSchema = v.object({
  deviceId: v.string(),
  deviceName: v.optional(v.string()),
});

// ============================================================================
// REMOTE FUNCTIONS
// ============================================================================

/**
 * Start a new timer session
 *
 * If another device has an active timer:
 * - Returns failure with device info so UI can show "timer on other device"
 *
 * If session is older than 24 hours:
 * - Auto-deletes it and allows new session
 */
export const startTimerSession = command(StartTimerSchema, async (input) => {
  const userId = getAuthenticatedUser();

  try {
    // Check for existing session
    const existing = await prisma.activeTimerSession.findUnique({
      where: { userId },
    });

    if (existing) {
      // Check 24h cap
      const hoursElapsed =
        (Date.now() - existing.startedAt.getTime()) / (1000 * 60 * 60);

      if (hoursElapsed >= MAX_SESSION_HOURS) {
        // Auto-discard expired session (no progress logged)
        await prisma.activeTimerSession.delete({ where: { userId } });
        console.log(
          `[startTimerSession] Deleted expired session (${hoursElapsed.toFixed(1)}h old)`,
        );
      } else if (existing.deviceId !== input.deviceId) {
        // Different device has active timer
        return {
          success: false as const,
          reason: "timer_on_other_device" as const,
          deviceName: existing.deviceName ?? "Unknown Device",
          taskTitle: existing.taskTitle,
          startedAt: existing.startedAt.toISOString(),
        };
      }
      // Same device - allow overwrite (shouldn't happen normally)
    }

    // Create new session
    await prisma.activeTimerSession.upsert({
      where: { userId },
      create: {
        userId,
        memoId: input.memoId,
        taskTitle: input.taskTitle,
        startedAt: new Date(input.startedAt),
        plannedEndTime: input.plannedEndTime ?? null,
        mode: input.mode,
        pomodoroState: input.pomodoroState ?? undefined,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
      },
      update: {
        memoId: input.memoId,
        taskTitle: input.taskTitle,
        startedAt: new Date(input.startedAt),
        plannedEndTime: input.plannedEndTime ?? null,
        mode: input.mode,
        pomodoroState: input.pomodoroState ?? undefined,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
      },
    });

    console.log(
      `[startTimerSession] Started session for memo ${input.memoId} on device ${input.deviceName ?? input.deviceId}`,
    );

    // Broadcast to other devices
    sseHub.broadcast(
      userId,
      createSSEEvent(
        "timer",
        "started",
        {
          memoId: input.memoId,
          taskTitle: input.taskTitle,
          startedAt: input.startedAt,
          plannedEndTime: input.plannedEndTime ?? null,
          mode: input.mode,
          pomodoroState: input.pomodoroState,
          deviceName: input.deviceName,
        },
        input.deviceId,
      ),
      input.deviceId, // Exclude triggering device
    );

    return { success: true as const };
  } catch (err) {
    console.error("[startTimerSession] Error:", err);
    throw new Error("Failed to start timer session");
  }
});

/**
 * Get active timer session for the user
 *
 * Returns:
 * - null if no active session
 * - { expired: true } if session exceeded 24h cap (auto-deleted)
 * - Full session data otherwise
 */
export const getActiveTimerSession = query(
  v.optional(v.object({})),
  async () => {
    const userId = getAuthenticatedUser();

    try {
      const session = await prisma.activeTimerSession.findUnique({
        where: { userId },
      });

      if (!session) {
        return null;
      }

      // Check 24h cap
      const hoursElapsed =
        (Date.now() - session.startedAt.getTime()) / (1000 * 60 * 60);

      if (hoursElapsed >= MAX_SESSION_HOURS) {
        // Auto-delete expired session
        await prisma.activeTimerSession.delete({ where: { userId } });
        console.log(
          `[getActiveTimerSession] Deleted expired session (${hoursElapsed.toFixed(1)}h old)`,
        );
        return { expired: true as const, reason: "24h_cap_exceeded" as const };
      }

      return {
        memoId: session.memoId,
        taskTitle: session.taskTitle,
        startedAt: session.startedAt.toISOString(),
        plannedEndTime: session.plannedEndTime,
        mode: session.mode as "normal" | "pomodoro",
        pomodoroState: session.pomodoroState as {
          phase: "work" | "break";
          cycleNumber: number;
          phaseStartedAt: string;
          workDuration: number;
          breakDuration: number;
          totalWorkTime: number;
        } | null,
        deviceId: session.deviceId,
        deviceName: session.deviceName ?? "Unknown Device",
        isPaused: session.isPaused,
        pausedAt: session.pausedAt?.toISOString() ?? null,
        pausedDuration: session.pausedDuration,
      };
    } catch (err) {
      console.error("[getActiveTimerSession] Error:", err);
      throw new Error("Failed to get timer session");
    }
  },
);

/**
 * End (delete) the current timer session
 * Called when session completes or is cancelled
 */
export const endTimerSession = command(EndTimerSchema, async (input) => {
  const userId = getAuthenticatedUser();

  try {
    await prisma.activeTimerSession.delete({ where: { userId } });
    console.log(`[endTimerSession] Ended session for user ${userId}`);

    // Broadcast to other devices
    sseHub.broadcast(
      userId,
      createSSEEvent("timer", "stopped", {}, input.deviceId),
      input.deviceId, // Exclude triggering device
    );

    return { success: true };
  } catch (err) {
    // Ignore "not found" errors (session may already be deleted)
    if (
      err instanceof Error &&
      err.message.includes("Record to delete does not exist")
    ) {
      return { success: true };
    }
    console.error("[endTimerSession] Error:", err);
    throw new Error("Failed to end timer session");
  }
});

/**
 * Update timer session state
 * Used for syncing Pomodoro phase changes, pause state, etc.
 */
export const updateTimerSession = command(UpdateTimerSchema, async (input) => {
  const userId = getAuthenticatedUser();

  try {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.pomodoroState !== undefined) {
      updateData.pomodoroState = input.pomodoroState;
    }

    if (input.isPaused !== undefined) {
      updateData.isPaused = input.isPaused;
    }

    if (input.pausedAt !== undefined) {
      updateData.pausedAt = input.pausedAt ? new Date(input.pausedAt) : null;
    }

    if (input.pausedDuration !== undefined) {
      updateData.pausedDuration = input.pausedDuration;
    }

    await prisma.activeTimerSession.update({
      where: { userId },
      data: updateData,
    });

    // Broadcast to other devices
    sseHub.broadcast(
      userId,
      createSSEEvent(
        "timer",
        "updated",
        {
          pomodoroState: input.pomodoroState,
          isPaused: input.isPaused,
          pausedAt: input.pausedAt,
          pausedDuration: input.pausedDuration,
        },
        input.deviceId,
      ),
      input.deviceId, // Exclude triggering device
    );

    return { success: true };
  } catch (err) {
    console.error("[updateTimerSession] Error:", err);
    throw new Error("Failed to update timer session");
  }
});

/**
 * Move timer to a different device
 *
 * Transfers ownership while preserving all timer state (progress, phase, etc.)
 * Used when user opens app on another device and clicks "Move timer here"
 */
export const moveTimerToDevice = command(MoveTimerSchema, async (input) => {
  const userId = getAuthenticatedUser();

  try {
    // Get existing session
    const existing = await prisma.activeTimerSession.findUnique({
      where: { userId },
    });

    if (!existing) {
      return { success: false as const, reason: "no_session" as const };
    }

    // Check 24h cap before moving
    const hoursElapsed =
      (Date.now() - existing.startedAt.getTime()) / (1000 * 60 * 60);

    if (hoursElapsed >= MAX_SESSION_HOURS) {
      await prisma.activeTimerSession.delete({ where: { userId } });
      console.log(
        `[moveTimerToDevice] Deleted expired session (${hoursElapsed.toFixed(1)}h old)`,
      );
      return { success: false as const, reason: "24h_cap_exceeded" as const };
    }

    // Update device ownership (keep all timer state intact)
    await prisma.activeTimerSession.update({
      where: { userId },
      data: {
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[moveTimerToDevice] Moved session to device ${input.deviceName ?? input.deviceId}`,
    );

    // Broadcast to ALL devices (including the new owner for confirmation)
    sseHub.broadcast(
      userId,
      createSSEEvent(
        "timer",
        "moved",
        {
          memoId: existing.memoId,
          taskTitle: existing.taskTitle,
          startedAt: existing.startedAt.toISOString(),
          plannedEndTime: existing.plannedEndTime,
          mode: existing.mode as "normal" | "pomodoro",
          pomodoroState: existing.pomodoroState as {
            phase: "work" | "break";
            cycleNumber: number;
            phaseStartedAt: string;
            workDuration: number;
            breakDuration: number;
            totalWorkTime: number;
          } | null,
          isPaused: existing.isPaused,
          pausedAt: existing.pausedAt?.toISOString() ?? null,
          pausedDuration: existing.pausedDuration,
          deviceName: input.deviceName,
          targetDeviceId: input.deviceId,
        },
        "server",
      ), // No exclusion - all devices need to know
    );

    // Return full session data so client can restore it
    return {
      success: true as const,
      session: {
        memoId: existing.memoId,
        taskTitle: existing.taskTitle,
        startedAt: existing.startedAt.toISOString(),
        plannedEndTime: existing.plannedEndTime,
        mode: existing.mode as "normal" | "pomodoro",
        pomodoroState: existing.pomodoroState as {
          phase: "work" | "break";
          cycleNumber: number;
          phaseStartedAt: string;
          workDuration: number;
          breakDuration: number;
          totalWorkTime: number;
        } | null,
        isPaused: existing.isPaused,
        pausedAt: existing.pausedAt?.toISOString() ?? null,
        pausedDuration: existing.pausedDuration,
      },
    };
  } catch (err) {
    console.error("[moveTimerToDevice] Error:", err);
    throw new Error("Failed to move timer to device");
  }
});
