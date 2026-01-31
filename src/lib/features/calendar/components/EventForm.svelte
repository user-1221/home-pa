<script lang="ts">
  import type { Recurrence } from "$lib/types.ts";
  import { eventFormState, eventActions } from "$lib/bootstrap/index.svelte.ts";
  import {
    utcToLocalDateString,
    utcToLocalTimeString,
  } from "$lib/utils/date-utils.ts";
  import DatePicker from "$lib/features/shared/components/DatePicker.svelte";
  import TimePicker from "$lib/features/shared/components/TimePicker.svelte";
  import TimePickerUI from "$lib/features/shared/components/TimePickerUI.svelte";
  import Button from "$lib/features/shared/components/Button.svelte";
  import { browser } from "$app/environment";
  import { onMount, tick } from "svelte";
  import {
    searchTemplates,
    type EventTemplateData,
  } from "../state/eventTemplate.remote.ts";
  import {
    EVENT_COLOR_PALETTE,
    getColorValue,
  } from "../utils/calendar-helpers.ts";

  interface Props {
    /**
     * When true, renders only the form content without the modal wrapper.
     * Used with ModalContainer for lazy-loading to prevent re-animation.
     */
    contentOnly?: boolean;
  }

  let { contentOnly = false }: Props = $props();

  // Form state
  let eventTitle = $state("");
  let eventStartDate = $state("");
  let eventEndDate = $state("");
  let eventStartTime = $state("");
  let eventEndTime = $state("");
  let eventAddress = $state("");
  let eventImportance = $state<"low" | "medium" | "high">("medium");
  let eventTimeLabel = $state<"all-day" | "some-timing" | "timed">("all-day");
  let eventColor = $state<string | undefined>(undefined);

  // Template suggestions state
  let templateSuggestions = $state<EventTemplateData[]>([]);
  let showTemplateSuggestions = $state(false);
  let titleInputFocused = $state(false);
  let templateSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Tri-state for clarity
  type TimeMode = "default" | "all-day" | "some-timing";
  let timeMode = $state<TimeMode>("default");
  let isGreyState = $derived(timeMode === "default");
  let isEventEditing = $state(false);
  let isManualDateOrTimeEdit = $state(false);

  // Track previous start time for duration preservation
  let previousStartTime = $state<string>("");

  /**
   * Calculate time in minutes from HH:mm string
   */
  function timeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }

  /**
   * Convert minutes to HH:mm string
   */
  function minutesToTime(minutes: number): string {
    // Handle overflow past midnight
    const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(normalizedMinutes / 60);
    const m = normalizedMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  /**
   * Handle start time change with duration preservation
   */
  function handleStartTimeChange(newStartTime: string): void {
    if (
      eventTimeLabel === "timed" &&
      previousStartTime &&
      eventEndTime &&
      newStartTime
    ) {
      // Calculate the original duration
      const originalStartMinutes = timeToMinutes(previousStartTime);
      const originalEndMinutes = timeToMinutes(eventEndTime);
      let duration = originalEndMinutes - originalStartMinutes;
      // Handle overnight events
      if (duration < 0) {
        duration += 1440; // 24 hours in minutes
      }

      // Calculate new end time preserving duration
      const newStartMinutes = timeToMinutes(newStartTime);
      const newEndMinutes = newStartMinutes + duration;
      eventEndTime = minutesToTime(newEndMinutes);
    }

    eventStartTime = newStartTime;
    previousStartTime = newStartTime;
  }
  // Recurrence state
  let isRecurring = $state(false);
  let recurrenceFrequency = $state<"DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY">(
    "WEEKLY",
  );
  let recurrenceInterval = $state(1);
  let recurrenceEndDate = $state<string>("");
  let weeklyDays = $state<boolean[]>([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  let monthlyType = $state<"dayOfMonth" | "nthWeekday">("nthWeekday");
  let isDeleting = $state(false);

  // Calendar picker state
  type ActiveDatePicker = "start" | "end" | "recurrence-end" | null;
  let activeDatePicker = $state<ActiveDatePicker>(null);

  // Time picker state
  type ActiveTimePicker = "start" | "end" | null;
  let activeTimePicker = $state<ActiveTimePicker>(null);
  let activePickerLabel = $derived(() => {
    switch (activeDatePicker) {
      case "start":
        return "開始日";
      case "end":
        return "終了日";
      case "recurrence-end":
        return "繰り返し終了日";
      default:
        return "";
    }
  });

  // Recurring delete dialog state
  let showRecurringDeleteDialog = $state(false);
  type RecurringDeleteOption = "this" | "future" | "all";
  let selectedDeleteOption = $state<RecurringDeleteOption>("this");

  // Track store changes to avoid circular updates
  let lastStoreTitle = $state("");
  let lastStoreAddress = $state("");
  let lastStoreImportance = $state<"low" | "medium" | "high">("medium");
  let lastStoreTimeLabel = $state<"all-day" | "some-timing" | "timed">(
    "all-day",
  );
  let lastStoreStart = $state("");
  let lastStoreEnd = $state("");
  let lastStoreRecurrence = $state<string>("");
  let lastStoreColor = $state<string | undefined>(undefined);

  // Track if we're in a local edit to prevent store sync from overwriting
  let isLocalEdit = $state(false);

  // Sync from store - only when store values actually changed externally
  $effect(() => {
    const form = eventFormState.formData;

    // Skip sync during local edits to prevent circular updates
    if (isLocalEdit) {
      return;
    }

    // Only sync title if store value changed
    if (form.title !== lastStoreTitle) {
      eventTitle = form.title;
      lastStoreTitle = form.title;
    }

    // Only sync dates/times if store values changed AND we're not in manual edit mode
    if (form.start !== lastStoreStart) {
      lastStoreStart = form.start;
      if (form.start) {
        const startDateTime = new Date(form.start);
        eventStartDate = utcToLocalDateString(startDateTime);
        // Only update time if it contains time info (has 'T')
        if (form.start.includes("T")) {
          eventStartTime = utcToLocalTimeString(startDateTime);
          previousStartTime = eventStartTime;
        }
      } else {
        eventStartDate = "";
        eventStartTime = "";
        previousStartTime = "";
      }
    }

    if (form.end !== lastStoreEnd) {
      lastStoreEnd = form.end;
      if (form.end) {
        const endDateTime = new Date(form.end);
        eventEndDate = utcToLocalDateString(endDateTime);
        // Only update time if it contains time info (has 'T')
        if (form.end.includes("T")) {
          eventEndTime = utcToLocalTimeString(endDateTime);
        }
      } else {
        eventEndDate = "";
        eventEndTime = "";
      }
    }

    // Sync timeLabel - handle time defaults for mode switches
    if (form.timeLabel !== lastStoreTimeLabel) {
      lastStoreTimeLabel = form.timeLabel || "timed";
      eventTimeLabel = form.timeLabel || "timed";

      // Set timeMode based on timeLabel
      if (form.timeLabel === "all-day") {
        timeMode = "all-day";
        if (!isManualDateOrTimeEdit) {
          eventStartTime = "00:00";
          eventEndTime = "23:59";
          previousStartTime = "00:00";
        }
      } else if (form.timeLabel === "some-timing") {
        timeMode = "some-timing";
        // Don't clear times for some-timing - keep display values
      } else {
        // timed mode is the default
        timeMode = "default";
      }
    }

    // Sync other fields only when changed
    if ((form.address || "") !== lastStoreAddress) {
      eventAddress = form.address || "";
      lastStoreAddress = form.address || "";
    }

    if ((form.importance || "medium") !== lastStoreImportance) {
      eventImportance = form.importance || "medium";
      lastStoreImportance = form.importance || "medium";
    }

    if (form.color !== lastStoreColor) {
      eventColor = form.color;
      lastStoreColor = form.color;
    }

    isEventEditing = form.isEditing;

    // Sync recurrence from store when editing
    const recurrenceStr = JSON.stringify(form.recurrence ?? { type: "NONE" });
    if (recurrenceStr !== lastStoreRecurrence) {
      lastStoreRecurrence = recurrenceStr;
      parseRecurrenceFromStore(form.recurrence);
    }
  });

  /**
   * Parse recurrence from store and populate local state
   */
  function parseRecurrenceFromStore(recurrence: Recurrence | undefined): void {
    if (!recurrence || recurrence.type === "NONE") {
      isRecurring = false;
      recurrenceFrequency = "WEEKLY";
      recurrenceInterval = 1;
      recurrenceEndDate = "";
      weeklyDays = [false, false, false, false, false, false, false];
      monthlyType = "nthWeekday";
      return;
    }

    isRecurring = true;

    if (recurrence.type === "RRULE" && recurrence.rrule) {
      const rrule = recurrence.rrule;

      // Parse FREQ
      const freqMatch = rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);
      if (freqMatch) {
        recurrenceFrequency = freqMatch[1] as
          | "DAILY"
          | "WEEKLY"
          | "MONTHLY"
          | "YEARLY";
      }

      // Parse INTERVAL
      const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
      if (intervalMatch) {
        recurrenceInterval = parseInt(intervalMatch[1], 10);
      } else {
        recurrenceInterval = 1;
      }

      // Parse UNTIL
      const untilMatch = rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
      if (untilMatch) {
        recurrenceEndDate = `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`;
      } else {
        recurrenceEndDate = "";
      }

      // Parse BYDAY for weekly
      if (recurrenceFrequency === "WEEKLY") {
        const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
        if (bydayMatch) {
          const dayNames = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
          const selectedDays = bydayMatch[1].split(",");
          weeklyDays = dayNames.map((day) => selectedDays.includes(day));
        } else {
          weeklyDays = [false, false, false, false, false, false, false];
        }
      }

      // Parse BYMONTHDAY vs BYDAY for monthly
      if (recurrenceFrequency === "MONTHLY") {
        if (rrule.includes("BYMONTHDAY=")) {
          monthlyType = "dayOfMonth";
        } else {
          monthlyType = "nthWeekday";
        }
      }
    }
  }

  // Sync to store (only when local value differs from last store value)
  $effect(() => {
    if (eventTitle !== lastStoreTitle) {
      eventFormState.updateField("title", eventTitle);
      lastStoreTitle = eventTitle;
    }
  });

  $effect(() => {
    if (eventAddress !== lastStoreAddress) {
      eventFormState.updateField("address", eventAddress);
      lastStoreAddress = eventAddress;
    }
  });

  $effect(() => {
    if (eventImportance !== lastStoreImportance) {
      eventFormState.updateField("importance", eventImportance);
      lastStoreImportance = eventImportance;
    }
  });

  $effect(() => {
    if (eventTimeLabel !== lastStoreTimeLabel) {
      eventFormState.updateField("timeLabel", eventTimeLabel);
      lastStoreTimeLabel = eventTimeLabel;
    }
  });

  $effect(() => {
    const recurrence = buildRecurrenceObject();
    const recurrenceStr = JSON.stringify(recurrence);
    if (recurrenceStr !== lastStoreRecurrence) {
      eventFormState.updateField("recurrence", recurrence);
      lastStoreRecurrence = recurrenceStr;
    }
  });

  $effect(() => {
    const startDateTime =
      eventStartDate && eventStartTime
        ? `${eventStartDate}T${eventStartTime}`
        : "";
    const endDateTime =
      eventEndDate && eventEndTime ? `${eventEndDate}T${eventEndTime}` : "";

    if (startDateTime !== lastStoreStart || endDateTime !== lastStoreEnd) {
      eventFormState.updateFields({
        start: startDateTime,
        end: endDateTime,
      });
      lastStoreStart = startDateTime;
      lastStoreEnd = endDateTime;
    }
  });

  // Sync color to store
  $effect(() => {
    if (eventColor !== lastStoreColor) {
      eventFormState.updateField("color", eventColor);
      lastStoreColor = eventColor;
    }
  });

  // Template search when title changes
  $effect(() => {
    if (!titleInputFocused || !eventTitle || eventTitle.length < 1) {
      templateSuggestions = [];
      showTemplateSuggestions = false;
      return;
    }

    // Debounce search
    if (templateSearchDebounceTimer) {
      clearTimeout(templateSearchDebounceTimer);
    }

    templateSearchDebounceTimer = setTimeout(async () => {
      try {
        const results = await searchTemplates({
          titlePrefix: eventTitle,
          limit: 5,
        });
        templateSuggestions = results;
        showTemplateSuggestions = results.length > 0 && titleInputFocused;
      } catch (err) {
        console.warn("[EventForm] Template search failed:", err);
        templateSuggestions = [];
        showTemplateSuggestions = false;
      }
    }, 200);
  });

  /**
   * Apply a template to the current form
   */
  function applyTemplate(template: EventTemplateData): void {
    eventTitle = template.title;
    eventImportance = template.importance;
    eventColor = template.color;
    if (template.address) {
      eventAddress = template.address;
    }
    eventTimeLabel = template.timeLabel;

    // Apply default times for timed events
    if (template.timeLabel === "timed" && template.defaultStartTime) {
      eventStartTime = template.defaultStartTime;
      if (template.defaultEndTime) {
        eventEndTime = template.defaultEndTime;
      } else if (template.defaultDuration) {
        // Calculate end time from duration
        const [h, m] = template.defaultStartTime.split(":").map(Number);
        const startMinutes = h * 60 + m;
        const endMinutes = startMinutes + template.defaultDuration;
        const endH = Math.floor(endMinutes / 60) % 24;
        const endM = endMinutes % 60;
        eventEndTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      }
      timeMode = "default";
      isManualDateOrTimeEdit = true;
      eventFormState.switchTimeLabel("timed");
    }

    // Sync to store
    eventFormState.updateFields({
      title: template.title,
      importance: template.importance,
      color: template.color,
      address: template.address,
      timeLabel: template.timeLabel,
    });

    // Hide suggestions
    showTemplateSuggestions = false;
    templateSuggestions = [];
  }

  function buildRecurrenceObject(): Recurrence {
    if (!isRecurring) {
      return { type: "NONE" };
    }

    let rrule = `FREQ=${recurrenceFrequency}`;

    if (recurrenceInterval > 1) {
      rrule += `;INTERVAL=${recurrenceInterval}`;
    }

    if (recurrenceFrequency === "WEEKLY" && weeklyDays.some((d) => d)) {
      const dayNames = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
      const selectedDays = weeklyDays
        .map((selected, i) => (selected ? dayNames[i] : null))
        .filter(Boolean)
        .join(",");
      if (selectedDays) {
        rrule += `;BYDAY=${selectedDays}`;
      }
    }

    if (recurrenceFrequency === "MONTHLY") {
      if (monthlyType === "dayOfMonth") {
        const startDate = new Date(
          eventStartDate + "T" + (eventStartTime || "00:00"),
        );
        rrule += `;BYMONTHDAY=${startDate.getDate()}`;
      } else {
        const startDate = new Date(
          eventStartDate + "T" + (eventStartTime || "00:00"),
        );
        const dayOfWeek = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][
          startDate.getDay()
        ];
        const weekOfMonth = Math.ceil(startDate.getDate() / 7);
        const position = weekOfMonth > 4 ? -1 : weekOfMonth;
        rrule += `;BYDAY=${position}${dayOfWeek}`;
      }
    }

    if (recurrenceEndDate) {
      const endDate = new Date(recurrenceEndDate + "T23:59:59");
      const year = endDate.getFullYear();
      const month = String(endDate.getMonth() + 1).padStart(2, "0");
      const day = String(endDate.getDate()).padStart(2, "0");
      rrule += `;UNTIL=${year}${month}${day}T235959Z`;
    }

    return { type: "RRULE", rrule };
  }

  function switchToTimedMode() {
    isLocalEdit = true;
    timeMode = "default";
    isManualDateOrTimeEdit = true;
    eventTimeLabel = "timed";

    // Set default times to 12:00-13:00 if not already set (for new events or switching from all-day/some-timing)
    if (
      !eventStartTime ||
      eventStartTime === "00:00" ||
      eventStartTime === ""
    ) {
      eventStartTime = "12:00";
      previousStartTime = "12:00";
    }
    if (!eventEndTime || eventEndTime === "23:59" || eventEndTime === "") {
      eventEndTime = "13:00";
    }

    // Update tracking vars before calling store
    lastStoreTimeLabel = "timed";
    eventFormState.switchTimeLabel("timed");
    isLocalEdit = false;
  }

  async function handleDelete(): Promise<void> {
    const form = eventFormState.formData;
    if (!form.editingId || isDeleting) return;

    // Check if this is a recurring event
    if (form.recurrence && form.recurrence.type !== "NONE") {
      // Show recurring delete dialog
      showRecurringDeleteDialog = true;
      return;
    }

    // Non-recurring event: simple confirmation
    const confirmed = window.confirm("この予定を削除しますか？");
    if (!confirmed) return;

    isDeleting = true;
    const success = await eventActions.delete(form.editingId);
    isDeleting = false;

    if (success) {
      eventFormState.close();
    }
  }

  async function handleRecurringDelete(): Promise<void> {
    const form = eventFormState.formData;
    if (!form.editingId || isDeleting) return;

    isDeleting = true;
    showRecurringDeleteDialog = false;

    try {
      let success = false;

      // Use occurrenceDate if available (for recurring events), otherwise fall back to form.start
      const targetDate = form.occurrenceDate ?? new Date(form.start);

      if (selectedDeleteOption === "all") {
        // Delete all: simply delete the master event
        success = await eventActions.delete(form.editingId);
      } else if (selectedDeleteOption === "future") {
        // Delete this and future: set UNTIL on the recurrence rule to the day before this occurrence
        success = await eventActions.deleteThisAndFuture(
          form.editingId,
          targetDate,
        );
      } else if (selectedDeleteOption === "this") {
        // Delete only this: add EXDATE to exclude this occurrence
        success = await eventActions.deleteOccurrence(
          form.editingId,
          targetDate,
        );
      }

      if (success) {
        eventFormState.close();
      }
    } finally {
      isDeleting = false;
    }
  }

  function cancelRecurringDelete(): void {
    showRecurringDeleteDialog = false;
    selectedDeleteOption = "this";
  }

  // Import cally on mount
  onMount(async () => {
    if (browser) {
      await import("cally");
    }
  });

  function handleCalendarChange(e: Event) {
    const target = e.target as HTMLElement & { value?: string };
    console.log(
      "[EventForm] Calendar change event:",
      target.value,
      "activeDatePicker:",
      activeDatePicker,
    );
    if (target.value) {
      switch (activeDatePicker) {
        case "start":
          eventStartDate = target.value;
          if (eventTimeLabel === "some-timing") {
            switchToTimedMode();
          }
          break;
        case "end":
          eventEndDate = target.value;
          if (eventTimeLabel === "some-timing") {
            switchToTimedMode();
          }
          break;
        case "recurrence-end":
          recurrenceEndDate = target.value;
          break;
      }
      activeDatePicker = null;
      activeTimePicker = null; // Also close time picker when date is selected
    }
  }

  // Svelte action to add change event listener to calendar-date element
  function calendarChangeAction(node: HTMLElement) {
    const handler = (e: Event) => handleCalendarChange(e);
    node.addEventListener("change", handler);
    return {
      destroy() {
        node.removeEventListener("change", handler);
      },
    };
  }

  // Refs for scrolling
  let startDateCalendarRef: HTMLDivElement | undefined = $state();
  let endDateCalendarRef: HTMLDivElement | undefined = $state();
  let recurrenceEndCalendarRef: HTMLDivElement | undefined = $state();
  let recurrenceSectionRef: HTMLDivElement | undefined = $state();
  let startTimePickerRef: HTMLDivElement | undefined = $state();
  let endTimePickerRef: HTMLDivElement | undefined = $state();

  // Auto-scroll when calendar opens
  $effect(() => {
    if (activeDatePicker) {
      tick().then(() => {
        if (activeDatePicker === "recurrence-end" && recurrenceEndCalendarRef) {
          recurrenceEndCalendarRef.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        } else if (activeDatePicker === "start" && startDateCalendarRef) {
          startDateCalendarRef.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        } else if (activeDatePicker === "end" && endDateCalendarRef) {
          endDateCalendarRef.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      });
    }
  });

  // Auto-scroll when time picker opens
  $effect(() => {
    if (activeTimePicker) {
      tick().then(() => {
        if (activeTimePicker === "start" && startTimePickerRef) {
          startTimePickerRef.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        } else if (activeTimePicker === "end" && endTimePickerRef) {
          endTimePickerRef.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      });
    }
  });

  // Handle start time changes from TimePicker (for duration preservation)
  let lastHandledStartTime = $state("");
  $effect(() => {
    if (
      eventStartTime &&
      eventTimeLabel === "timed" &&
      eventStartTime !== lastHandledStartTime &&
      previousStartTime &&
      eventEndTime
    ) {
      // Only handle if time actually changed and we have previous time
      const originalStartMinutes = timeToMinutes(previousStartTime);
      const originalEndMinutes = timeToMinutes(eventEndTime);
      let duration = originalEndMinutes - originalStartMinutes;
      if (duration < 0) {
        duration += 1440; // 24 hours in minutes
      }

      const newStartMinutes = timeToMinutes(eventStartTime);
      const newEndMinutes = newStartMinutes + duration;
      eventEndTime = minutesToTime(newEndMinutes);
      previousStartTime = eventStartTime;
      lastHandledStartTime = eventStartTime;
    } else if (eventStartTime && eventStartTime !== lastHandledStartTime) {
      // Just update tracking without duration preservation
      previousStartTime = eventStartTime;
      lastHandledStartTime = eventStartTime;
    }
  });

  // Auto-scroll when recurrence section opens
  $effect(() => {
    if (isRecurring && recurrenceSectionRef) {
      tick().then(() => {
        recurrenceSectionRef?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      });
    }
  });

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      activeDatePicker &&
      !target.closest("#shared-calendar-section") &&
      !target.closest("#event-start-date") &&
      !target.closest("#event-end-date") &&
      !target.closest("#recurrence-end")
    ) {
      activeDatePicker = null;
      activeTimePicker = null; // Also close time picker when date is selected
    }
  }

  $effect(() => {
    if (browser && activeDatePicker) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });
</script>

{#snippet formContent()}
  <div
    class="border-subtle flex flex-shrink-0 items-center justify-between border-b bg-base-100 p-4"
  >
    <Button
      variant="ghost"
      size="sm"
      class="btn-square md:hidden"
      onclick={() => eventFormState.close()}
      aria-label="Close"
    >
      ✕
    </Button>
    <h3 class="flex-1 text-left text-lg font-medium md:flex-none">
      {isEventEditing ? "予定を編集" : "新しい予定"}
    </h3>
    {#if isEventEditing}
      <div class="flex gap-2 md:hidden">
        <Button
          variant="danger"
          size="sm"
          rounded="sharp"
          onclick={handleDelete}
          disabled={isDeleting}
          loading={isDeleting}
        >
          削除
        </Button>
        <Button
          variant="primary"
          size="sm"
          rounded="sharp"
          onclick={() => eventActions.submitEventForm()}
        >
          更新
        </Button>
      </div>
    {:else}
      <Button
        variant="primary"
        size="sm"
        rounded="sharp"
        class="md:hidden"
        onclick={() => eventActions.submitEventForm()}
      >
        作成
      </Button>
    {/if}
  </div>

  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
    <!-- Title with Template Suggestions -->
    <div class="form-control relative">
      <input
        id="event-title"
        type="text"
        class="w-full border-0 border-b border-base-300 bg-transparent px-0 py-2 focus:border-[var(--color-primary)] focus:outline-none {eventFormState
          .errors.title
          ? 'border-[var(--color-error-500)]'
          : ''}"
        bind:value={eventTitle}
        placeholder="タイトル"
        onfocus={() => (titleInputFocused = true)}
        onblur={() => {
          // Delay hiding to allow clicking on suggestions
          setTimeout(() => {
            titleInputFocused = false;
            showTemplateSuggestions = false;
          }, 150);
        }}
      />
      {#if eventFormState.errors.title}
        <p class="label">
          <span class="label-text-alt text-[var(--color-error-500)]"
            >{eventFormState.errors.title}</span
          >
        </p>
      {/if}

      <!-- Template Suggestions Dropdown -->
      {#if showTemplateSuggestions && templateSuggestions.length > 0}
        <div
          class="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border border-base-300 bg-base-100 shadow-lg"
        >
          {#each templateSuggestions as template (template.id)}
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2 text-left first:rounded-t-lg last:rounded-b-lg hover:bg-base-200"
              onclick={() => applyTemplate(template)}
            >
              <!-- Color indicator -->
              <div
                class="h-3 w-3 shrink-0 rounded-full"
                style="background-color: {template.color
                  ? getColorValue(template.color)
                  : 'var(--color-primary)'};"
              ></div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">
                  {template.title}
                </div>
                <div
                  class="flex items-center gap-2 text-xs text-base-content/60"
                >
                  <span
                    >{template.timeLabel === "all-day"
                      ? "終日"
                      : template.timeLabel === "some-timing"
                        ? "時間未定"
                        : (template.defaultStartTime ?? "時間あり")}</span
                  >
                  {#if template.address}
                    <span>• {template.address}</span>
                  {/if}
                </div>
              </div>
              <span class="text-xs text-base-content/40">
                {"⭐".repeat(
                  template.importance === "high"
                    ? 3
                    : template.importance === "medium"
                      ? 2
                      : 1,
                )}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Time Label Switches -->
    <div class="form-control">
      <div class="flex gap-2">
        <button
          type="button"
          class="btn flex-1 transition-all duration-200 btn-sm
              {timeMode === 'all-day'
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)] text-[var(--color-primary-800)]'
            : 'border-base-300 btn-ghost'}
              {isGreyState ? 'opacity-60' : ''}"
          onclick={() => {
            isLocalEdit = true;
            if (timeMode === "all-day") {
              // Toggle off - return to default timed mode
              timeMode = "default";
              eventTimeLabel = "timed";
              eventStartTime = "12:00";
              eventEndTime = "13:00";
              previousStartTime = "12:00";
              isManualDateOrTimeEdit = true;
              lastStoreTimeLabel = "timed";
              eventFormState.switchTimeLabel("timed");
            } else {
              // Switch to all-day mode
              timeMode = "all-day";
              eventTimeLabel = "all-day";
              eventStartTime = "00:00";
              eventEndTime = "23:59";
              previousStartTime = "00:00";
              isManualDateOrTimeEdit = false;
              lastStoreTimeLabel = "all-day";
              eventFormState.switchTimeLabel("all-day");
            }
            isLocalEdit = false;
          }}
        >
          終日
        </button>
        <button
          type="button"
          class="btn flex-1 transition-all duration-200 btn-sm
              {timeMode === 'some-timing'
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)] text-[var(--color-primary-800)]'
            : 'border-base-300 btn-ghost'}"
          onclick={() => {
            isLocalEdit = true;
            if (timeMode === "some-timing") {
              // Toggle off - return to default timed mode
              timeMode = "default";
              eventTimeLabel = "timed";
              eventStartTime = "12:00";
              eventEndTime = "13:00";
              previousStartTime = "12:00";
              isManualDateOrTimeEdit = true;
              lastStoreTimeLabel = "timed";
              eventFormState.switchTimeLabel("timed");
            } else {
              // Switch to some-timing mode - keep existing dates, just grey them out
              timeMode = "some-timing";
              eventTimeLabel = "some-timing";
              // Don't modify dates or times - keep them as-is (displayed greyed)
              isManualDateOrTimeEdit = false;
              lastStoreTimeLabel = "some-timing";
              eventFormState.switchTimeLabel("some-timing");
            }
            isLocalEdit = false;
          }}
        >
          どこかのタイミングで
        </button>
      </div>
    </div>

    <!-- Date Settings -->
    <div class="form-control">
      <div class="flex items-center justify-between gap-2">
        <label class="label flex-shrink-0" for="event-start-date-btn">
          <span class="label-text text-sm text-[var(--color-text-secondary)]"
            >開始</span
          >
        </label>
        <div class="flex flex-shrink-0 items-center gap-2">
          <DatePicker
            id="event-start-date"
            bind:value={eventStartDate}
            active={activeDatePicker === "start"}
            disabled={eventTimeLabel === "some-timing"}
            onclick={() => {
              activeTimePicker = null; // Close time picker if open
              activeDatePicker = activeDatePicker === "start" ? null : "start";
            }}
            class="w-auto"
          />
          <TimePicker
            id="event-start-time"
            bind:value={eventStartTime}
            active={activeTimePicker === "start"}
            disabled={eventTimeLabel === "some-timing"}
            onclick={() => {
              activeDatePicker = null; // Close date picker if open
              if (eventTimeLabel === "all-day") {
                switchToTimedMode();
              }
              activeTimePicker = activeTimePicker === "start" ? null : "start";
            }}
            class="w-auto"
          />
        </div>
      </div>
      {#if eventFormState.errors.start}
        <p class="label">
          <span class="label-text-alt text-[var(--color-error-500)]"
            >{eventFormState.errors.start}</span
          >
        </p>
      {/if}

      <!-- Start Date Calendar Picker -->
      {#if activeDatePicker === "start"}
        <div
          id="shared-calendar-section"
          bind:this={startDateCalendarRef}
          class="mt-3 flex justify-center"
        >
          <div class="rounded-box border border-base-300 bg-base-200 p-3">
            <div
              class="mb-2 text-center text-xs font-medium text-[var(--color-text-secondary)]"
            >
              {activePickerLabel()}を選択
            </div>
            <calendar-date
              class="cally bg-base-200"
              value={eventStartDate}
              use:calendarChangeAction
            >
              <svg
                aria-label="Previous"
                class="size-4 fill-current"
                slot="previous"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
              >
                <path d="M15.75 19.5 8.25 12l7.5-7.5"></path>
              </svg>
              <svg
                aria-label="Next"
                class="size-4 fill-current"
                slot="next"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
              >
                <path d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
              </svg>
              <calendar-month></calendar-month>
            </calendar-date>
          </div>
        </div>
      {/if}

      <!-- Start Time Picker -->
      {#if activeTimePicker === "start"}
        <div
          id="start-time-picker-section"
          bind:this={startTimePickerRef}
          class="mt-3 flex justify-center"
        >
          <TimePickerUI bind:value={eventStartTime} />
        </div>
      {/if}
    </div>

    <!-- Time Settings -->
    <div class="form-control">
      <div class="flex items-center justify-between gap-2">
        <label class="label flex-shrink-0" for="event-end-date-btn">
          <span class="label-text text-sm text-[var(--color-text-secondary)]"
            >終了</span
          >
        </label>
        <div class="flex flex-shrink-0 items-center gap-2">
          <DatePicker
            id="event-end-date"
            bind:value={eventEndDate}
            active={activeDatePicker === "end"}
            disabled={eventTimeLabel === "some-timing"}
            onclick={() => {
              activeTimePicker = null; // Close time picker if open
              activeDatePicker = activeDatePicker === "end" ? null : "end";
            }}
            class="w-auto"
          />
          <TimePicker
            id="event-end-time"
            bind:value={eventEndTime}
            active={activeTimePicker === "end"}
            disabled={eventTimeLabel === "some-timing"}
            onclick={() => {
              activeDatePicker = null; // Close date picker if open
              if (eventTimeLabel === "all-day") {
                switchToTimedMode();
              }
              activeTimePicker = activeTimePicker === "end" ? null : "end";
            }}
            class="w-auto"
          />
        </div>
      </div>
      {#if eventFormState.errors.end}
        <p class="label">
          <span class="label-text-alt text-[var(--color-error-500)]"
            >{eventFormState.errors.end}</span
          >
        </p>
      {/if}

      <!-- End Date Calendar Picker -->
      {#if activeDatePicker === "end"}
        <div
          id="shared-calendar-section"
          bind:this={endDateCalendarRef}
          class="mt-3 flex justify-center"
        >
          <div class="rounded-box border border-base-300 bg-base-200 p-3">
            <div
              class="mb-2 text-center text-xs font-medium text-[var(--color-text-secondary)]"
            >
              {activePickerLabel()}を選択
            </div>
            <calendar-date
              class="cally bg-base-200"
              value={eventEndDate}
              use:calendarChangeAction
            >
              <svg
                aria-label="Previous"
                class="size-4 fill-current"
                slot="previous"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
              >
                <path d="M15.75 19.5 8.25 12l7.5-7.5"></path>
              </svg>
              <svg
                aria-label="Next"
                class="size-4 fill-current"
                slot="next"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
              >
                <path d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
              </svg>
              <calendar-month></calendar-month>
            </calendar-date>
          </div>
        </div>
      {/if}

      <!-- End Time Picker -->
      {#if activeTimePicker === "end"}
        <div
          id="end-time-picker-section"
          bind:this={endTimePickerRef}
          class="mt-3 flex justify-center"
        >
          <TimePickerUI
            bind:value={eventEndTime}
            onchange={() => {
              if (eventTimeLabel === "all-day") {
                switchToTimedMode();
              }
            }}
          />
        </div>
      {/if}
    </div>

    <!-- Recurrence Toggle -->
    <div class="form-control py-2">
      <label class="label cursor-pointer justify-start gap-2">
        <input
          type="checkbox"
          class="toggle toggle-primary"
          bind:checked={isRecurring}
        />
        <span class="label-text text-sm text-base-content">繰り返し設定</span>
      </label>
    </div>

    {#if isRecurring}
      <div
        bind:this={recurrenceSectionRef}
        class="card flex flex-col gap-4 p-4"
      >
        <div class="form-control">
          <div class="flex flex-nowrap items-center gap-2">
            <span
              class="label-text text-xs whitespace-nowrap text-[var(--color-text-secondary)]"
              >繰り返し</span
            >
            <input
              id="recurrence-interval-input"
              type="number"
              min="1"
              class="input-bordered input w-[60px] text-center text-sm"
              bind:value={recurrenceInterval}
              placeholder="1"
            />
            <select
              class="select-bordered select text-sm"
              bind:value={recurrenceFrequency}
            >
              <option value="DAILY">日</option>
              <option value="WEEKLY">週</option>
              <option value="MONTHLY">月</option>
              <option value="YEARLY">年</option>
            </select>
            <span
              class="text-xs whitespace-nowrap text-[var(--color-text-secondary)]"
              >ごと</span
            >
          </div>
        </div>

        {#if recurrenceFrequency === "WEEKLY"}
          <div class="form-control">
            <div class="flex flex-nowrap items-center gap-2">
              <span
                class="label-text text-xs whitespace-nowrap text-[var(--color-text-secondary)]"
                >曜日</span
              >
              <div class="flex flex-wrap gap-1" role="group" aria-label="曜日">
                {#each ["日", "月", "火", "水", "木", "金", "土"] as day, i (i)}
                  <label
                    class="btn btn-sm {weeklyDays[i]
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)] text-[var(--color-primary-800)]'
                      : 'border-base-300 btn-ghost'} cursor-pointer transition-all duration-200"
                  >
                    <input
                      type="checkbox"
                      class="hidden"
                      bind:checked={weeklyDays[i]}
                    />
                    {day}
                  </label>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        {#if recurrenceFrequency === "MONTHLY"}
          {@const startDate = new Date(
            eventStartDate + "T" + (eventStartTime || "00:00"),
          )}
          {@const dayOfMonth = startDate.getDate()}
          {@const weekdays = ["日", "月", "火", "水", "木", "金", "土"]}
          {@const weekday = weekdays[startDate.getDay()]}
          {@const weekOfMonth = Math.ceil(dayOfMonth / 7)}
          {@const positionText = weekOfMonth > 4 ? "最終" : `第${weekOfMonth}`}

          <fieldset class="form-control">
            <legend class="label">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
                >繰り返しパターン</span
              >
            </legend>
            <div class="flex flex-col gap-2">
              <label
                class="card cursor-pointer border border-base-300 p-2 transition-all duration-200 {monthlyType ===
                'dayOfMonth'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
                  : ''}"
              >
                <div class="flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-type"
                    value="dayOfMonth"
                    class="radio radio-sm radio-primary"
                    bind:group={monthlyType}
                  />
                  <span class="text-sm">毎月{dayOfMonth}日</span>
                </div>
              </label>
              <label
                class="card cursor-pointer border border-base-300 p-2 transition-all duration-200 {monthlyType ===
                'nthWeekday'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
                  : ''}"
              >
                <div class="flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-type"
                    value="nthWeekday"
                    class="radio radio-sm radio-primary"
                    bind:group={monthlyType}
                  />
                  <span class="text-sm">毎月{positionText}{weekday}曜日</span>
                </div>
              </label>
            </div>
          </fieldset>
        {/if}

        {#if recurrenceFrequency === "YEARLY"}
          {@const startDate = new Date(
            eventStartDate + "T" + (eventStartTime || "00:00"),
          )}
          {@const month = startDate.getMonth() + 1}
          {@const day = startDate.getDate()}

          <div class="form-control">
            <span class="label">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
                >繰り返しパターン</span
              >
            </span>
            <div class="rounded bg-base-100 p-2 text-sm text-base-content">
              毎年{month}月{day}日
            </div>
          </div>
        {/if}

        <div class="form-control">
          <div class="flex flex-nowrap items-center gap-2">
            <span
              class="label-text text-xs whitespace-nowrap text-[var(--color-text-secondary)]"
              >終了日（空欄 = ずっと繰り返す）</span
            >
            <div class="min-w-0 flex-1">
              <DatePicker
                id="recurrence-end"
                bind:value={recurrenceEndDate}
                active={activeDatePicker === "recurrence-end"}
                onclick={() =>
                  (activeDatePicker =
                    activeDatePicker === "recurrence-end"
                      ? null
                      : "recurrence-end")}
              />
            </div>
          </div>

          {#if activeDatePicker === "recurrence-end"}
            <div
              id="shared-calendar-section"
              bind:this={recurrenceEndCalendarRef}
              class="mt-3 flex justify-center"
            >
              <div
                class="rounded-box border border-base-content/10 bg-base-300 p-3"
              >
                <div
                  class="mb-2 text-center text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  {activePickerLabel()}を選択
                </div>
                <calendar-date
                  class="cally bg-base-300"
                  value={recurrenceEndDate}
                  use:calendarChangeAction
                >
                  <svg
                    aria-label="Previous"
                    class="size-4 fill-current"
                    slot="previous"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                  >
                    <path d="M15.75 19.5 8.25 12l7.5-7.5"></path>
                  </svg>
                  <svg
                    aria-label="Next"
                    class="size-4 fill-current"
                    slot="next"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                  >
                    <path d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
                  </svg>
                  <calendar-month></calendar-month>
                </calendar-date>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Address -->
    <div class="form-control">
      <label class="label" for="event-address">
        <span class="label-text text-sm text-[var(--color-text-secondary)]"
          >場所</span
        >
      </label>
      <input
        id="event-address"
        type="text"
        class="input-bordered input w-full"
        bind:value={eventAddress}
        placeholder="場所を入力（任意）"
      />
    </div>

    <!-- 到着目標 (Arrival Target) -->
    <div class="form-control">
      <span class="label">
        <span class="label-text text-sm text-[var(--color-text-secondary)]"
          >到着目標</span
        >
      </span>
      <div class="flex gap-2" role="group" aria-label="到着目標">
        <button
          type="button"
          class="btn flex-1 btn-sm {eventImportance === 'low'
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
            : 'border-base-300 btn-ghost'} border transition-all duration-200"
          onclick={() => (eventImportance = "low")}
        >
          5分前
        </button>
        <button
          type="button"
          class="btn flex-1 btn-sm {eventImportance === 'medium'
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
            : 'border-base-300 btn-ghost'} border transition-all duration-200"
          onclick={() => (eventImportance = "medium")}
        >
          10分前
        </button>
        <button
          type="button"
          class="btn flex-1 btn-sm {eventImportance === 'high'
            ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
            : 'border-base-300 btn-ghost'} border transition-all duration-200"
          onclick={() => (eventImportance = "high")}
        >
          余裕を持って
        </button>
      </div>
    </div>

    <!-- Color Picker -->
    <div class="form-control">
      <span class="label">
        <span class="label-text text-sm text-[var(--color-text-secondary)]"
          >カラー</span
        >
      </span>
      <div class="flex flex-wrap gap-2" role="group" aria-label="カラー選択">
        <!-- Auto color option -->
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-200 {eventColor ===
          undefined
            ? 'ring-opacity-30 border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]'
            : 'border-base-300 hover:border-base-content/30'}"
          onclick={() => (eventColor = undefined)}
          title="自動"
        >
          <span class="text-xs text-base-content/60">自動</span>
        </button>
        {#each EVENT_COLOR_PALETTE as color (color.key)}
          <button
            type="button"
            class="h-8 w-8 rounded-full border-2 transition-all duration-200 {eventColor ===
            color.key
              ? 'ring-opacity-30 scale-110 border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]'
              : 'border-transparent hover:scale-105'}"
            style="background-color: {color.value};"
            onclick={() => (eventColor = color.key)}
            title={color.label}
            aria-label={color.label}
          ></button>
        {/each}
      </div>
    </div>
  </div>

  <!-- General Error Display -->
  {#if eventFormState.errors.general}
    <div
      class="mx-4 flex items-center gap-2 rounded-lg border border-[var(--color-error-500)] bg-[var(--color-error-100)] p-3"
    >
      <div class="text-xl">⚠️</div>
      <div class="text-sm text-[var(--color-error-500)]">
        {eventFormState.errors.general}
      </div>
    </div>
  {/if}

  <!-- Desktop Action Bar -->
  <div
    class="hidden flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-base-300 p-4 md:flex"
  >
    {#if isEventEditing}
      <Button
        variant="danger"
        rounded="sharp"
        class="mr-auto"
        onclick={handleDelete}
        disabled={isDeleting}
        loading={isDeleting}
      >
        {isDeleting ? "削除中..." : "削除"}
      </Button>
      <Button variant="ghost" onclick={() => eventActions.cancelEventForm()}>
        キャンセル
      </Button>
      <Button
        variant="primary"
        rounded="sharp"
        onclick={() => eventActions.submitEventForm()}
      >
        更新
      </Button>
    {:else}
      <Button variant="ghost" onclick={() => eventActions.cancelEventForm()}>
        キャンセル
      </Button>
      <Button
        variant="primary"
        rounded="sharp"
        onclick={() => eventActions.submitEventForm()}
      >
        作成
      </Button>
    {/if}
  </div>
{/snippet}

{#if contentOnly}
  {@render formContent()}
{:else}
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2100] md:modal-middle"
    onkeydown={(e: KeyboardEvent) =>
      e.key === "Escape" && eventFormState.close()}
    role="dialog"
    aria-modal="true"
    aria-label="Event form"
    tabindex="-1"
  >
    <div
      class="modal-box h-full w-full max-w-[500px] overflow-hidden p-0 md:h-auto md:max-h-[90vh] md:overflow-y-auto"
      onclick={(e: MouseEvent) => e.stopPropagation()}
      onkeydown={(e: KeyboardEvent) =>
        e.key === "Escape" && eventFormState.close()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      {@render formContent()}
    </div>
    <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
  </div>
{/if}

<!-- Recurring Delete Dialog -->
{#if showRecurringDeleteDialog}
  <div
    class="modal-open modal z-[2200] md:modal-middle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="recurring-delete-title"
  >
    <div class="modal-box max-w-sm">
      <h3 id="recurring-delete-title" class="mb-4 text-lg font-medium">
        繰り返し予定の削除
      </h3>

      <div class="flex flex-col gap-3">
        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-base-200"
        >
          <input
            type="radio"
            name="deleteOption"
            value="this"
            class="radio radio-primary"
            bind:group={selectedDeleteOption}
          />
          <span class="text-sm">この予定だけを削除</span>
        </label>

        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-base-200"
        >
          <input
            type="radio"
            name="deleteOption"
            value="future"
            class="radio radio-primary"
            bind:group={selectedDeleteOption}
          />
          <span class="text-sm">これ以降の予定を削除</span>
        </label>

        <label
          class="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-base-200"
        >
          <input
            type="radio"
            name="deleteOption"
            value="all"
            class="radio radio-primary"
            bind:group={selectedDeleteOption}
          />
          <span class="text-sm">すべての予定を削除</span>
        </label>
      </div>

      <div class="modal-action mt-6">
        <Button
          variant="ghost"
          onclick={cancelRecurringDelete}
          disabled={isDeleting}
        >
          キャンセル
        </Button>
        <Button
          variant="danger"
          rounded="sharp"
          onclick={handleRecurringDelete}
          disabled={isDeleting}
          loading={isDeleting}
        >
          削除
        </Button>
      </div>
    </div>
    <div
      class="modal-backdrop bg-black/50"
      onclick={cancelRecurringDelete}
      onkeydown={(e: KeyboardEvent) =>
        e.key === "Escape" && cancelRecurringDelete()}
      role="button"
      tabindex="-1"
      aria-label="Close dialog"
    ></div>
  </div>
{/if}
