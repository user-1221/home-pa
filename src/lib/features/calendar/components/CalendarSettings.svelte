<script lang="ts">
  /**
   * CalendarSettings Component
   *
   * Provides import/export functionality for calendar events and
   * Google Calendar sync management with multi-account support.
   */

  import { calendarState } from "$lib/bootstrap/index.svelte.ts";
  import { UserSettings } from "$lib/features/shared/components/index.ts";
  import GoogleCalendarConnect from "./GoogleCalendarConnect.svelte";
  import CalendarSelector from "./CalendarSelector.svelte";
  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";
  import { onMount } from "svelte";

  // State
  let importing = $state(false);
  let importResult = $state<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  let fileInputRef: HTMLInputElement | undefined = $state();
  let showAdvanced = $state(false);
  let exportName = $state("flumen Calendar");

  // API mode is always enabled when using calendarState (API-based store)
  const isApiEnabled = $state(true);

  // Google Calendar Sync state
  let calendarSelectorAccount = $state<{
    id: string;
    email: string;
  } | null>(null);
  let isSyncing = $state(false);
  let syncError = $state<string | null>(null);

  // Check Google connection on mount
  onMount(() => {
    googleSyncState.checkConnection();
  });

  async function handleSync() {
    isSyncing = true;
    syncError = null;
    try {
      await googleSyncState.triggerSync();
      // Refresh calendar events after sync
      const window = calendarState.currentWindow;
      calendarState.clear();
      if (window) {
        await calendarState.fetchEvents(window.start, window.end);
      }
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Sync failed";
    } finally {
      isSyncing = false;
    }
  }

  function openCalendarSelector(accountId: string, accountEmail: string) {
    calendarSelectorAccount = { id: accountId, email: accountEmail };
  }

  function closeCalendarSelector() {
    calendarSelectorAccount = null;
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
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
      // Reset file input
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

  const hasAnySyncedCalendars = $derived(
    googleSyncState.allCalendars.length > 0,
  );
</script>

<div class="mx-auto max-w-[600px]">
  <!-- Account Section -->
  <section
    class="to-primary-focus mb-4 rounded-xl bg-gradient-to-br from-primary p-6 text-primary-content shadow-lg"
  >
    <h3 class="mb-3 text-xl font-normal text-primary-content">Account</h3>
    <UserSettings />
  </section>

  <!-- Import Section -->
  <section
    class="mb-4 rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm"
  >
    <h3 class="mb-2 text-xl font-normal text-base-content">Import Calendar</h3>
    <p class="mb-4 text-sm text-base-content/70">
      Import events from Google Calendar, Apple Calendar, or any .ics file.
    </p>

    <input
      type="file"
      accept=".ics,text/calendar"
      onchange={handleFileSelect}
      bind:this={fileInputRef}
      class="hidden"
      disabled={importing || !isApiEnabled}
    />

    <button
      class="btn w-full rounded-xl border border-base-300 bg-base-200 text-base-content/70 shadow-sm transition-all duration-200 hover:bg-base-200/80 hover:text-base-content disabled:opacity-50"
      onclick={triggerFileInput}
      disabled={importing || !isApiEnabled}
    >
      {#if importing}
        <span class="loading loading-sm loading-spinner"></span>
        Importing...
      {:else}
        Select .ics File
      {/if}
    </button>

    {#if importResult}
      <div
        class="relative mt-4 rounded-xl border p-4 {importResult.errors.length >
        0
          ? 'border-error/30 bg-error/10'
          : 'border-success/30 bg-success/10'}"
      >
        <button
          class="btn absolute top-2 right-2 h-8 min-h-8 w-8 rounded-lg p-0 text-base-content/70 btn-ghost btn-xs hover:bg-base-200"
          onclick={clearImportResult}>×</button
        >

        {#if importResult.imported > 0}
          <p class="my-1 text-success">
            Imported {importResult.imported} events
          </p>
        {/if}

        {#if importResult.skipped > 0}
          <p class="my-1 text-primary">
            Skipped {importResult.skipped} duplicates
          </p>
        {/if}

        {#if importResult.errors.length > 0}
          <div class="mt-2">
            <p class="font-medium text-error">Errors:</p>
            <ul class="mt-2 ml-4 list-disc text-sm text-error">
              {#each importResult.errors as error, idx (idx)}
                <li>{error}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Export Section -->
  <section
    class="mb-4 rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm"
  >
    <h3 class="mb-2 text-xl font-normal text-base-content">Export Calendar</h3>
    <p class="mb-4 text-sm text-base-content/70">
      Download all your events as an .ics file for backup or import into other
      apps.
    </p>

    <button
      class="btn mb-3 h-auto min-h-0 border-none bg-transparent p-0 text-sm font-medium text-base-content/70 hover:bg-transparent hover:text-primary"
      onclick={() => (showAdvanced = !showAdvanced)}
    >
      {showAdvanced ? "▼" : "▶"} Advanced Options
    </button>

    {#if showAdvanced}
      <div class="mb-4 rounded-xl bg-base-200 p-4">
        <label class="flex flex-col gap-2">
          <span class="text-sm font-medium text-base-content/70"
            >Calendar Name</span
          >
          <input
            type="text"
            class="input w-full rounded-xl border-base-300 bg-base-100 px-4 py-2.5 text-sm text-base-content focus:border-primary focus:ring-2 focus:ring-primary/20"
            bind:value={exportName}
            placeholder="flumen Calendar"
          />
        </label>
      </div>
    {/if}

    <button
      class="btn w-full rounded-xl border border-base-300 bg-base-200 text-base-content/70 shadow-sm transition-all duration-200 hover:bg-base-200/80 hover:text-base-content disabled:opacity-50"
      onclick={handleExport}
      disabled={!isApiEnabled}
    >
      Download .ics File
    </button>
  </section>

  <!-- Google Calendar Sync -->
  <section class="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm">
    <h3 class="mb-2 text-xl font-normal text-base-content">
      Google Calendar Sync
    </h3>
    <p class="mb-4 text-sm text-base-content/70">
      Connect Google accounts to sync their calendars. You can add multiple
      accounts.
    </p>

    <GoogleCalendarConnect />

    {#if googleSyncState.isConnected}
      <!-- Per-Account Calendars -->
      {#each googleSyncState.accounts as account (account.id)}
        {#if account.calendars.length > 0}
          <div class="mt-4 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-base-content">
                {account.email}
              </span>
              <button
                class="btn text-primary btn-ghost btn-xs"
                onclick={() => openCalendarSelector(account.id, account.email)}
              >
                Manage
              </button>
            </div>
            <div class="space-y-1">
              {#each account.calendars as calendar (calendar.id)}
                <div
                  class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm"
                >
                  {#if calendar.calendarColor}
                    <span
                      class="h-3 w-3 rounded-full"
                      style="background-color: {calendar.calendarColor}"
                    ></span>
                  {/if}
                  <span class="flex-1 truncate">{calendar.calendarName}</span>
                  {#if calendar.lastError}
                    <span class="text-xs text-error" title={calendar.lastError}
                      >Error</span
                    >
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="mt-4">
            <button
              class="btn w-full btn-sm btn-primary"
              onclick={() => openCalendarSelector(account.id, account.email)}
            >
              Select Calendars for {account.email}
            </button>
          </div>
        {/if}
      {/each}

      <!-- Sync Button -->
      <div class="mt-4 flex items-center gap-3">
        <button
          class="btn flex-1 rounded-xl border border-base-300 bg-base-200 text-base-content/70 shadow-sm transition-all duration-200 hover:bg-base-200/80 hover:text-base-content disabled:opacity-50"
          onclick={handleSync}
          disabled={isSyncing || !hasAnySyncedCalendars}
        >
          {#if isSyncing}
            <span class="loading loading-sm loading-spinner"></span>
            Syncing...
          {:else}
            Sync All
          {/if}
        </button>
      </div>

      {#if googleSyncState.lastSyncAt}
        <p class="mt-2 text-xs text-base-content/50">
          Last synced: {googleSyncState.lastSyncAt.toLocaleString()}
        </p>
      {/if}

      {#if syncError}
        <div class="mt-2 rounded-lg bg-error/10 p-2 text-sm text-error">
          {syncError}
        </div>
      {/if}
    {/if}
  </section>
</div>

<!-- Calendar Selector Modal -->
{#if calendarSelectorAccount}
  <CalendarSelector
    accountId={calendarSelectorAccount.id}
    accountEmail={calendarSelectorAccount.email}
    onClose={closeCalendarSelector}
  />
{/if}
