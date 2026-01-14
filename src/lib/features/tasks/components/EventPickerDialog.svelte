<script lang="ts">
  import type { Event } from "$lib/types";
  import type { TaskFormEventLink } from "../state/taskForm.svelte.ts";
  import { fetchEvents } from "$lib/features/calendar/state/calendar.functions.remote";
  import { loadTimetableData } from "$lib/features/calendar/services/timetable-events";
  import { getEventColor } from "$lib/features/calendar/utils/index";
  import { Button } from "$lib/features/shared/components/index.ts";

  // Local type for timetable items in the picker (different from TimetableEvent which has start/end)
  interface TimetablePickerItem {
    id: string;
    cellId: string;
    title: string;
    dayOfWeek: number;
    slotIndex: number;
    attendance: string;
    workAllowed: string;
    dayLabel: string;
  }

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (eventLink: TaskFormEventLink) => void;
  }

  let { isOpen, onClose, onSelect }: Props = $props();

  // Tab state
  type TabType = "calendar" | "timetable";
  let activeTab = $state<TabType>("calendar");

  // Loading states
  let isLoadingCalendar = $state(false);
  let isLoadingTimetable = $state(false);

  // Data
  let calendarEvents = $state<Event[]>([]);
  let timetableItems = $state<TimetablePickerItem[]>([]);

  // Load data when dialog opens
  $effect(() => {
    if (isOpen) {
      loadCalendarEvents();
      loadTimetableEvents();
    }
  });

  async function loadCalendarEvents() {
    isLoadingCalendar = true;
    try {
      const now = new Date();
      const start = now.toISOString();
      // Get events for next 30 days
      const end = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const events = await fetchEvents({ start, end });
      // Convert JSON dates back to Date objects
      calendarEvents = events.map((e: Record<string, unknown>) => ({
        ...e,
        start: new Date(e.start as string),
        end: new Date(e.end as string),
      })) as Event[];
    } catch (err) {
      console.error("[EventPickerDialog] Failed to load calendar events:", err);
      calendarEvents = [];
    } finally {
      isLoadingCalendar = false;
    }
  }

  async function loadTimetableEvents() {
    isLoadingTimetable = true;
    try {
      const { cells } = await loadTimetableData();
      // Convert cells to TimetablePickerItem format for display
      const dayNames = ["月", "火", "水", "木", "金"];
      timetableItems = cells.map((cell) => ({
        id: `timetable-${cell.id}`,
        cellId: cell.id,
        title: cell.title,
        dayOfWeek: cell.dayOfWeek,
        slotIndex: cell.slotIndex,
        attendance: cell.attendance,
        workAllowed: cell.workAllowed,
        dayLabel: dayNames[cell.dayOfWeek] ?? "",
      }));
    } catch (err) {
      console.error(
        "[EventPickerDialog] Failed to load timetable events:",
        err,
      );
      timetableItems = [];
    } finally {
      isLoadingTimetable = false;
    }
  }

  function handleSelectCalendarEvent(event: Event) {
    onSelect({
      type: "calendar",
      calendarEventId: event.id,
      eventTitle: event.title,
      offset: "same_day_after",
    });
  }

  function handleSelectTimetableItem(item: TimetablePickerItem) {
    onSelect({
      type: "timetable",
      timetableCellId: item.cellId,
      eventTitle: item.title,
      offset: "same_day_after",
    });
  }

  function formatEventTime(event: Event): string {
    if (event.timeLabel === "all-day") {
      return "終日";
    }
    const start = event.start;
    return `${start.getHours().toString().padStart(2, "0")}:${start.getMinutes().toString().padStart(2, "0")}`;
  }

  function formatEventDate(event: Event): string {
    const date = event.start;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day} (${weekday})`;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-[2200] flex items-center justify-center bg-base-content/60 p-4 backdrop-blur-sm"
    onclick={() => onClose()}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-base-300 bg-base-100 shadow-xl"
      onclick={(e: MouseEvent) => e.stopPropagation()}
      onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-base-300 p-4"
      >
        <h3 class="text-lg font-medium">イベントを選択</h3>
        <Button variant="ghost" size="sm" onclick={onClose} aria-label="閉じる">
          <svg
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-base-300">
        <button
          class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors
            {activeTab === 'calendar'
            ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
            : 'text-base-content/60 hover:text-base-content'}"
          onclick={() => (activeTab = "calendar")}
        >
          カレンダー
        </button>
        <button
          class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors
            {activeTab === 'timetable'
            ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
            : 'text-base-content/60 hover:text-base-content'}"
          onclick={() => (activeTab = "timetable")}
        >
          時間割
        </button>
      </div>

      <!-- Content -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if activeTab === "calendar"}
          {#if isLoadingCalendar}
            <div class="flex items-center justify-center p-8">
              <span class="loading loading-md loading-spinner"></span>
            </div>
          {:else if calendarEvents.length === 0}
            <div class="p-8 text-center text-sm text-base-content/60">
              今後30日間の予定がありません
            </div>
          {:else}
            <div class="divide-y divide-base-300/50">
              {#each calendarEvents as event (event.id)}
                <button
                  class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-200/50"
                  onclick={() => handleSelectCalendarEvent(event)}
                >
                  <div
                    class="h-3 w-3 shrink-0 rounded-full"
                    style="background-color: {getEventColor(event)};"
                  ></div>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">
                      {event.title}
                    </div>
                    <div class="text-xs text-base-content/60">
                      {formatEventDate(event)}
                      {formatEventTime(event)}
                      {#if event.recurrence && event.recurrence.type !== "NONE"}
                        <span class="ml-1 text-info">(繰り返し)</span>
                      {/if}
                    </div>
                  </div>
                  <svg
                    class="h-4 w-4 shrink-0 text-base-content/40"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              {/each}
            </div>
          {/if}
        {:else if isLoadingTimetable}
          <div class="flex items-center justify-center p-8">
            <span class="loading loading-md loading-spinner"></span>
          </div>
        {:else if timetableItems.length === 0}
          <div class="p-8 text-center text-sm text-base-content/60">
            時間割が登録されていません
          </div>
        {:else}
          <div class="divide-y divide-base-300/50">
            {#each timetableItems as item (item.id)}
              <button
                class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-200/50"
                onclick={() => handleSelectTimetableItem(item)}
              >
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-medium
                      {item.workAllowed === '作業不可'
                    ? 'bg-error/10 text-error'
                    : 'bg-success/10 text-success'}"
                >
                  {item.dayLabel}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">{item.title}</div>
                  <div class="text-xs text-base-content/60">
                    {item.slotIndex + 1}限目
                    <span class="ml-1">
                      {item.attendance === "出席必須" ? "出席必須" : "出欠自由"}
                    </span>
                  </div>
                </div>
                <svg
                  class="h-4 w-4 shrink-0 text-base-content/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="border-t border-base-300 p-4">
        <p class="text-xs text-base-content/60">
          選択したイベントに連動して締切が自動設定されます
        </p>
      </div>
    </div>
  </div>
{/if}
