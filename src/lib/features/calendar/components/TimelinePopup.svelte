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
  import TagEventDialog from "$lib/features/tasks/components/TagEventDialog.svelte";
  import { Button } from "$lib/features/shared/components/index.ts";

  interface Props {
    events: Event[];
    parseRecurrenceForEdit: (event: Event) => void;
    onClose: () => void;
    /** Pre-loaded timetable events. If provided, skips internal async loading. */
    timetableEvents?: TimetableEvent[];
  }

  let {
    events,
    parseRecurrenceForEdit,
    onClose,
    timetableEvents: propTimetableEvents,
  }: Props = $props();

  // Timetable events state - use prop if provided, otherwise load internally
  let internalTimetableEvents = $state<TimetableEvent[]>([]);
  let timetableEvents = $derived(
    propTimetableEvents ?? internalTimetableEvents,
  );
  let _timetableLoaded = $state(false);

  // Tag dialog state
  let tagDialogOpen = $state(false);
  let tagSourceType = $state<"calendar" | "timetable">("calendar");
  let tagCalendarEvent = $state<Event | undefined>(undefined);
  let tagTimetableEvent = $state<TimetableEvent | undefined>(undefined);

  function openTagDialog(type: "calendar", event: Event): void;
  function openTagDialog(type: "timetable", event: TimetableEvent): void;
  function openTagDialog(
    type: "calendar" | "timetable",
    event: Event | TimetableEvent,
  ): void {
    tagSourceType = type;
    if (type === "calendar") {
      tagCalendarEvent = event as Event;
      tagTimetableEvent = undefined;
    } else {
      tagTimetableEvent = event as TimetableEvent;
      tagCalendarEvent = undefined;
    }
    tagDialogOpen = true;
  }

  function closeTagDialog() {
    tagDialogOpen = false;
  }

  // Timeline container reference and height tracking
  let timelineContainer: HTMLDivElement | undefined = $state();
  let timelineHeight = $state(400); // Default to 400px (min-h-[400px])

  // Pagination state
  const MAX_COLUMNS_PER_PAGE = 5;
  let currentPage = $state(0);

  // Unified column type for pagination
  type ColumnData =
    | { type: "timetable"; events: TimetableEvent[] }
    | { type: "calendar"; events: Event[] };

  // Swipe gesture state
  let touchStartX = $state(0);

  // Load timetable events on mount (only if not provided via prop)
  $effect(() => {
    if (propTimetableEvents === undefined) {
      loadTimetableForDate();
    }
  });

  // Track timeline container height
  $effect(() => {
    if (!timelineContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        timelineHeight = entry.contentRect.height;
      }
    });

    resizeObserver.observe(timelineContainer);

    return () => {
      resizeObserver.disconnect();
    };
  });

  async function loadTimetableForDate() {
    try {
      const { config, cells } = await loadTimetableData();
      const allEvents = getTimetableEventsForDate(
        dataState.selectedDate,
        config,
        cells,
      );
      internalTimetableEvents = getVisibleTimetableEvents(allEvents);
      _timetableLoaded = true;
    } catch (err) {
      console.error("[TimelinePopup] Failed to load timetable:", err);
      _timetableLoaded = true;
    }
  }

  // Calculate pixels per hour based on actual timeline height
  let pixelsPerHour = $derived(timelineHeight / 24);

  function getCurrentTimePositionScaled(): number {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / 60) * pixelsPerHour;
  }

  function getEventPositionScaled(startTime: Date, timeLabel?: string): number {
    if (timeLabel === "all-day") {
      return 0;
    }
    const hours = startTime.getHours();
    const minutes = startTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / 60) * pixelsPerHour;
  }

  function getEventHeightScaled(event: Event): number {
    if (event.timeLabel === "all-day") {
      return 24 * pixelsPerHour;
    }
    // Use milliseconds-based duration to handle truncated events correctly
    // (Events may have been truncated at day boundaries by getEventsForDate)
    const durationMs = event.end.getTime() - event.start.getTime();
    const durationMinutes = Math.max(durationMs / (1000 * 60), 30);
    return (durationMinutes / 60) * pixelsPerHour;
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
    return (totalMinutes / 60) * pixelsPerHour;
  }

  function getTimetableEventHeight(event: TimetableEvent): number {
    const startMinutes = event.start.getHours() * 60 + event.start.getMinutes();
    const endMinutes = event.end.getHours() * 60 + event.end.getMinutes();
    const durationMinutes = Math.max(endMinutes - startMinutes, 30);
    return (durationMinutes / 60) * pixelsPerHour;
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

  // Combine all columns into unified array for pagination
  let allColumns = $derived.by(() => {
    const cols: ColumnData[] = [];
    if (hasTimetableEvents) {
      cols.push({ type: "timetable", events: timetableEvents });
    }
    for (const column of eventColumns) {
      cols.push({ type: "calendar", events: column });
    }
    return cols;
  });

  // Pagination derived values
  let totalPages = $derived(Math.ceil(totalColumns / MAX_COLUMNS_PER_PAGE));
  let needsPagination = $derived(totalColumns > MAX_COLUMNS_PER_PAGE);

  function getColumnsForPage(pageIndex: number): ColumnData[] {
    const start = pageIndex * MAX_COLUMNS_PER_PAGE;
    const end = Math.min(start + MAX_COLUMNS_PER_PAGE, allColumns.length);
    return allColumns.slice(start, end);
  }

  // Navigation functions
  function goToPage(page: number) {
    currentPage = Math.max(0, Math.min(page, totalPages - 1));
  }

  function nextPage() {
    if (currentPage < totalPages - 1) currentPage++;
  }

  function prevPage() {
    if (currentPage > 0) currentPage--;
  }

  // Swipe gesture handlers
  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
  }

  function handleTouchEnd(e: TouchEvent) {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      // 50px threshold
      if (diff > 0) nextPage();
      else prevPage();
    }
  }

  // Reset pagination when events change
  $effect(() => {
    // Dependency on totalColumns
    if (totalColumns) {
      currentPage = 0;
    }
  });
</script>

<div
  class="fixed inset-0 z-[2100] flex items-center justify-center bg-base-content/60 p-0 backdrop-blur-sm md:p-4"
  onclick={() => onClose()}
  onkeydown={(e: KeyboardEvent) => e.key === "Escape" && onClose()}
  role="button"
  tabindex="-1"
  aria-label="Close timeline"
>
  <div
    class="border-subtle flex h-full w-full animate-[slideUpFromBottom_0.3s_ease-out_forwards] flex-col overflow-hidden rounded-none border-0 bg-base-100 shadow-xl md:h-[600px] md:max-h-[80vh] md:max-w-[600px] md:animate-none md:rounded-xl md:border"
    onclick={(e: MouseEvent) => e.stopPropagation()}
    onkeydown={(e: KeyboardEvent) => e.key === "Escape" && onClose()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="border-subtle flex items-center justify-between border-b bg-base-100 p-4"
    >
      <h3 class="m-0 text-lg font-normal text-base-content">
        タイムライン - {dataState.selectedDate.toLocaleDateString("ja-JP")}
      </h3>
      <Button
        variant="ghost"
        size="sm"
        onclick={() => onClose()}
        aria-label="Close"
      >
        ✕
      </Button>
    </div>

    <div
      class="flex-1 overflow-hidden pt-8 pr-8 pb-16 pl-0 md:pt-4 md:pr-4 md:pb-4 md:pl-0"
    >
      {#if events.length === 0 && timetableEvents.length === 0}
        <p class="py-12 text-center text-[var(--color-text-muted)]">
          この日の予定はありません
        </p>
      {:else}
        <div
          class="relative h-full min-h-[400px]"
          bind:this={timelineContainer}
        >
          <!-- Hour grid lines (full width, behind everything) -->
          <div class="pointer-events-none absolute inset-0">
            {#each Array(24) as _, hour (hour)}
              <div
                class="absolute right-0 left-[50px] h-px"
                class:bg-base-300={hour % 6 === 0}
                class:bg-base-200={hour % 6 !== 0}
                class:opacity-80={hour % 6 === 0}
                class:opacity-40={hour % 6 !== 0}
                style="top: {hour * pixelsPerHour}px;"
              ></div>
            {/each}
          </div>

          <!-- Hour indicators (left gutter) -->
          <div class="absolute top-0 left-0 h-full w-[50px]">
            {#each Array(24) as _, hour (hour)}
              <div
                class="absolute left-0 flex w-full items-center"
                style="top: {hour * pixelsPerHour - 6}px;"
              >
                <span
                  class="w-11 pr-2 text-right font-mono text-[11px] tabular-nums {hour %
                    6 ===
                  0
                    ? 'font-medium text-base-content'
                    : 'font-normal text-base-content/60'}"
                  >{hour.toString().padStart(2, "0")}</span
                >
              </div>
            {/each}
          </div>

          <!-- Current time indicator -->
          <div
            class="absolute z-[5] flex items-center"
            style="top: {getCurrentTimePositionScaled()}px; left: 44px; right: 0;"
          >
            <div class="h-2.5 w-2.5 rounded-full bg-primary shadow-sm"></div>
            <div class="h-[2px] flex-1 bg-primary/80"></div>
          </div>

          <!-- Event columns with pagination -->
          <div
            class="absolute overflow-hidden"
            style="left: 55px; right: 0; top: 0; bottom: {needsPagination
              ? '32px'
              : '0'};"
            ontouchstart={handleTouchStart}
            ontouchend={handleTouchEnd}
          >
            <!-- Sliding container - all pages side by side -->
            <div
              class="flex h-full transition-transform duration-300 ease-out"
              style="width: {totalPages *
                100}%; transform: translateX(-{currentPage *
                (100 / totalPages)}%);"
            >
              {#each Array(totalPages) as _, pageIndex (pageIndex)}
                {@const pageColumns = getColumnsForPage(pageIndex)}
                {@const columnsOnPage = pageColumns.length}
                <div class="flex h-full" style="width: {100 / totalPages}%;">
                  {#each pageColumns as column, colIdx (`${pageIndex}-${colIdx}`)}
                    {#if column.type === "timetable"}
                      <!-- Timetable lane -->
                      <div
                        class="bg-base-50/30 relative h-full border-r border-base-200"
                        style="width: {100 / columnsOnPage}%;"
                      >
                        <div
                          class="absolute inset-x-0 top-[-18px] text-center font-mono text-xs font-medium tracking-wider text-base-content/60 uppercase"
                        >
                          時間割
                        </div>
                        {#each column.events as ttEvent (ttEvent.id)}
                          {@const isBlocking =
                            ttEvent.workAllowed === "作業不可"}
                          <div
                            class="group absolute right-1 left-1 min-h-[20px] overflow-hidden rounded-r-md border-l-[3px] px-1.5 py-1"
                            style="
                              top: {getTimetableEventPosition(ttEvent)}px;
                              height: {getTimetableEventHeight(ttEvent)}px;
                              background-color: {isBlocking
                              ? 'var(--color-error-100)'
                              : 'var(--color-success-100)'};
                              border-left-color: {getTimetableEventColor(
                              ttEvent,
                            )};
                            "
                          >
                            <!-- Tag button -->
                            <button
                              class="absolute top-0 right-0 flex h-8 w-8 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                              onclick={(e: MouseEvent) => {
                                e.stopPropagation();
                                openTagDialog("timetable", ttEvent);
                              }}
                              aria-label="タスクを作成"
                            >
                              <span
                                class="flex h-5 w-5 items-center justify-center rounded bg-base-100/80 shadow-sm hover:bg-base-100"
                              >
                                <svg
                                  class="h-3 w-3 text-base-content/70"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  stroke-width="2"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                  />
                                </svg>
                              </span>
                            </button>
                            <div
                              class="overflow-hidden text-[11px] font-medium text-ellipsis whitespace-nowrap"
                              style="color: {isBlocking
                                ? 'var(--color-error-700)'
                                : 'var(--color-success-700)'};"
                            >
                              {ttEvent.title}
                            </div>
                            <div
                              class="font-mono text-[9px] tabular-nums"
                              style="color: {isBlocking
                                ? 'var(--color-error-500)'
                                : 'var(--color-success-500)'};"
                            >
                              {formatTime(ttEvent.start)} – {formatTime(
                                ttEvent.end,
                              )}
                            </div>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <!-- Regular event column -->
                      <div
                        class="relative h-full px-0.5"
                        style="width: {100 / columnsOnPage}%;"
                      >
                        {#each column.events as event (event.id)}
                          <div
                            class="event-card group absolute right-1 left-1 min-h-[24px] cursor-pointer overflow-hidden rounded-r-md border-l-[3px] px-2 py-1 shadow-sm transition-all duration-200 hover:z-10 hover:shadow-lg"
                            onclick={() => handleEventClick(event)}
                            onkeydown={(e: KeyboardEvent) =>
                              e.key === "Enter" && handleEventClick(event)}
                            role="button"
                            tabindex="0"
                            style="
                              top: {getEventPositionScaled(
                              event.start,
                              event.timeLabel,
                            )}px;
                              height: {getEventHeightScaled(event)}px;
                              background-color: color-mix(in srgb, {getEventColor(
                              event,
                            )} 15%, white);
                              border-left-color: {getEventColor(event)};
                            "
                          >
                            <!-- Tag button -->
                            <button
                              class="absolute top-0 right-0 flex h-8 w-8 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                              onclick={(e: MouseEvent) => {
                                e.stopPropagation();
                                openTagDialog("calendar", event);
                              }}
                              aria-label="タスクを作成"
                            >
                              <span
                                class="flex h-5 w-5 items-center justify-center rounded bg-base-100/80 shadow-sm hover:bg-base-100"
                              >
                                <svg
                                  class="h-3 w-3 text-base-content/70"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  stroke-width="2"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                  />
                                </svg>
                              </span>
                            </button>
                            <div
                              class="overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap"
                              style="color: color-mix(in srgb, {getEventColor(
                                event,
                              )} 85%, black);"
                            >
                              {event.title}
                            </div>
                            <div
                              class="font-mono text-[10px] tabular-nums"
                              style="color: color-mix(in srgb, {getEventColor(
                                event,
                              )} 60%, black);"
                            >
                              {#if event.timeLabel === "all-day"}
                                終日
                              {:else}
                                {formatTime(event.start)} – {formatTime(
                                  event.end,
                                )}
                              {/if}
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {/each}
                </div>
              {/each}
            </div>
          </div>

          <!-- Pagination indicators -->
          {#if needsPagination}
            <div
              class="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2"
            >
              {#each Array(totalPages) as _, pageIdx (pageIdx)}
                <button
                  class="rounded-full transition-all duration-200 {currentPage ===
                  pageIdx
                    ? 'h-2 w-4 bg-primary'
                    : 'hover:bg-base-400 h-2 w-2 bg-base-300'}"
                  onclick={() => goToPage(pageIdx)}
                  aria-label="Page {pageIdx + 1}"
                ></button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Tag event dialog -->
<TagEventDialog
  isOpen={tagDialogOpen}
  sourceType={tagSourceType}
  calendarEvent={tagCalendarEvent}
  timetableEvent={tagTimetableEvent}
  onClose={closeTagDialog}
/>
