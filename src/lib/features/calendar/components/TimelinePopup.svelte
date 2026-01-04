<script lang="ts">
  import type { Event } from "$lib/types.ts";
  import {
    dataState,
    calendarState,
    eventActions,
  } from "$lib/bootstrap/compat.svelte.ts";
  import { getEventColor } from "../utils/index.ts";
  import {
    loadTimetableData,
    getTimetableEventsForDate,
    getVisibleTimetableEvents,
    type TimetableEvent,
  } from "../services/timetable-events.ts";

  interface Props {
    events: Event[];
    parseRecurrenceForEdit: (event: Event) => void;
    onClose: () => void;
  }

  let { events, parseRecurrenceForEdit, onClose }: Props = $props();

  // Timetable events state
  let timetableEvents = $state<TimetableEvent[]>([]);
  let _timetableLoaded = $state(false);

  // Load timetable events on mount
  $effect(() => {
    loadTimetableForDate();
  });

  async function loadTimetableForDate() {
    try {
      const { config, cells } = await loadTimetableData();
      const allEvents = getTimetableEventsForDate(
        dataState.selectedDate,
        config,
        cells,
      );
      timetableEvents = getVisibleTimetableEvents(allEvents);
      _timetableLoaded = true;
    } catch (err) {
      console.error("[TimelinePopup] Failed to load timetable:", err);
      _timetableLoaded = true;
    }
  }

  function getCurrentTimePositionScaled(): number {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / 60) * 16.67;
  }

  function getEventPositionScaled(startTime: Date, timeLabel?: string): number {
    if (timeLabel === "all-day") {
      return 0;
    }
    const hours = startTime.getHours();
    const minutes = startTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / 60) * 16.67;
  }

  function getEventHeightScaled(event: Event): number {
    if (event.timeLabel === "all-day") {
      return 24 * 16.67;
    }
    // Use milliseconds-based duration to handle truncated events correctly
    // (Events may have been truncated at day boundaries by getEventsForDate)
    const durationMs = event.end.getTime() - event.start.getTime();
    const durationMinutes = Math.max(durationMs / (1000 * 60), 30);
    return (durationMinutes / 60) * 16.67;
  }

  function formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  /**
   * Organize events into columns for display
   * All-day events get their own columns first, then timed events
   * This prevents all-day events from overlapping with timed events
   */
  function getEventColumns(evts: Event[]): Event[][] {
    if (evts.length === 0) return [];

    // Separate all-day events from timed events
    const allDayEvents = evts.filter((e) => e.timeLabel === "all-day");
    const timedEvents = evts.filter((e) => e.timeLabel !== "all-day");

    // Sort timed events by start time
    const sortedTimedEvents = [...timedEvents].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    // First, allocate columns for all-day events (each gets its own column)
    const allDayColumns: Event[][] = [];
    for (const allDayEvent of allDayEvents) {
      allDayColumns.push([allDayEvent]);
    }

    // Handle timed events with overlap detection (only among timed events)
    const timedColumns: Event[][] = [];
    for (const event of sortedTimedEvents) {
      // Find the first column where this event doesn't overlap with other timed events
      let columnIndex = 0;
      while (columnIndex < timedColumns.length) {
        const column = timedColumns[columnIndex];
        const lastEvent = column[column.length - 1];

        // For timed events, check actual time overlap
        if (event.start >= lastEvent.end) {
          break;
        }
        columnIndex++;
      }

      // If no suitable column found, create a new one
      if (columnIndex >= timedColumns.length) {
        timedColumns.push([]);
      }

      timedColumns[columnIndex].push(event);
    }

    // Combine: all-day columns first, then timed columns
    return [...allDayColumns, ...timedColumns];
  }

  function handleEventClick(event: Event) {
    const masterEvent =
      calendarState.events.find(
        (e) =>
          e.id === (event as Event & { eventId?: string }).eventId ||
          e.id === event.id,
      ) || event;
    // Pass the occurrence's start date for recurring event deletion
    const occurrenceDate = event.start;
    eventActions.editEvent(masterEvent, occurrenceDate);
    parseRecurrenceForEdit(masterEvent);
  }

  // Timetable event helpers
  function getTimetableEventPosition(event: TimetableEvent): number {
    const hours = event.start.getHours();
    const minutes = event.start.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / 60) * 16.67;
  }

  function getTimetableEventHeight(event: TimetableEvent): number {
    const startMinutes = event.start.getHours() * 60 + event.start.getMinutes();
    const endMinutes = event.end.getHours() * 60 + event.end.getMinutes();
    const durationMinutes = Math.max(endMinutes - startMinutes, 30);
    return (durationMinutes / 60) * 16.67;
  }

  function getTimetableEventColor(event: TimetableEvent): string {
    // 作業不可 (work not allowed) = blocking = red-ish
    // 作業可 (work allowed) = green-ish
    if (event.workAllowed === "作業不可") {
      return "var(--color-error-400)";
    }
    return "var(--color-success-400)";
  }

  let eventColumns = $derived(getEventColumns(events));
  let hasTimetableEvents = $derived(timetableEvents.length > 0);
  let totalColumns = $derived(
    eventColumns.length + (hasTimetableEvents ? 1 : 0),
  );
</script>

<div
  class="fixed inset-0 z-[2100] flex items-center justify-center bg-base-content/60 p-0 backdrop-blur-sm md:p-4"
  onclick={() => onClose()}
  onkeydown={(e) => e.key === "Escape" && onClose()}
  role="button"
  tabindex="-1"
  aria-label="Close timeline"
>
  <div
    class="flex h-full w-full max-w-[600px] animate-[slideUpFromBottom_0.3s_ease-out] flex-col overflow-hidden rounded-xl border-0 border-base-300 bg-base-100 shadow-xl md:h-auto md:max-h-[80vh] md:animate-none md:rounded-xl md:border"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === "Escape" && onClose()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="flex items-center justify-between border-b border-base-300 bg-base-100 p-4"
    >
      <h3 class="m-0 text-lg font-normal text-base-content">
        タイムライン - {dataState.selectedDate.toLocaleDateString("ja-JP")}
      </h3>
      <button
        class="btn btn-ghost transition-all duration-200 btn-sm hover:bg-error hover:text-error-content"
        onclick={() => onClose()}
        aria-label="Close"
      >
        ✕
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      {#if events.length === 0 && timetableEvents.length === 0}
        <p class="py-12 text-center text-[var(--color-text-muted)]">
          この日の予定はありません
        </p>
      {:else}
        <div class="relative h-[400px] min-h-[400px]">
          <!-- Hour indicators -->
          <div class="absolute top-0 left-0 h-full w-[50px]">
            {#each Array(24) as _, hour (hour)}
              <div
                class="absolute left-0 flex w-full items-center"
                style="top: {hour * 16.67}px;"
              >
                <span
                  class="w-10 pr-1 text-right text-xs text-[var(--color-text-muted)]"
                  >{hour.toString().padStart(2, "0")}:00</span
                >
                <div class="h-px flex-1 bg-base-300"></div>
              </div>
            {/each}
          </div>

          <!-- Current time indicator -->
          <div
            class="absolute z-[5] h-0.5 bg-error before:absolute before:top-[-3px] before:left-[-4px] before:h-2 before:w-2 before:rounded-full before:bg-error before:content-['']"
            style="top: {getCurrentTimePositionScaled()}px; left: 50px; right: 0;"
          ></div>

          <!-- Event columns (including timetable lane) -->
          <div
            class="absolute flex"
            style="left: 55px; right: 0; top: 0; height: 100%;"
          >
            <!-- Timetable lane (first column if exists) -->
            {#if hasTimetableEvents}
              <div
                class="relative h-full border-r border-base-300/50"
                style="width: {100 / totalColumns}%;"
              >
                <div
                  class="absolute inset-x-0 top-[-20px] text-center text-[10px] font-medium text-[var(--color-text-secondary)]"
                >
                  時間割
                </div>
                {#each timetableEvents as ttEvent (ttEvent.id)}
                  <div
                    class="absolute right-0.5 left-0.5 min-h-[20px] overflow-hidden rounded border-l-2 px-1 py-0.5"
                    style="
                      top: {getTimetableEventPosition(ttEvent)}px;
                      height: {getTimetableEventHeight(ttEvent)}px;
                      background-color: {getTimetableEventColor(ttEvent)}20;
                      border-left-color: {getTimetableEventColor(ttEvent)};
                    "
                  >
                    <div
                      class="overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap"
                      style="color: {getTimetableEventColor(ttEvent)};"
                    >
                      {ttEvent.title}
                    </div>
                    <div
                      class="text-[10px] opacity-70"
                      style="color: {getTimetableEventColor(ttEvent)};"
                    >
                      {formatTime(ttEvent.start)} - {formatTime(ttEvent.end)}
                    </div>
                    <div
                      class="text-[9px] opacity-60"
                      style="color: {getTimetableEventColor(ttEvent)};"
                    >
                      {ttEvent.workAllowed}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Regular event columns -->
            {#each eventColumns as column, columnIndex (columnIndex)}
              <div
                class="relative h-full"
                style="width: {100 / totalColumns}%;"
              >
                {#each column as event (event.id)}
                  <div
                    class="absolute right-0.5 left-0.5 min-h-[20px] cursor-pointer overflow-hidden rounded px-1 py-0.5 transition-all duration-200 hover:z-10 hover:scale-[1.02] hover:shadow-md"
                    onclick={() => handleEventClick(event)}
                    onkeydown={(e) =>
                      e.key === "Enter" && handleEventClick(event)}
                    role="button"
                    tabindex="0"
                    style="
                      top: {getEventPositionScaled(
                      event.start,
                      event.timeLabel,
                    )}px;
                      height: {getEventHeightScaled(event)}px;
                      background-color: {getEventColor(event)};
                      color: white;
                    "
                  >
                    <div
                      class="overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap"
                    >
                      {event.title}
                    </div>
                    <div class="text-[10px] opacity-80">
                      {#if event.timeLabel === "all-day"}
                        00:00 - 23:59
                      {:else}
                        {formatTime(event.start)} - {formatTime(event.end)}
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
