<script lang="ts">
  import {
    taskForm,
    taskFormErrors,
    isTaskFormSubmitting,
    isTaskFormOpen,
    isTaskFormValid,
    showDeadlineField,
    showRecurrenceFields,
    taskFormActions,
  } from "$lib/features/tasks/state/taskForm.ts";
  import { taskActions } from "$lib/features/tasks/state/taskActions.ts";
  import type { MemoType, LocationPreference } from "$lib/types.ts";

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
      { value: "ルーティン", label: "ルーティーン", description: "Recurring task" },
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

  // Handlers
  function handleClose() {
    taskFormActions.closeForm();
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    await taskActions.submit();
  }

  function handleTypeChange(type: MemoType) {
    taskFormActions.setType(type);
  }
</script>

{#if $isTaskFormOpen}
  <div
    class="modal-open modal modal-mobile-fullscreen z-[2100] md:modal-middle"
    onkeydown={(e) => e.key === "Escape" && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-label="Task form"
    tabindex="-1"
  >
    <div
      class="modal-box h-full w-full max-w-[500px] overflow-hidden p-0 md:max-h-[90vh] md:h-auto md:overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && handleClose()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div
        class="flex items-center justify-between border-b border-base-300 bg-base-100 p-4 flex-shrink-0"
      >
        <button
          class="btn btn-square btn-ghost btn-sm md:hidden"
          onclick={handleClose}
          aria-label="Close"
        >
          ✕
        </button>
        <h3 class="text-lg font-medium flex-1 md:flex-none text-left">
          {$taskForm.isEditing ? "タスクを編集" : "新しいタスク"}
        </h3>
        <button
          type="submit"
          class="btn btn-primary btn-sm md:hidden"
          disabled={!$isTaskFormValid || $isTaskFormSubmitting}
        >
          {#if $isTaskFormSubmitting}
            <span class="loading loading-sm loading-spinner"></span>
          {:else}
            {$taskForm.isEditing ? "更新" : "作成"}
          {/if}
        </button>
        <button
          class="btn btn-square btn-ghost btn-sm hidden md:flex"
          onclick={handleClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <form onsubmit={handleSubmit} class="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div class="flex flex-col gap-4 p-4 overflow-y-auto flex-1 min-h-0">
          <!-- Title -->
          <div class="form-control">
            <label class="label" for="title">
              <span class="label-text text-sm text-[var(--color-text-secondary)]"
                >タイトル</span
              >
            </label>
            <input
              id="title"
              type="text"
              placeholder="タスクのタイトルを入力"
              bind:value={$taskForm.title}
              class="input-bordered input w-full {$taskFormErrors.title
                ? 'input-error'
                : ''}"
            />
            {#if $taskFormErrors.title}
              <p class="label">
                <span class="label-text-alt text-[var(--color-error-500)]"
                  >{$taskFormErrors.title}</span
                >
              </p>
            {/if}
          </div>

          <!-- Type -->
          <div class="form-control">
            <span class="label">
              <span class="label-text text-sm text-[var(--color-text-secondary)]"
                >タイプ</span
              >
            </span>
            <div class="flex gap-2" role="group" aria-label="タスクタイプ">
              {#each typeOptions as option (option)}
                <button
                  type="button"
                  class="btn flex-1 btn-sm {$taskForm.type === option.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
                    : 'border-base-300 btn-ghost'} border transition-all duration-200"
                  onclick={() => handleTypeChange(option.value)}
                  aria-pressed={$taskForm.type === option.value}
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Deadline -->
          {#if $showDeadlineField}
            <div class="form-control">
              <label class="label" for="deadline">
                <span class="label-text text-sm text-[var(--color-text-secondary)]"
                  >期限</span
                >
              </label>
              <input
                id="deadline"
                type="date"
                bind:value={$taskForm.deadline}
                class="input-bordered input w-full {$taskFormErrors.deadline
                  ? 'input-error'
                  : ''}"
              />
              {#if $taskFormErrors.deadline}
                <p class="label">
                  <span class="label-text-alt text-[var(--color-error-500)]"
                    >{$taskFormErrors.deadline}</span
                  >
                </p>
              {/if}
            </div>
          {/if}

          <!-- Recurrence Goal -->
          {#if $showRecurrenceFields}
            <div class="form-control">
              <label class="label" for="recurrence-count">
                <span class="label-text text-sm text-[var(--color-text-secondary)]"
                  >目標</span
                >
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="recurrence-count"
                  type="number"
                  min="1"
                  max="100"
                  bind:value={$taskForm.recurrenceCount}
                  class="input-bordered input w-[70px] text-center"
                  aria-label="回数"
                />
                <span class="text-sm text-[var(--color-text-secondary)]"
                  >回 /</span
                >
                <select
                  id="recurrence-period"
                  bind:value={$taskForm.recurrencePeriod}
                  class="select-bordered select flex-1"
                  aria-label="期間"
                >
                  {#each periodOptions as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
              {#if $taskFormErrors.recurrence}
                <p class="label">
                  <span class="label-text-alt text-[var(--color-error-500)]"
                    >{$taskFormErrors.recurrence}</span
                  >
                </p>
              {/if}
            </div>
          {/if}

          <!-- Location -->
          <div class="form-control">
            <span class="label">
              <span class="label-text text-sm text-[var(--color-text-secondary)]"
                >場所</span
              >
            </span>
            <div class="flex gap-2" role="group" aria-label="場所">
              {#each locationOptions as option (option.value)}
                <label
                  class="btn flex-1 btn-sm cursor-pointer {$taskForm.locationPreference ===
                  option.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-100)]'
                    : 'border-base-300 btn-ghost'} border transition-all duration-200"
                >
                  <input
                    type="radio"
                    name="location"
                    value={option.value}
                    checked={$taskForm.locationPreference === option.value}
                    onchange={() =>
                      taskFormActions.updateField(
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

          <!-- General Error Display -->
          {#if $taskFormErrors.general}
            <div
              class="flex items-center gap-2 rounded-lg border border-[var(--color-error-500)] bg-[var(--color-error-100)] p-3"
            >
              <div class="text-xl">⚠️</div>
              <div class="text-sm text-[var(--color-error-500)]">{$taskFormErrors.general}</div>
            </div>
          {/if}
        </div>

        <!-- Desktop Action Bar -->
        <div
          class="hidden md:flex flex-wrap items-center justify-end gap-2 border-t border-base-300 p-4 flex-shrink-0"
        >
          <button
            type="button"
            class="btn btn-ghost"
            onclick={handleClose}
          >
            キャンセル
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={!$isTaskFormValid || $isTaskFormSubmitting}
          >
            {#if $isTaskFormSubmitting}
              <span class="loading loading-sm loading-spinner"></span>
              保存中...
            {:else}
              {$taskForm.isEditing ? "更新" : "作成"}
            {/if}
          </button>
        </div>
      </form>
    </div>
    <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
  </div>
{/if}
