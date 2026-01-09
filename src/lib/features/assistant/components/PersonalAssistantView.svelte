<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import CircularTimelineCss from "./CircularTimelineCss.svelte";
  import TimelineInfoPanel from "./TimelineInfoPanel.svelte";
  import { calendarState, dataState } from "$lib/bootstrap/index.svelte.ts";
  import {
    scheduleActions,
    pendingSuggestions,
    acceptedMemos,
    tasks,
    type AcceptedMemoInfo,
  } from "$lib/bootstrap/compat.svelte.ts";
  import type { Event, Gap } from "$lib/types.ts";
  import { get } from "svelte/store";
  import {
    startOfDay,
    endOfDay,
    parseTimeOnDate,
  } from "$lib/utils/date-utils.ts";
  import { unifiedGapState } from "$lib/features/assistant/state/unified-gaps.svelte.ts";

  // Task list (synced from store via subscription)
  let taskList = $state(get(tasks));

  // ============================================================================
  // INITIALIZATION STATE
  // ============================================================================

  /**
   * Whether the assistant view is fully initialized
   * Initialization sequence:
   * 1. Load blocking items (timetable) → compute unified gaps
   * 2. Load sync data (accepted/rejected from DB)
   * 3. Ready for schedule generation
   */
  let isInitialized = $state(false);

  // Subscribe to tasks store to keep local state in sync
  $effect(() => {
    const unsubscribe = tasks.subscribe((newTasks) => {
      taskList = newTasks;
    });
    return unsubscribe;
  });

  // Mark that we're on the assistant tab
  $effect(() => {
    unifiedGapState.setOnAssistantTab(true);
    return () => {
      unifiedGapState.setOnAssistantTab(false);
    };
  });

  // Load timetable events when date changes (after initial load)
  $effect(() => {
    const _date = dataState.selectedDate; // Track dependency
    if (isInitialized) {
      // Date changed after initialization - reload timetable
      console.log(
        "[PersonalAssistantView] Date changed, reloading timetable...",
      );
      unifiedGapState.loadTimetableEvents();
    }
  });

  // Selected items for details display - track all separately
  let selectedSuggestion = $state<
    | {
        type: "pending-suggestion";
        data: import("$lib/features/assistant/state/schedule.ts").PendingSuggestion;
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

  let unsubscribeTasks: (() => void) | undefined;

  onMount(async () => {
    const now = new Date(Date.now());
    dataState.setSelectedDate(startOfDay(now));

    // Subscribe to tasks store
    unsubscribeTasks = tasks.subscribe((value) => (taskList = value));

    // ========================================================================
    // INITIALIZATION SEQUENCE
    // ========================================================================
    // 1. Load blocking items (timetable) - creates unified gaps
    // 2. Load sync data (accepted/rejected from DB)
    // 3. Mark as initialized - allows schedule generation
    // ========================================================================

    console.log("[PersonalAssistantView] Starting initialization...");

    try {
      // Step 1: Load timetable data (affects gap computation)
      await unifiedGapState.initialize();
      console.log("[PersonalAssistantView] Timetable loaded");

      // Step 2: Load sync data (accepted/rejected suggestions)
      await scheduleActions.loadSyncedData();
      console.log("[PersonalAssistantView] Sync data loaded");

      // Step 3: Mark as initialized - this triggers schedule generation
      isInitialized = true;
      console.log("[PersonalAssistantView] Initialization complete");
    } catch (error) {
      console.error("[PersonalAssistantView] Initialization failed:", error);
      // Still mark as initialized to allow operation with degraded state
      isInitialized = true;
    }
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

  // Reactively compute schedule signature for auto-generation
  // Includes enriched gaps to ensure regeneration when gaps change
  let scheduleSignature = $derived.by(() => {
    // Only generate schedule for today AND after initialization
    if (!isTodaySelected || !isInitialized) return null;

    // Include gap details in signature to detect changes from:
    // - Active time settings changes
    // - Current time passing (past time blocker updates)
    // - Calendar/timetable event changes
    const gapSig = enrichedGaps.map((g) => `${g.start}-${g.end}`).join("|");
    return `t${taskList.length}|g${gapSig}`;
  });

  // Track last schedule signature to avoid re-triggering
  let lastScheduleSignature: string | null = null;

  // Auto-generate schedule when signature changes
  // Only runs after initialization is complete
  $effect(() => {
    if (scheduleSignature && scheduleSignature !== lastScheduleSignature) {
      lastScheduleSignature = scheduleSignature;
      console.log(
        "[PersonalAssistantView] Schedule signature changed, regenerating...",
      );
      // Pass enriched gaps from unified state for consistent pipeline
      scheduleActions.regenerate(taskList, { gaps: enrichedGaps });
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
    return $pendingSuggestions;
  });

  // Convert accepted memos to display format for CircularTimeline
  let filteredAcceptedForDisplay = $derived.by(() => {
    if (!isTodaySelected) return [];
    return Array.from($acceptedMemos.entries()).map(([memoId, info]) => ({
      memoId,
      startTime: info.startTime,
      endTime: info.endTime,
      duration: info.duration,
    }));
  });

  // Convert accepted memos to Event format for display list
  let acceptedEvents = $derived.by(() => {
    if (!isTodaySelected) return [];

    const base = startOfDay(dataState.selectedDate);
    return Array.from($acceptedMemos.entries()).map(([memoId, info]) => {
      const title = getTaskTitle(memoId);

      return {
        id: `accepted-${memoId}`,
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
    await scheduleActions.accept(suggestionId);
  }

  async function handleSuggestionSkip(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleActions.skip(suggestionId);
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
      gapsForDrag, // Pass gapsForDrag to match CircularTimeline's gap IDs
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
      gapsForDrag, // Pass gapsForDrag for constraint calculation
    );
  }

  // Info panel event handlers - update individual selections
  function handleSuggestionSelected(
    event: CustomEvent<{
      type: "pending" | "accepted";
      memoId: string;
      data:
        | import("$lib/features/assistant/state/schedule.ts").PendingSuggestion
        | AcceptedMemoInfo;
    }>,
  ) {
    const { type, memoId, data } = event.detail;
    if (type === "pending") {
      const pendingData =
        data as import("$lib/features/assistant/state/schedule.ts").PendingSuggestion;
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
    await scheduleActions.accept(suggestionId);
    selectedSuggestion = null;
  }

  async function handleInfoPanelReject(event: CustomEvent<string>) {
    const suggestionId = event.detail;
    await scheduleActions.skip(suggestionId);
    selectedSuggestion = null;
  }

  async function handleInfoPanelComplete(
    event: CustomEvent<{
      memoId: string;
      duration: number;
    }>,
  ) {
    const { memoId, duration } = event.detail;

    // Log progress via taskActions (updates DB AND store reactively)
    const { taskActions: actions } = await import(
      "$lib/features/tasks/state/taskActions.ts"
    );
    await actions.logProgress(memoId, duration);

    // Remove from accepted list
    await scheduleActions.completeSuggestion(memoId, duration);

    // Update local taskList from store
    taskList = get(tasks);

    selectedSuggestion = null;
  }

  async function handleInfoPanelMissed(event: CustomEvent<{ memoId: string }>) {
    const { memoId } = event.detail;
    await scheduleActions.missedSuggestion(memoId);
    selectedSuggestion = null;
  }

  async function handleInfoPanelDelete(event: CustomEvent<{ memoId: string }>) {
    const { memoId } = event.detail;
    await scheduleActions.deleteAccepted(memoId, taskList);
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
    await scheduleActions.updatePendingDuration(
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
        <div class="w-full max-w-2xl px-4">
          <TimelineInfoPanel
            selectedItem={displayedItem}
            on:accept={handleInfoPanelAccept}
            on:reject={handleInfoPanelReject}
            on:complete={handleInfoPanelComplete}
            on:missed={handleInfoPanelMissed}
            on:delete={handleInfoPanelDelete}
            on:durationChange={handleInfoPanelDurationChange}
          />
        </div>

        <!-- Timeline container with subtle glow effect -->
        <div
          class="relative h-[min(85vw,75vh)] w-[min(85vw,75vh)] flex-shrink-0 overflow-visible"
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
              <ul class="divide-y divide-base-300/30">
                {#each displayEvents as event, i (event.id)}
                  <li
                    class="group flex items-center justify-between py-3 transition-all duration-200 first:pt-0 last:pb-0 hover:translate-x-1"
                    style="animation: fadeSlideIn 0.3s ease-out {i *
                      50}ms backwards;"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="h-2 w-2 rounded-full bg-[var(--color-primary)]/60 transition-transform duration-200 group-hover:scale-125"
                      ></div>
                      <span class="text-sm font-medium">{event.title}</span>
                    </div>
                    <span
                      class="rounded-md bg-base-200/80 px-2.5 py-1 text-xs font-medium text-base-content/70 transition-colors duration-200 group-hover:bg-base-300/80"
                    >
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
