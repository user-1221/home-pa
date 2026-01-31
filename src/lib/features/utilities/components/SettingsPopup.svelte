<script lang="ts">
  /**
   * SettingsPopup Component
   *
   * Modal popup for app settings including account, import/export.
   * Opens from settings icon in UtilitiesView.
   */

  import { calendarState, settingsState } from "$lib/bootstrap/index.svelte.ts";
  import {
    UserSettings,
    Button,
  } from "$lib/features/shared/components/index.ts";
  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";
  import { authClient } from "$lib/auth-client.ts";
  import CalendarSelector from "$lib/features/calendar/components/CalendarSelector.svelte";
  import { onMount } from "svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  const { open, onClose }: Props = $props();

  // Import/Export State
  let importing = $state(false);
  let importResult = $state<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  let fileInputRef: HTMLInputElement | undefined = $state();
  let showAdvanced = $state(false);
  let exportName = $state("Home-PA Calendar");

  const isApiEnabled = $state(true);

  // Tab state
  type Tab = "account" | "data";
  let activeTab = $state<Tab>("account");

  // Google Calendar Sync state
  let showCalendarSelector = $state(false);
  let isSyncing = $state(false);
  let syncError = $state<string | null>(null);
  const session = authClient.useSession;

  // Check Google connection when popup opens
  $effect(() => {
    if (open) {
      googleSyncState.checkConnection();
    }
  });

  async function connectGoogle() {
    try {
      // Use linkSocial to link Google to current user (not signIn.social which could create new account)
      await authClient.linkSocial({
        provider: "google",
        callbackURL: window.location.href,
      });
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Failed to connect";
    }
  }

  async function handleSync() {
    isSyncing = true;
    syncError = null;
    try {
      await googleSyncState.triggerSync();
      calendarState.clear();
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Sync failed";
    } finally {
      isSyncing = false;
    }
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!file.name.endsWith(".ics") && file.type !== "text/calendar") {
      importResult = {
        imported: 0,
        skipped: 0,
        errors: ["Please select a valid .ics file"],
      };
      return;
    }

    importing = true;
    importResult = null;

    try {
      const result = await calendarState.importICS(file);
      importResult = result;
    } catch (error) {
      importResult = {
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Import failed"],
      };
    } finally {
      importing = false;
      if (fileInputRef) {
        fileInputRef.value = "";
      }
    }
  }

  function handleExport() {
    const url = calendarState.getExportUrl(undefined, undefined, exportName);
    window.location.href = url;
  }

  function triggerFileInput() {
    fileInputRef?.click();
  }

  function clearImportResult() {
    importResult = null;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2100] md:modal-middle"
    role="button"
    tabindex="-1"
    aria-label="Close settings"
    onclick={handleBackdropClick}
  >
    <div class="modal-box max-h-[85vh] w-full max-w-lg p-0 md:max-h-[85vh]">
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-base-300 p-4"
      >
        <div class="flex items-center gap-3">
          <span class="text-xl">⚙️</span>
          <h2 class="text-xl font-medium">Settings</h2>
        </div>
        <Button variant="ghost" size="sm" onclick={onClose} aria-label="Close">
          ×
        </Button>
      </div>

      <!-- Tabs -->
      <div role="tablist" class="tabs-bordered tabs">
        <button
          role="tab"
          class="tab flex-1 {activeTab === 'account' ? 'tab-active' : ''}"
          onclick={() => (activeTab = "account")}
        >
          Account
        </button>
        <button
          role="tab"
          class="tab flex-1 {activeTab === 'data' ? 'tab-active' : ''}"
          onclick={() => (activeTab = "data")}
        >
          Import / Export
        </button>
      </div>

      <!-- Content -->
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        {#if activeTab === "account"}
          <!-- Account Tab -->
          <div class="flex flex-col gap-4">
            <div
              class="card bg-gradient-to-br from-primary to-primary/80 text-primary-content shadow-lg"
            >
              <div class="card-body p-5">
                <UserSettings />
              </div>
            </div>

            <!-- Active Hours Setting -->
            <div class="card bg-base-200 card-sm">
              <div class="card-body gap-2 p-4">
                <h3 class="card-title text-base">Active Hours</h3>
                <p class="text-sm text-[var(--color-text-secondary)]">
                  Set your active hours for task scheduling in the Assistant
                  view.
                </p>
                <div class="flex items-center gap-2">
                  <input
                    type="time"
                    value={settingsState.activeStartTime}
                    onchange={(
                      e: Event & { currentTarget: HTMLInputElement },
                    ) =>
                      settingsState.setActiveStartTime(e.currentTarget.value)}
                    class="input-bordered input input-sm w-32"
                  />
                  <span class="text-sm text-[var(--color-text-muted)]">–</span>
                  <input
                    type="time"
                    value={settingsState.activeEndTime}
                    onchange={(
                      e: Event & { currentTarget: HTMLInputElement },
                    ) => settingsState.setActiveEndTime(e.currentTarget.value)}
                    class="input-bordered input input-sm w-32"
                  />
                </div>
              </div>
            </div>
          </div>
        {:else}
          <!-- Import/Export Tab -->
          <div class="flex flex-col gap-4">
            <!-- Import Section -->
            <div class="card bg-base-200 card-sm">
              <div class="card-body gap-2 p-4">
                <h3 class="card-title text-base">Import Calendar</h3>
                <p class="text-sm text-[var(--color-text-secondary)]">
                  Import events from Google Calendar, Apple Calendar, or any
                  .ics file.
                </p>

                <input
                  type="file"
                  accept=".ics,text/calendar"
                  onchange={handleFileSelect}
                  bind:this={fileInputRef}
                  class="hidden"
                  disabled={importing || !isApiEnabled}
                />

                <Button
                  variant="secondary"
                  fullWidth
                  onclick={triggerFileInput}
                  disabled={importing || !isApiEnabled}
                  loading={importing}
                >
                  {#if importing}
                    Importing...
                  {:else}
                    📁 Select .ics File
                  {/if}
                </Button>

                {#if importResult}
                  <div
                    class="mt-3 alert {importResult.errors.length > 0
                      ? 'alert-error'
                      : 'alert-success'}"
                  >
                    <div class="flex-1">
                      {#if importResult.imported > 0}
                        <p>✓ Imported {importResult.imported} events</p>
                      {/if}
                      {#if importResult.skipped > 0}
                        <p>Skipped {importResult.skipped} duplicates</p>
                      {/if}
                      {#if importResult.errors.length > 0}
                        {#each importResult.errors as error, idx (idx)}
                          <p>{error}</p>
                        {/each}
                      {/if}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={clearImportResult}>×</Button
                    >
                  </div>
                {/if}
              </div>
            </div>

            <!-- Export Section -->
            <div class="card bg-base-200 card-sm">
              <div class="card-body gap-2 p-4">
                <h3 class="card-title text-base">Export Calendar</h3>
                <p class="text-sm text-[var(--color-text-secondary)]">
                  Download all your events as an .ics file.
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  class="justify-start"
                  onclick={() => (showAdvanced = !showAdvanced)}
                >
                  {showAdvanced ? "▼" : "▶"} Advanced
                </Button>

                {#if showAdvanced}
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text text-xs">Calendar Name</span>
                    </label>
                    <input
                      type="text"
                      class="input-bordered input input-sm"
                      bind:value={exportName}
                      placeholder="Home-PA Calendar"
                    />
                  </div>
                {/if}

                <Button
                  variant="secondary"
                  fullWidth
                  onclick={handleExport}
                  disabled={!isApiEnabled}
                >
                  📥 Download .ics File
                </Button>
              </div>
            </div>

            <!-- Google Calendar Sync -->
            <div class="card bg-base-200 card-sm">
              <div class="card-body gap-3 p-4">
                <h3 class="card-title text-base">Google Calendar Sync</h3>
                <p class="text-sm text-[var(--color-text-secondary)]">
                  Sync events from your Google Calendar automatically.
                </p>

                {#if !$session.data?.user}
                  <p class="text-sm text-base-content/60">
                    Sign in to your account first to connect Google Calendar.
                  </p>
                {:else if googleSyncState.isConnected}
                  <!-- Connected State -->
                  <div class="flex items-center gap-2 text-sm text-success">
                    <svg
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                    </svg>
                    <span>Google Calendar Connected</span>
                  </div>

                  {#if googleSyncState.calendars.length > 0}
                    <div class="space-y-1">
                      {#each googleSyncState.calendars as calendar (calendar.id)}
                        <div class="flex items-center gap-2 text-sm">
                          {#if calendar.calendarColor}
                            <span
                              class="h-3 w-3 rounded-full"
                              style="background-color: {calendar.calendarColor}"
                            ></span>
                          {/if}
                          <span class="truncate">{calendar.calendarName}</span>
                        </div>
                      {/each}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => (showCalendarSelector = true)}
                    >
                      Manage Calendars
                    </Button>
                  {:else}
                    <Button
                      variant="primary"
                      size="sm"
                      onclick={() => (showCalendarSelector = true)}
                    >
                      Select Calendars to Sync
                    </Button>
                  {/if}

                  <Button
                    variant="secondary"
                    fullWidth
                    onclick={handleSync}
                    disabled={isSyncing ||
                      googleSyncState.calendars.length === 0}
                    loading={isSyncing}
                  >
                    {isSyncing ? "Syncing..." : "🔄 Sync Now"}
                  </Button>

                  {#if googleSyncState.lastSyncAt}
                    <p class="text-xs text-base-content/50">
                      Last synced: {googleSyncState.lastSyncAt.toLocaleString()}
                    </p>
                  {/if}
                {:else}
                  <!-- Not Connected -->
                  <Button variant="secondary" fullWidth onclick={connectGoogle}>
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
                  </Button>
                {/if}

                {#if syncError}
                  <div class="alert alert-error text-sm">
                    {syncError}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
    <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
  </div>
{/if}

{#if showCalendarSelector}
  <CalendarSelector onClose={() => (showCalendarSelector = false)} />
{/if}
