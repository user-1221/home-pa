<script lang="ts">
  /**
   * ReportView - Main report container
   *
   * Combines stat cards, time distribution charts, and completion history.
   */
  import StatCard from "./StatCard.svelte";
  import CompletionList from "./CompletionList.svelte";
  import DailyTrendBar from "./DailyTrendBar.svelte";
  import DonutChart from "./DonutChart.svelte";
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

  // Type colors (matching existing app colors)
  const TYPE_COLORS: Record<string, string> = {
    期限付き: "#F59E0B", // warning/amber
    ルーティン: "#3B82F6", // event-blue
    バックログ: "#9CA3AF", // gray
  };

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

  // Get type distribution as DonutChart segments
  function getTypeSegments(): Array<{
    label: string;
    value: number;
    color: string;
  }> {
    const timeByType = reportState.timeByType;
    return [
      {
        label: "期限付き",
        value: timeByType.期限付き,
        color: TYPE_COLORS.期限付き,
      },
      {
        label: "ルーティン",
        value: timeByType.ルーティン,
        color: TYPE_COLORS.ルーティン,
      },
      {
        label: "バックログ",
        value: timeByType.バックログ,
        color: TYPE_COLORS.バックログ,
      },
    ].filter((s) => s.value > 0);
  }

  // Get genre distribution as DonutChart segments
  function getGenreSegments(): Array<{
    label: string;
    value: number;
    color: string;
  }> {
    const timeByGenre = reportState.timeByGenre;
    const result: Array<{ label: string; value: number; color: string }> = [];
    let colorIndex = 0;

    // Sort by time descending
    const sorted = [...timeByGenre.entries()].sort((a, b) => b[1] - a[1]);

    for (const [genre, minutes] of sorted) {
      if (minutes > 0) {
        result.push({
          label: genre,
          value: minutes,
          color: GENRE_COLORS[colorIndex % GENRE_COLORS.length],
        });
        colorIndex++;
      }
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
    <!-- Stats -->
    <div class="stats w-full stats-vertical shadow sm:stats-horizontal">
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
        label="実行失敗"
        value={reportState.missedTaskCount}
        subInfo={reportState.missedTaskCount > 0 ? "承諾後に未完了" : undefined}
        valueColor={reportState.missedTaskCount > 0 ? "error" : undefined}
      />
    </div>

    <!-- Type & Genre Distribution Charts (side by side) -->
    {#if reportState.totalTimeMinutes > 0}
      {@const typeSegments = getTypeSegments()}
      {@const genreSegments = getGenreSegments()}
      <div class="grid grid-cols-2 gap-4">
        <!-- タイプ別 DonutChart -->
        {#if typeSegments.length > 0}
          <div class="flex flex-col gap-2">
            <h3 class="text-sm font-medium text-base-content/70">タイプ別</h3>
            <div
              class="flex items-center justify-center rounded-xl border border-base-300/50 bg-base-100 py-4"
            >
              <DonutChart
                segments={typeSegments}
                centerValue={formatDuration(reportState.totalTimeMinutes)}
                centerLabel="合計"
                size={100}
              />
            </div>
          </div>
        {/if}

        <!-- カテゴリ別 DonutChart -->
        {#if genreSegments.length > 0}
          <div class="flex flex-col gap-2">
            <h3 class="text-sm font-medium text-base-content/70">カテゴリ別</h3>
            <div
              class="flex items-center justify-center rounded-xl border border-base-300/50 bg-base-100 py-4"
            >
              <DonutChart
                segments={genreSegments}
                centerValue={genreSegments.length + "種"}
                centerLabel="カテゴリ"
                size={100}
              />
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Daily Trend (when filter is week or month) -->
    {#if reportState.dateFilter !== "all"}
      <DailyTrendBar />
    {/if}

    <!-- Completion History -->
    <CompletionList />
  {/if}
</div>
