<script lang="ts">
  /**
   * GoogleCalendarConnect Component
   *
   * Manages multiple Google account connections for calendar sync.
   * Uses a custom OAuth flow (independent from Better Auth login).
   */

  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";

  let isConnecting = $state(false);
  let removingAccountId = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function connectGoogle() {
    error = null;
    isConnecting = true;

    try {
      await googleSyncState.connectNewAccount();
      // Browser will redirect to Google OAuth — no further code runs
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to connect Google";
      isConnecting = false;
    }
  }

  async function removeAccount(accountId: string) {
    error = null;
    removingAccountId = accountId;

    try {
      await googleSyncState.removeAccount(accountId);
    } catch (err) {
      error =
        err instanceof Error ? err.message : "Failed to disconnect Google";
    } finally {
      removingAccountId = null;
    }
  }
</script>

<div class="flex flex-col gap-3">
  {#if googleSyncState.accounts.length > 0}
    <!-- Connected Accounts List -->
    {#each googleSyncState.accounts as account (account.id)}
      <div
        class="flex items-center justify-between rounded-xl p-3 {account.isValid
          ? 'bg-success/10'
          : 'bg-warning/10'}"
      >
        <div class="flex min-w-0 items-center gap-3">
          <svg
            class="h-5 w-5 flex-shrink-0 {account.isValid
              ? 'text-success'
              : 'text-warning'}"
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
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-base-content">
              {account.email}
            </p>
            {#if !account.isValid}
              <p class="text-xs text-warning">Needs re-authorization</p>
            {/if}
          </div>
        </div>
        <button
          class="btn flex-shrink-0 text-error btn-ghost btn-xs hover:bg-error/10"
          onclick={() => removeAccount(account.id)}
          disabled={removingAccountId === account.id}
        >
          {removingAccountId === account.id ? "..." : "Remove"}
        </button>
      </div>
    {/each}
  {/if}

  <!-- Add Account Button -->
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
      {googleSyncState.accounts.length > 0
        ? "Add Another Google Account"
        : "Connect Google Calendar"}
    {/if}
  </button>

  {#if error}
    <div class="rounded-xl bg-error/10 p-3 text-sm text-error">
      {error}
    </div>
  {/if}
</div>
