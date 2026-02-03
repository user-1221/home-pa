<script lang="ts">
  /**
   * CompletionList - Collapsible list of completed tasks
   *
   * Shows recent completions with task title, type badge, time spent, and date.
   * Collapsed by default to keep dashboard clean.
   */
  import {
    getReportState,
    formatDuration,
    formatRelativeDate,
  } from "$lib/features/tasks/state/report.svelte.ts";

  const reportState = getReportState();

  // Collapsed by default for cleaner dashboard
  let isExpanded = $state(false);

  // Type badge color mapping
  const typeBadgeClass: Record<string, string> = {
    期限付き: "bg-info/10 text-info",
    ルーティン: "bg-primary/10 text-primary",
    バックログ: "bg-base-200/80 text-base-content/70",
  };
</script>

<div class="flex flex-col gap-2">
  <!-- Clickable header to expand/collapse -->
  <button
    class="flex items-center gap-2 text-sm font-medium text-base-content/70 transition-colors hover:text-base-content"
    onclick={() => (isExpanded = !isExpanded)}
  >
    <span>完了履歴</span>
    {#if reportState.logs.length > 0}
      <span class="rounded-full bg-base-200/80 px-2 py-0.5 text-xs">
        {reportState.logs.length}件
      </span>
    {/if}
    <svg
      class="h-4 w-4 transition-transform duration-200 {isExpanded
        ? 'rotate-180'
        : ''}"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if isExpanded}
    {#if reportState.logs.length === 0}
      <!-- Empty state (only shown when expanded) -->
      <div
        class="flex flex-col items-center justify-center rounded-xl border border-base-300/50 bg-base-100 px-4 py-8 text-center"
      >
        <svg
          class="mb-2 h-8 w-8 text-base-content/30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p class="text-sm text-base-content/50">
          この期間に完了したタスクはありません
        </p>
      </div>
    {:else}
      <!-- Expanded list -->
      <div
        class="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl border border-base-300/50 bg-base-100"
      >
        {#each reportState.logs as log (log.id)}
          <div
            class="flex items-center justify-between gap-3 border-b border-base-300/30 px-4 py-3 last:border-b-0"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="truncate text-sm font-medium text-base-content">
                {log.taskTitle}
              </span>
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="rounded-full px-2 py-0.5 text-xs {typeBadgeClass[
                    log.taskType
                  ] ?? 'bg-base-200 text-base-content/60'}"
                >
                  {log.taskType}
                </span>
                {#if log.taskGenre}
                  <span
                    class="rounded-full bg-base-200/60 px-2 py-0.5 text-xs text-base-content/60"
                  >
                    {log.taskGenre}
                  </span>
                {/if}
              </div>
            </div>
            <div class="flex flex-shrink-0 flex-col items-end gap-1">
              <span class="text-xs text-base-content/60">
                {formatDuration(log.timeSpentMinutes)}
              </span>
              <span class="text-xs text-base-content/40">
                {formatRelativeDate(log.completedAt)}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
