/**
 * Action Sync Remote Functions
 *
 * Server-side Remote Functions for persisting suggestion actions
 * and cached transit info across sessions and devices.
 *
 * Suggestion Actions:
 * - "accepted": User accepted the suggestion (includes time slot info)
 * - "rejected": User rejected/skipped the suggestion
 * - "missed": User marked an accepted suggestion as missed
 *
 * Cleanup Logic:
 * - All suggestion actions: Cleared at start of new day (only today's actions persist)
 * - Cached transit: Removed when the event start time is in the past
 */

import { query, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";

// ============================================================================
// Helper - Get authenticated user
// ============================================================================

function getAuthenticatedUser(): string | null {
  try {
    const event = getRequestEvent();
    return event.locals.user?.id ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Schemas
// ============================================================================

const SuggestionActionSchema = v.object({
  memoId: v.string(),
  action: v.picklist(["accepted", "rejected", "missed"]),
  // Time slot info (only for accepted)
  startTime: v.optional(v.string()), // HH:mm
  endTime: v.optional(v.string()), // HH:mm
  duration: v.optional(v.number()),
});

const SaveSuggestionActionSchema = v.object({
  actions: v.array(SuggestionActionSchema),
});

const RemoveSuggestionActionSchema = v.object({
  memoId: v.string(),
  action: v.picklist(["accepted", "rejected", "missed"]),
});

const CachedTransitSchema = v.object({
  eventId: v.string(),
  eventLocation: v.string(),
  eventStart: v.string(), // ISO datetime string
  userLat: v.number(),
  userLon: v.number(),
  transitData: v.string(), // JSON string
  cachedAt: v.string(), // ISO datetime string
});

const SaveCachedTransitSchema = v.object({
  transitInfo: CachedTransitSchema,
});

// ============================================================================
// Response Types
// ============================================================================

export interface SyncedSuggestionAction {
  memoId: string;
  action: "accepted" | "rejected" | "missed";
  startTime?: string;
  endTime?: string;
  duration?: number;
}

export interface SyncedCachedTransit {
  eventId: string;
  eventLocation: string;
  eventStart: string;
  userLat: number;
  userLon: number;
  transitData: string;
  cachedAt: string;
}

// ============================================================================
// Remote Functions
// ============================================================================

/**
 * Load all synced data for the current user
 * Also performs cleanup of expired data (previous day's actions)
 */
export const loadSyncData = query(
  v.object({}),
  async (): Promise<{
    suggestionActions: SyncedSuggestionAction[];
    cachedTransit: SyncedCachedTransit[];
  }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return {
        suggestionActions: [],
        cachedTransit: [],
      };
    }
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Cleanup all suggestion actions from previous days
    // Only today's actions should persist
    const deletedActions = await prisma.suggestionAction.deleteMany({
      where: {
        userId,
        createdAt: { lt: todayStart },
      },
    });

    if (deletedActions.count > 0) {
      console.log(
        `[Sync] Cleaned up ${deletedActions.count} expired suggestion actions`,
      );
    }

    // Cleanup expired cached transit (eventStart < now)
    const deletedTransit = await prisma.cachedTransitInfo.deleteMany({
      where: {
        userId,
        eventStart: { lt: now },
      },
    });

    if (deletedTransit.count > 0) {
      console.log(
        `[Sync] Cleaned up ${deletedTransit.count} expired cached transit`,
      );
    }

    // Load remaining data
    const [suggestionActions, cachedTransit] = await Promise.all([
      prisma.suggestionAction.findMany({
        where: { userId },
      }),
      prisma.cachedTransitInfo.findMany({
        where: { userId },
        orderBy: { eventStart: "asc" },
      }),
    ]);

    return {
      suggestionActions: suggestionActions.map((a) => ({
        memoId: a.memoId,
        action: a.action as "accepted" | "rejected" | "missed",
        startTime: a.startTime ?? undefined,
        endTime: a.endTime ?? undefined,
        duration: a.duration ?? undefined,
      })),
      cachedTransit: cachedTransit.map((t) => ({
        eventId: t.eventId,
        eventLocation: t.eventLocation,
        eventStart: t.eventStart.toISOString(),
        userLat: t.userLat,
        userLon: t.userLon,
        transitData: t.transitData,
        cachedAt: t.cachedAt.toISOString(),
      })),
    };
  },
);

/**
 * Save suggestion actions to database
 * Uses upsert to handle updates
 */
export const saveSuggestionActions = query(
  SaveSuggestionActionSchema,
  async (input): Promise<{ success: boolean; count: number }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false, count: 0 };
    }

    // Upsert each action
    const operations = input.actions.map((a) =>
      prisma.suggestionAction.upsert({
        where: {
          userId_memoId_action: {
            userId,
            memoId: a.memoId,
            action: a.action,
          },
        },
        create: {
          userId,
          memoId: a.memoId,
          action: a.action,
          startTime: a.startTime,
          endTime: a.endTime,
          duration: a.duration,
        },
        update: {
          startTime: a.startTime,
          endTime: a.endTime,
          duration: a.duration,
        },
      }),
    );

    await Promise.all(operations);
    console.log(`[Sync] Saved ${input.actions.length} suggestion actions`);

    return { success: true, count: input.actions.length };
  },
);

/**
 * Remove a suggestion action from database
 */
export const removeSuggestionAction = query(
  RemoveSuggestionActionSchema,
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false };
    }

    await prisma.suggestionAction.deleteMany({
      where: {
        userId,
        memoId: input.memoId,
        action: input.action,
      },
    });

    console.log(
      `[Sync] Removed ${input.action} action for memo: ${input.memoId}`,
    );
    return { success: true };
  },
);

/**
 * Clear all suggestion actions for user (for a fresh start)
 */
export const clearSuggestionActions = query(
  v.object({}),
  async (): Promise<{ success: boolean; count: number }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false, count: 0 };
    }

    const result = await prisma.suggestionAction.deleteMany({
      where: { userId },
    });

    console.log(`[Sync] Cleared ${result.count} suggestion actions`);
    return { success: true, count: result.count };
  },
);

/**
 * Save cached transit info to database
 */
export const saveCachedTransit = query(
  SaveCachedTransitSchema,
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false };
    }
    const t = input.transitInfo;

    await prisma.cachedTransitInfo.upsert({
      where: {
        userId_eventId: {
          userId,
          eventId: t.eventId,
        },
      },
      create: {
        userId,
        eventId: t.eventId,
        eventLocation: t.eventLocation,
        eventStart: new Date(t.eventStart),
        userLat: t.userLat,
        userLon: t.userLon,
        transitData: t.transitData,
        cachedAt: new Date(t.cachedAt),
      },
      update: {
        eventLocation: t.eventLocation,
        eventStart: new Date(t.eventStart),
        userLat: t.userLat,
        userLon: t.userLon,
        transitData: t.transitData,
        cachedAt: new Date(t.cachedAt),
      },
    });

    console.log(`[Sync] Saved cached transit for event: ${t.eventId}`);
    return { success: true };
  },
);

/**
 * Remove cached transit info for an event
 */
export const removeCachedTransit = query(
  v.object({ eventId: v.string() }),
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false };
    }

    await prisma.cachedTransitInfo.deleteMany({
      where: {
        userId,
        eventId: input.eventId,
      },
    });

    console.log(`[Sync] Removed cached transit: ${input.eventId}`);
    return { success: true };
  },
);

/**
 * Clear all cached transit for user
 */
export const clearCachedTransit = query(
  v.object({}),
  async (): Promise<{ success: boolean; count: number }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false, count: 0 };
    }

    const result = await prisma.cachedTransitInfo.deleteMany({
      where: { userId },
    });

    console.log(`[Sync] Cleared ${result.count} cached transit entries`);
    return { success: true, count: result.count };
  },
);
