<script lang="ts">
  import { slide } from "svelte/transition";
  import { tick, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { taskFormState } from "$lib/features/tasks/state/taskForm.svelte.ts";
  import { taskState } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import Button from "$lib/features/shared/components/Button.svelte";
  import SlidingSelector from "$lib/features/shared/components/SlidingSelector.svelte";
  import DatePicker from "$lib/features/shared/components/DatePicker.svelte";
  import type {
    MemoType,
    LocationPreference,
    ImportanceLevel,
  } from "$lib/types.ts";
  import type { EventDeadlineOffset } from "../types/event-link.ts";
  import { OFFSET_OPTIONS } from "../types/event-link.ts";
  import EventPickerDialog from "./EventPickerDialog.svelte";

  interface Props {
    /**
     * When true, renders only the form content without the modal wrapper.
     * Used with ModalContainer for lazy-loading to prevent re-animation.
     */
    contentOnly?: boolean;
  }

  let { contentOnly = false }: Props = $props();

  // Advanced settings section state
  let showAdvancedSettings = $state(false);

  // Event picker dialog state
  let showEventPicker = $state(false);

  // Date picker state
  let activeDatePicker = $state<"deadline" | null>(null);
  let deadlineCalendarRef: HTMLDivElement | undefined = $state();

  // Lazy load Cally calendar library
  onMount(async () => {
    if (browser) {
      await import("cally");
    }
  });

  // Calendar change action for Cally web component
  function calendarChangeAction(node: HTMLElement) {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement & { value?: string };
      if (target.value) {
        taskFormState.updateField("deadline", target.value);
        activeDatePicker = null;
      }
    };
    node.addEventListener("change", handler);
    return {
      destroy() {
        node.removeEventListener("change", handler);
      },
    };
  }

  // Click outside handler to close date picker
  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      activeDatePicker &&
      !target.closest("#deadline-calendar-section") &&
      !target.closest("#deadline-picker-btn")
    ) {
      activeDatePicker = null;
    }
  }

  // Register click outside listener when date picker is active
  $effect(() => {
    if (browser && activeDatePicker) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });

  // Scroll calendar into view when opened
  $effect(() => {
    if (activeDatePicker === "deadline") {
      tick().then(() => {
        deadlineCalendarRef?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      });
    }
  });

  // Type options
  const typeOptions: { value: MemoType; label: string; description: string }[] =
    [
      {
        value: "期限付き",
        label: "締切あり",
        description: "Task with a due date",
      },
      {
        value: "バックログ",
        label: "バックログ",
        description: "Task without urgency",
      },
      {
        value: "ルーティン",
        label: "ルーティーン",
        description: "Recurring task",
      },
    ];

  // Location options (UI labels in Japanese, internal values unchanged)
  const locationOptions: { value: LocationPreference; label: string }[] = [
    { value: "home/near_home", label: "🏠 自宅/自宅付近" },
    { value: "workplace/near_workplace", label: "🏢 勤務地" },
    { value: "no_preference", label: "どこでも" },
  ];

  // Period options
  const periodOptions: { value: "day" | "week" | "month"; label: string }[] = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];

  // Genre options
  const genreOptions: string[] = [
    "勉強",
    "仕事",
    "運動",
    "家事",
    "趣味",
    "買い物",
    "その他",
  ];

  // Importance options
  const importanceOptions: { value: ImportanceLevel; label: string }[] = [
    { value: "low", label: "低" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
  ];

  // Auto-expand advanced settings when editing with LLM values
  $effect(() => {
    if (taskFormState.isEditing) {
      // Open advanced settings if there are any LLM-enriched values to edit
      // Note: totalDurationExpected only applies to backlog tasks now
      const hasEnrichedValues =
        taskFormState.genre ||
        taskFormState.importance ||
        taskFormState.sessionDuration ||
        (taskFormState.type === "バックログ" &&
          taskFormState.totalDurationExpected);
      if (hasEnrichedValues) {
        showAdvancedSettings = true;
      }
    } else {
      // Reset when creating new task
      showAdvancedSettings = false;
    }
  });

  // Handlers
  function handleClose() {
    taskFormState.closeForm();
    showAdvancedSettings = false;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    await taskState.submit();
  }

  function handleTypeChange(type: MemoType) {
    taskFormState.setType(type);
  }
</script>

{#snippet formContent()}
  <!-- Header -->
  <div
    class="sticky top-0 z-10 flex min-h-14 flex-shrink-0 items-center justify-between border-b border-base-300 bg-base-100 px-4 md:min-h-16 md:px-5"
  >
    <button
      class="btn btn-circle text-base-content/60 btn-ghost btn-sm hover:text-base-content md:hidden"
      onclick={handleClose}
      aria-label="Close"
    >
      <svg
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>

    <div
      class="flex flex-1 items-center justify-center gap-3 md:flex-none md:justify-start"
    >
      <div
        class="hidden h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-100)] md:flex"
      >
        <svg
          class="h-4 w-4 text-[var(--color-primary)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h3 class="text-base font-medium tracking-tight text-base-content">
        {taskFormState.isEditing ? "タスクを編集" : "新しいタスク"}
      </h3>
    </div>

    <button
      type="button"
      class="btn gap-1 text-sm font-medium shadow-sm btn-sm btn-primary md:hidden"
      disabled={!taskFormState.isValid || taskFormState.isSubmitting}
      onclick={async (e: MouseEvent) => {
        e.preventDefault();
        await taskState.submit();
      }}
    >
      {#if taskFormState.isSubmitting}
        <span class="loading loading-sm loading-spinner"></span>
      {:else}
        {taskFormState.isEditing ? "更新" : "作成"}
      {/if}
    </button>

    <button
      class="btn hidden btn-circle text-base-content/60 btn-ghost btn-sm hover:text-base-content md:flex"
      onclick={handleClose}
      aria-label="Close"
    >
      <svg
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>

  <form onsubmit={handleSubmit} class="flex min-h-0 flex-1 flex-col">
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <!-- Basic Info Section -->
      <div class="space-y-4 p-4 md:p-5">
        <!-- Title -->
        <div class="form-control">
          <input
            id="title"
            type="text"
            class="w-full border-0 border-b border-base-300 bg-transparent px-0 py-2 focus:border-[var(--color-primary)] focus:outline-none focus-visible:!outline-none {taskFormState
              .errors.title
              ? 'border-[var(--color-error-500)]'
              : ''}"
            bind:value={taskFormState.title}
            placeholder="タスク名"
          />
          {#if taskFormState.errors.title}
            <p class="label">
              <span class="label-text-alt text-[var(--color-error-500)]"
                >{taskFormState.errors.title}</span
              >
            </p>
          {/if}
        </div>

        <!-- Type -->
        <div class="space-y-1.5">
          <span class="text-xs font-medium text-[var(--color-text-muted)]"
            >タイプ</span
          >
          <SlidingSelector
            options={typeOptions.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            selected={taskFormState.type}
            onSelect={(value) => handleTypeChange(value as MemoType)}
          />
        </div>
      </div>

      <!-- Scheduling Section -->
      {#if taskFormState.type === "期限付き"}
        <div
          class="space-y-4 border-t border-base-300/60 p-4 md:p-5"
          transition:slide={{ duration: 300, axis: "y" }}
        >
          <div class="flex items-center gap-2">
            <svg
              class="h-4 w-4 text-[var(--color-text-secondary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span class="text-xs font-medium text-[var(--color-text-secondary)]"
              >スケジュール</span
            >
          </div>

          <!-- Deadline -->
          {#if taskFormState.showDeadlineField}
            <div class="space-y-1.5">
              <!-- Show event link if set -->
              {#if taskFormState.eventLink}
                <div
                  class="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary-100)] p-3"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div
                        class="flex items-center gap-1.5 text-xs text-[var(--color-primary)]"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          class="h-3.5 w-3.5"
                          aria-hidden="true"
                        >
                          <path
                            d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z"
                          />
                          <path
                            d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z"
                          />
                        </svg>
                        イベント連携
                      </div>
                      <div
                        class="mt-1 truncate text-sm font-medium text-base-content"
                      >
                        {taskFormState.eventLink.eventTitle}
                      </div>
                      <div
                        class="mt-0.5 text-xs text-[var(--color-text-secondary)]"
                      >
                        {taskFormState.eventLink.type === "calendar"
                          ? "カレンダー予定"
                          : "時間割"}
                        • {OFFSET_OPTIONS.find(
                          (o) => o.value === taskFormState.eventLink?.offset,
                        )?.label ?? ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-circle text-base-content/40 btn-ghost btn-xs hover:text-base-content"
                      onclick={() => taskFormState.clearEventLink()}
                      aria-label="イベント連携を解除"
                    >
                      <svg
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <!-- Offset selector -->
                  <div
                    class="mt-2 border-t border-[var(--color-primary)]/20 pt-2"
                  >
                    <select
                      class="select w-full border-base-300 bg-base-100 select-sm focus:border-[var(--color-primary)] focus:outline-none"
                      value={taskFormState.eventLink.offset}
                      onchange={(
                        e: Event & { currentTarget: HTMLSelectElement },
                      ) => {
                        if (taskFormState.eventLink) {
                          taskFormState.setEventLink({
                            ...taskFormState.eventLink,
                            offset: e.currentTarget
                              .value as EventDeadlineOffset,
                          });
                        }
                      }}
                    >
                      {#each OFFSET_OPTIONS as opt (opt.value)}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                    </select>
                  </div>
                </div>
              {:else}
                <!-- Manual deadline input or event link button -->
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2">
                    <div class="flex flex-1 items-center gap-2">
                      <label
                        class="shrink-0 text-xs font-medium text-[var(--color-text-muted)]"
                        for="deadline"
                      >
                        期限
                      </label>
                      <DatePicker
                        id="deadline-picker"
                        value={taskFormState.deadline}
                        active={activeDatePicker === "deadline"}
                        onclick={() => {
                          activeDatePicker =
                            activeDatePicker === "deadline" ? null : "deadline";
                        }}
                        class="flex-1 {taskFormState.errors.deadline
                          ? 'border-error'
                          : ''}"
                      />
                    </div>
                    <div class="h-5 w-px flex-shrink-0 bg-base-300/50"></div>
                    <div class="flex flex-1 items-center justify-center gap-2">
                      <span
                        class="shrink-0 text-xs font-medium text-[var(--color-text-muted)]"
                      >
                        予定
                      </span>
                      <button
                        type="button"
                        class="btn flex-1 gap-1.5 border border-base-300 bg-base-100 text-sm text-base-content/70 btn-ghost hover:border-base-300 hover:bg-base-200 hover:text-base-content"
                        onclick={() => (showEventPicker = true)}
                        aria-label="イベントから選択"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          class="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z"
                          />
                          <path
                            d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z"
                          />
                        </svg>
                        連携
                      </button>
                    </div>
                  </div>

                  <!-- Mini Calendar -->
                  {#if activeDatePicker === "deadline"}
                    <div
                      id="deadline-calendar-section"
                      bind:this={deadlineCalendarRef}
                      class="mt-3 flex justify-center"
                    >
                      <div
                        class="rounded-box border border-base-300 bg-base-200 p-3"
                      >
                        <div
                          class="mb-2 text-center text-xs font-medium text-[var(--color-text-secondary)]"
                        >
                          期限を選択
                        </div>
                        <calendar-date
                          class="cally bg-base-200"
                          value={taskFormState.deadline}
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
              {/if}

              {#if taskFormState.errors.deadline}
                <p class="text-xs text-error">
                  {taskFormState.errors.deadline}
                </p>
              {/if}
            </div>
          {/if}

          <!-- Recurrence Goal -->
          {#if taskFormState.showRecurrenceFields}
            <div class="space-y-1.5">
              <label
                class="text-xs font-medium text-[var(--color-text-muted)]"
                for="recurrence-count"
              >
                目標
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="recurrence-count"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  bind:value={taskFormState.recurrenceCount}
                  class="input w-20 border-base-300 bg-base-100 text-center focus:border-[var(--color-primary)] focus:outline-none"
                  aria-label="回数"
                />
                <span class="text-sm text-[var(--color-text-muted)]">回 /</span>
                <select
                  id="recurrence-period"
                  bind:value={taskFormState.recurrencePeriod}
                  class="select flex-1 border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                  aria-label="期間"
                >
                  {#each periodOptions as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
              {#if taskFormState.errors.recurrence}
                <p class="text-xs text-error">
                  {taskFormState.errors.recurrence}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Location (visible for all types) -->
      <div class="space-y-4 border-t border-base-300/60 p-4 md:p-5">
        <div class="space-y-1.5">
          <span class="text-xs font-medium text-[var(--color-text-muted)]"
            >場所</span
          >
          <SlidingSelector
            options={locationOptions.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            selected={taskFormState.locationPreference}
            onSelect={(value) =>
              taskFormState.updateField(
                "locationPreference",
                value as LocationPreference,
              )}
          />
        </div>
      </div>

      <!-- Advanced Settings Collapsible -->
      <div class="border-t border-base-300/60 bg-base-100 p-4 md:p-5">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg py-1 text-sm font-medium text-[var(--color-text-secondary)] transition-colors duration-150 hover:text-base-content"
          onclick={() => (showAdvancedSettings = !showAdvancedSettings)}
        >
          <svg
            class="h-4 w-4 transition-transform duration-200 {showAdvancedSettings
              ? 'rotate-90'
              : ''}"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          詳細設定
        </button>

        {#if showAdvancedSettings}
          <div
            class="mt-4 flex flex-col gap-4 rounded-lg border border-base-300/60 bg-[var(--color-bg-grid)] p-4"
            transition:slide={{ duration: 300, axis: "y" }}
          >
            <!-- Genre -->
            <div class="space-y-1.5">
              <label
                class="text-xs font-medium text-[var(--color-text-muted)]"
                for="genre"
              >
                ジャンル
              </label>
              <select
                id="genre"
                class="select w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                bind:value={taskFormState.genre}
              >
                <option value="">未設定（AIが推定）</option>
                {#each genreOptions as genre (genre)}
                  <option value={genre}>{genre}</option>
                {/each}
              </select>
            </div>

            <!-- Importance -->
            <div class="space-y-1.5">
              <span class="text-xs font-medium text-[var(--color-text-muted)]"
                >重要度</span
              >
              <div class="flex gap-2" role="group" aria-label="重要度">
                <button
                  type="button"
                  class="flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150
                        {taskFormState.importance === ''
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)] text-[var(--color-primary)]'
                    : 'border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200/50 hover:text-base-content'}"
                  onclick={() => taskFormState.updateField("importance", "")}
                >
                  未設定
                </button>
                {#each importanceOptions as option (option.value)}
                  <button
                    type="button"
                    class="flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150
                          {taskFormState.importance === option.value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)] text-[var(--color-primary)]'
                      : 'border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200/50 hover:text-base-content'}"
                    onclick={() =>
                      taskFormState.updateField("importance", option.value)}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>

            <!-- Session Duration & Total Duration (only in edit mode) -->
            {#if taskFormState.isEditing}
              <div class="space-y-1.5">
                <label
                  class="text-xs font-medium text-[var(--color-text-muted)]"
                  for="sessionDuration"
                >
                  1回のセッション時間（分）
                </label>
                <input
                  id="sessionDuration"
                  type="number"
                  min="5"
                  max="480"
                  step="5"
                  placeholder="例: 30"
                  class="input w-full border-base-300 bg-base-100 placeholder:text-base-content/50 focus:border-[var(--color-primary)] focus:outline-none"
                  value={taskFormState.sessionDuration ?? ""}
                  onchange={(
                    e: Event & { currentTarget: HTMLInputElement },
                  ) => {
                    const val = e.currentTarget.value;
                    taskFormState.updateField(
                      "sessionDuration",
                      val ? parseInt(val, 10) : null,
                    );
                  }}
                />
              </div>

              <!-- Total Duration: Only show for backlog tasks (removed from routine and deadline) -->
              {#if taskFormState.type === "バックログ"}
                <div class="space-y-1.5">
                  <label
                    class="text-xs font-medium text-[var(--color-text-muted)]"
                    for="totalDuration"
                  >
                    合計所要時間（分）
                  </label>
                  <input
                    id="totalDuration"
                    type="number"
                    min="5"
                    max="9999"
                    step="5"
                    placeholder="例: 120"
                    class="input w-full border-base-300 bg-base-100 placeholder:text-base-content/50 focus:border-[var(--color-primary)] focus:outline-none"
                    value={taskFormState.totalDurationExpected ?? ""}
                    onchange={(
                      e: Event & { currentTarget: HTMLInputElement },
                    ) => {
                      const val = e.currentTarget.value;
                      taskFormState.updateField(
                        "totalDurationExpected",
                        val ? parseInt(val, 10) : null,
                      );
                    }}
                  />
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>

      <!-- Errors Section -->
      {#if taskFormState.errors.enrichedFieldsCleared || taskFormState.errors.general}
        <div class="space-y-2 px-4 pb-4 md:px-5 md:pb-5">
          <!-- Enriched Fields Cleared Warning -->
          {#if taskFormState.errors.enrichedFieldsCleared}
            <div
              class="flex items-center gap-3 rounded-lg border border-[var(--color-warning-500)]/30 bg-[var(--color-warning-100)] p-3"
            >
              <svg
                class="h-5 w-5 flex-shrink-0 text-[var(--color-warning-500)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p class="text-sm text-[var(--color-warning-500)]">
                {taskFormState.errors.enrichedFieldsCleared}
              </p>
            </div>
          {/if}

          <!-- General Error Display -->
          {#if taskFormState.errors.general}
            <div
              class="flex items-center gap-3 rounded-lg border border-[var(--color-error-500)]/30 bg-[var(--color-error-100)] p-3"
            >
              <svg
                class="h-5 w-5 flex-shrink-0 text-[var(--color-error-500)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p class="text-sm text-[var(--color-error-500)]">
                {taskFormState.errors.general}
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Desktop Action Bar -->
    <div
      class="sticky bottom-0 z-10 flex flex-shrink-0 items-center justify-end gap-3 border-t border-base-300 bg-[var(--color-bg-grid)] p-4 md:p-5"
    >
      <Button variant="ghost" size="sm" type="button" onclick={handleClose}>
        キャンセル
      </Button>
      <Button
        variant="primary"
        size="sm"
        type="submit"
        disabled={!taskFormState.isValid || taskFormState.isSubmitting}
        loading={taskFormState.isSubmitting}
      >
        {taskFormState.isSubmitting
          ? "保存中..."
          : taskFormState.isEditing
            ? "更新"
            : "作成"}
      </Button>
    </div>
  </form>
{/snippet}

{#if contentOnly}
  {@render formContent()}
{:else if taskFormState.isOpen}
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2300] md:modal-middle"
    onkeydown={(e: KeyboardEvent) => e.key === "Escape" && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-label="Task form"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-box h-full w-full max-w-[500px] overflow-hidden rounded-none border-none bg-base-100 p-0 shadow-none md:h-auto md:max-h-[90vh] md:overflow-y-auto md:rounded-2xl md:border md:border-base-300/50 md:shadow-xl"
      onclick={(e: MouseEvent) => e.stopPropagation()}
      onkeydown={(e: KeyboardEvent) => e.key === "Escape" && handleClose()}
    >
      {@render formContent()}
    </div>
    <div class="modal-backdrop bg-black/40 backdrop-blur-sm"></div>
  </div>
{/if}

<!-- Event Picker Dialog -->
<EventPickerDialog
  isOpen={showEventPicker}
  onClose={() => (showEventPicker = false)}
  onSelect={(eventLink) => {
    taskFormState.setEventLink(eventLink);
    showEventPicker = false;
  }}
/>
