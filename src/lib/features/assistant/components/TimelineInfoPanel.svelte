<script lang="ts">
  import type { Event as MyEvent, Gap } from "$lib/types.ts";
  import type {
    PendingSuggestion,
    AcceptedSuggestion,
  } from "$lib/features/assistant/state/schedule.ts";
  import { createEventDispatcher } from "svelte";

  interface Props {
    selectedItem:
      | {
          type: "event";
          data: MyEvent;
        }
      | {
          type: "gap";
          data: Gap;
        }
      | {
          type: "pending-suggestion";
          data: PendingSuggestion;
          title: string;
        }
      | {
          type: "accepted-suggestion";
          data: AcceptedSuggestion;
          title: string;
        }
      | {
          type: "drag-preview";
          title: string;
          startTime: string;
          endTime: string;
          duration: number;
        }
      | null;
  }

  let { selectedItem = null }: Props = $props();

  const dispatch = createEventDispatcher<{
    accept: string;
    reject: string;
    complete: { suggestionId: string; memoId: string; duration: number };
    missed: { suggestionId: string };
    delete: { suggestionId: string };
  }>();

  function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) {
      return `${hours}時間${mins}分`;
    } else if (hours > 0) {
      return `${hours}時間`;
    } else {
      return `${mins}分`;
    }
  }

  function handleAccept() {
    if (selectedItem?.type === "pending-suggestion") {
      dispatch("accept", selectedItem.data.suggestionId);
    }
  }

  function handleReject() {
    if (selectedItem?.type === "pending-suggestion") {
      dispatch("reject", selectedItem.data.suggestionId);
    }
  }

  function handleComplete() {
    if (selectedItem?.type === "accepted-suggestion") {
      dispatch("complete", {
        suggestionId: selectedItem.data.suggestionId,
        memoId: selectedItem.data.memoId,
        duration: selectedItem.data.duration,
      });
    }
  }

  function handleMissed() {
    if (selectedItem?.type === "accepted-suggestion") {
      dispatch("missed", { suggestionId: selectedItem.data.suggestionId });
    }
  }

  function handleDelete() {
    if (selectedItem?.type === "accepted-suggestion") {
      dispatch("delete", { suggestionId: selectedItem.data.suggestionId });
    }
  }

  /**
   * Check if an accepted suggestion is in the past
   * Uses string comparison of HH:mm format times
   * @param endTime - End time in HH:mm format
   */
  function isInPast(endTime: string): boolean {
    // Get current time in HH:mm format
    const nowMs = Date.now();
    const nowDate = new globalThis.Date(nowMs);
    const nowHours = nowDate.getHours().toString().padStart(2, "0");
    const nowMins = nowDate.getMinutes().toString().padStart(2, "0");
    const nowTime = `${nowHours}:${nowMins}`;

    // Simple string comparison works for HH:mm format
    return nowTime > endTime;
  }
</script>

<div
  class="timeline-info-panel mb-4 rounded-lg border border-base-300 bg-base-200 p-4 shadow-lg"
>
  {#if selectedItem}
    {#if selectedItem.type === "pending-suggestion"}
      <!-- Compact layout: Badge + Title + Buttons in one row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="badge flex-shrink-0 badge-sm badge-warning">提案</span>
          <h3 class="truncate text-lg font-bold">{selectedItem.title}</h3>
        </div>
        <div class="flex flex-shrink-0 items-center gap-2">
          <button
            class="btn btn-sm btn-success"
            onclick={handleAccept}
            title="承認"
          >
            ✓
          </button>
          <button
            class="btn btn-sm btn-error"
            onclick={handleReject}
            title="却下"
          >
            ✗
          </button>
        </div>
      </div>
      <!-- Time range in separate row -->
      <div class="mt-1 text-sm opacity-70">
        {selectedItem.data.startTime} - {selectedItem.data.endTime}
        <span class="ml-2 opacity-50">
          ({formatDuration(selectedItem.data.duration)})
        </span>
      </div>
    {:else if selectedItem.type === "event"}
      <div class="mb-2 flex items-center gap-2">
        <span class="badge badge-sm badge-primary">イベント</span>
      </div>
      <h3 class="text-lg font-bold">{selectedItem.data.title}</h3>
      <div class="mt-1 text-sm opacity-70">
        {#if selectedItem.data.timeLabel === "all-day"}
          終日
        {:else if selectedItem.data.timeLabel === "some-timing"}
          どこかのタイミングで
        {:else}
          {new Date(selectedItem.data.start).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })} - {new Date(selectedItem.data.end).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        {/if}
      </div>
    {:else if selectedItem.type === "gap"}
      <div class="mb-2 flex items-center gap-2">
        <span class="badge badge-sm badge-secondary">空き時間</span>
      </div>
      <h3 class="text-lg font-bold">
        {selectedItem.data.start} - {selectedItem.data.end}
      </h3>
      <div class="mt-1 text-sm opacity-70">
        {formatDuration(selectedItem.data.duration)}
      </div>
    {:else if selectedItem.type === "accepted-suggestion"}
      <!-- Compact layout: Badge + Title + Buttons in one row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="badge flex-shrink-0 badge-sm badge-success"
            >承認済み</span
          >
          <h3 class="truncate text-lg font-bold">{selectedItem.title}</h3>
        </div>
        <div class="flex flex-shrink-0 items-center gap-2">
          {#if isInPast(selectedItem.data.endTime)}
            <!-- Past: Complete or Missed -->
            <button
              class="btn btn-sm btn-success"
              onclick={handleComplete}
              title="完了"
            >
              ✓
            </button>
            <button
              class="btn btn-ghost btn-sm"
              onclick={handleMissed}
              title="未達成"
            >
              ✗
            </button>
          {:else}
            <!-- Future: Delete only -->
            <button
              class="btn btn-sm btn-error"
              onclick={handleDelete}
              title="削除"
            >
              🗑
            </button>
          {/if}
        </div>
      </div>
      <!-- Time range in separate row -->
      <div class="mt-1 text-sm opacity-70">
        {selectedItem.data.startTime} - {selectedItem.data.endTime}
        <span class="ml-2 opacity-50">
          ({formatDuration(selectedItem.data.duration)})
        </span>
      </div>
    {:else if selectedItem.type === "drag-preview"}
      <div class="mb-2 flex items-center gap-2">
        <span class="badge badge-sm badge-info">プレビュー</span>
      </div>
      <h3 class="text-lg font-bold">{selectedItem.title}</h3>
      <div class="mt-1 text-sm opacity-70">
        {selectedItem.startTime} - {selectedItem.endTime}
        <span class="ml-2 opacity-50">
          ({formatDuration(selectedItem.duration)})
        </span>
      </div>
    {/if}
  {:else}
    <!-- Empty state when nothing is selected -->
    <div class="mb-2 flex items-center gap-2">
      <span class="badge badge-ghost badge-sm">選択なし</span>
    </div>
    <h3 class="text-lg font-bold opacity-50">項目を選択してください</h3>
    <div class="mt-1 text-sm opacity-40">
      提案、イベント、または空き時間をクリック
    </div>
  {/if}
</div>
