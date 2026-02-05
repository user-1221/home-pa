/**
 * Google Calendar Sync Remote Functions (Server-side)
 *
 * Server-side Remote Functions for Google Calendar sync operations.
 * Uses GoogleCalendarAccount (independent from Better Auth login)
 * to support multiple Google accounts per user.
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
 * Get a valid access token for a specific GoogleCalendarAccount.
 * Refreshes automatically if expired (with 5-minute buffer).
 */
async function getValidAccessToken(googleAccountId: string): Promise<string> {
  const account = await prisma.googleCalendarAccount.findUnique({
    where: { id: googleAccountId },
  });

  if (!account) {
    throw new Error("Google calendar account not found");
  }

  if (!account.accessToken || !account.refreshToken) {
    throw new Error("Google account tokens missing");
  }

  if (!account.isValid) {
    throw new Error(
      `Google account ${account.email} needs re-authorization: ${account.lastError ?? "unknown error"}`,
    );
  }

  // Check if token expires within 5 minutes (buffer for API call duration)
  const now = new Date();
  const expiresAt = account.accessTokenExpiresAt;
  const bufferMs = 5 * 60 * 1000;
  const isExpired =
    !expiresAt || expiresAt.getTime() - now.getTime() < bufferMs;

  if (!isExpired) {
    return account.accessToken;
  }

  // Refresh the token using googleapis
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: account.refreshToken });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("No access token in refresh response");
    }

    // Update tokens in database
    await prisma.googleCalendarAccount.update({
      where: { id: googleAccountId },
      data: {
        accessToken: credentials.access_token,
        accessTokenExpiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : null,
        isValid: true,
        lastError: null,
      },
    });

    return credentials.access_token;
  } catch (err) {
    // Mark account as invalid on refresh failure
    const errorMsg =
      err instanceof Error ? err.message : "Token refresh failed";
    await prisma.googleCalendarAccount.update({
      where: { id: googleAccountId },
      data: { isValid: false, lastError: errorMsg },
    });
    throw new Error(
      `Failed to refresh token for ${account.email}: ${errorMsg}`,
    );
  }
}

// ============================================================================
// SCHEMAS
// ============================================================================

const ListCalendarsSchema = v.object({
  accountId: v.string(),
});

const EnableSyncSchema = v.object({
  accountId: v.string(),
  calendarIds: v.array(v.string()),
});

const DisableSyncSchema = v.object({
  syncConfigId: v.string(),
});

const TriggerSyncSchema = v.object({
  accountId: v.optional(v.string()),
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

interface GoogleAccountWithCalendars {
  id: string;
  email: string;
  isValid: boolean;
  lastError: string | null;
  calendars: SyncedCalendarResponse[];
}

interface ConnectionCheckResponse {
  accounts: GoogleAccountWithCalendars[];
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
 * Check all connected Google accounts and their synced calendars.
 */
export const checkGoogleConnection = query(
  v.undefined(),
  async (): Promise<ConnectionCheckResponse> => {
    const userId = getAuthenticatedUser();

    const accounts = await prisma.googleCalendarAccount.findMany({
      where: { userId },
      include: {
        syncConfigs: {
          orderBy: { calendarName: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        email: account.email,
        isValid: account.isValid,
        lastError: account.lastError,
        calendars: account.syncConfigs.map((cal) => ({
          id: cal.id,
          googleCalendarId: cal.googleCalendarId,
          calendarName: cal.calendarName,
          calendarColor: cal.calendarColor,
          syncEnabled: cal.syncEnabled,
          lastSyncAt: cal.lastSyncAt?.toISOString() ?? null,
          lastError: cal.lastError,
        })),
      })),
    };
  },
);

/**
 * List available Google calendars for a specific connected account.
 */
export const listGoogleCalendars = query(
  ListCalendarsSchema,
  async (input): Promise<GoogleCalendarListItem[]> => {
    const userId = getAuthenticatedUser();

    // Verify ownership
    const account = await prisma.googleCalendarAccount.findFirst({
      where: { id: input.accountId, userId },
    });
    if (!account) {
      throw new Error("Google account not found");
    }

    const accessToken = await getValidAccessToken(input.accountId);

    const { listCalendars } = await import(
      "$lib/features/calendar/services/google-calendar/google-calendar-api.ts"
    );

    return listCalendars(accessToken);
  },
);

/**
 * Enable sync for selected Google calendars on a specific account.
 */
export const enableCalendarSync = command(
  EnableSyncSchema,
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();

    // Verify ownership
    const account = await prisma.googleCalendarAccount.findFirst({
      where: { id: input.accountId, userId },
    });
    if (!account) {
      throw new Error("Google account not found");
    }

    const accessToken = await getValidAccessToken(input.accountId);

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
          userId_googleAccountId_googleCalendarId: {
            userId,
            googleAccountId: input.accountId,
            googleCalendarId: calendarId,
          },
        },
        create: {
          userId,
          googleAccountId: input.accountId,
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
 * Disable sync for a specific calendar (by sync config ID).
 */
export const disableCalendarSync = command(
  DisableSyncSchema,
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();

    await prisma.googleCalendarSync.updateMany({
      where: {
        id: input.syncConfigId,
        userId,
      },
      data: {
        syncEnabled: false,
      },
    });

    return { success: true };
  },
);

/**
 * Trigger a sync for all enabled calendars across all accounts,
 * or for a specific account.
 */
export const triggerSync = command(
  TriggerSyncSchema,
  async (input): Promise<{ synced: number; errors: string[] }> => {
    const userId = getAuthenticatedUser();

    // Get all valid accounts (or specific one)
    const accounts = await prisma.googleCalendarAccount.findMany({
      where: {
        userId,
        isValid: true,
        ...(input.accountId ? { id: input.accountId } : {}),
      },
      include: {
        syncConfigs: {
          where: { syncEnabled: true },
        },
      },
    });

    if (accounts.length === 0) {
      return { synced: 0, errors: ["No connected Google accounts"] };
    }

    const allSyncConfigs = accounts.flatMap((a) => a.syncConfigs);
    if (allSyncConfigs.length === 0) {
      return { synced: 0, errors: ["No calendars to sync"] };
    }

    // Import sync engine
    const { performSync } = await import(
      "$lib/features/calendar/services/google-calendar/sync-engine.ts"
    );

    let synced = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(account.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Token error";
        errors.push(`${account.email}: ${errorMsg}`);
        continue;
      }

      for (const calendar of account.syncConfigs) {
        try {
          const syncResult = await performSync(
            userId,
            calendar.googleCalendarId,
            accessToken,
            calendar.syncToken,
            calendar.id, // syncConfigId for calendarId/uid scoping
          );

          console.log(`[triggerSync] Calendar "${calendar.calendarName}":`, {
            created: syncResult.created,
            updated: syncResult.updated,
            deleted: syncResult.deleted,
            errors: syncResult.errors,
            newSyncToken: syncResult.newSyncToken ? "received" : "none",
          });

          if (syncResult.created > 0 || syncResult.updated > 0) {
            synced++;
          }

          if (syncResult.errors.length > 0) {
            errors.push(
              ...syncResult.errors.map((e) => `${calendar.calendarName}: ${e}`),
            );
          }

          await prisma.googleCalendarSync.update({
            where: { id: calendar.id },
            data: {
              lastSyncAt: new Date(),
              lastError:
                syncResult.errors.length > 0
                  ? syncResult.errors.join("; ")
                  : null,
              errorCount: syncResult.errors.length > 0 ? { increment: 1 } : 0,
              syncToken: syncResult.newSyncToken ?? undefined,
            },
          });
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Unknown sync error";
          console.error(
            `[triggerSync] Calendar "${calendar.calendarName}" failed:`,
            err,
          );
          errors.push(`${calendar.calendarName}: ${errorMsg}`);

          await prisma.googleCalendarSync.update({
            where: { id: calendar.id },
            data: {
              lastError: errorMsg,
              errorCount: { increment: 1 },
            },
          });
        }
      }
    }

    return { synced, errors };
  },
);
