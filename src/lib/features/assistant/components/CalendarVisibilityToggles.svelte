<script lang="ts">
  import { calendarVisibilityState } from "$lib/features/calendar/state/calendar-visibility.svelte.ts";
  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";

  // Reactive access to visibility state
  let hiddenCalendars = $derived(calendarVisibilityState.hiddenCalendars);
  let showLocalEvents = $derived(calendarVisibilityState.showLocalEvents);

  // Initialize calendar visibility defaults when Google calendars become available
  $effect(() => {
    const calendars = googleSyncState.enabledCalendars;
    if (calendars.length > 0) {
      calendarVisibilityState.initializeDefaults(calendars.map((c) => c.id));
    }
  });
</script>

<div
  class="flex min-h-10 flex-shrink-0 items-center gap-2 overflow-x-auto px-3 md:px-5"
>
  <!-- Local events toggle -->
  <button
    class="btn shrink-0 btn-xs {showLocalEvents
      ? 'btn-primary'
      : 'opacity-50 btn-ghost'}"
    onclick={() => calendarVisibilityState.toggleLocalEvents()}
  >
    Local
  </button>

  <!-- Google Calendar toggles (using syncConfig ID as calendarId) -->
  {#each googleSyncState.enabledCalendars as calendar (calendar.id)}
    <button
      class="btn shrink-0 btn-xs {hiddenCalendars.has(calendar.id)
        ? 'opacity-50 btn-ghost'
        : ''}"
      style={calendar.calendarColor && !hiddenCalendars.has(calendar.id)
        ? `background-color: ${calendar.calendarColor}; border-color: ${calendar.calendarColor}; color: white`
        : ""}
      onclick={() => calendarVisibilityState.toggleCalendar(calendar.id)}
    >
      {calendar.calendarName}
    </button>
  {/each}

  {#if googleSyncState.enabledCalendars.length === 0 && googleSyncState.isConnected}
    <span class="text-xs text-base-content/50">No calendars synced</span>
  {/if}
</div>
