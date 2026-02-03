<script lang="ts">
  /**
   * DayDetailModal - Popup modal showing detailed category breakdown for a day
   *
   * Shows a large donut chart with category breakdown and legend.
   */
  import DonutChart from "./DonutChart.svelte";
  import { formatDuration } from "$lib/features/tasks/state/report.svelte.ts";
  import { DateTime } from "luxon";
  import type { TaskActivity } from "$lib/features/tasks/state/report.svelte.ts";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    day: { date: string; minutes: number; tasks: number } | null;
    taskActivities: TaskActivity[] | null;
  }

  let { isOpen, onClose, day, taskActivities }: Props = $props();

  // Genre colors (same as ReportView)
  const GENRE_COLORS = [
    "#8B5CF6", // purple
    "#EC4899", // pink
    "#14B8A6", // teal
    "#F97316", // orange
    "#06B6D4", // cyan
    "#84CC16", // lime
    "#EF4444", // red
    "#6366F1", // indigo
  ];

  function formatDateLong(isoDate: string): string {
    const dt = DateTime.fromISO(isoDate);
    return dt.toFormat("M月d日 (ccc)", { locale: "ja" });
  }

  // Calculate category breakdown from taskActivities
  function getCategoryBreakdown(): Array<{
    label: string;
    value: number;
    color: string;
    percent: number;
  }> {
    if (!taskActivities) return [];

    const genreMap = new Map<string, number>();
    let total = 0;

    for (const activity of taskActivities) {
      const genre = activity.taskGenre ?? "未分類";
      const current = genreMap.get(genre) ?? 0;
      genreMap.set(genre, current + activity.timeSpentMinutes);
      total += activity.timeSpentMinutes;
    }

    if (total === 0) return [];

    return [...genreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([genre, minutes], index) => ({
        label: genre,
        value: minutes,
        color: GENRE_COLORS[index % GENRE_COLORS.length],
        percent: Math.round((minutes / total) * 100),
      }));
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && day}
  {@const categoryBreakdown = getCategoryBreakdown()}
  <!-- Modal Backdrop -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={handleBackdropClick}
  >
    <!-- Modal Content -->
    <div
      class="w-full max-w-sm rounded-2xl bg-base-100 p-6 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-detail-title"
    >
      <!-- Header -->
      <div class="mb-4 text-center">
        <h2
          id="day-detail-title"
          class="text-lg font-semibold text-base-content"
        >
          {formatDateLong(day.date)}
        </h2>
        <p class="text-sm text-base-content/60">
          合計: {formatDuration(day.minutes)} / {day.tasks}件のタスク
        </p>
      </div>

      <!-- Chart -->
      {#if categoryBreakdown.length > 0}
        <div class="mb-4 flex justify-center">
          <DonutChart
            segments={categoryBreakdown}
            centerValue={formatDuration(day.minutes)}
            centerLabel="合計"
            size={160}
          />
        </div>

        <!-- Detailed Legend -->
        <div class="space-y-2">
          {#each categoryBreakdown as cat (cat.label)}
            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                <div
                  class="h-3 w-3 rounded"
                  style="background-color: {cat.color};"
                ></div>
                <span class="text-base-content">{cat.label}</span>
              </div>
              <div class="flex items-center gap-2 text-base-content/70">
                <span>{formatDuration(cat.value)}</span>
                <span class="text-base-content/50">({cat.percent}%)</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="py-8 text-center text-sm text-base-content/50">
          この日のカテゴリデータはありません
        </div>
      {/if}

      <!-- Close Button -->
      <button
        class="mt-6 w-full rounded-lg bg-base-200 px-4 py-2 text-sm font-medium text-base-content transition-colors hover:bg-base-300"
        onclick={onClose}
      >
        閉じる
      </button>
    </div>
  </div>
{/if}
