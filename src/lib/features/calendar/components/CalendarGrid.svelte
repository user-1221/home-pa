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
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-base-300 bg-base-200">
  <!-- Weekday Header -->
  <div class="grid flex-shrink-0 grid-cols-7 border-b border-base-300 bg-base-100">
    <div class="p-2 text-center text-sm font-medium text-base-content/70">日</div>
    <div class="p-2 text-center text-sm font-medium text-base-content/70">月</div>
    <div class="p-2 text-center text-sm font-medium text-base-content/70">火</div>
    <div class="p-2 text-center text-sm font-medium text-base-content/70">水</div>
    <div class="p-2 text-center text-sm font-medium text-base-content/70">木</div>
    <div class="p-2 text-center text-sm font-medium text-base-content/70">金</div>
    <div class="p-2 text-center text-sm font-medium text-base-content/70">土</div>
  </div>

  <!-- Calendar Days Grid -->
  <div class="grid flex-1 grid-cols-7 overflow-y-auto">
    {#each getCalendarDays(currentMonth) as day (day.getTime())}
      <div
        class="relative flex min-h-[72px] cursor-pointer flex-col border border-base-300 bg-base-100 p-1 transition-all duration-200 ease-out hover:bg-base-200
          {isToday(day) ? 'bg-primary/5' : ''}
          {isSelected(day, selectedDate) ? 'border-primary bg-primary/10' : ''}
          {!isCurrentMonth(day, currentMonth) ? 'opacity-30' : ''}"
        onclick={() => onSelectDate(day)}
        onkeydown={(e) => e.key === "Enter" && onSelectDate(day)}
        role="button"
        tabindex="0"
      >
        <div
          class="flex h-7 flex-shrink-0 items-center justify-start pl-1 text-[0.85rem] font-normal {isToday(day)
            ? 'w-7 justify-center rounded-full bg-primary font-medium text-primary-content'
            : ''}"
        >
          {day.getDate()}
        </div>
        <div class="relative mt-1 min-h-[36px] flex-1">
          {#each getEventsForDate(events, day) as truncatedEvent (truncatedEvent.id)}
            {@const originalEvent = events.find((e) => e.id === truncatedEvent.id) || truncatedEvent}
            {@const barPosition = getEventBarPosition(
              originalEvent.start,
              originalEvent.end,
              day,
              originalEvent.timeLabel === "all-day",
            )}
            {@const showLabel = isFirstDayOfEvent(originalEvent, day)}
            {@const rowIndex = eventRowMap.get(truncatedEvent.id) ?? 0}
            <div
              class="absolute right-0 left-0 h-4 cursor-pointer overflow-hidden px-1 py-0.5 text-[0.625rem] leading-[12px] font-medium text-ellipsis whitespace-nowrap text-white transition-transform duration-200 hover:z-[1] hover:translate-y-[-1px] hover:shadow-md
                {barPosition === 'start' ? '-mr-px rounded-l' : ''}
                {barPosition === 'middle' ? '-mx-px' : ''}
                {barPosition === 'end' ? '-ml-px rounded-r' : ''}
                {barPosition === 'single' ? 'rounded' : ''}"
              style="background-color: {getEventColor(truncatedEvent)}; top: {rowIndex * 18}px;"
            >
              {#if showLabel}
                <span class="flex items-center gap-1">
                  {truncatedEvent.title}
                  {#if (truncatedEvent as Event & { isForever?: boolean }).isForever}
                    <span class="text-[0.5rem] opacity-80" title="Forever recurring">∞</span>
                  {/if}
                  {#if (truncatedEvent as Event & { isDuplicate?: boolean }).isDuplicate}
                    <span class="text-[0.5rem] opacity-60" title="Auto-generated duplicate">↻</span>
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
