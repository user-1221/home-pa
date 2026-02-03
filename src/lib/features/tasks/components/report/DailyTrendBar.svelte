<script lang="ts">
  /**
   * DailyTrendBar - Shows daily productivity trend as simple bars
   *
   * Mobile-friendly horizontal bar display showing last 7 days.
   * Click on a bar to see details in a popover.
   */
  import {
    getReportState,
    formatDuration,
  } from "$lib/features/tasks/state/report.svelte.ts";
  import { DateTime } from "luxon";
  import ChartPopover from "./ChartPopover.svelte";

  const reportState = getReportState();

  // Popover state
  let popoverOpen = $state(false);
  let popoverPosition = $state({ x: 0, y: 0 });
  let selectedDay = $state<{
    date: string;
    minutes: number;
    tasks: number;
  } | null>(null);

  function formatDateShort(isoDate: string): string {
    const dt = DateTime.fromISO(isoDate);
    const now = DateTime.now();
    const diff = now.startOf("day").diff(dt.startOf("day"), "days").days;

    if (diff === 0) return "今日";
    if (diff === 1) return "昨日";
    return dt.toFormat("M/d");
  }

  function formatDateLong(isoDate: string): string {
    const dt = DateTime.fromISO(isoDate);
    return dt.toFormat("M月d日 (ccc)", { locale: "ja" });
  }

  function getRecentData(): Array<{
    date: string;
    minutes: number;
    tasks: number;
  }> {
    return reportState.dailyTrend.slice(-7);
  }

  function getMaxMinutes(): number {
    const data = getRecentData();
    const max = Math.max(...data.map((d) => d.minutes));
    return max > 0 ? max : 60; // Default to 60 if all zeros
  }

  function handleBarClick(
    e: MouseEvent,
    day: { date: string; minutes: number; tasks: number },
  ) {
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    popoverPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top,
    };
    selectedDay = day;
    popoverOpen = true;
  }

  function closePopover() {
    popoverOpen = false;
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
          onclick={(e: MouseEvent) => handleBarClick(e, day)}
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

<!-- Detail Popover -->
<ChartPopover
  isOpen={popoverOpen}
  onClose={closePopover}
  position={popoverPosition}
>
  {#if selectedDay}
    <div class="flex flex-col gap-1">
      <span class="font-medium text-base-content">
        {formatDateLong(selectedDay.date)}
      </span>
      <div class="flex items-center gap-3 text-sm text-base-content/70">
        <span>{formatDuration(selectedDay.minutes)}</span>
        <span class="text-base-content/40">·</span>
        <span>{selectedDay.tasks}件のタスク</span>
      </div>
    </div>
  {/if}
</ChartPopover>
