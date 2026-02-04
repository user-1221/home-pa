<script lang="ts">
  import { onMount, untrack } from "svelte";
  import CircularTimelineCss from "./CircularTimelineCss.svelte";
  import TimelineInfoPanel from "./TimelineInfoPanel.svelte";
  import CalendarVisibilityToggles from "./CalendarVisibilityToggles.svelte";
  import ActiveTimeControl from "./ActiveTimeControl.svelte";
  import { calendarState, dataState } from "$lib/bootstrap/index.svelte.ts";
  import {
    scheduleState,
    type AcceptedMemoInfo,
    type PendingSuggestion,
    getUnifiedGapState,
  } from "$lib/features/assistant/state";
  import { taskState } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";
  import type { Event, Gap } from "$lib/types.ts";
  import {
    startOfDay,
    endOfDay,
    parseTimeOnDate,
  } from "$lib/utils/date-utils.ts";

  // Get page-scoped UnifiedGapState from context
  const unifiedGapState = getUnifiedGapState();

  // Task list - directly from taskState (reactive)
  let taskList = $derived(taskState.items);

  // ============================================================================
  // INITIALIZATION STATE (Reactive Approach)
  // ============================================================================

  /**
   * Whether the assistant view is fully initialized.
   * Derived from reactive loading states - no manual promise management needed.
   *
   * Becomes true when:
   * 1. Timetable data is loaded (unifiedGapState.isReady)
   * 2. Sync data is loaded (scheduleState.isSyncLoaded)
   *
   * This prevents UI flickering by ensuring all data is ready before rendering.
   */
  let isInitialized = $derived(
    unifiedGapState.isReady && scheduleState.isSyncLoaded,
  );

  // Mark that we're on the assistant tab
  $effect(() => {
    unifiedGapState.setOnAssistantTab(true);
    return () => {
      unifiedGapState.setOnAssistantTab(false);
    };
  });

  // Load timetable events when date changes
  // Runs on initial mount AND when date changes
  $effect(() => {
    const _date = dataState.selectedDate; // Track dependency
    console.log("[PersonalAssistantView] Loading timetable for date change...");
    // Fire-and-forget: state updates will trigger UI reactively
    unifiedGapState.loadTimetableEvents();
  });

  // Selected items for details display - track all separately
  let selectedSuggestion = $state<
    | {
        type: "pending-suggestion";
        data: PendingSuggestion;
        title: string;
        gapEnd: string; // For duration extension limits
      }
    | {
        type: "accepted-suggestion";
        memoId: string;
        data: AcceptedMemoInfo;
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

  onMount(() => {
    // Set today's date on mount
    const now = new Date(Date.now());
    dataState.setSelectedDate(startOfDay(now));

    // ========================================================================
    // REACTIVE INITIALIZATION
    // ========================================================================
    // Loading is triggered by $effect above (timetable) and here (sync data).
    // isInitialized is a $derived that becomes true when both are ready.
    // No await needed - UI renders reactively when data is ready.
    // ========================================================================

    console.log("[PersonalAssistantView] Starting initialization...");

    // Trigger sync data loading (fire-and-forget)
    // The $derived isInitialized will become true when this completes
    scheduleState.loadSyncedData();

    // Load Google Calendar sync state for visibility toggle buttons
    googleSyncState.checkConnection();
  });

  function overlapsDay(eventStart: Date, eventEnd: Date, day: Date) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    return (
      eventStart.getTime() <= dayEnd.getTime() &&
      eventEnd.getTime() >= dayStart.getTime()
    );
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

  // ============================================================================
  // UNIFIED GAP STATE - All gap computation now handled by unifiedGapState
  // This provides:
  // - Reactive current time (updates every minute)
  // - Automatic past time blocking
  // - Automatic enrichment with location labels
  // - Consistent gap computation across initial generation and repopulation
  // ============================================================================

  // Check if selected date is today
  let isTodaySelected = $derived(unifiedGapState.isTodaySelected);

  // Enriched gaps from unified state (includes location labels)
  let enrichedGaps = $derived(unifiedGapState.enrichedGaps);

  // Available gaps for schedule regeneration (accepted + moved subtracted)
  // Note: availableGaps is consumed by schedule.ts via unifiedGapState directly
  let _availableGaps = $derived(unifiedGapState.availableGaps);

  // Gaps for drag operations (only accepted subtracted, moved suggestions don't block)
  // During drag, users should be able to drag over other pending suggestions
  let gapsForDrag = $derived(unifiedGapState.gapsForDrag);

  // ============================================================================
  // SCHEDULE REGENERATION
  // Uses unified gap state for consistent gap computation
  // ============================================================================

  // Auto-generate schedule when dependencies change
  // Svelte 5's $effect automatically tracks: taskList, enrichedGaps, isTodaySelected, isInitialized
  // The effect re-runs when any tracked dependency changes - no manual signature needed
  $effect(() => {
    // Only generate schedule for today AND after initialization
    if (!isTodaySelected || !isInitialized) return;

    // Track dependencies by reading them (Svelte 5 reactivity)
    const currentTasks = taskList;
    const currentGaps = enrichedGaps;

    // Skip if no tasks or gaps
    if (currentTasks.length === 0 && currentGaps.length === 0) return;

    console.log(
      "[PersonalAssistantView] Dependencies changed, regenerating schedule...",
      { tasks: currentTasks.length, gaps: currentGaps.length },
    );

    // Use untrack for the side effect to prevent infinite loops
    // The regenerate call itself shouldn't create new subscriptions
    untrack(() => {
      scheduleState.regenerate(currentTasks, { gaps: currentGaps });
    });
  });

  // Clean up orphaned accepted slots when task list changes
  // This handles cases where:
  // - Task is deleted directly from task list
  // - Task is completed (markComplete) and the task type results in deletion
  //   (deadline without recurrence, backlog)
  $effect(() => {
    // Track taskList changes
    const currentTaskIds = new Set(taskList.map((t) => t.id));

    // Only run after initialization to avoid unnecessary work on first render
    if (!isInitialized) return;

    // Check if any accepted slots reference missing tasks
    const acceptedMemoIds = new Set(
      Array.from(scheduleState.acceptedMemos.values()).map(
        (info) => info.memoId,
      ),
    );

    // Find orphaned slots
    let hasOrphans = false;
    for (const memoId of acceptedMemoIds) {
      if (!currentTaskIds.has(memoId)) {
        hasOrphans = true;
        break;
      }
    }

    // Clean up if orphans found
    if (hasOrphans) {
      untrack(() => {
        scheduleState.cleanupOrphanedSlots(currentTaskIds);
      });
    }
  });

  // Helper to get task title from memoId
  function getTaskTitle(memoId: string): string {
    const task = taskList.find((t) => t.id === memoId);
    return task?.title ?? "Task";
  }

  // Only show suggestions when viewing today
  let filteredPendingSuggestions = $derived.by(() => {
    if (!isTodaySelected) return [];
    return scheduleState.pendingSuggestions;
  });

  // Convert accepted memos to display format for CircularTimeline
  // Also filters out slots where the task no longer exists (safety net)
  let filteredAcceptedForDisplay = $derived.by(() => {
    if (!isTodaySelected) return [];

    // Filter out slots where the task no longer exists (safety net)
    const taskIds = new Set(taskList.map((t) => t.id));

    return Array.from(scheduleState.acceptedMemos.entries())
      .filter(([_key, info]) => taskIds.has(info.memoId))
      .map(([_key, info]) => ({
        memoId: info.memoId,
        startTime: info.startTime,
        endTime: info.endTime,
        duration: info.duration,
        isProgressLogged: info.isProgressLogged,
        actualEndTime: info.actualEndTime,
      }));
  });

  // Convert accepted memos to Event format for display list
  // Also filters out slots where the task no longer exists (safety net)
  let acceptedEvents = $derived.by(() => {
    if (!isTodaySelected) return [];

    const base = startOfDay(dataState.selectedDate);
    // Filter out slots where the task no longer exists (safety net)
    const taskIds = new Set(taskList.map((t) => t.id));

    return Array.from(scheduleState.acceptedMemos.entries())
      .filter(([_key, info]) => taskIds.has(info.memoId))
      .map(([_key, info]) => {
        const title = getTaskTitle(info.memoId);
        return {
          id: `accepted-${info.memoId}`,
          title,
          start: parseTimeOnDate(base, info.startTime),
          end: parseTimeOnDate(base, info.endTime),
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
    await scheduleState.accept(suggestionId);
  }

  async function handleSuggestionSkip(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleState.skip(suggestionId);
  }

  async function handleSuggestionDelete(event: CustomEvent<string>) {
    const memoId = event.detail;
    // Note: No startTime available from this event, use undefined to find first slot
    await scheduleState.deleteAccepted(memoId, undefined, taskList);
  }

  async function handleSuggestionResize(
    event: CustomEvent<{ suggestionId: string; newDuration: number }>,
  ) {
    const { suggestionId, newDuration } = event.detail;
    await scheduleState.updateAcceptedDuration(
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
    await scheduleState.moveSuggestion(
      suggestionId,
      newStartTime,
      newEndTime,
      newGapId,
      taskList,
      gapsForDrag, // Pass gapsForDrag to match CircularTimeline's gap IDs
    );
  }

  async function handleSuggestionDurationChange(
    event: CustomEvent<{ suggestionId: string; newDuration: number }>,
  ) {
    const { suggestionId, newDuration } = event.detail;
    await scheduleState.updateAcceptedDuration(
      suggestionId,
      newDuration,
      taskList,
      gapsForDrag, // Pass gapsForDrag for constraint calculation
    );
  }

  // Info panel event handlers - update individual selections
  function handleSuggestionSelected(
    event: CustomEvent<{
      type: "pending" | "accepted";
      memoId: string;
      data: PendingSuggestion | AcceptedMemoInfo;
    }>,
  ) {
    const { type, memoId, data } = event.detail;
    if (type === "pending") {
      const pendingData = data as PendingSuggestion;
      // Find the gap this suggestion is in to get gapEnd
      const gap = gapsForDrag?.find((g) => g.gapId === pendingData.gapId);
      const gapEnd = gap?.end ?? "23:59"; // Fallback to end of day

      selectedSuggestion = {
        type: "pending-suggestion",
        data: pendingData,
        title: getTaskTitle(memoId),
        gapEnd,
      };
    } else {
      selectedSuggestion = {
        type: "accepted-suggestion",
        memoId,
        data: data as AcceptedMemoInfo,
        title: getTaskTitle(memoId),
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
    // Clear suggestion when user explicitly clicks on an event
    selectedSuggestion = null;
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
    await scheduleState.accept(suggestionId);
    selectedSuggestion = null;
  }

  async function handleInfoPanelReject(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleState.skip(suggestionId);
    selectedSuggestion = null;
  }

  async function handleInfoPanelComplete(
    event: CustomEvent<{
      memoId: string;
      startTime: string;
      duration: number;
    }>,
  ) {
    const { memoId, startTime, duration } = event.detail;

    // Log progress via taskState (updates DB AND store reactively)
    const { taskState } = await import(
      "$lib/features/tasks/state/taskActions.svelte.ts"
    );
    await taskState.logProgress(memoId, duration);

    // Mark as complete with actual wall-clock end time
    const actualEndTime = new Date().toTimeString().slice(0, 5);
    await scheduleState.completeSuggestion(
      memoId,
      startTime,
      duration,
      actualEndTime,
    );

    // taskList is now $derived from taskState.items, no manual update needed

    selectedSuggestion = null;
  }

  async function handleInfoPanelMissed(
    event: CustomEvent<{ memoId: string; startTime: string }>,
  ) {
    const { memoId, startTime } = event.detail;
    await scheduleState.missedSuggestion(memoId, startTime);
    selectedSuggestion = null;
  }

  async function handleInfoPanelDelete(
    event: CustomEvent<{ memoId: string; startTime: string }>,
  ) {
    const { memoId, startTime } = event.detail;
    await scheduleState.deleteAccepted(memoId, startTime, taskList);
    selectedSuggestion = null;
  }

  async function handleInfoPanelDurationChange(
    event: CustomEvent<{
      suggestionId: string;
      newDuration: number;
      newEndTime: string;
    }>,
  ) {
    const { suggestionId, newDuration, newEndTime } = event.detail;

    // Update the pending suggestion in the schedule (triggers regeneration if overlaps were removed)
    await scheduleState.updatePendingDuration(
      suggestionId,
      newDuration,
      newEndTime,
      taskList,
      gapsForDrag,
    );

    // Update the selected suggestion display
    if (
      selectedSuggestion?.type === "pending-suggestion" &&
      selectedSuggestion.data.suggestionId === suggestionId
    ) {
      selectedSuggestion = {
        ...selectedSuggestion,
        data: {
          ...selectedSuggestion.data,
          duration: newDuration,
          endTime: newEndTime,
        },
      };
    }
  }

  // Component-level event handling is wired directly on the child via on: handlers below
</script>

<div
  class="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-base-200/80 to-base-200/40"
>
  <!-- Main Content -->
  <main
    class="relative flex h-full min-h-0 w-full flex-1 flex-row items-start overflow-x-hidden overflow-y-auto"
  >
    <!-- Timeline Section - Takes majority of space -->
    <section
      class="z-10 m-4 flex w-full min-w-0 flex-1 items-stretch justify-center overflow-y-visible"
    >
      <div
        class="flex min-h-0 w-full flex-1 flex-col items-center gap-6 overflow-y-visible"
      >
        <!-- Info Panel above timeline - always visible -->
        <TimelineInfoPanel
          selectedItem={displayedItem}
          on:accept={handleInfoPanelAccept}
          on:reject={handleInfoPanelReject}
          on:complete={handleInfoPanelComplete}
          on:missed={handleInfoPanelMissed}
          on:delete={handleInfoPanelDelete}
          on:durationChange={handleInfoPanelDurationChange}
        />

        <!-- Timeline container with subtle glow effect -->
        <div
          class="relative h-[min(85vw,50vh)] w-[min(85vw,50vh)] flex-shrink-0 overflow-visible"
        >
          <!-- Subtle ambient glow behind timeline -->
          <div
            class="pointer-events-none absolute inset-0 -z-10 rounded-full bg-[var(--color-primary)]/5 blur-3xl"
          ></div>
          <CircularTimelineCss
            externalGaps={gapsForDrag}
            pendingSuggestions={filteredPendingSuggestions}
            acceptedMemos={filteredAcceptedForDisplay}
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

        <!-- Calendar visibility toggles -->
        <div class="mt-4 w-full max-w-[720px]">
          <CalendarVisibilityToggles />
        </div>

        <!-- Active time control -->
        <div class="w-full max-w-[720px]">
          <ActiveTimeControl />
        </div>

        <!-- Events Card with refined styling -->
        <div
          class="card mb-6 w-full max-w-[720px] border border-base-300/50 bg-base-100/80 shadow-lg shadow-base-300/20 backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-base-300/30"
        >
          <div class="card-body gap-4 p-6">
            <div
              class="flex items-center justify-between border-b border-base-300/50 pb-4"
            >
              <h3
                class="flex items-center gap-2 text-lg font-medium tracking-tight"
              >
                <svg
                  class="h-5 w-5 text-[var(--color-primary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
                Events
              </h3>
              <span
                class="rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
                >{formatDateLabel(dataState.selectedDate)}</span
              >
            </div>

            {#if displayEvents.length === 0}
              <div
                class="flex flex-col items-center justify-center py-10 text-base-content/50"
              >
                <svg
                  class="mb-3 h-10 w-10 opacity-40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"
                  />
                </svg>
                <p class="text-sm">この日の予定はありません</p>
              </div>
            {:else}
              <ul class="timeline timeline-vertical">
                {#each displayEvents as event, i (event.id)}
                  <li
                    style="animation: fadeSlideIn 0.3s ease-out {i *
                      50}ms backwards;"
                  >
                    {#if i > 0}<hr class="bg-primary/30" />{/if}
                    <div
                      class="timeline-start text-xs font-medium text-base-content/70"
                    >
                      {formatEventTime(event)}
                    </div>
                    <div class="timeline-middle">
                      <div class="h-3 w-3 rounded-full bg-primary"></div>
                    </div>
                    <div class="timeline-end py-2">
                      <span class="text-sm font-medium">{event.title}</span>
                    </div>
                    {#if i < displayEvents.length - 1}<hr
                        class="bg-primary/30"
                      />{/if}
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

<style>
  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateX(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
