/**
 * Google Calendar API Wrapper
 *
 * Provides type-safe access to Google Calendar API operations.
 * Uses the googleapis library for API calls.
 */
import type { calendar_v3 } from "googleapis";

// ============================================================================
// LAZY GOOGLEAPIS LOADER
// ============================================================================

/**
 * Lazily loaded googleapis instance.
 * Prevents the library from being loaded during build/prerender phase.
 */
let _google: typeof import("googleapis").google | null = null;

async function getGoogle(): Promise<typeof import("googleapis").google> {
  if (!_google) {
    const { google } = await import("googleapis");
    _google = google;
  }
  return _google;
}

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleCalendarListItem {
  id: string;
  name: string;
  color: string | null;
}

export interface GoogleEventListResult {
  events: calendar_v3.Schema$Event[];
  nextSyncToken: string | null;
  nextPageToken: string | null;
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

/**
 * Create an authenticated Google Calendar client.
 */
export async function getCalendarClient(
  accessToken: string,
): Promise<calendar_v3.Calendar> {
  const google = await getGoogle();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

// ============================================================================
// CALENDAR LIST OPERATIONS
// ============================================================================

/**
 * List all calendars accessible by the user.
 */
export async function listCalendars(
  accessToken: string,
): Promise<GoogleCalendarListItem[]> {
  const calendar = await getCalendarClient(accessToken);

  const response = await calendar.calendarList.list({
    minAccessRole: "reader",
  });

  const items = response.data.items ?? [];

  return items
    .filter((item) => item.id && item.summary)
    .map((item) => ({
      id: item.id!,
      name: item.summary!,
      color: item.backgroundColor ?? null,
    }));
}

// ============================================================================
// EVENT OPERATIONS
// ============================================================================

/**
 * List events from a calendar, optionally using a sync token for incremental sync.
 *
 * @param accessToken - OAuth access token
 * @param calendarId - Google Calendar ID (e.g., "primary")
 * @param syncToken - Optional sync token from previous sync
 * @param pageToken - Optional page token for pagination
 * @returns Events and sync token for next incremental sync
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  syncToken?: string | null,
  pageToken?: string | null,
): Promise<GoogleEventListResult> {
  const calendar = await getCalendarClient(accessToken);

  // Build request parameters
  const params: calendar_v3.Params$Resource$Events$List = {
    calendarId,
    maxResults: 250,
    singleEvents: false, // Get recurring events as masters
    showDeleted: true, // Needed for incremental sync
  };

  if (syncToken) {
    // Incremental sync - use sync token
    params.syncToken = syncToken;
  } else {
    // Full sync - set time bounds (past 1 year to future 2 years)
    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setFullYear(timeMin.getFullYear() - 1);
    const timeMax = new Date(now);
    timeMax.setFullYear(timeMax.getFullYear() + 2);

    params.timeMin = timeMin.toISOString();
    params.timeMax = timeMax.toISOString();
  }

  if (pageToken) {
    params.pageToken = pageToken;
  }

  try {
    const response = await calendar.events.list(params);

    return {
      events: response.data.items ?? [],
      nextSyncToken: response.data.nextSyncToken ?? null,
      nextPageToken: response.data.nextPageToken ?? null,
    };
  } catch (error) {
    // Handle 410 GONE - sync token expired
    if (isGoogleApiError(error) && error.code === 410) {
      throw new SyncTokenExpiredError(
        "Sync token expired. Full sync required.",
      );
    }
    throw error;
  }
}

/**
 * Get a single event by ID.
 */
export async function getEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<calendar_v3.Schema$Event | null> {
  const calendar = await getCalendarClient(accessToken);

  try {
    const response = await calendar.events.get({
      calendarId,
      eventId,
    });
    return response.data;
  } catch (error) {
    if (isGoogleApiError(error) && error.code === 404) {
      return null;
    }
    throw error;
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Custom error for expired sync tokens.
 */
export class SyncTokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncTokenExpiredError";
  }
}

/**
 * Type guard for Google API errors.
 */
interface GoogleApiError {
  code: number;
  message: string;
}

function isGoogleApiError(error: unknown): error is GoogleApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as GoogleApiError).code === "number"
  );
}
