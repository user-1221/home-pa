<script lang="ts">
  /**
   * DonutChart - SVG donut chart for visualizing proportions
   *
   * Shows segments with click-to-show-detail popover.
   * Center displays a summary value.
   */
  import ChartPopover from "./ChartPopover.svelte";
  import { formatDuration } from "$lib/features/tasks/state/report.svelte.ts";

  interface Segment {
    label: string;
    value: number; // minutes
    color: string;
  }

  interface Props {
    segments: Segment[];
    centerLabel?: string;
    centerValue?: string;
    size?: number;
  }

  let { segments, centerLabel, centerValue, size = 120 }: Props = $props();

  // Popover state
  let popoverOpen = $state(false);
  let popoverPosition = $state({ x: 0, y: 0 });
  let selectedSegment = $state<Segment | null>(null);

  // SVG constants
  const viewBox = 100;
  const cx = viewBox / 2;
  const cy = viewBox / 2;
  const radius = 38;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;

  // Calculate total for percentages
  const total = $derived(segments.reduce((sum, s) => sum + s.value, 0));

  // Calculate segments with their dash offsets
  const segmentData = $derived(() => {
    if (total === 0) return [];

    let offset = circumference * 0.25; // Start from top (12 o'clock)
    return segments
      .filter((s) => s.value > 0)
      .map((segment) => {
        const percent = segment.value / total;
        const dashLength = circumference * percent;
        const dashGap = circumference - dashLength;
        const currentOffset = offset;
        offset -= dashLength; // Move offset for next segment
        return {
          ...segment,
          percent: Math.round(percent * 100),
          dashArray: `${dashLength} ${dashGap}`,
          dashOffset: currentOffset,
        };
      });
  });

  function handleSegmentClick(e: MouseEvent, segment: Segment) {
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    popoverPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top,
    };
    selectedSegment = segment;
    popoverOpen = true;
  }

  function closePopover() {
    popoverOpen = false;
    selectedSegment = null;
  }
</script>

<div class="flex flex-col items-center gap-3">
  <!-- Donut SVG -->
  <div class="relative" style="width: {size}px; height: {size}px;">
    <svg viewBox="0 0 {viewBox} {viewBox}" class="h-full w-full -rotate-90">
      <!-- Background circle -->
      <circle
        {cx}
        {cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        stroke-width={strokeWidth}
        class="text-base-200/50"
      />

      <!-- Segments -->
      {#each segmentData() as segment (segment.label)}
        <circle
          {cx}
          {cy}
          r={radius}
          fill="none"
          stroke={segment.color}
          stroke-width={strokeWidth}
          stroke-dasharray={segment.dashArray}
          stroke-dashoffset={segment.dashOffset}
          class="cursor-pointer transition-opacity hover:opacity-80"
          role="button"
          tabindex="0"
          aria-label="{segment.label}: {segment.percent}%"
          onclick={(e: MouseEvent) => handleSegmentClick(e, segment)}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              handleSegmentClick(e as unknown as MouseEvent, segment);
            }
          }}
        />
      {/each}
    </svg>

    <!-- Center content -->
    {#if centerValue || centerLabel}
      <div
        class="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        {#if centerValue}
          <span class="text-lg font-semibold text-base-content">
            {centerValue}
          </span>
        {/if}
        {#if centerLabel}
          <span class="text-xs text-base-content/60">{centerLabel}</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="flex flex-wrap justify-center gap-3 text-xs text-base-content/60">
    {#each segmentData() as segment (segment.label)}
      <div class="flex items-center gap-1">
        <div
          class="h-3 w-3 rounded"
          style="background-color: {segment.color};"
        ></div>
        <span>{segment.label}</span>
      </div>
    {/each}
  </div>
</div>

<!-- Detail Popover -->
<ChartPopover
  isOpen={popoverOpen}
  onClose={closePopover}
  position={popoverPosition}
>
  {#if selectedSegment}
    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <div
          class="h-3 w-3 rounded"
          style="background-color: {selectedSegment.color};"
        ></div>
        <span class="font-medium text-base-content"
          >{selectedSegment.label}</span
        >
      </div>
      <div class="text-sm text-base-content/70">
        {formatDuration(selectedSegment.value)}
      </div>
      <div class="text-xs text-base-content/50">
        {total > 0 ? Math.round((selectedSegment.value / total) * 100) : 0}%
      </div>
    </div>
  {/if}
</ChartPopover>
