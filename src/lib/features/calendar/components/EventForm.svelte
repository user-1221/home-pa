<script lang="ts">
  import type { Recurrence } from "$lib/types.ts";
  import {
    dataState,
    eventFormState,
    eventActions,
  } from "$lib/bootstrap/index.svelte.ts";
  import {
    utcToLocalDateString,
    utcToLocalTimeString,
  } from "$lib/utils/date-utils.ts";

  // Form state
  let eventTitle = $state("");
  let eventStartDate = $state("");
  let eventEndDate = $state("");
  let eventStartTime = $state("");
  let eventEndTime = $state("");
  let eventAddress = $state("");
  let eventImportance = $state<"low" | "medium" | "high">("medium");
  let eventTimeLabel = $state<"all-day" | "some-timing" | "timed">("all-day");

  // Tri-state for clarity
  type TimeMode = "default" | "all-day" | "some-timing";
  let timeMode = $state<TimeMode>("default");
  let isGreyState = $derived(timeMode === "default");
  let isEventEditing = $state(false);
  let isManualDateOrTimeEdit = $state(false);
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

  // Sync from store
  $effect(() => {
    const form = eventFormState.formData;

    eventTitle = form.title;
    lastStoreTitle = form.title;

    if (form.start) {
      const startDateTime = new Date(form.start);
      eventStartDate = utcToLocalDateString(startDateTime);
      eventStartTime = utcToLocalTimeString(startDateTime);
    } else {
      eventStartDate = "";
      eventStartTime = "";
    }

    if (form.end) {
      const endDateTime = new Date(form.end);
      eventEndDate = utcToLocalDateString(endDateTime);
      eventEndTime = utcToLocalTimeString(endDateTime);
    } else {
      eventEndDate = "";
      eventEndTime = "";
    }

    if (!isManualDateOrTimeEdit) {
      if (form.timeLabel === "all-day") {
        eventStartTime = "00:00";
        eventEndTime = "23:59";
      } else if (form.timeLabel === "some-timing") {
        eventStartTime = "";
        eventEndTime = "";
      }
    }

    eventAddress = form.address || "";
    lastStoreAddress = form.address || "";
    eventImportance = form.importance || "medium";
    lastStoreImportance = form.importance || "medium";
    eventTimeLabel = form.timeLabel || "all-day";
    lastStoreTimeLabel = form.timeLabel || "all-day";
    isEventEditing = form.isEditing;

    // Track start/end for sync guards
    lastStoreStart = form.start;
    lastStoreEnd = form.end;

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
        recurrenceFrequency = freqMatch[1] as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
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
    timeMode = "default";
    isManualDateOrTimeEdit = true;
    eventTimeLabel = "timed";
    eventFormState.switchTimeLabel("timed");
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
        success = await eventActions.deleteThisAndFuture(form.editingId, targetDate);
      } else if (selectedDeleteOption === "this") {
        // Delete only this: add EXDATE to exclude this occurrence
        success = await eventActions.deleteOccurrence(form.editingId, targetDate);
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
</script>

<div
  class="modal-open modal modal-mobile-fullscreen z-[2100] md:modal-middle"
  onkeydown={(e) => e.key === "Escape" && eventFormState.close()}
  role="dialog"
  aria-modal="true"
  aria-label="Event form"
  tabindex="-1"
>
  <div
    class="modal-box h-full w-full max-w-[500px] overflow-hidden p-0 md:max-h-[90vh] md:h-auto md:overflow-y-auto"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === "Escape" && eventFormState.close()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="flex items-center justify-between border-b border-base-300 bg-base-100 p-4 flex-shrink-0"
    >
      <button
        class="btn btn-square btn-ghost btn-sm md:hidden"
        onclick={() => eventFormState.close()}
        aria-label="Close"
      >
        ✕
      </button>
      <h3 class="text-lg font-medium flex-1 md:flex-none text-left">
        {isEventEditing ? "予定を編集" : "新しい予定"}
      </h3>
      {#if isEventEditing}
        <div class="flex gap-2 md:hidden">
          <button
            type="button"
            class="btn btn-sm btn-outline btn-error"
            onclick={handleDelete}
            disabled={isDeleting}
          >
            {#if isDeleting}
              <span class="loading loading-sm loading-spinner"></span>
            {:else}
              削除
            {/if}
          </button>
          <button
            type="button"
            class="btn btn-sm border-none text-white hover:bg-[var(--color-primary-400)] active:bg-[var(--color-primary-800)]"
            style="background-color: var(--color-primary);"
            onclick={() => eventActions.submitEventForm()}
          >
            更新
          </button>
        </div>
      {:else}
        <button
          type="button"
          class="btn btn-sm md:hidden border-none text-white hover:bg-[var(--color-primary-400)] active:bg-[var(--color-primary-800)]"
          style="background-color: var(--color-primary);"
          onclick={() => eventActions.submitEventForm()}
        >
          作成
        </button>
      {/if}
      <button
        class="btn btn-square btn-ghost btn-sm hidden md:flex"
        onclick={() => eventFormState.close()}
        aria-label="Close"
      >
        ✕
      </button>
    </div>

    <div class="flex flex-col gap-4 p-4 overflow-y-auto flex-1 min-h-0">
      <!-- Title -->
      <div class="form-control">
        <label class="label" for="event-title">
          <span class="label-text text-sm text-[var(--color-text-secondary)]"
            >タイトル</span
          >
        </label>
        <input
          id="event-title"
          type="text"
          class="input-bordered input w-full {eventFormState.errors.title
            ? 'input-error'
            : ''}"
          bind:value={eventTitle}
          placeholder="予定のタイトルを入力"
        />
        {#if eventFormState.errors.title}
          <p class="label">
            <span class="label-text-alt text-[var(--color-error-500)]"
              >{eventFormState.errors.title}</span
            >
          </p>
        {/if}
      </div>

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

      <!-- Importance -->
      <div class="form-control">
        <span class="label">
          <span class="label-text text-sm text-[var(--color-text-secondary)]"
            >重要度</span
          >
        </span>
        <div class="flex gap-2" role="group" aria-label="重要度">
          <button
            type="button"
            class="btn flex-1 btn-sm {eventImportance === 'low'
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
              : 'border-base-300 btn-ghost'} border transition-all duration-200"
            onclick={() => (eventImportance = "low")}
          >
            ⭐
          </button>
          <button
            type="button"
            class="btn flex-1 btn-sm {eventImportance === 'medium'
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
              : 'border-base-300 btn-ghost'} border transition-all duration-200"
            onclick={() => (eventImportance = "medium")}
          >
            ⭐⭐
          </button>
          <button
            type="button"
            class="btn flex-1 btn-sm {eventImportance === 'high'
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
              : 'border-base-300 btn-ghost'} border transition-all duration-200"
            onclick={() => (eventImportance = "high")}
          >
            ⭐⭐⭐
          </button>
        </div>
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
              timeMode = "all-day";
              eventTimeLabel = "all-day";
              eventFormState.switchTimeLabel("all-day");
              eventStartTime = "00:00";
              eventEndTime = "23:59";
              isManualDateOrTimeEdit = false;
            }}
          >
            終日
          </button>
          <button
            type="button"
            class="btn flex-1 transition-all duration-200 btn-sm
              {timeMode === 'some-timing'
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)] text-[var(--color-primary-800)]'
              : 'border-base-300 btn-ghost'}
              {isGreyState ? 'opacity-60' : ''}"
            onclick={() => {
              timeMode = "some-timing";
              eventTimeLabel = "some-timing";
              eventFormState.switchTimeLabel("some-timing");
              const dateString = utcToLocalDateString(dataState.selectedDate);
              eventStartDate = dateString;
              eventEndDate = dateString;
              isManualDateOrTimeEdit = false;
            }}
          >
            どこかのタイミングで
          </button>
        </div>
      </div>

      <!-- Date Settings -->
      <div class="form-control">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="event-start-date">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
                >開始日</span
              >
            </label>
            <input
              id="event-start-date"
              type="date"
              class="input-bordered input w-full"
              bind:value={eventStartDate}
              onfocus={() =>
                eventTimeLabel === "some-timing" && switchToTimedMode()}
              oninput={() =>
                eventTimeLabel === "some-timing" && switchToTimedMode()}
            />
          </div>
          <div>
            <label class="label" for="event-end-date">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
                >終了日</span
              >
            </label>
            <input
              id="event-end-date"
              type="date"
              class="input-bordered input w-full"
              bind:value={eventEndDate}
              onfocus={() =>
                eventTimeLabel === "some-timing" && switchToTimedMode()}
              oninput={() =>
                eventTimeLabel === "some-timing" && switchToTimedMode()}
            />
          </div>
        </div>
      </div>

      <!-- Time Settings -->
      <div class="form-control">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="event-start-time">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
                >開始時間</span
              >
            </label>
            <input
              id="event-start-time"
              type="time"
              class="input-bordered input w-full {eventFormState.errors.start
                ? 'input-error'
                : ''}"
              bind:value={eventStartTime}
              onfocus={() =>
                (eventTimeLabel === "all-day" ||
                  eventTimeLabel === "some-timing") &&
                switchToTimedMode()}
              oninput={() =>
                (eventTimeLabel === "all-day" ||
                  eventTimeLabel === "some-timing") &&
                switchToTimedMode()}
            />
            {#if eventFormState.errors.start}
              <p class="label">
                <span class="label-text-alt text-[var(--color-error-500)]"
                  >{eventFormState.errors.start}</span
                >
              </p>
            {/if}
          </div>
          <div>
            <label class="label" for="event-end-time">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
                >終了時間</span
              >
            </label>
            <input
              id="event-end-time"
              type="time"
              class="input-bordered input w-full {eventFormState.errors.end
                ? 'input-error'
                : ''}"
              bind:value={eventEndTime}
              onfocus={() =>
                (eventTimeLabel === "all-day" ||
                  eventTimeLabel === "some-timing") &&
                switchToTimedMode()}
              oninput={() =>
                (eventTimeLabel === "all-day" ||
                  eventTimeLabel === "some-timing") &&
                switchToTimedMode()}
            />
            {#if eventFormState.errors.end}
              <p class="label">
                <span class="label-text-alt text-[var(--color-error-500)]"
                  >{eventFormState.errors.end}</span
                >
              </p>
            {/if}
          </div>
        </div>
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
        <div class="card flex flex-col gap-4 bg-base-200 p-4">
          <div class="form-control">
            <label class="label" for="recurrence-interval-input">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
                >繰り返し</span
              >
            </label>
            <div class="flex items-center gap-2">
              <input
                id="recurrence-interval-input"
                type="number"
                min="1"
                class="input-bordered input w-[60px] text-center"
                bind:value={recurrenceInterval}
                placeholder="1"
              />
              <select
                class="select-bordered select"
                bind:value={recurrenceFrequency}
              >
                <option value="DAILY">日</option>
                <option value="WEEKLY">週</option>
                <option value="MONTHLY">月</option>
                <option value="YEARLY">年</option>
              </select>
              <span class="text-sm text-[var(--color-text-secondary)]"
                >ごと</span
              >
            </div>
          </div>

          {#if recurrenceFrequency === "WEEKLY"}
            <div class="form-control">
              <span class="label">
                <span
                  class="label-text text-sm text-[var(--color-text-secondary)]"
                  >曜日</span
                >
              </span>
              <div class="flex flex-wrap gap-1" role="group" aria-label="曜日">
                {#each ["日", "月", "火", "水", "木", "金", "土"] as day, i (i)}
                  <label
                    class="btn btn-sm {weeklyDays[i]
                      ? 'border-none text-white hover:bg-[var(--color-primary-400)] active:bg-[var(--color-primary-800)]'
                      : 'border-base-300 btn-ghost'} cursor-pointer transition-all duration-200"
                    style={weeklyDays[i] ? 'background-color: var(--color-primary);' : ''}
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
          {/if}

          {#if recurrenceFrequency === "MONTHLY"}
            {@const startDate = new Date(
              eventStartDate + "T" + (eventStartTime || "00:00"),
            )}
            {@const dayOfMonth = startDate.getDate()}
            {@const weekdays = ["日", "月", "火", "水", "木", "金", "土"]}
            {@const weekday = weekdays[startDate.getDay()]}
            {@const weekOfMonth = Math.ceil(dayOfMonth / 7)}
            {@const positionText =
              weekOfMonth > 4 ? "最終" : `第${weekOfMonth}`}

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
            <label class="label" for="recurrence-end">
              <span
                class="label-text text-sm text-[var(--color-text-secondary)]"
              >
                終了日
                <span class="ml-1 text-xs opacity-70"
                  >空欄 = ずっと繰り返す</span
                >
              </span>
            </label>
            <input
              id="recurrence-end"
              type="date"
              class="input-bordered input w-full"
              bind:value={recurrenceEndDate}
            />
          </div>
        </div>
      {/if}
    </div>

    <!-- General Error Display -->
    {#if eventFormState.errors.general}
      <div
        class="mx-4 flex items-center gap-2 rounded-lg border border-[var(--color-error-500)] bg-[var(--color-error-100)] p-3"
      >
        <div class="text-xl">⚠️</div>
        <div class="text-sm text-[var(--color-error-500)]">{eventFormState.errors.general}</div>
      </div>
    {/if}

    <!-- Desktop Action Bar -->
    <div
      class="hidden md:flex flex-wrap items-center justify-end gap-2 border-t border-base-300 p-4 flex-shrink-0"
    >
      {#if isEventEditing}
        <button
          type="button"
          class="btn mr-auto btn-outline btn-error"
          onclick={handleDelete}
          disabled={isDeleting}
        >
          {#if isDeleting}
            <span class="loading loading-sm loading-spinner"></span>
            削除中...
          {:else}
            削除
          {/if}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => eventActions.cancelEventForm()}
        >
          キャンセル
        </button>
        <button
          type="button"
          class="btn border-none text-white hover:bg-[var(--color-primary-400)] active:bg-[var(--color-primary-800)]"
          style="background-color: var(--color-primary);"
          onclick={() => eventActions.submitEventForm()}
        >
          更新
        </button>
      {:else}
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => eventActions.cancelEventForm()}
        >
          キャンセル
        </button>
        <button
          type="button"
          class="btn border-none text-white hover:bg-[var(--color-primary-400)] active:bg-[var(--color-primary-800)]"
          style="background-color: var(--color-primary);"
          onclick={() => eventActions.submitEventForm()}
        >
          作成
        </button>
      {/if}
    </div>
  </div>
  <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
</div>

<!-- Recurring Delete Dialog -->
{#if showRecurringDeleteDialog}
  <div
    class="modal-open modal z-[2200] md:modal-middle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="recurring-delete-title"
  >
    <div class="modal-box max-w-sm">
      <h3 id="recurring-delete-title" class="text-lg font-medium mb-4">
        繰り返し予定の削除
      </h3>
      
      <div class="flex flex-col gap-3">
        <label class="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-base-200">
          <input
            type="radio"
            name="deleteOption"
            value="this"
            class="radio radio-primary"
            bind:group={selectedDeleteOption}
          />
          <span class="text-sm">この予定だけを削除</span>
        </label>
        
        <label class="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-base-200">
          <input
            type="radio"
            name="deleteOption"
            value="future"
            class="radio radio-primary"
            bind:group={selectedDeleteOption}
          />
          <span class="text-sm">これ以降の予定を削除</span>
        </label>
        
        <label class="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-base-200">
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
        <button
          type="button"
          class="btn btn-ghost"
          onclick={cancelRecurringDelete}
          disabled={isDeleting}
        >
          キャンセル
        </button>
        <button
          type="button"
          class="btn btn-error"
          onclick={handleRecurringDelete}
          disabled={isDeleting}
        >
          {#if isDeleting}
            <span class="loading loading-sm loading-spinner"></span>
          {:else}
            削除
          {/if}
        </button>
      </div>
    </div>
    <div
      class="modal-backdrop bg-black/50"
      onclick={cancelRecurringDelete}
      onkeydown={(e) => e.key === "Escape" && cancelRecurringDelete()}
      role="button"
      tabindex="-1"
      aria-label="Close dialog"
    ></div>
  </div>
{/if}
