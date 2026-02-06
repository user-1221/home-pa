<script lang="ts">
  import type { Event as MyEvent, Gap } from "$lib/types.ts";
  import type {
    PendingSuggestion,
    AcceptedMemoInfo,
  } from "$lib/features/assistant/state/schedule.svelte.ts";
  import { createEventDispatcher } from "svelte";
  import {
    calculateMaxDuration,
    adjustDuration,
    calculateNewEndTime,
  } from "../services/suggestion-drag.ts";
  import { MIN_DRAG_DURATION } from "../services/suggestions/suggestion-scheduler.ts";
  import { focusState } from "$lib/features/focus/state/index.ts";
  import {
    StartNowButton,
    DurationPicker,
  } from "$lib/features/focus/components/index.ts";
  import { onMount } from "svelte";

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
          gapEnd: string; // Gap end time for max duration calculation
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
      | null;
  }

  let { selectedItem = null }: Props = $props();

  const dispatch = createEventDispatcher<{
    accept: string;
    reject: string;
    complete: { memoId: string; startTime: string; duration: number };
    missed: { memoId: string; startTime: string };
    delete: { memoId: string; startTime: string };
    durationChange: {
      suggestionId: string;
      newDuration: number;
      newEndTime: string;
    };
  }>();

  // Minimum duration for suggestions (aligned to 10-min snap grid)
  const MIN_DURATION = MIN_DRAG_DURATION;

  // Calculate max and current duration for pending suggestions
  let maxDuration = $derived.by(() => {
    if (selectedItem?.type === "pending-suggestion") {
      return calculateMaxDuration(
        selectedItem.data.startTime,
        selectedItem.gapEnd,
      );
    }
    return 0;
  });

  let canExtend = $derived.by(() => {
    if (selectedItem?.type === "pending-suggestion") {
      return selectedItem.data.duration < maxDuration;
    }
    return false;
  });

  let canShrink = $derived.by(() => {
    if (selectedItem?.type === "pending-suggestion") {
      return selectedItem.data.duration > MIN_DURATION;
    }
    return false;
  });

  function handleExtend() {
    if (selectedItem?.type === "pending-suggestion" && canExtend) {
      const newDuration = adjustDuration(
        selectedItem.data.duration,
        "extend",
        maxDuration,
        MIN_DURATION,
      );
      const newEndTime = calculateNewEndTime(
        selectedItem.data.startTime,
        newDuration,
      );
      dispatch("durationChange", {
        suggestionId: selectedItem.data.suggestionId,
        newDuration,
        newEndTime,
      });
    }
  }

  function handleShrink() {
    if (selectedItem?.type === "pending-suggestion" && canShrink) {
      const newDuration = adjustDuration(
        selectedItem.data.duration,
        "shrink",
        maxDuration,
        MIN_DURATION,
      );
      const newEndTime = calculateNewEndTime(
        selectedItem.data.startTime,
        newDuration,
      );
      dispatch("durationChange", {
        suggestionId: selectedItem.data.suggestionId,
        newDuration,
        newEndTime,
      });
    }
  }

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

  function handleMissed() {
    if (selectedItem?.type === "accepted-suggestion") {
      dispatch("missed", {
        memoId: selectedItem.memoId,
        startTime: selectedItem.data.startTime,
      });
    }
  }

  function handleDelete() {
    if (selectedItem?.type === "accepted-suggestion") {
      dispatch("delete", {
        memoId: selectedItem.memoId,
        startTime: selectedItem.data.startTime,
      });
    }
  }

  /**
   * Get current time in HH:mm format
   */
  function getCurrentHHmm(): string {
    const nowDate = new globalThis.Date();
    const nowHours = nowDate.getHours().toString().padStart(2, "0");
    const nowMins = nowDate.getMinutes().toString().padStart(2, "0");
    return `${nowHours}:${nowMins}`;
  }

  /**
   * Check if an accepted suggestion is in the past
   * Uses string comparison of HH:mm format times
   * @param endTime - End time in HH:mm format
   */
  function isInPast(endTime: string): boolean {
    const nowTime = getCurrentHHmm();
    // Simple string comparison works for HH:mm format
    return nowTime > endTime;
  }

  /**
   * Check if current time is within an accepted suggestion's time range
   * @param startTime - Start time in HH:mm format
   * @param endTime - End time in HH:mm format
   */
  function isInCurrent(startTime: string, endTime: string): boolean {
    const nowTime = getCurrentHHmm();
    return nowTime >= startTime && nowTime < endTime;
  }

  /**
   * Check if this suggestion is currently being tracked
   */
  let isBeingTracked = $derived.by(() => {
    if (selectedItem?.type !== "accepted-suggestion") return false;
    return (
      focusState.activeSession?.memoId === selectedItem.memoId &&
      focusState.isActive
    );
  });

  // Popover state for DurationPicker
  let showDurationPopover = $state(false);
  let panelRef: HTMLDivElement | null = $state(null);
  let popoverRef: HTMLDivElement | null = $state(null);
  let popoverPosition = $state<{
    top: number;
    left: number;
    placement: "above" | "below";
  } | null>(null);

  // Badge config based on item type
  let badgeConfig = $derived.by(() => {
    if (!selectedItem) {
      return {
        label: "選択なし",
        class: "bg-base-200 text-base-content/50",
      };
    }
    switch (selectedItem.type) {
      case "pending-suggestion":
        return {
          label: "提案",
          class: "bg-warning/15 text-warning border border-warning/30",
        };
      case "accepted-suggestion":
        return {
          label: "承認済み",
          class: "bg-success/15 text-success border border-success/30",
        };
      case "event":
        return {
          label: "イベント",
          class:
            "bg-[var(--color-primary-100)] text-[var(--color-primary-800)] border border-[var(--color-primary)]/30",
        };
      case "gap":
        return {
          label: "空き時間",
          class:
            "bg-[var(--color-surface-100)] text-[var(--color-text-primary)] border border-base-300",
        };
      case "drag-preview":
        return {
          label: "移動",
          class:
            "bg-[var(--color-primary-100)] text-[var(--color-primary-800)] border border-[var(--color-primary)]/30 animate-pulse",
        };
      default:
        return { label: "", class: "" };
    }
  });

  /**
   * Calculate popover position relative to panel
   */
  function calculatePopoverPosition() {
    if (!panelRef) return;

    const panelRect = panelRef.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceAbove = panelRect.top;
    const spaceBelow = viewportHeight - panelRect.bottom;
    const popoverEstimatedHeight = 120; // Approximate height of DurationPicker + padding
    const popoverEstimatedWidth = 320; // Approximate width of popover
    const gap = 12; // Gap between panel and popover

    // Determine placement: above or below
    const placement =
      spaceAbove >= popoverEstimatedHeight + gap ? "above" : "below";

    let top: number;
    if (placement === "above") {
      top = panelRect.top - popoverEstimatedHeight - gap;
      // Ensure popover doesn't go above viewport
      if (top < 8) {
        top = 8;
      }
    } else {
      top = panelRect.bottom + gap;
      // Ensure popover doesn't go below viewport
      if (top + popoverEstimatedHeight > viewportHeight - 8) {
        top = viewportHeight - popoverEstimatedHeight - 8;
      }
    }

    // Center horizontally relative to panel, but constrain to viewport
    let left = panelRect.left + panelRect.width / 2;
    const minLeft = popoverEstimatedWidth / 2 + 8; // 8px margin from left edge
    const maxLeft = viewportWidth - popoverEstimatedWidth / 2 - 8; // 8px margin from right edge

    if (left < minLeft) {
      left = minLeft;
    } else if (left > maxLeft) {
      left = maxLeft;
    }

    popoverPosition = { top, left, placement };
  }

  /**
   * Open popover and calculate position
   */
  function openDurationPopover() {
    showDurationPopover = true;
    // Calculate position after DOM update
    setTimeout(() => {
      calculatePopoverPosition();
      // Focus first button in popover for accessibility
      if (popoverRef) {
        const firstButton = popoverRef.querySelector("button");
        if (firstButton) {
          firstButton.focus();
        }
      }
    }, 0);
  }

  /**
   * Close popover
   */
  function closeDurationPopover() {
    showDurationPopover = false;
    popoverPosition = null;
  }

  /**
   * Handle duration selection and close popover
   */
  function handleDurationSelect(minutes: number) {
    if (selectedItem?.type === "accepted-suggestion") {
      dispatch("complete", {
        memoId: selectedItem.memoId,
        startTime: selectedItem.data.startTime,
        duration: minutes,
      });
      closeDurationPopover();
    }
  }

  /**
   * Handle keyboard events for popover
   */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && showDurationPopover) {
      closeDurationPopover();
    }
  }

  /**
   * Handle click outside popover
   */
  function handleClickOutside(e: MouseEvent) {
    if (
      showDurationPopover &&
      popoverRef &&
      !popoverRef.contains(e.target as Node) &&
      panelRef &&
      !panelRef.contains(e.target as Node)
    ) {
      e.stopPropagation();
      closeDurationPopover();
    }
  }

  // Update popover position on scroll/resize and handle click outside
  onMount(() => {
    const updatePosition = () => {
      if (showDurationPopover) {
        calculatePopoverPosition();
      }
    };

    const handleDocumentClick = (e: MouseEvent) => {
      if (
        showDurationPopover &&
        popoverRef &&
        !popoverRef.contains(e.target as Node) &&
        panelRef &&
        !panelRef.contains(e.target as Node)
      ) {
        closeDurationPopover();
      }
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  });

  // Close popover when selectedItem changes
  $effect(() => {
    if (selectedItem) {
      closeDurationPopover();
    }
  });
</script>

<div
  class="group relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm transition-all duration-300 ease-out hover:shadow-md"
  bind:this={panelRef}
  onkeydown={handleKeydown}
>
  <!-- Subtle gradient overlay for depth -->
  <div
    class="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
  ></div>

  <div class="relative flex h-[100px] flex-col justify-evenly p-4">
    {#if selectedItem}
      {#if selectedItem.type === "pending-suggestion"}
        <!-- Pending Suggestion -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <div class="flex h-9 min-w-0 items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <span class="badge flex-shrink-0 badge-sm {badgeConfig.class}">
                  {badgeConfig.label}
                </span>
                <h3
                  class="min-w-0 truncate text-base font-medium text-[var(--color-text-primary)]"
                >
                  {selectedItem.title}
                </h3>
              </div>
              <!-- Action buttons -->
              <div class="flex flex-shrink-0 gap-2">
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success transition-all duration-200 hover:bg-success hover:text-success-content active:scale-95"
                  onclick={handleAccept}
                  title="承認"
                  aria-label="承認"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-lg bg-error/10 text-error transition-all duration-200 hover:bg-error hover:text-error-content active:scale-95"
                  onclick={handleReject}
                  title="却下"
                  aria-label="却下"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div class="flex h-8 flex-wrap items-center gap-3">
              <p
                class="font-mono text-sm tracking-tight text-[var(--color-text-secondary)]"
              >
                {selectedItem.data.startTime} - {selectedItem.data.endTime}
              </p>
              <!-- Duration adjustment -->
              <div
                class="flex items-center gap-1 rounded-lg bg-base-200/60 px-2 py-1"
              >
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-md text-sm transition-all duration-200 hover:bg-base-300 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent"
                  onclick={handleShrink}
                  disabled={!canShrink}
                  title="10分短く (最小: {formatDuration(MIN_DURATION)})"
                >
                  −
                </button>
                <span
                  class="min-w-[4rem] text-center text-xs font-medium text-[var(--color-text-primary)]"
                >
                  {formatDuration(selectedItem.data.duration)}
                </span>
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-md text-sm transition-all duration-200 hover:bg-base-300 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent"
                  onclick={handleExtend}
                  disabled={!canExtend}
                  title="10分長く (最大: {formatDuration(maxDuration)})"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      {:else if selectedItem.type === "event"}
        <!-- Event -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="badge flex-shrink-0 badge-sm {badgeConfig.class}">
              {badgeConfig.label}
            </span>
            <h3
              class="truncate text-base font-medium text-[var(--color-text-primary)]"
            >
              {selectedItem.data.title}
            </h3>
          </div>
          <p
            class="font-mono text-sm tracking-tight text-[var(--color-text-secondary)]"
          >
            {#if selectedItem.data.timeLabel === "all-day"}
              終日
            {:else}
              {new Date(selectedItem.data.start).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
              })} - {new Date(selectedItem.data.end).toLocaleTimeString(
                "ja-JP",
                { hour: "2-digit", minute: "2-digit" },
              )}
            {/if}
          </p>
        </div>
      {:else if selectedItem.type === "gap"}
        <!-- Gap -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="badge flex-shrink-0 badge-sm {badgeConfig.class}">
              {badgeConfig.label}
            </span>
            <h3
              class="font-mono text-base font-medium tracking-tight text-[var(--color-text-primary)]"
            >
              {selectedItem.data.start} - {selectedItem.data.end}
            </h3>
          </div>
          <p class="text-sm text-[var(--color-text-secondary)]">
            {formatDuration(selectedItem.data.duration)}の空き
          </p>
        </div>
      {:else if selectedItem.type === "accepted-suggestion"}
        <!-- Accepted Suggestion -->
        <div class="flex flex-col gap-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex items-center gap-2">
                <span class="badge flex-shrink-0 badge-sm {badgeConfig.class}">
                  {badgeConfig.label}
                </span>
                {#if isBeingTracked}
                  <span
                    class="badge flex-shrink-0 border border-primary/30 bg-primary/15 badge-sm text-primary"
                  >
                    集中中
                  </span>
                {/if}
                <h3
                  class="truncate text-base font-medium text-[var(--color-text-primary)]"
                >
                  {selectedItem.title}
                </h3>
              </div>
              <p
                class="font-mono text-sm tracking-tight text-[var(--color-text-secondary)]"
              >
                {selectedItem.data.startTime} - {selectedItem.data.endTime}
                <span class="ml-2 text-[var(--color-text-muted)]">
                  ({formatDuration(selectedItem.data.duration)})
                </span>
              </p>
            </div>
            <!-- Action buttons - delete for future/current, missed for past -->
            {#if !isBeingTracked}
              <div class="flex flex-shrink-0 gap-2">
                {#if !isInCurrent(selectedItem.data.startTime, selectedItem.data.endTime) && isInPast(selectedItem.data.endTime)}
                  <!-- Past: show missed button only -->
                  <button
                    class="flex h-9 w-9 items-center justify-center rounded-lg bg-base-200 text-base-content/60 transition-all duration-200 hover:bg-base-300 active:scale-95"
                    onclick={handleMissed}
                    title="未達成"
                    aria-label="未達成"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
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
                {:else}
                  <!-- Future/Current: show delete button -->
                  <button
                    class="flex h-9 w-9 items-center justify-center rounded-lg bg-error/10 text-error transition-all duration-200 hover:bg-error hover:text-error-content active:scale-95"
                    onclick={handleDelete}
                    title="削除"
                    aria-label="削除"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Action area based on state -->
          {#if selectedItem.data.isProgressLogged}
            <!-- Already logged: show completed state -->
            <div
              class="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2"
            >
              <span class="text-sm text-success">進捗記録済み</span>
              <span class="font-mono text-sm text-[var(--color-text-muted)]">
                {formatDuration(selectedItem.data.duration)}
              </span>
            </div>
          {:else if isBeingTracked}
            <!-- Currently tracking: show elapsed time -->
            <div
              class="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2"
            >
              <span class="text-sm text-[var(--color-text-secondary)]">
                経過時間
              </span>
              <span class="font-mono text-sm font-medium text-primary">
                {formatDuration(focusState.elapsedWorkMinutes)}
              </span>
            </div>
          {:else if isInCurrent(selectedItem.data.startTime, selectedItem.data.endTime)}
            <!-- Current time range: show Start Now button -->
            <StartNowButton
              memoId={selectedItem.memoId}
              title={selectedItem.title}
              endTime={selectedItem.data.endTime}
            />
          {:else if isInPast(selectedItem.data.endTime)}
            <!-- Past: show trigger button for Duration Picker popover -->
            <button
              class="flex w-full items-center justify-center rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-center transition-all duration-200 hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
              onclick={openDurationPopover}
              aria-label="作業時間を記録"
              aria-expanded={showDurationPopover}
            >
              <span class="text-sm text-[var(--color-text-secondary)]">
                作業時間を記録
              </span>
            </button>
          {/if}
        </div>
      {:else if selectedItem.type === "drag-preview"}
        <!-- Drag Preview -->
        <div class="flex flex-col gap-2">
          <div class="flex h-9 items-center gap-2">
            <span class="badge flex-shrink-0 badge-sm {badgeConfig.class}">
              {badgeConfig.label}
            </span>
            <h3
              class="truncate text-base font-medium text-[var(--color-text-primary)]"
            >
              {selectedItem.title}
            </h3>
          </div>
          <div class="flex h-8 items-center gap-3">
            <p
              class="font-mono text-sm tracking-tight text-[var(--color-text-secondary)]"
            >
              {selectedItem.startTime} - {selectedItem.endTime}
              <span class="ml-2 text-[var(--color-text-muted)]">
                ({formatDuration(selectedItem.duration)})
              </span>
            </p>
          </div>
        </div>
      {/if}
    {:else}
      <!-- Empty state -->
      <div class="flex flex-col items-center gap-2 text-center">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full bg-base-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-base-content/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
            />
          </svg>
        </div>
        <div>
          <p class="text-sm font-medium text-[var(--color-text-muted)]">
            項目を選択してください
          </p>
          <p class="text-xs text-[var(--color-text-muted)]/70">
            提案、イベント、または空き時間をクリック
          </p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Duration Picker Popover -->
  {#if showDurationPopover && popoverPosition && selectedItem?.type === "accepted-suggestion"}
    <!-- Backdrop for mobile (optional, subtle) -->
    <div
      class="fixed inset-0 z-40 bg-black/5 backdrop-blur-[2px] transition-opacity duration-200"
      onclick={closeDurationPopover}
      aria-hidden="true"
    ></div>
    <div
      bind:this={popoverRef}
      class="duration-popover fixed z-50 w-full max-w-[calc(100vw-2rem)] rounded-xl border border-base-300 bg-base-100 p-4 shadow-lg transition-all duration-200 ease-out md:max-w-sm"
      style="top: {popoverPosition.top}px; left: {popoverPosition.left}px; transform: translateX(-50%);"
      role="dialog"
      aria-label="作業時間を選択"
      aria-modal="false"
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeDurationPopover();
        }
      }}
    >
      <DurationPicker
        plannedDuration={selectedItem.data.duration}
        onSelect={handleDurationSelect}
      />
    </div>
  {/if}
</div>

<style>
  .duration-popover {
    animation: fadeInPopover 0.2s ease-out;
  }

  @keyframes fadeInPopover {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .duration-popover {
      animation: none;
      transition: none;
    }
  }
</style>
