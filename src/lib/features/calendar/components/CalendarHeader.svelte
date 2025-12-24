<script lang="ts">
  interface Props {
    currentMonth: Date;
    calendarError: string | null;
    showDebugInfo: boolean;
    onNavigateMonth: (direction: number) => void;
    onToggleDebug: () => void;
    onCreateEvent: () => void;
    onOpenTimetable?: () => void;
  }

  let {
    currentMonth,
    calendarError,
    showDebugInfo,
    onNavigateMonth,
    onToggleDebug,
    onCreateEvent,
    onOpenTimetable,
  }: Props = $props();
</script>

<div
  class="sticky top-0 z-10 navbar min-h-14 flex-shrink-0 border-b border-base-300 bg-base-100/90 px-3 backdrop-blur-sm md:min-h-20 md:px-5"
>
  <div class="navbar-start gap-2 md:gap-4">
    <button
      class="btn btn-square btn-ghost btn-sm md:btn-md"
      onclick={() => onNavigateMonth(-1)}>←</button
    >
    <h2
      class="min-w-[120px] text-center text-base font-normal tracking-tight whitespace-nowrap md:min-w-[160px] md:text-xl"
    >
      {currentMonth.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
      })}
    </h2>
    <button
      class="btn btn-square btn-ghost btn-sm md:btn-md"
      onclick={() => onNavigateMonth(1)}>→</button
    >
  </div>

  <div class="navbar-end gap-2">
    <button
      class="btn hidden btn-ghost btn-xs md:flex"
      onclick={onToggleDebug}
      title="Toggle debug information"
    >
      {showDebugInfo ? "Hide" : "Show"} Debug
    </button>
    {#if calendarError}
      <div
        class="badge cursor-help gap-1 badge-outline border-[var(--color-error-500)] text-[var(--color-error-500)]"
        title={calendarError}
      >
        ⚠️ Recurring events unavailable
      </div>
    {/if}
    {#if onOpenTimetable}
      <button
        class="btn btn-ghost btn-sm md:btn-md"
        onclick={onOpenTimetable}
        title="時間割"
      >
        📅
      </button>
    {/if}
    <button
      class="btn btn-circle border-none bg-[var(--color-primary-600)] text-white shadow-sm btn-sm hover:bg-[var(--color-primary-800)] md:btn-md"
      onclick={onCreateEvent}>+</button
    >
  </div>
</div>
