<script lang="ts">
  /**
   * GoogleCalendarConnect Component
   *
   * Handles Google OAuth connection for calendar sync.
   * Uses Better Auth's social provider to authenticate with Google
   * and obtain calendar access tokens.
   */

  import { authClient } from "$lib/auth-client.ts";
  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";

  const session = authClient.useSession;

  let isConnecting = $state(false);
  let error = $state<string | null>(null);

  // Check if user has linked Google account
  const isGoogleConnected = $derived(googleSyncState.isConnected);

  async function connectGoogle() {
    error = null;
    isConnecting = true;

    try {
      // Use Better Auth's social sign-in with Google
      // This will redirect to Google OAuth and back
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to connect Google";
      isConnecting = false;
    }
  }

  async function disconnectGoogle() {
    error = null;
    isConnecting = true;

    try {
      await googleSyncState.disconnect();
    } catch (err) {
      error =
        err instanceof Error ? err.message : "Failed to disconnect Google";
    } finally {
      isConnecting = false;
    }
  }
</script>

<div class="flex flex-col gap-3">
  {#if !$session.data?.user}
    <!-- Not logged in -->
    <div class="rounded-xl bg-base-200 p-4 text-sm text-base-content/70">
      <p>Sign in to your account first to connect Google Calendar.</p>
    </div>
  {:else if isGoogleConnected}
    <!-- Google Connected -->
    <div class="flex items-center justify-between rounded-xl bg-success/10 p-4">
      <div class="flex items-center gap-3">
        <svg
          class="h-6 w-6 text-success"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <div>
          <p class="font-medium text-success">Google Calendar Connected</p>
          {#if googleSyncState.lastSyncAt}
            <p class="text-xs text-base-content/60">
              Last synced: {googleSyncState.lastSyncAt.toLocaleString()}
            </p>
          {/if}
        </div>
      </div>
      <button
        class="btn text-error btn-ghost btn-sm hover:bg-error/10"
        onclick={disconnectGoogle}
        disabled={isConnecting}
      >
        {isConnecting ? "..." : "Disconnect"}
      </button>
    </div>
  {:else}
    <!-- Not connected -->
    <button
      class="btn w-full gap-3 rounded-xl border border-base-300 bg-base-100 text-base-content shadow-sm transition-all duration-200 hover:bg-base-200"
      onclick={connectGoogle}
      disabled={isConnecting}
    >
      {#if isConnecting}
        <span class="loading loading-sm loading-spinner"></span>
        Connecting...
      {:else}
        <svg class="h-5 w-5" viewBox="0 0 24 24">
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
        Connect Google Calendar
      {/if}
    </button>
  {/if}

  {#if error}
    <div class="rounded-xl bg-error/10 p-3 text-sm text-error">
      {error}
    </div>
  {/if}
</div>
