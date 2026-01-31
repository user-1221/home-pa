/**
 * Google Calendar Sync Remote Functions (Server-side)
 *
 * Server-side Remote Functions for Google Calendar sync operations.
 * These run on the server and are callable from client with type safety.
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";

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
// HELPER - Get valid access token (with auto-refresh)
// ============================================================================

/**
 * Get a valid access token, refreshing if expired.
 * Google access tokens expire after 1 hour; this uses the refresh token
 * to get a new one when needed.
 */
async function getValidAccessToken(userId: string): Promise<string> {
  const googleAccount = await prisma.account.findFirst({
    where: { userId, providerId: "google" },
  });

  if (!googleAccount?.accessToken || !googleAccount?.refreshToken) {
    throw new Error("Google account not connected");
  }

  // Check if token expires within 5 minutes (buffer for API call duration)
  const now = new Date();
  const expiresAt = googleAccount.accessTokenExpiresAt;
  const bufferMs = 5 * 60 * 1000;
  const isExpired =
    !expiresAt || expiresAt.getTime() - now.getTime() < bufferMs;

  if (!isExpired) {
    return googleAccount.accessToken;
  }

  // Refresh the token using googleapis
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: googleAccount.refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Failed to refresh access token");
  }

  // Update tokens in database
  await prisma.account.update({
    where: { id: googleAccount.id },
    data: {
      accessToken: credentials.access_token,
      accessTokenExpiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null,
    },
  });

  return credentials.access_token;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const EnableSyncSchema = v.object({
  calendarIds: v.array(v.string()),
});

const DisableSyncSchema = v.object({
  googleCalendarId: v.string(),
});

const TriggerSyncSchema = v.object({
  googleCalendarId: v.optional(v.string()),
});

// ============================================================================
// TYPES
// ============================================================================

interface SyncedCalendarResponse {
  id: string;
  googleCalendarId: string;
  calendarName: string;
  calendarColor: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface ConnectionCheckResponse {
  isConnected: boolean;
  calendars: SyncedCalendarResponse[];
}

interface GoogleCalendarListItem {
  id: string;
  name: string;
  color: string | null;
}

// ============================================================================
// REMOTE FUNCTIONS
// ============================================================================

/**
 * Check if user has a Google account linked and get synced calendars.
 */
export const checkGoogleConnection = query(
  v.undefined(),
  async (): Promise<ConnectionCheckResponse> => {
    const userId = getAuthenticatedUser();

    // Check if user has a Google account linked via Better Auth
    const googleAccount = await prisma.account.findFirst({
      where: {
        userId,
        providerId: "google",
      },
    });

    if (!googleAccount) {
      return { isConnected: false, calendars: [] };
    }

    // Get all synced calendars for this user
    const syncedCalendars = await prisma.googleCalendarSync.findMany({
      where: { userId },
      orderBy: { calendarName: "asc" },
    });

    return {
      isConnected: true,
      calendars: syncedCalendars.map((cal) => ({
        id: cal.id,
        googleCalendarId: cal.googleCalendarId,
        calendarName: cal.calendarName,
        calendarColor: cal.calendarColor,
        syncEnabled: cal.syncEnabled,
        lastSyncAt: cal.lastSyncAt?.toISOString() ?? null,
        lastError: cal.lastError,
      })),
    };
  },
);

/**
 * List available Google calendars for the connected account.
 * Requires Google account to be linked.
 */
export const listGoogleCalendars = query(
  v.undefined(),
  async (): Promise<GoogleCalendarListItem[]> => {
    const userId = getAuthenticatedUser();
    const accessToken = await getValidAccessToken(userId);

    // Import and use the Google Calendar API
    const { listCalendars } = await import(
      "$lib/features/calendar/services/google-calendar/google-calendar-api.ts"
    );

    return listCalendars(accessToken);
  },
);

/**
 * Enable sync for selected Google calendars.
 */
export const enableCalendarSync = command(
  EnableSyncSchema,
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();
    const accessToken = await getValidAccessToken(userId);

    // Fetch calendar details from Google
    const { listCalendars } = await import(
      "$lib/features/calendar/services/google-calendar/google-calendar-api.ts"
    );
    const allCalendars = await listCalendars(accessToken);

    // Create or update sync entries for selected calendars
    for (const calendarId of input.calendarIds) {
      const calendarInfo = allCalendars.find((c) => c.id === calendarId);
      if (!calendarInfo) continue;

      await prisma.googleCalendarSync.upsert({
        where: {
          userId_googleCalendarId: {
            userId,
            googleCalendarId: calendarId,
          },
        },
        create: {
          userId,
          googleCalendarId: calendarId,
          calendarName: calendarInfo.name,
          calendarColor: calendarInfo.color,
          syncEnabled: true,
        },
        update: {
          calendarName: calendarInfo.name,
          calendarColor: calendarInfo.color,
          syncEnabled: true,
        },
      });
    }

    return { success: true };
  },
);

/**
 * Disable sync for a specific Google calendar.
 */
export const disableCalendarSync = command(
  DisableSyncSchema,
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();

    await prisma.googleCalendarSync.updateMany({
      where: {
        userId,
        googleCalendarId: input.googleCalendarId,
      },
      data: {
        syncEnabled: false,
      },
    });

    return { success: true };
  },
);

/**
 * Trigger a sync for all enabled calendars or a specific one.
 */
export const triggerSync = command(
  TriggerSyncSchema,
  async (input): Promise<{ synced: number; errors: string[] }> => {
    const userId = getAuthenticatedUser();
    const accessToken = await getValidAccessToken(userId);

    // Get calendars to sync
    const calendarsToSync = await prisma.googleCalendarSync.findMany({
      where: {
        userId,
        syncEnabled: true,
        ...(input.googleCalendarId
          ? { googleCalendarId: input.googleCalendarId }
          : {}),
      },
    });

    if (calendarsToSync.length === 0) {
      return { synced: 0, errors: ["No calendars to sync"] };
    }

    // Import sync engine
    const { performSync } = await import(
      "$lib/features/calendar/services/google-calendar/sync-engine.ts"
    );

    let synced = 0;
    const errors: string[] = [];

    for (const calendar of calendarsToSync) {
      try {
        await performSync(
          userId,
          calendar.googleCalendarId,
          accessToken,
          calendar.syncToken,
        );
        synced++;

        // Update last sync time
        await prisma.googleCalendarSync.update({
          where: { id: calendar.id },
          data: {
            lastSyncAt: new Date(),
            lastError: null,
            errorCount: 0,
          },
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown sync error";
        errors.push(`${calendar.calendarName}: ${errorMsg}`);

        // Update error state
        await prisma.googleCalendarSync.update({
          where: { id: calendar.id },
          data: {
            lastError: errorMsg,
            errorCount: { increment: 1 },
          },
        });
      }
    }

    return { synced, errors };
  },
);

/**
 * Disconnect Google Calendar integration.
 * Removes all sync configurations (but keeps synced events).
 */
export const disconnectGoogle = command(
  v.undefined(),
  async (): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();

    // Delete all sync configurations for this user
    await prisma.googleCalendarSync.deleteMany({
      where: { userId },
    });

    // Note: We don't delete the Google account from Better Auth
    // as that would affect login. User can still use Google to login.
    // Synced events remain in the database with syncStatus = "synced"

    return { success: true };
  },
);
