<script lang="ts">
  import type { Event } from "$lib/types";
  import type { TimetableEvent } from "$lib/features/calendar/services/timetable-events";
  import {
    type EventDeadlineOffset,
    type EventLinkType,
    OFFSET_OPTIONS,
  } from "../types/event-link";
  import { taskState } from "../state/taskActions.svelte";
  import { createMemo } from "../state/memo.functions.remote";
  import {
    getNextCalendarOccurrence,
    getNextTimetableOccurrence,
    calculateDeadlineFromOccurrence,
    calculateSuggestionAvailableFrom,
  } from "../services/event-deadline-service";
  import { loadTimetableData } from "$lib/features/calendar/services/timetable-events";
  import { toastState } from "$lib/bootstrap/toast.svelte";

  interface Props {
    isOpen: boolean;
    sourceType: EventLinkType;
    calendarEvent?: Event;
    timetableEvent?: TimetableEvent;
    onClose: () => void;
  }

  let { isOpen, sourceType, calendarEvent, timetableEvent, onClose }: Props =
    $props();

  let title = $state("");
  let selectedOffset = $state<EventDeadlineOffset>("same_day_after");
  let isSubmitting = $state(false);

  // Source event title for display
  let sourceTitle = $derived(
    sourceType === "calendar"
      ? (calendarEvent?.title ?? "")
      : (timetableEvent?.title ?? ""),
  );

  // Reset form when dialog opens
  $effect(() => {
    if (isOpen) {
      title = "";
      selectedOffset = "same_day_after";
      isSubmitting = false;
    }
  });

  async function handleSubmit() {
    if (!title.trim() || isSubmitting) return;

    isSubmitting = true;

    try {
      let deadline: Date;
      let trackedOccurrence: Date;
      let occurrenceEnd: Date;

      if (sourceType === "calendar" && calendarEvent) {
        // For calendar events
        const nextOcc = getNextCalendarOccurrence(calendarEvent);
        if (!nextOcc) {
          toastState.show("次のイベント日程が見つかりません", "error");
          isSubmitting = false;
          return;
        }
        trackedOccurrence = nextOcc.startDate;
        occurrenceEnd = nextOcc.endDate;
        deadline = calculateDeadlineFromOccurrence(
          nextOcc.startDate,
          nextOcc.endDate,
          selectedOffset,
        );
      } else if (sourceType === "timetable" && timetableEvent) {
        // For timetable events
        const { config, cells } = await loadTimetableData();
        const cell = cells.find((c) => c.id === timetableEvent.cellId);
        if (!cell) {
          toastState.show("時間割データが見つかりません", "error");
          isSubmitting = false;
          return;
        }

        const nextOcc = getNextTimetableOccurrence(cell, config);
        if (!nextOcc) {
          toastState.show("次の時間割日程が見つかりません", "error");
          isSubmitting = false;
          return;
        }
        trackedOccurrence = nextOcc.startDate;
        occurrenceEnd = nextOcc.endDate;
        deadline = calculateDeadlineFromOccurrence(
          nextOcc.startDate,
          nextOcc.endDate,
          selectedOffset,
        );
      } else {
        toastState.show("イベント情報が不正です", "error");
        isSubmitting = false;
        return;
      }

      // Calculate when suggestion should become available
      const suggestionAvailableFrom = calculateSuggestionAvailableFrom(
        occurrenceEnd,
        selectedOffset,
      );

      // Create the memo with event link
      const now = new Date();
      await createMemo({
        title: title.trim(),
        type: "期限付き",
        createdAt: now.toISOString(),
        deadline: deadline.toISOString(),
        locationPreference: "no_preference",
        status: {
          timeSpentMinutes: 0,
          completionState: "not_started",
        },
        eventLink: {
          type: sourceType,
          calendarEventId:
            sourceType === "calendar" ? calendarEvent?.id : undefined,
          timetableCellId:
            sourceType === "timetable" ? timetableEvent?.cellId : undefined,
          offset: selectedOffset,
          trackedOccurrenceDate: trackedOccurrence.toISOString(),
        },
        suggestionAvailableFrom: suggestionAvailableFrom?.toISOString(),
      });

      // Reload tasks to show the new one
      await taskState.load();

      toastState.show("イベント連携タスクを作成しました", "success");
      onClose();
    } catch (err) {
      console.error("[TagEventDialog] Failed to create task:", err);
      toastState.show("タスクの作成に失敗しました", "error");
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
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
      class="w-full max-w-md animate-[slideUp_0.2s_ease-out] rounded-xl border border-base-300 bg-base-100 shadow-xl"
      onclick={(e: MouseEvent) => e.stopPropagation()}
      onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
      role="document"
    >
      <div class="border-b border-base-300 p-4">
        <h3 class="text-lg font-medium">イベント連携タスクを作成</h3>
      </div>

      <div class="space-y-4 p-4">
        <!-- Source event info -->
        <div class="rounded-lg bg-base-200/50 p-3">
          <div class="text-xs text-base-content/60">リンク先イベント</div>
          <div class="mt-1 font-medium">{sourceTitle}</div>
          <div class="mt-0.5 text-xs text-base-content/50">
            {sourceType === "calendar" ? "カレンダー予定" : "時間割"}
          </div>
        </div>

        <!-- Task title input -->
        <div>
          <label class="mb-1 block text-sm font-medium" for="task-title">
            タスクタイトル
          </label>
          <input
            id="task-title"
            type="text"
            class="input-bordered input w-full"
            placeholder="例：〇〇の準備、レポート提出"
            bind:value={title}
            disabled={isSubmitting}
          />
        </div>

        <!-- Offset selection -->
        <div>
          <label class="mb-1 block text-sm font-medium" for="offset-select">
            締切タイミング
          </label>
          <select
            id="offset-select"
            class="select-bordered select w-full"
            bind:value={selectedOffset}
            disabled={isSubmitting}
          >
            {#each OFFSET_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <p class="mt-1 text-xs text-base-content/60">
            {OFFSET_OPTIONS.find((o) => o.value === selectedOffset)
              ?.description ?? ""}
          </p>
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-base-300 p-4">
        <button class="btn btn-ghost" onclick={onClose} disabled={isSubmitting}>
          キャンセル
        </button>
        <button
          class="btn btn-primary"
          onclick={handleSubmit}
          disabled={!title.trim() || isSubmitting}
        >
          {#if isSubmitting}
            <span class="loading loading-sm loading-spinner"></span>
          {/if}
          作成
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
