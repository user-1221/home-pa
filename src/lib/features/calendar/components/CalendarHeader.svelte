<script lang="ts">
  interface Props {
    currentMonth: Date;
    calendarError: string | null;
    showDebugInfo: boolean;
    onNavigateMonth: (direction: number) => void;
    onToggleDebug: () => void;
    onCreateEvent: () => void;
  }

  let {
    currentMonth,
    calendarError,
    showDebugInfo,
    onNavigateMonth,
    onToggleDebug,
    onCreateEvent,
  }: Props = $props();
</script>

<div class="navbar sticky top-0 z-10 min-h-14 flex-shrink-0 border-b border-base-300 bg-base-100/90 px-3 backdrop-blur-sm md:min-h-20 md:px-5">
  <div class="navbar-start gap-2 md:gap-4">
    <button
      class="btn btn-ghost btn-square btn-sm md:btn-md"
      onclick={() => onNavigateMonth(-1)}
    >←</button>
    <h2 class="min-w-[120px] text-center text-base font-normal tracking-tight whitespace-nowrap md:min-w-[160px] md:text-xl">
      {currentMonth.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
      })}
    </h2>
    <button
      class="btn btn-ghost btn-square btn-sm md:btn-md"
      onclick={() => onNavigateMonth(1)}
    >→</button>
  </div>

  <div class="navbar-end gap-2">
    <button
      class="btn btn-ghost btn-xs hidden md:flex"
      onclick={onToggleDebug}
      title="Toggle debug information"
    >
      {showDebugInfo ? "Hide" : "Show"} Debug
    </button>
    {#if calendarError}
      <div class="badge badge-error badge-outline cursor-help gap-1" title={calendarError}>
        ⚠️ Recurring events unavailable
      </div>
    {/if}
    <button
      class="btn btn-primary btn-circle btn-sm md:btn-md shadow-sm"
      onclick={onCreateEvent}
    >+</button>
  </div>
</div>
