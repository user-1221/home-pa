/**
 * Google Calendar Account Remote Functions (Server-side)
 *
 * Manages independent Google account connections for calendar sync.
 * Decoupled from Better Auth login - users can connect multiple Google accounts.
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";
import { createOAuthState } from "$lib/server/oauth-state.ts";

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
// HELPER - Lazy googleapis import
// ============================================================================

let _google: (typeof import("googleapis"))["google"] | null = null;
async function getGoogle() {
  if (!_google) {
    const { google } = await import("googleapis");
    _google = google;
  }
  return _google;
}

function getBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.BASE_URL ??
    "http://localhost:5173"
  );
}

// ============================================================================
// SCHEMAS
// ============================================================================

const RemoveAccountSchema = v.object({
  accountId: v.string(),
});

// ============================================================================
// TYPES
// ============================================================================

interface GoogleAccountResponse {
  id: string;
  email: string;
  isValid: boolean;
  lastError: string | null;
  calendarCount: number;
}

// ============================================================================
// REMOTE FUNCTIONS
// ============================================================================

/**
 * Generate a Google OAuth URL for connecting a new calendar account.
 * Returns the URL that the client should redirect to.
 */
export const initiateGoogleConnect = command(
  v.undefined(),
  async (): Promise<{ authUrl: string }> => {
    const userId = getAuthenticatedUser();

    const google = await getGoogle();
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${getBaseUrl()}/api/google-calendar/callback`,
    );

    // Generate cryptographically random state for CSRF protection
    const state = createOAuthState(userId);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      state,
    });

    return { authUrl };
  },
);

/**
 * List all connected Google accounts for the current user.
 */
export const listGoogleAccounts = query(
  v.undefined(),
  async (): Promise<GoogleAccountResponse[]> => {
    const userId = getAuthenticatedUser();

    const accounts = await prisma.googleCalendarAccount.findMany({
      where: { userId },
      include: { _count: { select: { syncConfigs: true } } },
      orderBy: { createdAt: "asc" },
    });

    return accounts.map((account) => ({
      id: account.id,
      email: account.email,
      isValid: account.isValid,
      lastError: account.lastError,
      calendarCount: account._count.syncConfigs,
    }));
  },
);

/**
 * Remove a connected Google account and all its sync configurations.
 * Synced events remain in the database.
 */
export const removeGoogleAccount = command(
  RemoveAccountSchema,
  async (input): Promise<{ success: boolean }> => {
    const userId = getAuthenticatedUser();

    // Verify ownership before deleting
    const account = await prisma.googleCalendarAccount.findFirst({
      where: { id: input.accountId, userId },
    });

    if (!account) {
      throw new Error("Google account not found");
    }

    // Cascade deletes sync configs via Prisma relation
    await prisma.googleCalendarAccount.delete({
      where: { id: input.accountId },
    });

    return { success: true };
  },
);
