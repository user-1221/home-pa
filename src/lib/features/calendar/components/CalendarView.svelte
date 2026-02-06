<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { SvelteMap } from "svelte/reactivity";
  import type { Event } from "$lib/types.ts";
  import {
    calendarState,
    dataState,
    eventActions,
    type ExpandedOccurrence,
  } from "$lib/bootstrap/index.svelte.ts";
  import CalendarHeader from "./CalendarHeader.svelte";
  import CalendarGrid from "./CalendarGrid.svelte";
  import CalendarDebugInfo from "./CalendarDebugInfo.svelte";
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import ModalSkeleton from "$lib/features/shared/components/skeletons/ModalSkeleton.svelte";
  import TimetablePopupSkeleton from "$lib/features/shared/components/skeletons/TimetablePopupSkeleton.svelte";
  import { startOfDay } from "$lib/utils/date-utils.ts";
  import { getEventsForTimeline as getEventsForTimelineHelper } from "../utils/calendar-helpers.ts";
  import {
    loadTimetableData,
    getTimetableEventsForDate,
    getVisibleTimetableEvents,
    getCachedTimetableData,
    type TimetableEvent,
  } from "../services/timetable-events.ts";
  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";
  import GoogleSyncButton from "./GoogleSyncButton.svelte";

  // Local reactive variables for calendar state
  let currentMonth = $state(new Date());
  let showTimelinePopup = $state(false);
  let showTimetablePopup = $state(false);
  let showDropdownBar = $state(false);

  // Calendar visibility state (for filtering events by source)
  // hiddenCalendars tracks which calendars are hidden (empty = all visible)
  let hiddenCalendars = $state<Set<string>>(new Set());
  let showLocalEvents = $state(true);

  // Timetable events for the selected date (pre-loaded for TimelinePopup)
  let timetableEventsForDate = $state<TimetableEvent[]>([]);
  let lastTimetableDateKey: string | null = null;

  function getDateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  // Load timetable events when selected date changes
  $effect(() => {
    const dateKey = getDateKey(dataState.selectedDate);
    if (dateKey !== lastTimetableDateKey) {
      lastTimetableDateKey = dateKey;
      loadTimetableEventsForSelectedDate();
    }
  });

  async function loadTimetableEventsForSelectedDate() {
    // Try sync cache first for instant response
    const cached = getCachedTimetableData();
    if (cached) {
      const allEvents = getTimetableEventsForDate(
        dataState.selectedDate,
        cached.config,
        cached.cells,
      );
      timetableEventsForDate = getVisibleTimetableEvents(allEvents);
      return;
    }

    // Fall back to async load
    try {
      const { config, cells } = await loadTimetableData();
      const allEvents = getTimetableEventsForDate(
        dataState.selectedDate,
        config,
        cells,
      );
      timetableEventsForDate = getVisibleTimetableEvents(allEvents);
    } catch (err) {
      console.error("[CalendarView] Failed to load timetable:", err);
      timetableEventsForDate = [];
    }
  }

  // Track previous month to only fetch when month actually changes
  let previousMonthKey: string | null = null;

  function getMonthKey(month: Date): string {
    return `${month.getFullYear()}-${month.getMonth()}`;
  }

  function fetchEventsForCurrentMonth() {
    const windowStart = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 3,
      1,
    );
    const windowEnd = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 4,
      0,
    );
    calendarState.fetchEvents(windowStart, windowEnd, true);
  }

  // Load events on mount
  onMount(() => {
    const monthKey = getMonthKey(currentMonth);
    previousMonthKey = monthKey;
    fetchEventsForCurrentMonth();
    // Load Google Calendar sync state for toggle buttons
    googleSyncState.checkConnection();
  });

  // Reload events when month actually changes (not on every render)
  $effect(() => {
    const monthKey = getMonthKey(currentMonth);

    // Only fetch if month actually changed (skip initial render/mount)
    if (previousMonthKey !== null && previousMonthKey !== monthKey) {
      previousMonthKey = monthKey;
      fetchEventsForCurrentMonth();
    }
  });

  // Combine regular events with recurring occurrences for display
  let allDisplayEvents = $derived.by(() => {
    // First, filter events by calendar visibility
    const visibleEvents = calendarState.events.filter((e) => {
      if (e.calendarId) {
        // Google synced event - check BOTH:
        // 1. Calendar is enabled in GoogleSyncState (syncEnabled: true)
        // 2. User hasn't hidden it (not in hiddenCalendars)
        const isEnabled = googleSyncState.isCalendarEnabled(e.calendarId);
        return isEnabled && !hiddenCalendars.has(e.calendarId);
      } else {
        // Local event - use local events toggle
        return showLocalEvents;
      }
    });

    const regularEvents = visibleEvents.filter(
      (e) => !e.recurrence || e.recurrence.type === "NONE",
    );

    // Filter occurrences to only include those for visible recurring events
    const recurringEventIds = new Set(
      visibleEvents
        .filter((e) => e.recurrence && e.recurrence.type !== "NONE")
        .map((e) => e.id),
    );

    const occurrences = calendarState.occurrences
      .filter((occ) => recurringEventIds.has(occ.masterEventId))
      .map(
        (occ: ExpandedOccurrence) =>
          ({
            id: occ.id, // Use unique occurrence ID, not the master event ID
            eventId: occ.masterEventId, // Keep reference to master event ID
            title: occ.title,
            start: occ.start,
            end: occ.end,
            description: occ.description,
            address: occ.location,
            importance: occ.importance,
            timeLabel: occ.timeLabel,
            isRecurring: true,
            originalEventId: occ.masterEventId,
            // New sliding window fields
            isForever: occ.isForever,
            // Color from master event
            color: occ.color,
          }) as Event & {
            eventId: string;
            isRecurring: boolean;
            originalEventId: string;
            isForever?: boolean;
          },
      );

    return [...regularEvents, ...occurrences].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
  });

  // Get forever recurring events for special handling
  let foreverEvents = $derived.by(() => {
    return calendarState.occurrences.filter((occ) => occ.isForever);
  });

  // Debug info
  let showDebugInfo = $state(false);

  function navigateMonth(direction: number) {
    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + direction,
      1,
    );
  }

  function createEvent() {
    eventActions.createNewEvent();
  }

  function selectDate(date: Date) {
    const wasAlreadySelected = isSelected(date);
    dataState.setSelectedDate(date);

    if (wasAlreadySelected) {
      showTimelinePopup = !showTimelinePopup;
    } else {
      showTimelinePopup = false;
    }
  }

  function isSelected(date: Date) {
    return date.toDateString() === dataState.selectedDate.toDateString();
  }

  // Assign row indices to events so multi-day events maintain same row across days
  function assignEventRows(events: Event[]): SvelteMap<string, number> {
    const eventRows = new SvelteMap<string, number>();

    // Sort events by start date, then by duration (longer first)
    const sortedEvents = [...events].sort((a, b) => {
      const startDiff = a.start.getTime() - b.start.getTime();
      if (startDiff !== 0) return startDiff;
      // If same start, longer events first
      const aDuration = a.end.getTime() - a.start.getTime();
      const bDuration = b.end.getTime() - b.start.getTime();
      return bDuration - aDuration;
    });

    for (const event of sortedEvents) {
      const eventStartDate = startOfDay(event.start);
      const eventEndDate = startOfDay(event.end);

      // Find the first available row
      let row = 0;
      let rowAvailable = false;

      while (!rowAvailable) {
        rowAvailable = true;

        // Check if this row is occupied by any conflicting event
        for (const [otherEventId, otherRow] of eventRows.entries()) {
          if (otherRow !== row) continue;

          const otherEvent = events.find((e) => e.id === otherEventId);
          if (!otherEvent) continue;

          const otherStartDate = startOfDay(otherEvent.start);
          const otherEndDate = startOfDay(otherEvent.end);

          // Check if events overlap in date range
          if (
            eventStartDate.getTime() <= otherEndDate.getTime() &&
            eventEndDate.getTime() >= otherStartDate.getTime()
          ) {
            rowAvailable = false;
            break;
          }
        }

        if (!rowAvailable) {
          row++;
        }
      }

      eventRows.set(event.id, row);
    }

    return eventRows;
  }

  // Get the row assignment map for current events (including recurring occurrences)
  let eventRowMap = $derived(assignEventRows(allDisplayEvents));

  // Use helper that properly truncates multi-day events at day boundaries
  function getEventsForTimeline(events: Event[], targetDate: Date): Event[] {
    return getEventsForTimelineHelper(events, targetDate);
  }

  function parseRecurrenceForEdit(_event: Event) {
    // Passed to TimelinePopup - implementation can be added if needed
  }

  function toggleCalendarVisibility(calendarId: string) {
    const newSet = new Set(hiddenCalendars);
    if (newSet.has(calendarId)) {
      newSet.delete(calendarId); // Remove from hidden = show
    } else {
      newSet.add(calendarId); // Add to hidden = hide
    }
    hiddenCalendars = newSet;
  }
</script>

<div
  class="card flex h-full max-h-full min-h-0 flex-col overflow-hidden bg-base-100 shadow-sm"
  style="scrollbar-width: none; -ms-overflow-style: none;"
>
  <!-- Calendar Header -->
  <CalendarHeader
    {currentMonth}
    calendarError={calendarState.error}
    {showDebugInfo}
    onNavigateMonth={navigateMonth}
    onToggleDebug={() => (showDebugInfo = !showDebugInfo)}
    onCreateEvent={createEvent}
    onOpenTimetable={() => (showTimetablePopup = true)}
    onToggleDropdown={() => (showDropdownBar = !showDropdownBar)}
    showDropdown={showDropdownBar}
  />

  <!-- Debug Information -->
  {#if showDebugInfo}
    <CalendarDebugInfo
      {currentMonth}
      totalEvents={calendarState.events.length}
      displayEvents={allDisplayEvents.length}
      {foreverEvents}
      isLoading={calendarState.loading}
      error={calendarState.error}
    />
  {/if}

  <!-- Dropdown Bar Section -->
  {#if showDropdownBar}
    <div
      class="border-subtle sticky top-14 z-[9] flex min-h-12 flex-shrink-0 items-center gap-2 overflow-x-auto border-b bg-base-100/90 px-3 backdrop-blur-sm md:top-20 md:min-h-10 md:gap-1.5 md:px-5"
      transition:slide={{ duration: 300, axis: "y" }}
    >
      <!-- Google Sync controls -->
      <GoogleSyncButton />

      <!-- Divider -->
      <div class="h-5 w-px flex-shrink-0 bg-base-300/50"></div>

      <!-- Local events toggle -->
      <button
        class="btn shrink-0 btn-sm md:btn-xs {showLocalEvents
          ? 'btn-primary'
          : 'opacity-50 btn-ghost'}"
        onclick={() => (showLocalEvents = !showLocalEvents)}
      >
        Local
      </button>

      <!-- Google Calendar toggles (only enabled calendars) -->
      {#each googleSyncState.enabledCalendars as calendar (calendar.id)}
        <button
          class="btn shrink-0 btn-sm md:btn-xs {hiddenCalendars.has(calendar.id)
            ? 'opacity-50 btn-ghost'
            : ''}"
          style={calendar.calendarColor && !hiddenCalendars.has(calendar.id)
            ? `background-color: ${calendar.calendarColor}; border-color: ${calendar.calendarColor}; color: white`
            : ""}
          title={calendar.calendarName}
          onclick={() => toggleCalendarVisibility(calendar.id)}
        >
          <span class="max-w-24 truncate md:max-w-32"
            >{calendar.calendarName}</span
          >
        </button>
      {/each}

      {#if googleSyncState.enabledCalendars.length === 0 && googleSyncState.isConnected}
        <span class="text-xs text-base-content/50">No calendars synced</span>
      {/if}
    </div>
  {/if}

  <!-- Calendar Grid -->
  <CalendarGrid
    {currentMonth}
    selectedDate={dataState.selectedDate}
    events={allDisplayEvents}
    {eventRowMap}
    onSelectDate={selectDate}
  />
</div>

<!-- Timeline Popup (lazy-loaded) -->
{#if showTimelinePopup}
  <LazyLoad
    loader={() => import("./TimelinePopup.svelte")}
    props={{
      events: getEventsForTimeline(allDisplayEvents, dataState.selectedDate),
      parseRecurrenceForEdit,
      onClose: () => (showTimelinePopup = false),
      timetableEvents: timetableEventsForDate,
    }}
  >
    <ModalSkeleton rows={4} fullscreenMobile={true} />
  </LazyLoad>
{/if}

<!-- Timetable Popup (lazy-loaded) -->
{#if showTimetablePopup}
  <LazyLoad
    loader={() => import("./TimetablePopup.svelte")}
    props={{
      isOpen: true,
      onClose: () => (showTimetablePopup = false),
    }}
  >
    <TimetablePopupSkeleton />
  </LazyLoad>
{/if}
