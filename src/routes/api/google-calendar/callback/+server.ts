/**
 * Google Calendar OAuth Callback
 *
 * Handles the redirect from Google after OAuth consent.
 * Exchanges the authorization code for tokens and creates/updates
 * a GoogleCalendarAccount record.
 *
 * Must be a +server.ts (not a Remote Function) because Google
 * redirects the browser here.
 */
import { redirect, type RequestHandler } from "@sveltejs/kit";
import { prisma } from "$lib/server/prisma";
import { encryptToken } from "$lib/server/crypto.ts";
import { validateAndConsumeOAuthState } from "$lib/server/oauth-state.ts";

function getBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.BASE_URL ??
    "http://localhost:5173"
  );
}

export const GET: RequestHandler = async ({ url, locals }) => {
  // 1. Verify user is authenticated
  const user = locals.user;
  if (!user?.id) {
    throw redirect(302, "/auth");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Handle user denial or errors from Google
  if (error) {
    console.error("[google-calendar/callback] OAuth error:", error);
    throw redirect(302, "/calendar?google_error=denied");
  }

  if (!code) {
    console.error("[google-calendar/callback] Missing authorization code");
    throw redirect(302, "/calendar?google_error=missing_code");
  }

  // 2. Verify state using cryptographically secure validation (CSRF protection)
  // State must be a valid, non-expired token that was created for this user
  if (!state) {
    console.error("[google-calendar/callback] Missing state parameter");
    throw redirect(302, "/calendar?google_error=state_mismatch");
  }

  const stateUserId = validateAndConsumeOAuthState(state);
  if (!stateUserId) {
    console.error("[google-calendar/callback] Invalid or expired state token");
    throw redirect(302, "/calendar?google_error=state_mismatch");
  }

  // Verify the state was created for the currently authenticated user
  if (stateUserId !== user.id) {
    console.error("[google-calendar/callback] State belongs to different user");
    throw redirect(302, "/calendar?google_error=state_mismatch");
  }

  try {
    // 3. Exchange code for tokens
    const { google } = await import("googleapis");
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${getBaseUrl()}/api/google-calendar/callback`,
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      console.error(
        "[google-calendar/callback] Missing tokens in response",
        Object.keys(tokens),
      );
      throw redirect(302, "/calendar?google_error=missing_tokens");
    }

    // 4. Get Google user info from id_token or userinfo endpoint
    let googleSub: string;
    let googleEmail: string;

    if (tokens.id_token) {
      // Decode JWT payload (no verification needed — tokens came from Google directly)
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split(".")[1], "base64url").toString(
          "utf-8",
        ),
      ) as { sub: string; email: string };
      googleSub = payload.sub;
      googleEmail = payload.email;
    } else {
      // Fallback: call userinfo endpoint
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      if (!userInfo.data.id || !userInfo.data.email) {
        throw new Error("Failed to get Google user info");
      }
      googleSub = userInfo.data.id;
      googleEmail = userInfo.data.email;
    }

    // 5. Encrypt tokens before storing
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    // 6. Upsert GoogleCalendarAccount
    await prisma.googleCalendarAccount.upsert({
      where: {
        userId_googleAccountId: {
          userId: user.id,
          googleAccountId: googleSub,
        },
      },
      create: {
        userId: user.id,
        googleAccountId: googleSub,
        email: googleEmail,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        accessTokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        scope: tokens.scope ?? null,
        isValid: true,
        lastError: null,
      },
      update: {
        email: googleEmail,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        accessTokenExpiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        scope: tokens.scope ?? null,
        isValid: true,
        lastError: null,
      },
    });

    console.log(
      `[google-calendar/callback] Connected Google account ${googleEmail} for user ${user.id}`,
    );

    // 7. Redirect back to settings
    throw redirect(302, "/calendar?google_connected=1");
  } catch (err) {
    // Re-throw redirects
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }

    console.error("[google-calendar/callback] Error:", err);
    throw redirect(302, "/calendar?google_error=exchange_failed");
  }
};
