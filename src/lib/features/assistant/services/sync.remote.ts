/**
 * Sync Remote Functions
 *
 * Server-side Remote Functions for persisting cached transit info
 * across sessions and devices.
 *
 * Note: Suggestion actions (accepted/rejected/missed) are now stored
 * directly on memo state and no longer need separate sync.
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
 * Load cached transit data for the current user
 * Also performs cleanup of expired data (past events)
 */
export const loadSyncData = query(
  v.object({}),
  async (): Promise<{
    cachedTransit: SyncedCachedTransit[];
  }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return {
        cachedTransit: [],
      };
    }

    const now = new Date();

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
    const cachedTransit = await prisma.cachedTransitInfo.findMany({
      where: { userId },
      orderBy: { eventStart: "asc" },
    });

    return {
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
