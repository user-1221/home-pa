<script lang="ts">
  /**
   * SettingsPopup Component
   *
   * Modal popup for app settings including account, import/export.
   * Opens from settings icon in UtilitiesView.
   */

  import {
    calendarState,
    settingsState,
  } from "$lib/bootstrap/index.svelte.ts";
  import { UserSettings } from "$lib/features/shared/components/index.ts";

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
    class="modal-open modal modal-mobile-fullscreen z-[2100] md:modal-middle"
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
        <button
          class="btn btn-square btn-ghost btn-sm"
          onclick={onClose}
          aria-label="Close"
        >
          ×
        </button>
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
                    onchange={(e) =>
                      settingsState.setActiveStartTime(e.currentTarget.value)}
                    class="input-bordered input input-sm w-32"
                  />
                  <span class="text-sm text-[var(--color-text-muted)]">–</span>
                  <input
                    type="time"
                    value={settingsState.activeEndTime}
                    onchange={(e) =>
                      settingsState.setActiveEndTime(e.currentTarget.value)}
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

                <button
                  class="btn btn-block btn-outline"
                  onclick={triggerFileInput}
                  disabled={importing || !isApiEnabled}
                >
                  {#if importing}
                    <span class="loading loading-sm loading-spinner"></span>
                    Importing...
                  {:else}
                    📁 Select .ics File
                  {/if}
                </button>

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
                    <button
                      class="btn btn-square btn-ghost btn-xs"
                      onclick={clearImportResult}>×</button
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

                <button
                  class="btn justify-start gap-1 btn-ghost btn-xs"
                  onclick={() => (showAdvanced = !showAdvanced)}
                >
                  {showAdvanced ? "▼" : "▶"} Advanced
                </button>

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

                <button
                  class="btn btn-block btn-outline"
                  onclick={handleExport}
                  disabled={!isApiEnabled}
                >
                  📥 Download .ics File
                </button>
              </div>
            </div>

            <!-- Sync Info -->
            <div class="card bg-base-200 card-sm">
              <div class="card-body gap-2 p-4">
                <h3 class="card-title text-base">Calendar Sync</h3>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-base-content/60"
                    >CalDAV support</span
                  >
                  <span
                    class="badge border border-[var(--color-primary)] bg-[var(--color-primary-100)] badge-sm text-[var(--color-primary-800)]"
                    >Coming Soon</span
                  >
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
    <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
  </div>
{/if}
