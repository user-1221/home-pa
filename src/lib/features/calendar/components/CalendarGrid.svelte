<script lang="ts">
  import type { Event } from "$lib/types.ts";
  import {
    getCalendarDays,
    isToday,
    isCurrentMonth,
    isSelected,
    getEventsForDate,
    isFirstDayOfEvent,
    getEventBarPosition,
    getEventColor,
    getEventTextColor,
  } from "../utils/index.ts";

  interface Props {
    currentMonth: Date;
    selectedDate: Date;
    events: Event[];
    eventRowMap: Map<string, number>;
    onSelectDate: (date: Date) => void;
  }

  let { currentMonth, selectedDate, events, eventRowMap, onSelectDate }: Props =
    $props();

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  // Calculate number of weeks needed for this month
  let calendarDays = $derived(getCalendarDays(currentMonth));
  let numWeeks = $derived(Math.ceil(calendarDays.length / 7));
</script>

<div
  class="flex min-h-0 flex-1 flex-col overflow-hidden border border-base-300/50 bg-base-200/50 shadow-sm backdrop-blur-sm"
>
  <!-- Weekday Header -->
  <div
    class="grid flex-shrink-0 grid-cols-7 border-b border-base-300/50 bg-base-100/80"
  >
    {#each weekdays as weekday, i (weekday)}
      <div
        class="p-2.5 text-center text-xs font-medium tracking-wide text-base-content/60
          {i === 0 ? 'text-error/70' : ''}
          {i === 6 ? 'text-info/70' : ''}"
      >
        {weekday}
      </div>
    {/each}
  </div>

  <!-- Calendar Days Grid - rows fill available space equally -->
  <div
    class="grid min-h-0 flex-1 grid-cols-7"
    style="grid-template-rows: repeat({numWeeks}, minmax(0, 1fr));"
  >
    {#each calendarDays as day, _dayIndex (day.getTime())}
      {@const dayOfWeek = day.getDay()}
      <!-- Cell wrapper: no padding, handles borders and background -->
      <div
        class="group relative flex min-h-0 cursor-pointer flex-col border-r border-b bg-base-100/60
          {isToday(day) ? 'bg-[var(--color-primary)]/5' : ''}
          {isSelected(day, selectedDate)
          ? 'z-10 border-base-300/30 bg-base-300'
          : 'border-base-300/30'}
          {!isCurrentMonth(day, currentMonth) ? 'opacity-40' : ''}"
        onclick={() => onSelectDate(day)}
        onkeydown={(e: KeyboardEvent) => e.key === "Enter" && onSelectDate(day)}
        role="button"
        tabindex="0"
      >
        <!-- Date number with padding -->
        <div class="flex h-7 flex-shrink-0 items-center justify-center p-1">
          <span
            class="flex h-6 w-6 items-center justify-center text-[0.85rem] font-normal
              {dayOfWeek === 0 ? 'text-error/80' : ''}
              {dayOfWeek === 6 ? 'text-info/80' : ''}
              {isToday(day)
              ? 'rounded-full bg-[var(--color-primary)] font-semibold text-white'
              : ''}"
          >
            {day.getDate()}
          </span>
        </div>
        <!-- Events container: no horizontal padding so bars can extend edge-to-edge -->
        <div class="relative min-h-0 flex-1 overflow-hidden">
          {#each getEventsForDate(events, day) as truncatedEvent (truncatedEvent.id)}
            {@const originalEvent =
              events.find((e) => e.id === truncatedEvent.id) || truncatedEvent}
            {@const barPosition = getEventBarPosition(
              originalEvent.start,
              originalEvent.end,
              day,
              originalEvent.timeLabel === "all-day",
            )}
            {@const showLabel = isFirstDayOfEvent(originalEvent, day)}
            {@const rowIndex = eventRowMap.get(truncatedEvent.id) ?? 0}
            {@const eventColorValue = getEventColor(truncatedEvent)}
            <!-- Event bar: extends past cell edges for seamless multi-day connection -->
            <div
              class="absolute h-[18px] cursor-pointer overflow-hidden py-0.5 text-[0.7rem] leading-[14px] font-medium text-ellipsis whitespace-nowrap
                {barPosition === 'start' ? '-right-[1px] left-1 pl-1' : ''}
                {barPosition === 'middle' ? '-right-[1px] -left-[1px]' : ''}
                {barPosition === 'end' ? 'right-1 -left-[1px]' : ''}
                {barPosition === 'single' ? 'right-1 left-1 px-1' : ''}"
              style="background-color: color-mix(in srgb, {eventColorValue} 20%, transparent); color: {getEventTextColor(
                truncatedEvent.color,
                eventColorValue,
              )}; top: {rowIndex * 20}px;"
            >
              {#if showLabel}
                <span class="flex items-center gap-1">
                  {truncatedEvent.title}
                  {#if (truncatedEvent as Event & { isForever?: boolean }).isForever}
                    <span
                      class="text-[0.5rem] opacity-80"
                      title="Forever recurring">∞</span
                    >
                  {/if}
                  {#if (truncatedEvent as Event & { isDuplicate?: boolean }).isDuplicate}
                    <span
                      class="text-[0.5rem] opacity-60"
                      title="Auto-generated duplicate">↻</span
                    >
                  {/if}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
