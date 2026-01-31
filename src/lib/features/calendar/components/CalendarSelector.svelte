<script lang="ts">
  /**
   * CalendarSelector Component
   *
   * Modal dialog for selecting which Google calendars to sync.
   * Fetches available calendars from Google and allows toggling sync status.
   */

  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";
  import { onMount } from "svelte";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  interface AvailableCalendar {
    id: string;
    name: string;
    color: string | null;
  }

  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let availableCalendars = $state<AvailableCalendar[]>([]);
  let selectedIds = $state<Set<string>>(new Set());
  let isSaving = $state(false);

  // Initialize selected calendars from current sync state
  const currentlySyncedIds = $derived(
    new Set(googleSyncState.calendars.map((c) => c.googleCalendarId)),
  );

  onMount(async () => {
    // Pre-select currently synced calendars
    selectedIds = new Set(currentlySyncedIds);

    try {
      availableCalendars = await googleSyncState.fetchAvailableCalendars();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load calendars";
    } finally {
      isLoading = false;
    }
  });

  function toggleCalendar(calendarId: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(calendarId)) {
      newSet.delete(calendarId);
    } else {
      newSet.add(calendarId);
    }
    selectedIds = newSet;
  }

  async function handleSave() {
    isSaving = true;
    error = null;

    try {
      await googleSyncState.enableSync(Array.from(selectedIds));
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save settings";
    } finally {
      isSaving = false;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  onclick={handleBackdropClick}
>
  <!-- Modal Content -->
  <div
    class="w-full max-w-md rounded-2xl bg-base-100 p-6 shadow-xl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="calendar-selector-title"
  >
    <h2
      id="calendar-selector-title"
      class="mb-4 text-xl font-medium text-base-content"
    >
      Select Calendars to Sync
    </h2>

    {#if isLoading}
      <div class="flex items-center justify-center py-8">
        <span class="loading loading-md loading-spinner"></span>
      </div>
    {:else if error}
      <div class="rounded-lg bg-error/10 p-4 text-error">
        {error}
      </div>
    {:else if availableCalendars.length === 0}
      <div class="py-8 text-center text-base-content/60">
        No calendars found in your Google account.
      </div>
    {:else}
      <div class="max-h-[300px] space-y-2 overflow-y-auto">
        {#each availableCalendars as calendar (calendar.id)}
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-base-200"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-primary"
              checked={selectedIds.has(calendar.id)}
              onchange={() => toggleCalendar(calendar.id)}
            />
            {#if calendar.color}
              <span
                class="h-4 w-4 flex-shrink-0 rounded-full"
                style="background-color: {calendar.color}"
              ></span>
            {/if}
            <span class="flex-1 truncate text-base-content"
              >{calendar.name}</span
            >
          </label>
        {/each}
      </div>
    {/if}

    <!-- Actions -->
    <div class="mt-6 flex justify-end gap-3">
      <button class="btn btn-ghost" onclick={onClose} disabled={isSaving}>
        Cancel
      </button>
      <button
        class="btn btn-primary"
        onclick={handleSave}
        disabled={isSaving || isLoading}
      >
        {#if isSaving}
          <span class="loading loading-sm loading-spinner"></span>
          Saving...
        {:else}
          Save
        {/if}
      </button>
    </div>
  </div>
</div>
