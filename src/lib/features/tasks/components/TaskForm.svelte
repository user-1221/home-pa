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
        label: "Deadline",
        description: "Task with a due date",
      },
      {
        value: "バックログ",
        label: "Backlog",
        description: "Task without urgency",
      },
      { value: "ルーティン", label: "Routine", description: "Recurring task" },
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
    class="modal-open modal z-[2100] modal-bottom md:modal-middle"
    onkeydown={(e) => e.key === "Escape" && handleClose()}
    role="dialog"
    aria-modal="true"
    aria-label="Task form"
    tabindex="-1"
  >
    <div
      class="modal-box max-h-[calc(90vh-80px)] w-full max-w-[500px] overflow-y-auto p-6 md:max-h-[85vh]"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && handleClose()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div
        class="mb-6 flex items-center justify-between border-b border-base-300 pb-4"
      >
        <h2 class="m-0 text-lg font-normal text-base-content">
          {$taskForm.isEditing ? "Edit Task" : "New Task"}
        </h2>
        <button
          class="btn btn-square border-none bg-base-200 btn-sm hover:bg-error hover:text-error-content"
          onclick={handleClose}
          aria-label="Close">✕</button
        >
      </div>

      <form onsubmit={handleSubmit}>
        <div class="mb-4">
          <label
            for="title"
            class="mb-2 block text-sm font-medium text-base-content/70"
            >Title</label
          >
          <input
            id="title"
            type="text"
            placeholder="What do you need to do?"
            bind:value={$taskForm.title}
            class="input-bordered input w-full"
            class:input-error={$taskFormErrors.title}
          />
          {#if $taskFormErrors.title}
            <span class="mt-1 block text-xs text-error"
              >{$taskFormErrors.title}</span
            >
          {/if}
        </div>

        <fieldset class="mb-4 border-none p-0">
          <legend class="mb-2 text-sm font-medium text-base-content/70"
            >Type</legend
          >
          <div
            class="flex flex-col gap-2"
            role="radiogroup"
            aria-label="Task type"
          >
            {#each typeOptions as option (option)}
              <button
                type="button"
                class="flex flex-col items-start rounded-lg border p-3 text-left transition-all duration-150 hover:border-primary {$taskForm.type ===
                option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-base-300 bg-base-200'}"
                onclick={() => handleTypeChange(option.value)}
                aria-pressed={$taskForm.type === option.value}
              >
                <span class="font-medium text-base-content">{option.label}</span
                >
                <span class="text-xs text-[var(--color-text-secondary)]"
                  >{option.description}</span
                >
              </button>
            {/each}
          </div>
        </fieldset>

        {#if $showDeadlineField}
          <div class="mb-4">
            <label
              for="deadline"
              class="mb-2 block text-sm font-medium text-base-content/70"
              >Deadline</label
            >
            <input
              id="deadline"
              type="date"
              bind:value={$taskForm.deadline}
              class="input-bordered input w-full"
              class:input-error={$taskFormErrors.deadline}
            />
            {#if $taskFormErrors.deadline}
              <span class="mt-1 block text-xs text-error"
                >{$taskFormErrors.deadline}</span
              >
            {/if}
          </div>
        {/if}

        {#if $showRecurrenceFields}
          <fieldset class="mb-4 border-none p-0">
            <legend class="mb-2 text-sm font-medium text-base-content/70"
              >Goal</legend
            >
            <div class="flex items-center gap-2">
              <input
                id="recurrence-count"
                type="number"
                min="1"
                max="100"
                bind:value={$taskForm.recurrenceCount}
                class="input-bordered input w-[70px] text-center"
                aria-label="Number of times"
              />
              <span class="text-sm text-base-content/70">times per</span>
              <select
                id="recurrence-period"
                bind:value={$taskForm.recurrencePeriod}
                class="select-bordered select w-[100px]"
                aria-label="Period"
              >
                {#each periodOptions as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
            {#if $taskFormErrors.recurrence}
              <span class="mt-1 block text-xs text-error"
                >{$taskFormErrors.recurrence}</span
              >
            {/if}
          </fieldset>
        {/if}

        <fieldset class="mb-4 border-none p-0">
          <legend class="mb-2 text-sm font-medium text-base-content/70"
            >Location</legend
          >
          <div class="flex flex-col gap-2">
            {#each locationOptions as option (option.value)}
              <label
                class="flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-all duration-150 hover:border-primary {$taskForm.locationPreference ===
                option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-base-300'}"
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
                  class="radio radio-sm radio-primary"
                />
                <span>{option.label}</span>
              </label>
            {/each}
          </div>
        </fieldset>

        {#if $taskFormErrors.general}
          <div class="mb-4 alert alert-error p-3 text-sm">
            {$taskFormErrors.general}
          </div>
        {/if}

        <div class="mt-6 flex gap-2 border-t border-base-300 pt-4">
          <button
            type="button"
            class="btn flex-1 border border-base-300 btn-ghost"
            onclick={handleClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn flex-1 btn-primary"
            disabled={!$isTaskFormValid || $isTaskFormSubmitting}
          >
            {#if $isTaskFormSubmitting}
              <span class="loading loading-sm loading-spinner"></span>
              Saving...
            {:else}
              {$taskForm.isEditing ? "Update Task" : "Create Task"}
            {/if}
          </button>
        </div>
      </form>
    </div>
    <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
  </div>
{/if}
