/**
 * OAuth State Store
 *
 * Provides CSRF protection for OAuth flows using cryptographically random state tokens.
 * State tokens are stored in memory with a TTL and are one-time use.
 */
import { randomUUID } from "crypto";

interface OAuthStateEntry {
  userId: string;
  expiresAt: number;
}

// In-memory store for OAuth state tokens (10-minute TTL)
const oauthStateStore = new Map<string, OAuthStateEntry>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate and store a cryptographically random OAuth state.
 * Returns the state string to be used in the OAuth URL.
 */
export function createOAuthState(userId: string): string {
  // Clean up expired states periodically (every call, simple approach)
  const now = Date.now();
  for (const [state, entry] of oauthStateStore) {
    if (entry.expiresAt < now) {
      oauthStateStore.delete(state);
    }
  }

  const state = randomUUID();
  oauthStateStore.set(state, {
    userId,
    expiresAt: now + STATE_TTL_MS,
  });
  return state;
}

/**
 * Validate and consume an OAuth state token.
 * Returns the userId if valid, null if invalid or expired.
 * The state is deleted after validation (one-time use).
 */
export function validateAndConsumeOAuthState(state: string): string | null {
  const entry = oauthStateStore.get(state);
  if (!entry) {
    return null;
  }

  // Delete immediately (one-time use)
  oauthStateStore.delete(state);

  // Check expiration
  if (entry.expiresAt < Date.now()) {
    return null;
  }

  return entry.userId;
}
