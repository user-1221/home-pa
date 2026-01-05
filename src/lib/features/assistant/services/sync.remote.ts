/**
 * Action Sync Remote Functions
 *
 * Server-side Remote Functions for persisting accepted suggestions,
 * cached transit info, and rejected memos across sessions and devices.
 *
 * Cleanup Logic:
 * - Accepted suggestions: Removed when their date is in the past
 * - Cached transit: Removed when the event start time is in the past
 * - Rejected memos: Persisted indefinitely (memos never reappear)
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

const AcceptedSuggestionSchema = v.object({
  suggestionId: v.string(),
  memoId: v.string(),
  gapId: v.string(),
  date: v.string(), // ISO date string
  startTime: v.string(), // HH:mm
  endTime: v.string(), // HH:mm
  duration: v.number(),
  originalDuration: v.number(),
  acceptedAt: v.string(), // ISO datetime string
});

const SaveAcceptedSuggestionsSchema = v.object({
  suggestions: v.array(AcceptedSuggestionSchema),
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

const RejectedMemoSchema = v.object({
  memoIds: v.array(v.string()),
});

// ============================================================================
// Response Types
// ============================================================================

export interface SyncedAcceptedSuggestion {
  suggestionId: string;
  memoId: string;
  gapId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  originalDuration: number;
  acceptedAt: string;
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
 * Also performs cleanup of expired data
 */
export const loadSyncData = query(
  v.object({}),
  async (): Promise<{
    acceptedSuggestions: SyncedAcceptedSuggestion[];
    cachedTransit: SyncedCachedTransit[];
    rejectedMemoIds: string[];
  }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return {
        acceptedSuggestions: [],
        cachedTransit: [],
        rejectedMemoIds: [],
      };
    }
    const now = new Date();
    const yesterdayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
    );

    // Cleanup expired accepted suggestions (date < yesterday)
    // We keep today's past suggestions so users can mark them as complete/missed
    const deletedSuggestions = await prisma.acceptedSuggestion.deleteMany({
      where: {
        userId,
        date: { lt: yesterdayStart },
      },
    });

    if (deletedSuggestions.count > 0) {
      console.log(
        `[Sync] Cleaned up ${deletedSuggestions.count} expired accepted suggestions`,
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
    const [acceptedSuggestions, cachedTransit, rejectedMemos] =
      await Promise.all([
        prisma.acceptedSuggestion.findMany({
          where: { userId },
          orderBy: { date: "asc" },
        }),
        prisma.cachedTransitInfo.findMany({
          where: { userId },
          orderBy: { eventStart: "asc" },
        }),
        prisma.rejectedMemo.findMany({
          where: { userId },
        }),
      ]);

    return {
      acceptedSuggestions: acceptedSuggestions.map((s) => ({
        suggestionId: s.suggestionId,
        memoId: s.memoId,
        gapId: s.gapId,
        date: s.date.toISOString(),
        startTime: s.startTime,
        endTime: s.endTime,
        duration: s.duration,
        originalDuration: s.originalDuration,
        acceptedAt: s.acceptedAt.toISOString(),
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
      rejectedMemoIds: rejectedMemos.map((r) => r.memoId),
    };
  },
);

/**
 * Save accepted suggestions to database
 * Uses upsert to handle updates
 */
export const saveAcceptedSuggestions = query(
  SaveAcceptedSuggestionsSchema,
  async (input): Promise<{ success: boolean; count: number }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false, count: 0 };
    }

    // Upsert each suggestion
    const operations = input.suggestions.map((s) =>
      prisma.acceptedSuggestion.upsert({
        where: {
          userId_suggestionId: {
            userId,
            suggestionId: s.suggestionId,
          },
        },
        create: {
          userId,
          suggestionId: s.suggestionId,
          memoId: s.memoId,
          gapId: s.gapId,
          date: new Date(s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          originalDuration: s.originalDuration,
          acceptedAt: new Date(s.acceptedAt),
        },
        update: {
          memoId: s.memoId,
          gapId: s.gapId,
          date: new Date(s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          acceptedAt: new Date(s.acceptedAt),
        },
      }),
    );

    await Promise.all(operations);
    console.log(
      `[Sync] Saved ${input.suggestions.length} accepted suggestions`,
    );

    return { success: true, count: input.suggestions.length };
  },
);

/**
 * Remove an accepted suggestion from database
 */
export const removeAcceptedSuggestion = query(
  v.object({ suggestionId: v.string() }),
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false };
    }

    await prisma.acceptedSuggestion.deleteMany({
      where: {
        userId,
        suggestionId: input.suggestionId,
      },
    });

    console.log(`[Sync] Removed accepted suggestion: ${input.suggestionId}`);
    return { success: true };
  },
);

/**
 * Clear all accepted suggestions for user (for a fresh start)
 */
export const clearAcceptedSuggestions = query(
  v.object({}),
  async (): Promise<{ success: boolean; count: number }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false, count: 0 };
    }

    const result = await prisma.acceptedSuggestion.deleteMany({
      where: { userId },
    });

    console.log(`[Sync] Cleared ${result.count} accepted suggestions`);
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

/**
 * Save rejected memo IDs to database
 */
export const saveRejectedMemos = query(
  RejectedMemoSchema,
  async (input): Promise<{ success: boolean; count: number }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false, count: 0 };
    }
    const now = new Date();

    // Create rejected memo entries (skip if already exists)
    const operations = input.memoIds.map((memoId) =>
      prisma.rejectedMemo.upsert({
        where: {
          userId_memoId: {
            userId,
            memoId,
          },
        },
        create: {
          userId,
          memoId,
          rejectedAt: now,
        },
        update: {}, // No update needed - just skip if exists
      }),
    );

    await Promise.all(operations);
    console.log(`[Sync] Saved ${input.memoIds.length} rejected memos`);

    return { success: true, count: input.memoIds.length };
  },
);

/**
 * Remove a rejected memo (restore it to suggestions)
 */
export const removeRejectedMemo = query(
  v.object({ memoId: v.string() }),
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false };
    }

    await prisma.rejectedMemo.deleteMany({
      where: {
        userId,
        memoId: input.memoId,
      },
    });

    console.log(`[Sync] Removed rejected memo: ${input.memoId}`);
    return { success: true };
  },
);

/**
 * Clear all rejected memos for user
 */
export const clearRejectedMemos = query(
  v.object({}),
  async (): Promise<{ success: boolean; count: number }> => {
    const userId = getAuthenticatedUser();
    if (!userId) {
      console.warn("[Sync] No authenticated user");
      return { success: false, count: 0 };
    }

    const result = await prisma.rejectedMemo.deleteMany({
      where: { userId },
    });

    console.log(`[Sync] Cleared ${result.count} rejected memos`);
    return { success: true, count: result.count };
  },
);
