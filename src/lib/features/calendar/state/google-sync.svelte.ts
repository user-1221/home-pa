import { getContext, setContext } from "svelte";
import {
  checkGoogleConnection as _checkGoogleConnection,
  listGoogleCalendars,
  enableCalendarSync,
  disableCalendarSync,
  triggerSync as _triggerSync,
  initiateGoogleConnect as _initiateGoogleConnect,
  removeGoogleAccount as _removeGoogleAccount,
} from "./gcal-sync.ts";

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
 * Represents a connected Google account with its synced calendars
 */
export interface ConnectedGoogleAccount {
  id: string;
  email: string;
  isValid: boolean;
  lastError: string | null;
  calendars: SyncedCalendar[];
}

/**
 * GoogleSyncState manages the state for Google Calendar synchronization.
 * Supports multiple connected Google accounts, each with their own calendars.
 *
 * @scope singleton
 * @owner src/routes/+layout.svelte (via bootstrap)
 * @cleanup none - State persists across navigation
 */
export class GoogleSyncState {
  // Connected accounts with their calendars
  accounts = $state<ConnectedGoogleAccount[]>([]);

  // Loading / error state
  isLoading = $state(false);
  error = $state<string | null>(null);

  // Sync status
  syncStatus = $state<"idle" | "syncing" | "error">("idle");
  lastSyncAt = $state<Date | null>(null);

  /**
   * Whether any Google account is connected.
   */
  get isConnected(): boolean {
    return this.accounts.length > 0;
  }

  /**
   * All calendars across all connected accounts (flattened).
   */
  get allCalendars(): SyncedCalendar[] {
    return this.accounts.flatMap((a) => a.calendars);
  }

  /**
   * Only calendars with syncEnabled: true across all connected accounts.
   * Use this for dropdown displays and event filtering.
   */
  get enabledCalendars(): SyncedCalendar[] {
    return this.accounts.flatMap((a) =>
      a.calendars.filter((c) => c.syncEnabled),
    );
  }

  /**
   * Check if a specific calendar ID is enabled for sync.
   * @param calendarId - The sync config ID (stored on events as calendarId)
   */
  isCalendarEnabled(calendarId: string): boolean {
    return this.enabledCalendars.some((c) => c.id === calendarId);
  }

  /**
   * Check all connected Google accounts and their synced calendars.
   */
  async checkConnection(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const result = await _checkGoogleConnection(undefined);
      this.accounts = result.accounts.map((account) => ({
        ...account,
        calendars: account.calendars.map((cal) => ({
          ...cal,
          lastSyncAt: cal.lastSyncAt ? new Date(cal.lastSyncAt) : null,
        })),
      }));

      // Update lastSyncAt from the most recent calendar sync across all accounts
      const mostRecent = this.allCalendars
        .map((c) => c.lastSyncAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      this.lastSyncAt = mostRecent ?? null;
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : "Failed to check connection";
      this.accounts = [];
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Initiate OAuth flow to connect a new Google account.
   * Redirects the browser to Google's consent screen.
   */
  async connectNewAccount(): Promise<void> {
    this.error = null;
    this.isLoading = true;

    try {
      const { authUrl } = await _initiateGoogleConnect(undefined);
      window.location.href = authUrl;
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : "Failed to start Google connect";
      this.isLoading = false;
    }
  }

  /**
   * Remove a connected Google account and all its sync configurations.
   */
  async removeAccount(accountId: string): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      await _removeGoogleAccount({ accountId });
      await this.checkConnection();
    } catch (err) {
      this.error =
        err instanceof Error ? err.message : "Failed to remove account";
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Fetch available Google calendars for a specific account.
   */
  async fetchAvailableCalendars(
    accountId: string,
  ): Promise<Array<{ id: string; name: string; color: string | null }>> {
    return listGoogleCalendars({ accountId });
  }

  /**
   * Enable sync for selected calendars on a specific account.
   */
  async enableSync(accountId: string, calendarIds: string[]): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      await enableCalendarSync({ accountId, calendarIds });
      await this.checkConnection();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to enable sync";
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Disable sync for a specific calendar (by sync config ID).
   */
  async disableSync(syncConfigId: string): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      await disableCalendarSync({ syncConfigId });
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
   * Trigger a manual sync for all accounts or a specific one.
   */
  async triggerSync(accountId?: string): Promise<void> {
    this.syncStatus = "syncing";
    this.error = null;

    try {
      await _triggerSync({ accountId });
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
