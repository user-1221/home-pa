<script lang="ts">
  /**
   * ReportView - Main report container
   *
   * Combines stat cards, time distribution bar, and completion history.
   */
  import StatCard from "./StatCard.svelte";
  import CompletionList from "./CompletionList.svelte";
  import SuggestionStats from "./SuggestionStats.svelte";
  import DailyTrendBar from "./DailyTrendBar.svelte";
  import Skeleton from "$lib/features/shared/components/Skeleton.svelte";
  import {
    getReportState,
    formatDuration,
    type DateFilter,
  } from "$lib/features/tasks/state/report.svelte.ts";

  // Get state from context (created in TaskView)
  const reportState = getReportState();

  // Date filter options
  const filterOptions: { id: DateFilter; label: string }[] = [
    { id: "week", label: "今週" },
    { id: "month", label: "今月" },
    { id: "all", label: "全期間" },
  ];

  // Genre colors (cycle through these for different genres)
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

  // Calculate time distribution percentages by type
  function getTimePercentages() {
    const timeByType = reportState.timeByType;
    const total =
      timeByType.期限付き + timeByType.ルーティン + timeByType.バックログ;

    if (total === 0) {
      return { 期限付き: 0, ルーティン: 0, バックログ: 0 };
    }

    return {
      期限付き: Math.round((timeByType.期限付き / total) * 100),
      ルーティン: Math.round((timeByType.ルーティン / total) * 100),
      バックログ: Math.round((timeByType.バックログ / total) * 100),
    };
  }

  // Calculate time distribution percentages by genre
  function getGenrePercentages(): Array<{
    genre: string;
    percent: number;
    color: string;
  }> {
    const timeByGenre = reportState.timeByGenre;
    let total = 0;
    for (const minutes of timeByGenre.values()) {
      total += minutes;
    }

    if (total === 0) return [];

    const result: Array<{ genre: string; percent: number; color: string }> = [];
    let colorIndex = 0;

    // Sort by time descending
    const sorted = [...timeByGenre.entries()].sort((a, b) => b[1] - a[1]);

    for (const [genre, minutes] of sorted) {
      result.push({
        genre,
        percent: Math.round((minutes / total) * 100),
        color: GENRE_COLORS[colorIndex % GENRE_COLORS.length],
      });
      colorIndex++;
    }

    return result;
  }
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-6">
  <!-- Date Filter Tabs -->
  <div class="flex items-center gap-2">
    {#each filterOptions as option (option.id)}
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors {reportState.dateFilter ===
        option.id
          ? 'bg-primary text-white'
          : 'bg-base-200/80 text-base-content/70 hover:bg-base-200'}"
        onclick={() => reportState.setFilter(option.id)}
      >
        {option.label}
      </button>
    {/each}
  </div>

  {#if reportState.isLoading}
    <!-- Loading State -->
    <div class="grid grid-cols-2 gap-3">
      {#each Array(4) as _, i (i)}
        <Skeleton variant="card" />
      {/each}
    </div>
    <Skeleton variant="card" />
    <Skeleton variant="card" />
    <Skeleton variant="card" />
    <Skeleton variant="card" />
  {:else if reportState.error}
    <!-- Error State -->
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-error/30 bg-error/10 px-4 py-8 text-center"
    >
      <svg
        class="mb-2 h-8 w-8 text-error"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      <p class="text-sm text-error">{reportState.error}</p>
      <button
        class="mt-3 rounded-lg bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90"
        onclick={() => reportState.load()}
      >
        再試行
      </button>
    </div>
  {:else}
    <!-- Stats Grid -->
    <div class="grid grid-cols-2 gap-3">
      <StatCard
        label="完了タスク"
        value={reportState.totalCompletions}
        subInfo={reportState.totalCompletions === 0
          ? "タスクを完了しましょう"
          : undefined}
      />
      <StatCard
        label="作業時間"
        value={formatDuration(reportState.totalTimeMinutes)}
      />
      <StatCard
        label="日平均"
        value={formatDuration(reportState.averageDailyMinutes)}
        subInfo={reportState.dailyLogs.length > 0
          ? `${reportState.dailyLogs.length}日分`
          : undefined}
      />
      <StatCard
        label="提案承諾率"
        value={`${reportState.suggestionAcceptanceRate}%`}
        subInfo={reportState.suggestionStats.accepted +
          reportState.suggestionStats.rejected >
        0
          ? `${reportState.suggestionStats.accepted}/${reportState.suggestionStats.accepted + reportState.suggestionStats.rejected}`
          : undefined}
      />
    </div>

    <!-- Time Distribution Bar (by Type) -->
    {#if reportState.totalTimeMinutes > 0}
      {@const percentages = getTimePercentages()}
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-medium text-base-content/70">
          タイプ別作業時間
        </h3>
        <div class="flex h-6 w-full overflow-hidden rounded-lg">
          {#if percentages.期限付き > 0}
            <div
              class="flex items-center justify-center text-xs font-medium text-white"
              style="width: {percentages.期限付き}%; background-color: var(--color-warning-500);"
            >
              {percentages.期限付き > 10 ? `${percentages.期限付き}%` : ""}
            </div>
          {/if}
          {#if percentages.ルーティン > 0}
            <div
              class="flex items-center justify-center text-xs font-medium text-white"
              style="width: {percentages.ルーティン}%; background-color: var(--color-event-blue);"
            >
              {percentages.ルーティン > 10 ? `${percentages.ルーティン}%` : ""}
            </div>
          {/if}
          {#if percentages.バックログ > 0}
            <div
              class="flex items-center justify-center bg-base-content/20 text-xs font-medium text-base-content/70"
              style="width: {percentages.バックログ}%"
            >
              {percentages.バックログ > 10 ? `${percentages.バックログ}%` : ""}
            </div>
          {/if}
        </div>
        <!-- Legend -->
        <div class="flex flex-wrap gap-4 text-xs text-base-content/60">
          <div class="flex items-center gap-1">
            <div
              class="h-3 w-3 rounded"
              style="background-color: var(--color-warning-500);"
            ></div>
            <span>期限付き</span>
          </div>
          <div class="flex items-center gap-1">
            <div
              class="h-3 w-3 rounded"
              style="background-color: var(--color-event-blue);"
            ></div>
            <span>ルーティン</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="h-3 w-3 rounded bg-base-content/20"></div>
            <span>バックログ</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Genre Distribution Bar -->
    {#if reportState.totalTimeMinutes > 0}
      {@const genreData = getGenrePercentages()}
      {#if genreData.length > 0}
        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-medium text-base-content/70">
            カテゴリ別作業時間
          </h3>
          <div class="flex h-6 w-full overflow-hidden rounded-lg">
            {#each genreData as item (item.genre)}
              <div
                class="flex items-center justify-center text-xs font-medium text-white"
                style="width: {item.percent}%; background-color: {item.color};"
              >
                {item.percent > 10 ? `${item.percent}%` : ""}
              </div>
            {/each}
          </div>
          <!-- Legend -->
          <div class="flex flex-wrap gap-4 text-xs text-base-content/60">
            {#each genreData as item (item.genre)}
              <div class="flex items-center gap-1">
                <div
                  class="h-3 w-3 rounded"
                  style="background-color: {item.color};"
                ></div>
                <span>{item.genre}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Suggestion Stats -->
    <SuggestionStats />

    <!-- Daily Trend (when filter is week or month) -->
    {#if reportState.dateFilter !== "all"}
      <DailyTrendBar />
    {/if}

    <!-- Completion History -->
    <CompletionList />
  {/if}
</div>
