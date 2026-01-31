/**
 * Google Calendar Sync Engine
 *
 * Orchestrates synchronization between Google Calendar and local database.
 * Supports both full sync and incremental sync using Google's sync tokens.
 */
import { prisma } from "$lib/server/prisma";
import { listEvents, SyncTokenExpiredError } from "./google-calendar-api.ts";
import { googleEventToLocal, type MappedEvent } from "./event-mapper.ts";
import { createVEvent } from "$lib/features/calendar/services/ical-service.ts";
import type { calendar_v3 } from "googleapis";

// ============================================================================
// TYPES
// ============================================================================

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
  newSyncToken: string | null;
}

// ============================================================================
// MAIN SYNC FUNCTION
// ============================================================================

/**
 * Perform a sync for a specific Google Calendar.
 * Automatically handles full sync vs incremental sync based on syncToken.
 *
 * @param userId - Local user ID
 * @param googleCalendarId - Google Calendar ID to sync
 * @param accessToken - OAuth access token
 * @param syncToken - Optional sync token from previous sync
 * @returns Sync result with counts and new sync token
 */
export async function performSync(
  userId: string,
  googleCalendarId: string,
  accessToken: string,
  syncToken?: string | null,
): Promise<SyncResult> {
  try {
    if (syncToken) {
      return await performIncrementalSync(
        userId,
        googleCalendarId,
        accessToken,
        syncToken,
      );
    } else {
      return await performFullSync(userId, googleCalendarId, accessToken);
    }
  } catch (error) {
    // If sync token expired, perform full sync
    if (error instanceof SyncTokenExpiredError) {
      console.log(
        `Sync token expired for calendar ${googleCalendarId}, performing full sync`,
      );
      return await performFullSync(userId, googleCalendarId, accessToken);
    }
    throw error;
  }
}

// ============================================================================
// FULL SYNC
// ============================================================================

/**
 * Perform a full sync - fetches all events from Google Calendar.
 * Used for initial sync or when sync token has expired.
 */
export async function performFullSync(
  userId: string,
  googleCalendarId: string,
  accessToken: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
    newSyncToken: null,
  };

  // Collect all events across pages
  const allEvents: calendar_v3.Schema$Event[] = [];
  let pageToken: string | null = null;

  do {
    const response = await listEvents(
      accessToken,
      googleCalendarId,
      null, // No sync token for full sync
      pageToken,
    );

    allEvents.push(...response.events);
    pageToken = response.nextPageToken;
    result.newSyncToken = response.nextSyncToken;
  } while (pageToken);

  // Map Google events to local format
  const mappedEvents = allEvents
    .map((event) => googleEventToLocal(event, googleCalendarId))
    .filter((e): e is MappedEvent => e !== null);

  // Apply changes to database
  const applyResult = await applyChanges(
    userId,
    mappedEvents,
    googleCalendarId,
  );

  result.created = applyResult.created;
  result.updated = applyResult.updated;
  result.deleted = applyResult.deleted;
  result.errors = applyResult.errors;

  // Update sync token in database
  if (result.newSyncToken) {
    await prisma.googleCalendarSync.updateMany({
      where: {
        userId,
        googleCalendarId,
      },
      data: {
        syncToken: result.newSyncToken,
      },
    });
  }

  return result;
}

// ============================================================================
// INCREMENTAL SYNC
// ============================================================================

/**
 * Perform an incremental sync using a sync token.
 * Only fetches events that have changed since the last sync.
 */
export async function performIncrementalSync(
  userId: string,
  googleCalendarId: string,
  accessToken: string,
  syncToken: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
    newSyncToken: null,
  };

  // Fetch changed events
  const allEvents: calendar_v3.Schema$Event[] = [];
  let pageToken: string | null = null;

  do {
    const response = await listEvents(
      accessToken,
      googleCalendarId,
      syncToken,
      pageToken,
    );

    allEvents.push(...response.events);
    pageToken = response.nextPageToken;
    result.newSyncToken = response.nextSyncToken;
  } while (pageToken);

  // Map Google events to local format
  const mappedEvents = allEvents
    .map((event) => googleEventToLocal(event, googleCalendarId))
    .filter((e): e is MappedEvent => e !== null);

  // Apply changes to database
  const applyResult = await applyChanges(
    userId,
    mappedEvents,
    googleCalendarId,
  );

  result.created = applyResult.created;
  result.updated = applyResult.updated;
  result.deleted = applyResult.deleted;
  result.errors = applyResult.errors;

  // Update sync token in database
  if (result.newSyncToken) {
    await prisma.googleCalendarSync.updateMany({
      where: {
        userId,
        googleCalendarId,
      },
      data: {
        syncToken: result.newSyncToken,
      },
    });
  }

  return result;
}

// ============================================================================
// APPLY CHANGES
// ============================================================================

interface ApplyResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/**
 * Apply mapped events to the local database.
 * Handles creates, updates, and deletes.
 */
async function applyChanges(
  userId: string,
  events: MappedEvent[],
  googleCalendarId: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  for (const mappedEvent of events) {
    try {
      if (mappedEvent.isCancelled) {
        // Delete the event
        const deleted = await deleteLocalEvent(
          userId,
          mappedEvent.googleEventId,
          googleCalendarId,
        );
        if (deleted) {
          result.deleted++;
        }
      } else {
        // Create or update the event
        const { created, updated } = await upsertLocalEvent(
          userId,
          mappedEvent,
        );
        if (created) result.created++;
        if (updated) result.updated++;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(
        `Failed to process event ${mappedEvent.googleEventId}: ${errorMsg}`,
      );
    }
  }

  return result;
}

/**
 * Create or update a local event from a Google event.
 */
async function upsertLocalEvent(
  userId: string,
  mappedEvent: MappedEvent,
): Promise<{ created: boolean; updated: boolean }> {
  const { googleEventId, event, calendarId, etag } = mappedEvent;

  // Generate UID for the event (using Google event ID)
  const uid = `${googleEventId}@google.com`;

  // Check if event already exists
  const existing = await prisma.calendarEvent.findFirst({
    where: {
      userId,
      uid,
    },
  });

  // Determine if this is an all-day event
  const isAllDay = event.timeLabel === "all-day";

  // Prepare the data
  const eventData = {
    userId,
    uid,
    summary: event.title,
    dtstart: event.start,
    dtend: event.end,
    isAllDay,
    dtstartTzid: event.tzid ?? null,
    description: event.description ?? null,
    location: event.address ?? null,
    color: event.color ?? null,
    rrule: event.recurrence?.type === "RRULE" ? event.recurrence.rrule : null,
    hasRecurrence: event.recurrence?.type === "RRULE",
    icalData:
      event.icalData ??
      createVEvent({
        summary: event.title,
        dtstart: event.start,
        dtend: event.end,
        isAllDay,
        description: event.description,
        location: event.address,
        rrule:
          event.recurrence?.type === "RRULE"
            ? event.recurrence.rrule
            : undefined,
        dtstartTzid: event.tzid,
      }),
    // Sync metadata
    calendarId,
    etag,
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  };

  if (existing) {
    // Update existing event
    await prisma.calendarEvent.update({
      where: { id: existing.id },
      data: eventData,
    });
    return { created: false, updated: true };
  } else {
    // Create new event
    await prisma.calendarEvent.create({
      data: eventData,
    });
    return { created: true, updated: false };
  }
}

/**
 * Delete a local event that was deleted in Google Calendar.
 */
async function deleteLocalEvent(
  userId: string,
  googleEventId: string,
  _googleCalendarId: string,
): Promise<boolean> {
  const uid = `${googleEventId}@google.com`;

  const existing = await prisma.calendarEvent.findFirst({
    where: {
      userId,
      uid,
    },
  });

  if (!existing) {
    return false;
  }

  // Hard delete the event
  await prisma.calendarEvent.delete({
    where: { id: existing.id },
  });

  return true;
}
