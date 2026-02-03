<script lang="ts">
  /**
   * SuggestionStats - Shows suggestion acceptance/rejection statistics
   *
   * Displays:
   * - Acceptance rate as percentage
   * - Bar visualization of accepted vs rejected (clickable for details)
   * - Raw counts in legend
   */
  import { getReportState } from "$lib/features/tasks/state/report.svelte.ts";
  import ChartPopover from "./ChartPopover.svelte";

  const reportState = getReportState();

  // Popover state
  let popoverOpen = $state(false);
  let popoverPosition = $state({ x: 0, y: 0 });
  let selectedType = $state<"accepted" | "rejected" | null>(null);

  function getAcceptedPercent(): number {
    const total =
      reportState.suggestionStats.accepted +
      reportState.suggestionStats.rejected;
    if (total === 0) return 0;
    return (reportState.suggestionStats.accepted / total) * 100;
  }

  function handleSegmentClick(e: MouseEvent, type: "accepted" | "rejected") {
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    popoverPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top,
    };
    selectedType = type;
    popoverOpen = true;
  }

  function closePopover() {
    popoverOpen = false;
    selectedType = null;
  }
</script>

<div class="flex flex-col gap-2">
  <h3 class="text-sm font-medium text-base-content/70">提案への反応</h3>

  {#if reportState.suggestionStats.accepted + reportState.suggestionStats.rejected === 0}
    <div
      class="rounded-xl border border-base-300/50 bg-base-100 p-4 text-center text-sm text-base-content/50"
    >
      この期間の提案データはありません
    </div>
  {:else}
    <div class="rounded-xl border border-base-300/50 bg-base-100 p-4">
      <!-- Acceptance rate display -->
      <div class="mb-3 flex items-baseline gap-2">
        <span class="text-2xl font-semibold text-base-content">
          {reportState.suggestionAcceptanceRate}%
        </span>
        <span class="text-sm text-base-content/60">承諾率</span>
      </div>

      <!-- Visual bar (clickable segments) -->
      <div class="mb-2 flex h-6 w-full overflow-hidden rounded-lg">
        {#if reportState.suggestionStats.accepted > 0}
          <button
            class="flex items-center justify-center bg-success text-xs font-medium text-white transition-opacity hover:opacity-80"
            style="width: {getAcceptedPercent()}%"
            onclick={(e: MouseEvent) => handleSegmentClick(e, "accepted")}
            aria-label="承諾: {reportState.suggestionStats.accepted}件"
          >
            {getAcceptedPercent() > 15
              ? reportState.suggestionStats.accepted
              : ""}
          </button>
        {/if}
        {#if reportState.suggestionStats.rejected > 0}
          <button
            class="flex items-center justify-center bg-base-content/20 text-xs font-medium text-base-content/70 transition-opacity hover:opacity-80"
            style="width: {100 - getAcceptedPercent()}%"
            onclick={(e: MouseEvent) => handleSegmentClick(e, "rejected")}
            aria-label="見送り: {reportState.suggestionStats.rejected}件"
          >
            {100 - getAcceptedPercent() > 15
              ? reportState.suggestionStats.rejected
              : ""}
          </button>
        {/if}
      </div>

      <!-- Legend -->
      <div class="flex gap-4 text-xs text-base-content/60">
        <div class="flex items-center gap-1">
          <div class="h-3 w-3 rounded bg-success"></div>
          <span>承諾 ({reportState.suggestionStats.accepted})</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="h-3 w-3 rounded bg-base-content/20"></div>
          <span>見送り ({reportState.suggestionStats.rejected})</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Detail Popover -->
<ChartPopover
  isOpen={popoverOpen}
  onClose={closePopover}
  position={popoverPosition}
>
  {#if selectedType === "accepted"}
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <div class="h-3 w-3 rounded bg-success"></div>
        <span class="font-medium text-base-content">承諾した提案</span>
      </div>
      <div class="text-sm text-base-content/70">
        {reportState.suggestionStats.accepted}件
      </div>
      <div class="text-xs text-base-content/50">
        {Math.round(getAcceptedPercent())}%
      </div>
    </div>
  {:else if selectedType === "rejected"}
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <div class="h-3 w-3 rounded bg-base-content/20"></div>
        <span class="font-medium text-base-content">見送った提案</span>
      </div>
      <div class="text-sm text-base-content/70">
        {reportState.suggestionStats.rejected}件
      </div>
      <div class="text-xs text-base-content/50">
        {Math.round(100 - getAcceptedPercent())}%
      </div>
    </div>
  {/if}
</ChartPopover>
