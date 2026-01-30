/**
 * Memo Utilities
 *
 * Shared helper functions for memo remote functions.
 */
import { getRequestEvent } from "$app/server";

/**
 * Get the authenticated user's ID from the request event.
 * Throws if user is not authenticated.
 */
export function getAuthenticatedUser(): string {
  const event = getRequestEvent();
  if (!event.locals.user?.id) {
    throw new Error("Unauthorized");
  }
  return event.locals.user.id;
}
