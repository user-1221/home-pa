<script lang="ts">
  /**
   * CalendarSettings Component
   *
   * Provides import/export functionality for calendar events
   * Uses ical.js-backed API endpoints
   */

  import { calendarActions } from "$lib/bootstrap/compat.svelte.ts";
  import { UserSettings } from "$lib/features/shared/components/index.ts";

  // State
  let importing = $state(false);
  let importResult = $state<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  let fileInputRef: HTMLInputElement | undefined = $state();
  let showAdvanced = $state(false);
  let exportName = $state("Home-PA Calendar");

  // API mode is always enabled when using calendarActions (API-based store)
  const isApiEnabled = $state(true);

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
      const result = await calendarActions.importICS(file);
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
    const url = calendarActions.getExportUrl(undefined, undefined, exportName);
    window.location.href = url;
  }

  function triggerFileInput() {
    fileInputRef?.click();
  }

  function clearImportResult() {
    importResult = null;
  }
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
            ✓ Imported {importResult.imported} events
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
            placeholder="Home-PA Calendar"
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

  <!-- Sync Info -->
  <section class="rounded-xl border border-base-300 bg-base-200 p-6 shadow-sm">
    <h3 class="mb-2 text-xl font-normal text-base-content">Calendar Sync</h3>
    <p class="mb-4 text-sm text-base-content/70">
      Two-way sync with Google Calendar and Apple Calendar is coming soon!
    </p>
    <div
      class="mt-2 flex items-center justify-between rounded-xl bg-base-100 p-4 shadow-sm"
    >
      <span class="text-sm font-medium text-base-content/70"
        >CalDAV support</span
      >
      <span
        class="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
        >Coming Soon</span
      >
    </div>
  </section>
</div>
