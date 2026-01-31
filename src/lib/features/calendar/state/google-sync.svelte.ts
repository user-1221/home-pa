import { getContext, setContext } from "svelte";

/**
 * Represents a synced Google Calendar
 */
export interface SyncedCalendar {
  id: string;
  googleCalendarId: string;
  calendarName: string;
  calendarColor: string | null;
  syncEnabled: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
}

/**
 * GoogleSyncState manages the state for Google Calendar synchronization.
 *
 * @scope singleton
 * @owner src/routes/+layout.svelte (via bootstrap)
 * @cleanup none - State persists across navigation
 */
export class GoogleSyncState {
  // Connection status
  isConnected = $state(false);
  isLoading = $state(false);
  error = $state<string | null>(null);

  // Synced calendars
  calendars = $state<SyncedCalendar[]>([]);

  // Sync status
  syncStatus = $state<"idle" | "syncing" | "error">("idle");
  lastSyncAt = $state<Date | null>(null);

  /**
   * Check if Google Calendar is connected by looking for
   * a Google account linked to the current user.
   */
  async checkConnection(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const { checkGoogleConnection } = await import("./google-sync.remote.ts");
      const result = await checkGoogleConnection(undefined);
      this.isConnected = result.isConnected;
      this.calendars = result.calendars.map((cal) => ({
        ...cal,
        lastSyncAt: cal.lastSyncAt ? new Date(cal.lastSyncAt) : null,
      }));

      // Update lastSyncAt from the most recent calendar sync
      const mostRecent = this.calendars
        .map((c) => c.lastSyncAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      this.lastSyncAt = mostRecent ?? null;
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : "Failed to check connection";
      this.isConnected = false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Fetch available Google calendars for the connected account.
   */
  async fetchAvailableCalendars(): Promise<
    Array<{ id: string; name: string; color: string | null }>
  > {
    const { listGoogleCalendars } = await import("./google-sync.remote.ts");
    return listGoogleCalendars(undefined);
  }

  /**
   * Enable sync for selected calendars.
   */
  async enableSync(calendarIds: string[]): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const { enableCalendarSync } = await import("./google-sync.remote.ts");
      await enableCalendarSync({ calendarIds });
      await this.checkConnection();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to enable sync";
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Disable sync for a specific calendar.
   */
  async disableSync(googleCalendarId: string): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const { disableCalendarSync } = await import("./google-sync.remote.ts");
      await disableCalendarSync({ googleCalendarId });
      await this.checkConnection();
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : "Failed to disable sync";
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Trigger a manual sync for all enabled calendars or a specific one.
   */
  async triggerSync(googleCalendarId?: string): Promise<void> {
    this.syncStatus = "syncing";
    this.error = null;

    try {
      const { triggerSync } = await import("./google-sync.remote.ts");
      await triggerSync({ googleCalendarId });
      this.lastSyncAt = new Date();
      this.syncStatus = "idle";
      await this.checkConnection();
    } catch (err) {
      this.syncStatus = "error";
      this.error = err instanceof Error ? err.message : "Sync failed";
      throw err;
    }
  }

  /**
   * Disconnect Google Calendar integration.
   */
  async disconnect(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const { disconnectGoogle } = await import("./google-sync.remote.ts");
      await disconnectGoogle(undefined);
      this.isConnected = false;
      this.calendars = [];
      this.lastSyncAt = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to disconnect";
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Clear any error state.
   */
  clearError(): void {
    this.error = null;
    if (this.syncStatus === "error") {
      this.syncStatus = "idle";
    }
  }
}

// Singleton instance for app-wide use
export const googleSyncState = new GoogleSyncState();

// Context-based access (alternative pattern)
const GOOGLE_SYNC_STATE_KEY = Symbol("google-sync-state");

export function setGoogleSyncState(state: GoogleSyncState): void {
  setContext(GOOGLE_SYNC_STATE_KEY, state);
}

export function getGoogleSyncState(): GoogleSyncState {
  const state = getContext<GoogleSyncState | undefined>(GOOGLE_SYNC_STATE_KEY);
  if (!state) {
    throw new Error("GoogleSyncState not found in context.");
  }
  return state;
}
