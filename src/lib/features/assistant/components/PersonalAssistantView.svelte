<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import CircularTimelineCss from "./CircularTimelineCss.svelte";
  import TimelineInfoPanel from "./TimelineInfoPanel.svelte";
  import {
    calendarState,
    dataState,
    settingsState,
  } from "$lib/bootstrap/index.svelte.ts";
  import {
    scheduleActions,
    pendingSuggestions,
    acceptedSuggestions,
    tasks,
  } from "$lib/bootstrap/compat.svelte.ts";
  import type { Event, Gap } from "$lib/types.ts";
  import { GapFinder } from "$lib/features/assistant/services/gap-finder.ts";
  import { get } from "svelte/store";
  import {
    startOfDay,
    endOfDay,
    parseTimeOnDate,
  } from "$lib/utils/date-utils.ts";

  // Task list (synced from store)
  let taskList = $state(get(tasks));

  // Selected items for details display - track all separately
  let selectedSuggestion = $state<
    | {
        type: "pending-suggestion";
        data: import("$lib/features/assistant/state/schedule.ts").PendingSuggestion;
        title: string;
      }
    | {
        type: "accepted-suggestion";
        data: import("$lib/features/assistant/state/schedule.ts").AcceptedSuggestion;
        title: string;
      }
    | {
        type: "drag-preview";
        title: string;
        startTime: string;
        endTime: string;
        duration: number;
      }
    | null
  >(null);
  let selectedEvent = $state<Event | null>(null);
  let selectedGap = $state<Gap | null>(null);

  // Priority-based display: suggestion → event → gap
  let displayedItem = $derived.by(() => {
    if (selectedSuggestion) return selectedSuggestion;
    if (selectedEvent)
      return {
        type: "event" as const,
        data: selectedEvent,
      };
    if (selectedGap)
      return {
        type: "gap" as const,
        data: selectedGap,
      };
    return null;
  });

  function dateKey(date: Date): string {
    return startOfDay(date).toISOString().slice(0, 10);
  }

  function sortEventsByStart(events: Event[]): Event[] {
    return [...events].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }

  function formatEventTime(event: Event): string {
    if (event.timeLabel === "all-day") return "終日";
    if (event.timeLabel === "some-timing") return "どこかのタイミングで";

    const toTime = (value: Date) => value.toTimeString().slice(0, 5);
    return `${toTime(new Date(event.start))} - ${toTime(new Date(event.end))}`;
  }

  function formatDateLabel(date: Date): string {
    return startOfDay(date).toLocaleDateString("ja-JP");
  }

  let unsubscribeTasks: (() => void) | undefined;

  onMount(() => {
    const now = new Date(Date.now());
    dataState.setSelectedDate(startOfDay(now));

    // Subscribe to tasks store
    unsubscribeTasks = tasks.subscribe((value) => (taskList = value));
  });

  onDestroy(() => {
    if (unsubscribeTasks) unsubscribeTasks();
  });

  function overlapsDay(eventStart: Date, eventEnd: Date, day: Date) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    return (
      eventStart.getTime() <= dayEnd.getTime() &&
      eventEnd.getTime() >= dayStart.getTime()
    );
  }

  function toGapEventForDay(e: Event, day: Date) {
    const dayStart = "00:00";
    const dayEnd = "23:59";

    if (e.timeLabel === "all-day") {
      return { id: e.id, title: e.title, start: dayStart, end: dayEnd };
    }

    const targetDay = startOfDay(day);
    const startDay = startOfDay(e.start);
    const endDay = startOfDay(e.end);

    const startsToday = startDay.getTime() === targetDay.getTime();
    const endsToday = endDay.getTime() === targetDay.getTime();

    const startTime = startsToday
      ? new Date(e.start).toTimeString().slice(0, 5)
      : dayStart;
    const endTime = endsToday
      ? new Date(e.end).toTimeString().slice(0, 5)
      : dayEnd;

    return {
      id: e.id,
      title: e.title,
      start: startTime,
      end: endTime,
    };
  }

  // Reactively compute events for selected day
  let selectedDayEvents = $derived.by(() => {
    const events = calendarState.events;
    const occurrences = calendarState.occurrences;
    const currentDate = startOfDay(dataState.selectedDate);

    const combined: Event[] = [
      ...events,
      ...occurrences.map(
        (occ) =>
          ({
            id: occ.id,
            title: occ.title,
            start: occ.start,
            end: occ.end,
            description: occ.description,
            address: occ.location,
            importance: occ.importance,
            timeLabel: occ.timeLabel,
          }) as Event,
      ),
    ];

    const todaysEvents = combined.filter((e) =>
      overlapsDay(new Date(e.start), new Date(e.end), currentDate),
    );

    return sortEventsByStart(todaysEvents);
  });

  // Reactively compute gaps based on selected day events
  let computedGaps = $derived.by(() => {
    const gf = new GapFinder({
      dayStart: settingsState.activeStartTime,
      dayEnd: settingsState.activeEndTime,
    });
    const currentDate = startOfDay(dataState.selectedDate);

    const mapped = selectedDayEvents.map((e) =>
      toGapEventForDay(e, currentDate),
    );
    return gf.findGaps(mapped);
  });

  // Reactively compute schedule signature for auto-generation
  let scheduleSignature = $derived.by(() => {
    const now = new Date();
    const todayKey = dateKey(now);
    const currentDate = startOfDay(dataState.selectedDate);

    // Only generate schedule for today
    if (dateKey(currentDate) !== todayKey) return null;

    return `${dateKey(currentDate)}|t${taskList.length}|g${computedGaps.length}`;
  });

  // Track last schedule signature to avoid re-triggering
  let lastScheduleSignature: string | null = null;

  // Auto-generate schedule when signature changes
  $effect(() => {
    if (scheduleSignature && scheduleSignature !== lastScheduleSignature) {
      lastScheduleSignature = scheduleSignature;
      scheduleActions.regenerate(taskList, { gaps: computedGaps });
    }
  });

  // Helper to get task title from memoId
  function getTaskTitle(memoId: string): string {
    const task = taskList.find((t) => t.id === memoId);
    return task?.title ?? "Task";
  }

  // Convert accepted suggestions to Event format for display list
  let acceptedEvents = $derived.by(() => {
    const now = new Date(Date.now());
    const isTodaySelected = dateKey(dataState.selectedDate) === dateKey(now);
    if (!isTodaySelected) return [];

    const base = startOfDay(dataState.selectedDate);
    return $acceptedSuggestions.map((block) => {
      const title = getTaskTitle(block.memoId);

      return {
        id: `accepted-${block.suggestionId}`,
        title,
        start: parseTimeOnDate(base, block.startTime),
        end: parseTimeOnDate(base, block.endTime),
        description: "Accepted suggestion",
        timeLabel: "timed",
      } as Event;
    });
  });

  let displayEvents = $derived.by(() =>
    [...selectedDayEvents, ...acceptedEvents].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    ),
  );

  // Suggestion event handlers
  async function handleSuggestionAccept(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleActions.accept(suggestionId, taskList);
  }

  async function handleSuggestionSkip(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleActions.skip(suggestionId, taskList);
  }

  async function handleSuggestionDelete(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleActions.deleteAccepted(suggestionId, taskList);
  }

  async function handleSuggestionResize(
    event: CustomEvent<{ suggestionId: string; newDuration: number }>,
  ) {
    const { suggestionId, newDuration } = event.detail;
    await scheduleActions.updateAcceptedDuration(
      suggestionId,
      newDuration,
      taskList,
    );
  }

  async function handleSuggestionMove(
    event: CustomEvent<{
      suggestionId: string;
      newStartTime: string;
      newEndTime: string;
      newGapId: string;
    }>,
  ) {
    const { suggestionId, newStartTime, newEndTime, newGapId } = event.detail;
    await scheduleActions.moveSuggestion(
      suggestionId,
      newStartTime,
      newEndTime,
      newGapId,
      taskList,
      computedGaps, // Pass the correctly computed gaps with user's active time settings
    );
  }

  async function handleSuggestionDurationChange(
    event: CustomEvent<{ suggestionId: string; newDuration: number }>,
  ) {
    const { suggestionId, newDuration } = event.detail;
    await scheduleActions.updateAcceptedDuration(
      suggestionId,
      newDuration,
      taskList,
      computedGaps, // Pass gaps for constraint calculation
    );
  }

  // Info panel event handlers - update individual selections
  function handleSuggestionSelected(
    event: CustomEvent<{
      type: "pending" | "accepted";
      data:
        | import("$lib/features/assistant/state/schedule.ts").PendingSuggestion
        | import("$lib/features/assistant/state/schedule.ts").AcceptedSuggestion;
    }>,
  ) {
    const { type, data } = event.detail;
    if (type === "pending") {
      selectedSuggestion = {
        type: "pending-suggestion",
        data: data as import("$lib/features/assistant/state/schedule.ts").PendingSuggestion,
        title: getTaskTitle(data.memoId),
      };
    } else {
      selectedSuggestion = {
        type: "accepted-suggestion",
        data: data as import("$lib/features/assistant/state/schedule.ts").AcceptedSuggestion,
        title: getTaskTitle(data.memoId),
      };
    }
    // Clear lower priority selections
    selectedEvent = null;
    selectedGap = null;
  }

  function handleDragPreview(
    event: CustomEvent<{
      title: string;
      startTime: string;
      endTime: string;
      duration: number;
    }>,
  ) {
    selectedSuggestion = {
      type: "drag-preview",
      ...event.detail,
    };
    // Clear lower priority selections
    selectedEvent = null;
    selectedGap = null;
  }

  function handleEventSelected(event: CustomEvent<Event>) {
    selectedEvent = event.detail;
    // Clear lower priority selection
    selectedGap = null;
    // Don't clear suggestion - it has higher priority
  }

  function handleGapSelected(
    event: CustomEvent<{
      start: string;
      end: string;
      duration: number;
      startAngle: number;
      endAngle: number;
    }>,
  ) {
    const gapData = event.detail;
    selectedGap = {
      start: gapData.start,
      end: gapData.end,
      duration: gapData.duration,
      gapId: `gap-${gapData.startAngle}`,
    };
    // Don't clear higher priority selections
  }

  function handleClearSelection() {
    // Only clear suggestion (highest priority)
    // Event and gap remain until explicitly cleared
    selectedSuggestion = null;
  }

  // Info panel actions
  async function handleInfoPanelAccept(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleActions.accept(suggestionId, taskList);
    selectedSuggestion = null;
  }

  async function handleInfoPanelReject(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleActions.skip(suggestionId, taskList);
    selectedSuggestion = null;
  }

  async function handleInfoPanelComplete(
    event: CustomEvent<{
      suggestionId: string;
      memoId: string;
      duration: number;
    }>,
  ) {
    const { suggestionId, memoId, duration } = event.detail;

    // Log progress via remote function
    const { logSuggestionComplete } = await import(
      "$lib/features/tasks/state/memo.functions.remote.ts"
    );
    await logSuggestionComplete({ memoId, durationMinutes: duration });

    // Remove from accepted list
    await scheduleActions.completeSuggestion(suggestionId, memoId, duration);

    // Refresh tasks
    const { fetchMemos } = await import(
      "$lib/features/tasks/state/memo.functions.remote.ts"
    );
    const updatedMemos = await fetchMemos({});
    if (updatedMemos) {
      taskList = updatedMemos.map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt),
        deadline: m.deadline ? new Date(m.deadline) : undefined,
        lastActivity: m.lastActivity ? new Date(m.lastActivity) : undefined,
        status: {
          ...m.status,
          periodStartDate: m.status.periodStartDate
            ? new Date(m.status.periodStartDate)
            : undefined,
        },
      }));
      tasks.set(taskList);
    }

    selectedSuggestion = null;
  }

  function handleInfoPanelMissed(event: CustomEvent<{ suggestionId: string }>) {
    const { suggestionId } = event.detail;
    scheduleActions.missedSuggestion(suggestionId);
    selectedSuggestion = null;
  }

  async function handleInfoPanelDelete(
    event: CustomEvent<{ suggestionId: string }>,
  ) {
    const { suggestionId } = event.detail;
    await scheduleActions.deleteAccepted(suggestionId, taskList);
    selectedSuggestion = null;
  }

  // Component-level event handling is wired directly on the child via on: handlers below
</script>

<div class="relative flex h-full w-full flex-col overflow-hidden bg-base-200/60 backdrop-blur-sm">
  <!-- Main Content -->
  <main class="relative flex h-full min-h-0 w-full flex-1 flex-row items-start overflow-x-hidden overflow-y-auto">
    <!-- Timeline Section - Takes majority of space -->
    <section class="z-10 m-4 flex w-full min-w-0 flex-1 items-stretch justify-center overflow-y-visible">
      <div class="flex min-h-0 w-full flex-1 flex-col items-center gap-4 overflow-y-visible">
        <!-- Info Panel above timeline - always visible -->
        <div class="w-full max-w-2xl px-4">
          <TimelineInfoPanel
            selectedItem={displayedItem}
            on:accept={handleInfoPanelAccept}
            on:reject={handleInfoPanelReject}
            on:complete={handleInfoPanelComplete}
            on:missed={handleInfoPanelMissed}
            on:delete={handleInfoPanelDelete}
          />
        </div>

        <div class="relative h-[min(70vw,60vh)] w-[min(70vw,60vh)] flex-shrink-0 overflow-visible">
          <CircularTimelineCss
            externalGaps={computedGaps}
            pendingSuggestions={$pendingSuggestions}
            acceptedSuggestions={$acceptedSuggestions}
            {getTaskTitle}
            on:eventSelected={handleEventSelected}
            on:gapSelected={handleGapSelected}
            on:suggestionAccept={handleSuggestionAccept}
            on:suggestionSkip={handleSuggestionSkip}
            on:suggestionDelete={handleSuggestionDelete}
            on:suggestionResize={handleSuggestionResize}
            on:suggestionMove={handleSuggestionMove}
            on:suggestionDurationChange={handleSuggestionDurationChange}
            on:suggestionSelected={handleSuggestionSelected}
            on:dragPreview={handleDragPreview}
            on:clearSelection={handleClearSelection}
          />
        </div>

        <!-- Events Card using DaisyUI -->
        <div class="card card-md mb-4 w-full max-w-[720px] bg-base-100 shadow-sm">
          <div class="card-body gap-3">
            <div class="flex items-center justify-between border-b border-base-300 pb-3">
              <h3 class="card-title text-xl font-normal">Events</h3>
              <span class="badge badge-primary badge-outline">{formatDateLabel(dataState.selectedDate)}</span>
            </div>

            {#if displayEvents.length === 0}
              <p class="py-6 text-center text-sm text-base-content/60">
                この日の予定はありません
              </p>
            {:else}
              <ul class="list rounded-box">
                {#each displayEvents as event (event.id)}
                  <li class="list-row hover:bg-base-200/50 transition-colors duration-200">
                    <div class="list-col-grow">
                      <span class="text-sm font-medium">{event.title}</span>
                    </div>
                    <span class="badge badge-ghost text-xs font-medium">
                      {formatEventTime(event)}
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      </div>
    </section>
  </main>
</div>
