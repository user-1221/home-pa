<script lang="ts">
  interface Props {
    currentMonth: Date;
    calendarError: string | null;
    showDebugInfo: boolean;
    onNavigateMonth: (direction: number) => void;
    onToggleDebug: () => void;
    onCreateEvent: () => void;
    onOpenTimetable?: () => void;
    onToggleDropdown?: () => void;
    showDropdown?: boolean;
  }

  let {
    currentMonth,
    calendarError,
    showDebugInfo,
    onNavigateMonth,
    onToggleDebug,
    onCreateEvent,
    onOpenTimetable,
    onToggleDropdown,
    showDropdown = false,
  }: Props = $props();
</script>

<div
  class="border-subtle relative sticky top-0 z-10 navbar min-h-14 flex-shrink-0 justify-between border-b bg-base-100/90 px-5 backdrop-blur-sm md:min-h-20 md:px-8"
>
  <div class="navbar-start w-auto flex-shrink-0 gap-4 md:gap-6">
    <button
      class="btn btn-square btn-ghost btn-sm md:btn-md"
      onclick={() => onNavigateMonth(-1)}
      aria-label="Previous month"
    >
      <svg
        class="h-5 w-5 md:h-6 md:w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15 19l-7-7 7-7"
        />
      </svg>
    </button>
    <h2
      class="text-center text-lg font-normal tracking-tight whitespace-nowrap md:text-2xl"
    >
      {currentMonth.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
      })}
    </h2>
    <button
      class="btn btn-square btn-ghost btn-sm md:btn-md"
      onclick={() => onNavigateMonth(1)}
      aria-label="Next month"
    >
      <svg
        class="h-5 w-5 md:h-6 md:w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>

  <div class="navbar-end w-auto flex-shrink-0 gap-4 md:gap-6">
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
        aria-label="時間割"
        data-tour="calendar-timetable"
      >
        <svg
          class="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <!-- Calendar grid icon representing timetable -->
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 10h18M3 14h18M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8 4v4M16 4v4"
          />
        </svg>
      </button>
    {/if}
    <button
      class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-lg text-white shadow-md transition-all duration-200 hover:bg-[var(--color-primary-800)] hover:shadow-lg active:scale-95"
      onclick={onCreateEvent}
      aria-label="Create new event"
      data-tour="calendar-create-event"
    >
      <svg
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4v16m8-8H4"
        />
      </svg>
    </button>
  </div>

  <!-- Toggle dropdown button at bottom center -->
  {#if onToggleDropdown}
    <button
      class="absolute bottom-0 left-1/2 flex h-6 w-16 -translate-x-1/2 items-center justify-center rounded-t-full bg-base-300/60 transition-all duration-200 hover:bg-base-300/80 active:bg-base-300"
      onclick={onToggleDropdown}
      title={showDropdown ? "Hide dropdown" : "Show dropdown"}
      aria-label={showDropdown ? "Hide dropdown" : "Show dropdown"}
      aria-expanded={showDropdown}
      data-tour="calendar-filter-toggle"
    >
      <svg
        class="h-3 w-3 transition-transform duration-200 {showDropdown
          ? 'rotate-180'
          : ''}"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M19 9l-7 7-7-7"
        />
      </svg>
      <span class="sr-only">{showDropdown ? "Hide" : "Show"} dropdown</span>
    </button>
  {/if}
</div>
