<script lang="ts">
  /**
   * DailyTrendBar - Shows daily productivity trend as horizontal bars
   *
   * Mobile-friendly horizontal bar display showing last 7 days.
   * Click on a bar to open a detailed modal with category breakdown.
   */
  import {
    getReportState,
    formatDuration,
    type TaskActivity,
  } from "$lib/features/tasks/state/report.svelte.ts";
  import { DateTime } from "luxon";
  import DayDetailModal from "./DayDetailModal.svelte";

  const reportState = getReportState();

  // Modal state
  let showDetailModal = $state(false);
  let selectedDay = $state<{
    date: string;
    minutes: number;
    tasks: number;
    taskActivities: TaskActivity[] | null;
  } | null>(null);

  function formatDateShort(isoDate: string): string {
    const dt = DateTime.fromISO(isoDate);
    const now = DateTime.now();
    const diff = now.startOf("day").diff(dt.startOf("day"), "days").days;

    if (diff === 0) return "今日";
    if (diff === 1) return "昨日";
    return dt.toFormat("M/d");
  }

  function getRecentData(): Array<{
    date: string;
    minutes: number;
    tasks: number;
    taskActivities: TaskActivity[] | null;
  }> {
    return reportState.dailyTrend.slice(-7);
  }

  function getMaxMinutes(): number {
    const data = getRecentData();
    const max = Math.max(...data.map((d) => d.minutes));
    return max > 0 ? max : 60; // Default to 60 if all zeros
  }

  function handleBarClick(day: {
    date: string;
    minutes: number;
    tasks: number;
    taskActivities: TaskActivity[] | null;
  }) {
    selectedDay = day;
    showDetailModal = true;
  }

  function closeModal() {
    showDetailModal = false;
    selectedDay = null;
  }
</script>

<div class="flex flex-col gap-2">
  <h3 class="text-sm font-medium text-base-content/70">日別作業時間</h3>

  {#if getRecentData().length === 0}
    <div
      class="rounded-xl border border-base-300/50 bg-base-100 p-4 text-center text-sm text-base-content/50"
    >
      この期間のデータはありません
    </div>
  {:else}
    <div
      class="flex flex-col gap-1 rounded-xl border border-base-300/50 bg-base-100 p-4"
    >
      {#each getRecentData() as day (day.date)}
        <button
          class="flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-base-200/50"
          onclick={() => handleBarClick(day)}
          aria-label="{formatDateShort(day.date)}: {formatDuration(
            day.minutes,
          )}"
        >
          <span class="w-12 text-right text-xs text-base-content/60">
            {formatDateShort(day.date)}
          </span>
          <div class="flex-1">
            <div class="h-5 w-full overflow-hidden rounded bg-base-200/50">
              <div
                class="h-full bg-primary transition-all duration-300"
                style="width: {(day.minutes / getMaxMinutes()) * 100}%"
              ></div>
            </div>
          </div>
          <span class="w-14 text-right text-xs text-base-content/70">
            {formatDuration(day.minutes)}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<!-- Detail Modal -->
<DayDetailModal
  isOpen={showDetailModal}
  onClose={closeModal}
  day={selectedDay}
  taskActivities={selectedDay?.taskActivities ?? null}
/>
