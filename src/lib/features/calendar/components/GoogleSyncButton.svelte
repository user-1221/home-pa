<script lang="ts">
  /**
   * GoogleSyncButton Component
   *
   * Compact icon button for Google Calendar sync in the header bar.
   * Shows connect button if not connected, sync button if connected.
   *
   * @scope page
   * @owner CalendarView.svelte
   */

  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";
  import { calendarState } from "$lib/bootstrap/index.svelte.ts";
  import { goto } from "$app/navigation";

  let isConnecting = $state(false);

  const isConnected = $derived(googleSyncState.isConnected);
  const isSyncing = $derived(googleSyncState.syncStatus === "syncing");
  const hasError = $derived(googleSyncState.syncStatus === "error");
  const isLoading = $derived(googleSyncState.isLoading);

  function formatLastSync(date: Date | null): string {
    if (!date) return "";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  const lastSyncText = $derived(formatLastSync(googleSyncState.lastSyncAt));

  function getTooltip(): string {
    if (!isConnected) return "Connect Google Calendar";
    if (isSyncing) return "Syncing...";
    if (hasError) {
      return `Sync failed: ${googleSyncState.error ?? "Unknown error"}. Click to retry.`;
    }
    if (lastSyncText) return `Sync now (last: ${lastSyncText})`;
    return "Sync now";
  }

  async function handleConnect() {
    isConnecting = true;
    try {
      // Redirect to settings page where user can add Google accounts
      await goto("/calendar/settings");
    } catch {
      isConnecting = false;
    }
  }

  async function handleSync() {
    try {
      await googleSyncState.triggerSync();
      const window = calendarState.currentWindow;
      calendarState.clear();
      if (window) {
        await calendarState.fetchEvents(window.start, window.end);
      }
    } catch {
      // Error captured in googleSyncState
    }
  }
</script>

{#if !isConnected}
  <!-- Connect button -->
  <button
    class="btn btn-square btn-ghost btn-sm md:btn-xs"
    onclick={handleConnect}
    title={getTooltip()}
    disabled={isLoading || isConnecting}
    aria-label="Connect Google Calendar"
  >
    {#if isLoading || isConnecting}
      <span class="loading loading-sm loading-spinner md:loading-xs"></span>
    {:else}
      <!-- Google "G" multicolor icon -->
      <svg class="h-5 w-5 md:h-4 md:w-4" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    {/if}
  </button>
{:else}
  <!-- Sync button -->
  <button
    class="btn btn-square btn-ghost btn-sm md:btn-xs {hasError
      ? 'text-error'
      : ''}"
    onclick={handleSync}
    title={getTooltip()}
    disabled={isSyncing}
    aria-label={isSyncing ? "Syncing" : "Sync Google Calendar"}
  >
    {#if isSyncing}
      <span class="loading loading-sm loading-spinner md:loading-xs"></span>
    {:else}
      <!-- Refresh/sync icon -->
      <svg
        class="h-5 w-5 md:h-4 md:w-4 {hasError ? '' : 'text-base-content/70'}"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    {/if}
  </button>
{/if}
