<script lang="ts">
  /**
   * SuggestionStats - Shows suggestion acceptance/rejection statistics
   *
   * Displays:
   * - Acceptance rate as percentage
   * - Bar visualization of accepted vs rejected
   * - Raw counts
   */
  import { getReportState } from "$lib/features/tasks/state/report.svelte.ts";

  const reportState = getReportState();

  function getAcceptedPercent(): number {
    const total =
      reportState.suggestionStats.accepted +
      reportState.suggestionStats.rejected;
    if (total === 0) return 0;
    return (reportState.suggestionStats.accepted / total) * 100;
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

      <!-- Visual bar -->
      <div class="mb-2 flex h-4 w-full overflow-hidden rounded-lg">
        {#if reportState.suggestionStats.accepted > 0}
          <div
            class="flex items-center justify-center bg-success text-xs font-medium text-white"
            style="width: {getAcceptedPercent()}%"
          >
            {getAcceptedPercent() > 15
              ? reportState.suggestionStats.accepted
              : ""}
          </div>
        {/if}
        {#if reportState.suggestionStats.rejected > 0}
          <div
            class="flex items-center justify-center bg-base-content/20 text-xs font-medium text-base-content/70"
            style="width: {100 - getAcceptedPercent()}%"
          >
            {100 - getAcceptedPercent() > 15
              ? reportState.suggestionStats.rejected
              : ""}
          </div>
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
