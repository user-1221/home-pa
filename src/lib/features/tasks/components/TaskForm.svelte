<script lang="ts">
  import { taskFormState } from "$lib/features/tasks/state/taskForm.svelte.ts";
  import { taskActions } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import type {
    MemoType,
    LocationPreference,
    ImportanceLevel,
  } from "$lib/types.ts";
  import type { EventDeadlineOffset } from "../types/event-link.ts";
  import { OFFSET_OPTIONS } from "../types/event-link.ts";
  import EventPickerDialog from "./EventPickerDialog.svelte";

  // Advanced settings section state
  let showAdvancedSettings = $state(false);

  // Event picker dialog state
  let showEventPicker = $state(false);

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
    await taskActions.submit();
  }

  function handleTypeChange(type: MemoType) {
    taskFormState.setType(type);
  }
</script>

{#if taskFormState.isOpen}
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2100] md:modal-middle"
    onkeydown={(e: KeyboardEvent) => e.key === "Escape" && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-label="Task form"
    tabindex="-1"
  >
    <div
      class="modal-box h-full w-full max-w-[500px] overflow-hidden rounded-none border-none bg-base-100 p-0 shadow-none md:h-auto md:max-h-[90vh] md:overflow-y-auto md:rounded-2xl md:border md:border-base-300/50 md:shadow-xl"
      onclick={(e: MouseEvent) => e.stopPropagation()}
      onkeydown={(e: KeyboardEvent) => e.key === "Escape" && handleClose()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="sticky top-0 z-10 flex min-h-14 flex-shrink-0 items-center justify-between border-b border-base-300/50 bg-base-100/95 px-4 backdrop-blur-md md:min-h-16 md:px-6"
      >
        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg text-base-content/60 transition-colors duration-200 hover:bg-base-200 hover:text-base-content md:hidden"
          onclick={handleClose}
          aria-label="Close"
        >
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
        </button>
        <h3
          class="flex-1 text-center text-base font-medium tracking-tight text-base-content md:flex-none md:text-left md:text-lg"
        >
          {taskFormState.isEditing ? "タスクを編集" : "新しいタスク"}
        </h3>
        <button
          type="button"
          class="flex h-9 items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[var(--color-primary-800)] active:scale-95 disabled:opacity-50 md:hidden"
          disabled={!taskFormState.isValid || taskFormState.isSubmitting}
          onclick={async (e: MouseEvent) => {
            e.preventDefault();
            await taskActions.submit();
          }}
        >
          {#if taskFormState.isSubmitting}
            <span class="loading loading-sm loading-spinner"></span>
          {:else}
            {taskFormState.isEditing ? "更新" : "作成"}
          {/if}
        </button>
        <button
          class="hidden h-8 w-8 items-center justify-center rounded-lg text-base-content/60 transition-colors duration-200 hover:bg-base-200 hover:text-base-content md:flex"
          onclick={handleClose}
          aria-label="Close"
        >
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
        </button>
      </div>

      <form
        onsubmit={handleSubmit}
        class="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div
          class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 md:p-6"
        >
          <!-- Title -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-base-content/70" for="title">
              タイトル
            </label>
            <input
              id="title"
              type="text"
              placeholder="タスクのタイトルを入力"
              bind:value={taskFormState.title}
              class="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-base text-base-content transition-colors duration-200 placeholder:text-base-content/40 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none {taskFormState
                .errors.title
                ? 'border-error'
                : ''}"
            />
            {#if taskFormState.errors.title}
              <p class="text-xs text-error">{taskFormState.errors.title}</p>
            {/if}
          </div>

          <!-- Type -->
          <div class="space-y-1.5">
            <span class="text-sm font-medium text-base-content/70">タイプ</span>
            <div class="flex gap-2" role="group" aria-label="タスクタイプ">
              {#each typeOptions as option (option)}
                <button
                  type="button"
                  class="flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200
                    {taskFormState.type === option.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-base-300/60 bg-base-100 text-base-content/70 hover:bg-base-200/50 hover:text-base-content'}"
                  onclick={() => handleTypeChange(option.value)}
                  aria-pressed={taskFormState.type === option.value}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Deadline -->
          {#if taskFormState.showDeadlineField}
            <div class="space-y-1.5">
              <label
                class="text-sm font-medium text-base-content/70"
                for="deadline"
              >
                期限
              </label>

              <!-- Show event link if set -->
              {#if taskFormState.eventLink}
                <div class="rounded-lg border border-info/30 bg-info/5 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 text-xs text-info">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          class="h-3.5 w-3.5"
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
                      <div class="mt-0.5 text-xs text-base-content/60">
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
                      class="flex h-6 w-6 items-center justify-center rounded text-base-content/40 transition-colors hover:bg-base-200 hover:text-base-content"
                      onclick={() => taskFormState.clearEventLink()}
                      aria-label="イベント連携を解除"
                    >
                      <svg
                        class="h-4 w-4"
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
                    </button>
                  </div>
                  <!-- Offset selector -->
                  <div class="mt-2 border-t border-info/20 pt-2">
                    <select
                      class="w-full rounded border border-base-300/60 bg-base-100 px-2 py-1.5 text-sm text-base-content focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
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
                <div class="flex gap-2">
                  <input
                    id="deadline"
                    type="date"
                    bind:value={taskFormState.deadline}
                    class="flex-1 rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-base text-base-content transition-colors duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none {taskFormState
                      .errors.deadline
                      ? 'border-error'
                      : ''}"
                  />
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-sm text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                    onclick={() => (showEventPicker = true)}
                    aria-label="イベントから選択"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      class="h-4 w-4"
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
                class="text-sm font-medium text-base-content/70"
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
                  bind:value={taskFormState.recurrenceCount}
                  class="w-16 rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-center text-base text-base-content transition-colors duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                  aria-label="回数"
                />
                <span class="text-sm text-base-content/60">回 /</span>
                <select
                  id="recurrence-period"
                  bind:value={taskFormState.recurrencePeriod}
                  class="flex-1 rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-base text-base-content transition-colors duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none"
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

          <!-- Location -->
          <div class="space-y-1.5">
            <span class="text-sm font-medium text-base-content/70">場所</span>
            <div class="flex gap-2" role="group" aria-label="場所">
              {#each locationOptions as option (option.value)}
                <label
                  class="flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200
                    {taskFormState.locationPreference === option.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-base-300/60 bg-base-100 text-base-content/70 hover:bg-base-200/50 hover:text-base-content'}"
                >
                  <input
                    type="radio"
                    name="location"
                    value={option.value}
                    checked={taskFormState.locationPreference === option.value}
                    onchange={() =>
                      taskFormState.updateField(
                        "locationPreference",
                        option.value,
                      )}
                    class="hidden"
                  />
                  {option.label}
                </label>
              {/each}
            </div>
          </div>

          <!-- Advanced Settings Collapsible -->
          <div class="mt-1 border-t border-base-300/40 pt-3">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-base-content/60 transition-colors duration-200 hover:bg-base-200/50 hover:text-base-content"
              onclick={() => (showAdvancedSettings = !showAdvancedSettings)}
            >
              <svg
                class="h-4 w-4 transition-transform duration-200 {showAdvancedSettings
                  ? 'rotate-90'
                  : ''}"
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
              詳細設定
            </button>

            {#if showAdvancedSettings}
              <div class="flex flex-col gap-4 pt-3 pl-1">
                <!-- Genre -->
                <div class="space-y-1.5">
                  <label
                    class="text-sm font-medium text-base-content/70"
                    for="genre"
                  >
                    ジャンル
                  </label>
                  <select
                    id="genre"
                    class="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-base text-base-content transition-colors duration-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none"
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
                  <span class="text-sm font-medium text-base-content/70"
                    >重要度</span
                  >
                  <div class="flex gap-2" role="group" aria-label="重要度">
                    <button
                      type="button"
                      class="flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200
                        {taskFormState.importance === ''
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'border-base-300/60 bg-base-100 text-base-content/70 hover:bg-base-200/50 hover:text-base-content'}"
                      onclick={() =>
                        taskFormState.updateField("importance", "")}
                    >
                      未設定
                    </button>
                    {#each importanceOptions as option (option.value)}
                      <button
                        type="button"
                        class="flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200
                          {taskFormState.importance === option.value
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'border-base-300/60 bg-base-100 text-base-content/70 hover:bg-base-200/50 hover:text-base-content'}"
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
                      class="text-sm font-medium text-base-content/70"
                      for="sessionDuration"
                    >
                      1回のセッション時間（分）
                    </label>
                    <input
                      id="sessionDuration"
                      type="number"
                      min="5"
                      max="480"
                      placeholder="例: 30"
                      class="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-base text-base-content transition-colors duration-200 placeholder:text-base-content/40 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none"
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
                        class="text-sm font-medium text-base-content/70"
                        for="totalDuration"
                      >
                        合計所要時間（分）
                      </label>
                      <input
                        id="totalDuration"
                        type="number"
                        min="5"
                        max="9999"
                        placeholder="例: 120"
                        class="w-full rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-base text-base-content transition-colors duration-200 placeholder:text-base-content/40 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none"
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

          <!-- Enriched Fields Cleared Warning -->
          {#if taskFormState.errors.enrichedFieldsCleared}
            <div
              class="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3"
            >
              <svg
                class="h-5 w-5 flex-shrink-0 text-warning"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p class="text-sm text-warning">
                {taskFormState.errors.enrichedFieldsCleared}
              </p>
            </div>
          {/if}

          <!-- General Error Display -->
          {#if taskFormState.errors.general}
            <div
              class="flex items-center gap-3 rounded-lg border border-error/30 bg-error/10 p-3"
            >
              <svg
                class="h-5 w-5 flex-shrink-0 text-error"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p class="text-sm text-error">
                {taskFormState.errors.general}
              </p>
            </div>
          {/if}
        </div>

        <!-- Desktop Action Bar -->
        <div
          class="hidden flex-shrink-0 items-center justify-end gap-3 border-t border-base-300/50 bg-base-100/80 p-4 backdrop-blur-sm md:flex md:p-6"
        >
          <button
            type="button"
            class="rounded-lg px-4 py-2.5 text-sm font-medium text-base-content/70 transition-colors duration-200 hover:bg-base-200 hover:text-base-content"
            onclick={handleClose}
          >
            キャンセル
          </button>
          <button
            type="submit"
            class="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[var(--color-primary-800)] hover:shadow-md active:scale-95 disabled:opacity-50"
            disabled={!taskFormState.isValid || taskFormState.isSubmitting}
          >
            {#if taskFormState.isSubmitting}
              <span class="loading loading-sm loading-spinner"></span>
              保存中...
            {:else}
              {taskFormState.isEditing ? "更新" : "作成"}
            {/if}
          </button>
        </div>
      </form>
    </div>
    <div class="modal-backdrop bg-base-content/30 backdrop-blur-sm"></div>
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
