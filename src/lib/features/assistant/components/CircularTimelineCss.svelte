<script lang="ts">
  import { onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { dataState, calendarState } from "$lib/bootstrap/compat.svelte.ts";
  import { getEventColor } from "$lib/features/calendar/utils/index.ts";
  import type { Event as MyEvent, Gap } from "$lib/types.ts";
  import type {
    PendingSuggestion,
    AcceptedSuggestion,
  } from "$lib/features/assistant/state/schedule.ts";
  import SuggestionCard from "./SuggestionCard.svelte";
  import { startOfDay, endOfDay } from "$lib/utils/date-utils.ts";
  import {
    snapToGap,
    minutesToTime,
    svgCoordsToAngle,
    angleToMinutes,
  } from "../services/suggestion-drag.ts";
  import {
    clientToSvgCoords,
    getPointerCoords,
  } from "$lib/utils/pointer-drag.ts";
  import {
    createDragTracker,
    startTracking,
    updateTracking,
    endTracking,
    type DragState,
  } from "../utils/interaction-helper.ts";
  import {
    loadTimetableData,
    getTimetableEventsForDate,
    getVisibleTimetableEvents,
    type TimetableEvent,
  } from "$lib/features/calendar/services/timetable-events.ts";

  interface Props {
    showLog?: boolean;
    externalGaps?: Array<{
      start: string;
      end: string;
      duration: number;
      gapId?: string;
    }> | null;
    extraEvents?: MyEvent[] | null;
    pendingSuggestions?: PendingSuggestion[];
    acceptedSuggestions?: AcceptedSuggestion[];
    getTaskTitle?: (memoId: string) => string;
  }

  let {
    showLog = $bindable(false),
    externalGaps = $bindable(null),
    extraEvents = $bindable(null),
    pendingSuggestions = [],
    acceptedSuggestions = [],
    getTaskTitle = () => "Task",
  }: Props = $props();

  // Convert external gaps to Gap type with gapId
  let gapsWithIds = $derived.by((): Gap[] => {
    return (externalGaps ?? []).map((g, i) => ({
      ...g,
      gapId: g.gapId ?? `gap-${i}`,
    }));
  });

  // Timetable events state
  let timetableEvents = $state<TimetableEvent[]>([]);

  // Load timetable events when selected date changes
  $effect(() => {
    const _date = selectedDateCurrent; // Track dependency
    loadTimetableForDate();
  });

  async function loadTimetableForDate() {
    try {
      const { config, cells } = await loadTimetableData();
      const allEvents = getTimetableEventsForDate(
        selectedDateCurrent,
        config,
        cells,
      );
      timetableEvents = getVisibleTimetableEvents(allEvents);
    } catch (err) {
      console.error("[CircularTimeline] Failed to load timetable:", err);
      timetableEvents = [];
    }
  }

  // DOM refs & sizing
  let containerElement: HTMLDivElement | null = null;
  let _size = $state(300);

  // Gap type for dispatcher
  interface GapData {
    start: string;
    end: string;
    duration: number;
    startAngle: number;
    endAngle: number;
  }

  // Track active pointer ID for capture
  let activePointerId = $state<number | null>(null);

  // Dispatcher
  const dispatch = createEventDispatcher<{
    eventSelected: MyEvent;
    gapSelected: GapData;
    suggestionAccept: string;
    suggestionSkip: string;
    suggestionDelete: string;
    suggestionResize: { suggestionId: string; newDuration: number };
    suggestionMove: {
      suggestionId: string;
      newStartTime: string;
      newEndTime: string;
      newGapId: string;
    };
    suggestionDurationChange: { suggestionId: string; newDuration: number };
    suggestionSelected: {
      type: "pending" | "accepted";
      data: PendingSuggestion | AcceptedSuggestion;
    };
    dragPreview: {
      title: string;
      startTime: string;
      endTime: string;
      duration: number;
    };
    clearSelection: void;
  }>();

  // Direct state access
  let masterEvents = $derived(calendarState.events);
  let occurrences = $derived(calendarState.occurrences);
  let selectedDateCurrent = $derived(dataState.selectedDate);

  let centerDateInput: HTMLInputElement | null = null;

  // Combine events
  let allEvents = $derived.by(() => {
    const regular = masterEvents.filter(
      (e) => !e.recurrence || e.recurrence.type === "NONE",
    );
    const recurringIds = new Set(
      masterEvents
        .filter((e) => e.recurrence && e.recurrence.type !== "NONE")
        .map((e) => e.id),
    );
    const expanded: MyEvent[] = occurrences
      .filter((o) => recurringIds.has(o.masterEventId))
      .map((o) => ({
        id: o.id,
        title: o.title,
        start: o.start,
        end: o.end,
        description: o.description,
        address: o.location,
        importance: o.importance,
        timeLabel: o.timeLabel as "all-day" | "timed" | "some-timing",
      }));
    return [...regular, ...expanded, ...(extraEvents ?? [])];
  });

  // Constants
  const TWO_PI = Math.PI * 2;
  const center = 50; // SVG viewBox center
  const outerRadius = 42; // Outermost ring (reduced to make room for time indicators)
  const laneWidth = 5; // Width per lane
  const laneGap = 1; // Gap between lanes

  // Time utilities
  function timeToAngle(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return ((h * 60 + m) / (24 * 60)) * TWO_PI;
  }

  function dateToAngle(d: Date): number {
    return ((d.getHours() * 60 + d.getMinutes()) / (24 * 60)) * TWO_PI;
  }

  function dateToHM(d: Date): string {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function formatDate(d: Date): string {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${month}/${day}`;
  }

  function getEffectiveEnd(ev: MyEvent): Date {
    const end = new Date(ev.end);
    if (
      ev.timeLabel === "all-day" &&
      end.getHours() === 0 &&
      end.getMinutes() === 0
    ) {
      return new Date(end.getTime() - 1);
    }
    return end;
  }

  // Build arc path (for stroked arcs like suggestions)
  function arcPath(
    startAngle: number,
    endAngle: number,
    radius: number,
  ): string {
    if (endAngle < startAngle) endAngle += TWO_PI;
    const delta = endAngle - startAngle;
    const largeArc = delta > Math.PI ? 1 : 0;

    // Rotate -90deg so 0 is at top
    const x1 = center + radius * Math.cos(startAngle - Math.PI / 2);
    const y1 = center + radius * Math.sin(startAngle - Math.PI / 2);
    const x2 = center + radius * Math.cos(endAngle - Math.PI / 2);
    const y2 = center + radius * Math.sin(endAngle - Math.PI / 2);

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  // Build annular trapezoid path (filled shape between two radii)
  // Creates a wedge/sector shape for fixed events
  // paddingAngle - optional angle (in radians) to subtract from both ends for visual separation
  function annularTrapezoidPath(
    startAngle: number,
    endAngle: number,
    outerR: number,
    innerR: number,
    paddingAngle = 0,
  ): string {
    if (endAngle < startAngle) endAngle += TWO_PI;
    
    // Apply padding to create gaps between arcs
    const paddedStartAngle = startAngle + paddingAngle;
    const paddedEndAngle = endAngle - paddingAngle;
    
    // Don't render if padding makes it too small
    if (paddedEndAngle <= paddedStartAngle) return "";
    
    const delta = paddedEndAngle - paddedStartAngle;
    const largeArc = delta > Math.PI ? 1 : 0;

    // Rotate -90deg so 0 is at top
    const adj = -Math.PI / 2;

    // Outer arc points
    const ox1 = center + outerR * Math.cos(paddedStartAngle + adj);
    const oy1 = center + outerR * Math.sin(paddedStartAngle + adj);
    const ox2 = center + outerR * Math.cos(paddedEndAngle + adj);
    const oy2 = center + outerR * Math.sin(paddedEndAngle + adj);

    // Inner arc points
    const ix1 = center + innerR * Math.cos(paddedStartAngle + adj);
    const iy1 = center + innerR * Math.sin(paddedStartAngle + adj);
    const ix2 = center + innerR * Math.cos(paddedEndAngle + adj);
    const iy2 = center + innerR * Math.sin(paddedEndAngle + adj);

    // Path: outer arc clockwise, line to inner, inner arc counter-clockwise, line back
    return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
  }

  // Normalize events for date with lane packing
  interface NormalizedEvent {
    ref: MyEvent;
    startAngle: number;
    endAngle: number;
    lane: number;
  }

  let normalizedEvents = $derived.by((): NormalizedEvent[] => {
    const dayStart = startOfDay(selectedDateCurrent);
    const dayEnd = endOfDay(selectedDateCurrent);
    const ds = dayStart.getTime();
    const de = dayEnd.getTime();

    // Filter and map events
    const events = allEvents
      .filter((ev) => {
        const s = new Date(ev.start).getTime();
        const e = getEffectiveEnd(ev).getTime();
        return s <= de && e >= ds;
      })
      .map((ev) => {
        if (ev.timeLabel === "all-day") {
          return { ref: ev, startAngle: 0, endAngle: TWO_PI * 0.9999 };
        }
        let s = new Date(ev.start);
        let e = new Date(ev.end);
        if (s.getTime() < ds) s = dayStart;
        if (e.getTime() > de) e = dayEnd;
        return {
          ref: ev,
          startAngle: dateToAngle(s),
          endAngle: dateToAngle(e),
        };
      })
      .sort((a, b) => a.startAngle - b.startAngle);

    // Separate timed and all-day
    const timed = events.filter((e) => e.ref.timeLabel !== "all-day");
    const allDay = events.filter((e) => e.ref.timeLabel === "all-day");

    // Lane packing for timed events
    const laneEnds: number[] = [];
    const placed: NormalizedEvent[] = [];

    for (const ev of timed) {
      let lane = 0;
      const endAdj =
        ev.endAngle < ev.startAngle ? ev.endAngle + TWO_PI : ev.endAngle;

      for (let i = 0; i < laneEnds.length; i++) {
        if (ev.startAngle >= laneEnds[i]) {
          lane = i;
          break;
        }
        lane = laneEnds.length;
      }

      if (lane === laneEnds.length) laneEnds.push(endAdj);
      else laneEnds[lane] = Math.max(laneEnds[lane], endAdj);

      placed.push({ ...ev, endAngle: endAdj, lane });
    }

    // All-day events go to inner lanes
    const maxLane =
      placed.length > 0 ? Math.max(...placed.map((p) => p.lane)) : -1;
    const allDayPlaced = allDay.map((ev, i) => ({
      ...ev,
      endAngle:
        ev.endAngle < ev.startAngle ? ev.endAngle + TWO_PI : ev.endAngle,
      lane: maxLane + 1 + i,
    }));

    return [...placed, ...allDayPlaced];
  });

  // Compute max event lanes for lane rails
  const maxEventLanes = $derived.by(() =>
    normalizedEvents.length > 0
      ? Math.max(...normalizedEvents.map((e) => e.lane)) + 1
      : 1
  );

  // Normalize gaps
  interface NormalizedGap {
    start: string;
    end: string;
    duration: number;
    startAngle: number;
    endAngle: number;
  }

  let normalizedGaps = $derived.by((): NormalizedGap[] => {
    return (externalGaps ?? []).map((g) => ({
      ...g,
      startAngle: timeToAngle(g.start),
      endAngle: timeToAngle(g.end),
    }));
  });

  // Normalize suggestions
  interface NormalizedSuggestion {
    data: PendingSuggestion | AcceptedSuggestion;
    startAngle: number;
    endAngle: number;
    isAccepted: boolean;
  }

  let normalizedSuggestions = $derived.by((): NormalizedSuggestion[] => {
    const pending = pendingSuggestions.map((s) => ({
      data: s,
      startAngle: timeToAngle(s.startTime),
      endAngle: timeToAngle(s.endTime),
      isAccepted: false,
    }));
    const accepted = acceptedSuggestions.map((s) => ({
      data: s,
      startAngle: timeToAngle(s.startTime),
      endAngle: timeToAngle(s.endTime),
      isAccepted: true,
    }));
    return [...pending, ...accepted];
  });

  // Normalize timetable events
  interface NormalizedTimetableEvent {
    event: TimetableEvent;
    startAngle: number;
    endAngle: number;
  }

  let normalizedTimetableEvents = $derived.by(
    (): NormalizedTimetableEvent[] => {
      return timetableEvents.map((ev) => ({
        event: ev,
        startAngle: dateToAngle(ev.start),
        endAngle: dateToAngle(ev.end),
      }));
    },
  );

  // Ring radii - NEW LAYOUT:
  // 1. Outermost: Suggestions (annular trapezoids for better touch targets)
  // 2. Middle: Fixed events (annular trapezoids, same color per lane)
  // 3. Inner: Timetable events (dedicated lane, no labels)
  const suggestionOuterRadius = outerRadius - 1; // Outer edge of suggestion trapezoids
  const suggestionInnerRadius = outerRadius - 5; // Inner edge of suggestion trapezoids (thin for visibility)
  const eventBaseRadius = outerRadius - 8; // Events next layer (annular trapezoids)
  const eventInnerRadius = outerRadius - 20; // Inner edge of event trapezoids
  const timetableRingRadius = outerRadius - 28; // Timetable lane (innermost dedicated lane, smaller radius)
  // Visual gap between suggestions (in radians)
  // This creates a small space between consecutive suggestions to make them visually distinct
  const suggestionGapAngle = 0.015; // ~0.86 degrees, visible but not too large
  // Lane colors for fixed events (same color per lane for visual clarity)
  const laneColors: readonly string[] = [
    "var(--color-primary-600)",
    "var(--color-primary-400)",
    "var(--color-primary-800)",
    "var(--color-success-500)",
    "var(--color-warning-500)",
  ];

  function getLaneColor(lane: number): string {
    return laneColors[lane % laneColors.length] ?? "var(--color-primary)";
  }

  // Current time
  let currentTime = $state(new Date());
  let currentTimeAngle = $derived(dateToAngle(currentTime));

  // Hover state with fixed positioning
  let hoveredEvent = $state<MyEvent | null>(null);
  let mousePos = $state({ x: 0, y: 0 });

  function updateMouse(e: MouseEvent) {
    const pad = 15;
    let x = e.clientX + pad;
    let y = e.clientY - pad;
    if (x + 220 > window.innerWidth) x = e.clientX - 220 - pad;
    if (y < pad) y = pad;
    if (y + 100 > window.innerHeight) y = window.innerHeight - 100 - pad;
    mousePos = { x, y };
  }

  function hoverEvent(ev: MyEvent, e: MouseEvent) {
    hoveredEvent = ev;
    updateMouse(e);
  }

  function clearHover() {
    hoveredEvent = null;
  }

  // Suggestion card state
  let selectedSuggestion = $state<{
    suggestion: PendingSuggestion | AcceptedSuggestion;
    isAccepted: boolean;
    position: { x: number; y: number };
  } | null>(null);

  // Drag state (for resize handle)
  let isDragging = $state(false);
  let dragId = $state<string | null>(null);
  let dragStartY = $state(0);
  let dragOrigDuration = $state(0);

  // Midpoint drag state (for moving suggestions)
  let isDraggingMidpoint = $state(false);
  let draggingSuggestionId = $state<string | null>(null);
  let draggingSuggestionDuration = $state(0);
  let draggingSuggestionGapId = $state<string | null>(null);
  let dragPreviewAngles = $state<{ start: number; end: number } | null>(null);
  let dragPreviewGapId = $state<string | null>(null);
  let svgElement: SVGSVGElement | null = $state(null);

  // Handlers
  function handleCenterClick() {
    if (centerDateInput?.showPicker) {
      centerDateInput.showPicker();
    } else if (centerDateInput?.click) {
      centerDateInput.click();
    }
  }

  function handleDateChange(e: Event) {
    const val = (e.target as HTMLInputElement)?.value;
    if (val) {
      const [y, m, d] = val.split("-").map(Number);
      const baseTime = new Date(Date.UTC(y, m - 1, d)).getTime();
      const next = startOfDay(new Date(baseTime));
      dataState.setSelectedDate(next);
    }
  }

  function onSuggestionClick(
    s: PendingSuggestion | AcceptedSuggestion,
    isAccepted: boolean,
    e: MouseEvent,
  ) {
    selectedSuggestion = {
      suggestion: s,
      isAccepted,
      position: { x: e.clientX + 10, y: e.clientY - 50 },
    };
  }

  function closeSuggestionCard() {
    selectedSuggestion = null;
  }
  function handleAccept() {
    if (selectedSuggestion)
      dispatch("suggestionAccept", selectedSuggestion.suggestion.suggestionId);
    closeSuggestionCard();
  }
  function handleSkip() {
    if (selectedSuggestion)
      dispatch("suggestionSkip", selectedSuggestion.suggestion.suggestionId);
    closeSuggestionCard();
  }
  function handleDelete() {
    if (selectedSuggestion)
      dispatch("suggestionDelete", selectedSuggestion.suggestion.suggestionId);
    closeSuggestionCard();
  }

  function handleDurationChange(newDuration: number) {
    if (selectedSuggestion) {
      dispatch("suggestionDurationChange", {
        suggestionId: selectedSuggestion.suggestion.suggestionId,
        newDuration,
      });
    }
  }

  // Resize drag handlers using window event listeners
  function onWindowResizeMove(e: PointerEvent) {
    if (!isDragging || !dragId) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    
    e.preventDefault();
    const coords = getPointerCoords(e);
    const delta = Math.round((dragStartY - coords.y) / 5) * 5;
    dispatch("suggestionResize", {
      suggestionId: dragId,
      newDuration: Math.max(5, dragOrigDuration + delta),
    });
  }

  function onWindowResizeUp(e: PointerEvent) {
    if (!isDragging) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    
    cleanupResizeDrag();
  }

  function cleanupResizeDrag() {
    isDragging = false;
    dragId = null;
    activePointerId = null;
    
    window.removeEventListener("pointermove", onWindowResizeMove);
    window.removeEventListener("pointerup", onWindowResizeUp);
    window.removeEventListener("pointercancel", onWindowResizeUp);
  }

  function startResize(id: string, duration: number, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    activePointerId = e.pointerId;
    const coords = getPointerCoords(e);
    isDragging = true;
    dragId = id;
    dragStartY = coords.y;
    dragOrigDuration = duration;
    
    // Add window listeners for reliable tracking
    window.addEventListener("pointermove", onWindowResizeMove);
    window.addEventListener("pointerup", onWindowResizeUp);
    window.addEventListener("pointercancel", onWindowResizeUp);
  }

  // Drag tracking state
  let dragTracker = $state<DragState>(createDragTracker());
  let currentSuggestion = $state<PendingSuggestion | null>(null);

  // Track pointer ID for suggestion dragging
  let suggestionPointerId = $state<number | null>(null);

  // Suggestion drag handlers using Pointer Events with window listeners
  function onWindowPointerMove(e: PointerEvent) {
    if (!isDraggingMidpoint || !svgElement || !draggingSuggestionId) return;
    if (suggestionPointerId !== null && e.pointerId !== suggestionPointerId) return;
    
    e.preventDefault();
    const coords = getPointerCoords(e);

    // Update drag tracking
    const hasMoved = updateTracking(dragTracker, coords.x, coords.y);

    // Only start visual drag if movement threshold exceeded
    if (!hasMoved) return;

    // Convert pointer position to SVG coordinates
    const svgCoords = clientToSvgCoords(coords.x, coords.y, svgElement);

    // Convert to angle (0 at top, clockwise)
    const angle = svgCoordsToAngle(svgCoords.x, svgCoords.y, center, center);

    // Convert angle to cursor position in minutes
    const cursorMinutes = angleToMinutes(angle);

    // Position arc based on cursor
    const snapResult = snapToGap(
      cursorMinutes,
      draggingSuggestionDuration,
      gapsWithIds,
      draggingSuggestionGapId ?? undefined,
    );

    if (snapResult) {
      dragPreviewAngles = {
        start: timeToAngle(snapResult.newStartTime),
        end: timeToAngle(snapResult.newEndTime),
      };
      dragPreviewGapId = snapResult.targetGap.gapId;

      // Dispatch preview for info panel
      if (currentSuggestion) {
        const startMinutes = angleToMinutes(dragPreviewAngles.start);
        const endMinutes = angleToMinutes(dragPreviewAngles.end);
        dispatch("dragPreview", {
          title: getTaskTitle(currentSuggestion.memoId),
          startTime: minutesToTime(startMinutes),
          endTime: minutesToTime(endMinutes),
          duration: endMinutes - startMinutes,
        });
      }
    }
  }

  function onWindowPointerUp(e: PointerEvent) {
    if (!isDraggingMidpoint) return;
    if (suggestionPointerId !== null && e.pointerId !== suggestionPointerId) return;
    
    const interactionType = endTracking(dragTracker);

    if (
      interactionType === "drag" &&
      isDraggingMidpoint &&
      draggingSuggestionId &&
      dragPreviewAngles &&
      currentSuggestion
    ) {
      // Calculate final times from preview angles
      const startMinutes = angleToMinutes(dragPreviewAngles.start);
      const endMinutes = angleToMinutes(dragPreviewAngles.end);
      const newStartTime = minutesToTime(startMinutes);
      const newEndTime = minutesToTime(endMinutes);
      const newGapId = dragPreviewGapId ?? draggingSuggestionGapId ?? "";

      dispatch("suggestionMove", {
        suggestionId: draggingSuggestionId,
        newStartTime,
        newEndTime,
        newGapId,
      });

      // Select the moved suggestion with updated position (not preview, actual suggestion)
      const updatedSuggestion: PendingSuggestion = {
        ...currentSuggestion,
        startTime: newStartTime,
        endTime: newEndTime,
        gapId: newGapId,
        duration: endMinutes - startMinutes,
      };

      dispatch("suggestionSelected", {
        type: "pending",
        data: updatedSuggestion,
      });
    } else if (interactionType === "click" && currentSuggestion) {
      // It was a click - dispatch selection
      dispatch("suggestionSelected", {
        type: "pending",
        data: currentSuggestion,
      });
    }

    // Reset state and remove listeners
    cleanupSuggestionDrag();
  }

  function cleanupSuggestionDrag() {
    isDraggingMidpoint = false;
    draggingSuggestionId = null;
    draggingSuggestionDuration = 0;
    draggingSuggestionGapId = null;
    dragPreviewAngles = null;
    dragPreviewGapId = null;
    currentSuggestion = null;
    suggestionPointerId = null;
    
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("pointercancel", onWindowPointerUp);
  }

  function startSuggestionDrag(
    suggestion: PendingSuggestion,
    gapId: string,
    e: PointerEvent,
  ) {
    e.preventDefault();
    e.stopPropagation();
    
    suggestionPointerId = e.pointerId;
    const coords = getPointerCoords(e);

    // Start tracking for click vs drag detection
    startTracking(dragTracker, coords.x, coords.y);
    currentSuggestion = suggestion;

    isDraggingMidpoint = true;
    draggingSuggestionId = suggestion.suggestionId;
    draggingSuggestionDuration = suggestion.duration;
    draggingSuggestionGapId = gapId;
    dragPreviewAngles = {
      start: timeToAngle(suggestion.startTime),
      end: timeToAngle(suggestion.endTime),
    };
    dragPreviewGapId = gapId;
    
    // Add window listeners for reliable tracking
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
  }

  // Resize observer with throttle
  let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleResize() {
    if (!containerElement) return;
    const rect = containerElement.getBoundingClientRect();
    _size = Math.min(rect.width, rect.height);
  }

  onMount(() => {
    handleResize();
    const ro = new ResizeObserver(() => {
      if (resizeTimeout) return;
      resizeTimeout = setTimeout(() => {
        handleResize();
        resizeTimeout = null;
      }, 50);
    });
    if (containerElement) ro.observe(containerElement);

    const interval = setInterval(() => {
      currentTime = new Date();
    }, 60000);

    return () => {
      ro.disconnect();
      if (resizeTimeout) clearTimeout(resizeTimeout);
      clearInterval(interval);
      // Cleanup any active drag listeners
      cleanupSuggestionDrag();
      cleanupResizeDrag();
    };
  });

  // Helper to get resize handle position
  function getHandlePos(
    endAngle: number,
    radius: number,
  ): { x: number; y: number } {
    const x = center + radius * Math.cos(endAngle - Math.PI / 2);
    const y = center + radius * Math.sin(endAngle - Math.PI / 2);
    return { x, y };
  }
</script>

<div bind:this={containerElement} class="timeline-container">
  <svg bind:this={svgElement} viewBox="-10 -10 120 120" class="timeline-svg">
    <defs>
      <!-- Solid color refs for arcs -->

      <!-- Glow filters -->
      <filter id="glow"
        filterUnits="userSpaceOnUse"
        x="-20" y="-20" width="140" height="140">
        <feGaussianBlur stdDeviation="0.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="softGlow"
        filterUnits="userSpaceOnUse"
        x="-20" y="-20" width="140" height="140">
        <feGaussianBlur stdDeviation="0.3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <!-- Background rings (new layout: suggestion outer, events middle, timetable inner) -->
    <circle
      cx={center}
      cy={center}
      r={outerRadius}
      fill="none"
      stroke="var(--color-border-default)"
      stroke-opacity="0.4"
      stroke-width="0.3"
    />
    <!-- Suggestion ring guides (outermost) -->
    <circle
      cx={center}
      cy={center}
      r={suggestionOuterRadius}
      fill="none"
      stroke="var(--color-border-default)"
      stroke-opacity="0.2"
      stroke-width="0.15"
    />
    <circle
      cx={center}
      cy={center}
      r={suggestionInnerRadius}
      fill="none"
      stroke="var(--color-border-default)"
      stroke-opacity="0.2"
      stroke-width="0.15"
    />
    <!-- Event zone outer boundary -->
    <circle
      cx={center}
      cy={center}
      r={eventBaseRadius}
      fill="none"
      stroke="var(--color-border-default)"
      stroke-opacity="0.2"
      stroke-width="0.15"
    />
    <!-- Event zone inner boundary -->
    <circle
      cx={center}
      cy={center}
      r={eventInnerRadius}
      fill="none"
      stroke="var(--color-border-default)"
      stroke-opacity="0.2"
      stroke-width="0.15"
    />
    <!-- Timetable ring guide (innermost dedicated lane) -->
    <circle
      cx={center}
      cy={center}
      r={timetableRingRadius}
      fill="none"
      stroke="var(--color-border-default)"
      stroke-opacity="0.25"
      stroke-width="0.2"
    />

    <!-- Hour markers -->
    {#each [0, 6, 12, 18] as hour (hour)}
      {@const angle = (hour / 24) * TWO_PI - Math.PI / 2}
      {@const x1 = center + (outerRadius - 0.5) * Math.cos(angle)}
      {@const y1 = center + (outerRadius - 0.5) * Math.sin(angle)}
      {@const x2 = center + (outerRadius + 1.5) * Math.cos(angle)}
      {@const y2 = center + (outerRadius + 1.5) * Math.sin(angle)}
      {@const lx = center + (outerRadius + 5) * Math.cos(angle)}
      {@const ly = center + (outerRadius + 5) * Math.sin(angle)}
      <line
        {x1}
        {y1}
        {x2}
        {y2}
        stroke="var(--color-text-muted)"
        stroke-opacity="0.6"
        stroke-width="0.5"
      />
      <circle
        cx={lx}
        cy={ly}
        r="2.5"
        fill="var(--color-bg-app)"
        fill-opacity="0.95"
        stroke="var(--color-border-strong)"
        stroke-opacity="0.6"
        stroke-width="0.3"
      />
      <text
        x={lx}
        y={ly}
        font-size="3"
        font-weight="600"
        fill="var(--color-text-primary)"
        fill-opacity="0.8"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {String(hour).padStart(2, "0")}
      </text>
    {/each}

    <!-- Timetable arcs (dedicated innermost lane, no labels) -->
    {#each normalizedTimetableEvents as tt (tt.event.id)}
      {@const isBlocking = tt.event.workAllowed === "作業不可"}
      <path
        d={arcPath(tt.startAngle, tt.endAngle, timetableRingRadius)}
        fill="none"
        stroke={isBlocking
          ? "var(--color-error-400)"
          : "var(--color-success-400)"}
        stroke-width="3"
        stroke-linecap="round"
        stroke-opacity="0.85"
        class="timetable-arc"
        filter="url(#softGlow)"
      />
    {/each}

    <!-- Suggestion arcs as annular trapezoids (for better touch targets) -->
    {#each normalizedSuggestions as s (s.data.suggestionId)}
      {@const isPending = !s.isAccepted}
      {@const isBeingDragged =
        isDraggingMidpoint && draggingSuggestionId === s.data.suggestionId}
      {@const shouldHide = isDraggingMidpoint && isPending && !isBeingDragged}
      {@const handlePos = getHandlePos(s.endAngle, suggestionOuterRadius)}

      {#if !shouldHide}
        {#if isBeingDragged && dragPreviewAngles}
          <!-- Drag preview trapezoid (shown during drag) -->
          <path
            d={annularTrapezoidPath(
              dragPreviewAngles.start,
              dragPreviewAngles.end,
              suggestionOuterRadius,
              suggestionInnerRadius,
              suggestionGapAngle,
            )}
            fill="var(--color-warning-500)"
            fill-opacity="0.9"
            stroke="none"
            class="suggestion-arc dragging"
            filter="url(#glow)"
          />
          <!-- Original position ghost -->
          <path
            d={annularTrapezoidPath(
              s.startAngle,
              s.endAngle,
              suggestionOuterRadius,
              suggestionInnerRadius,
              suggestionGapAngle,
            )}
            fill="var(--color-warning-500)"
            fill-opacity="0.25"
            stroke="none"
          />
        {:else}
          <!-- Invisible larger touch target (extends beyond visual arc) -->
          <path
            role="button"
            tabindex="0"
            d={annularTrapezoidPath(
              s.startAngle,
              s.endAngle,
              suggestionOuterRadius + 2, // Extend outward
              suggestionInnerRadius - 2, // Extend inward
              suggestionGapAngle * 0.5, // Smaller gap for touch target
            )}
            fill="transparent"
            stroke="none"
            pointer-events="auto"
            onpointerdown={(e) => {
              if (isPending) {
                startSuggestionDrag(s.data as PendingSuggestion, s.data.gapId, e);
              } else {
                // Accepted suggestion - just dispatch selection on click
                e.preventDefault();
                e.stopPropagation();
                dispatch("suggestionSelected", {
                  type: "accepted",
                  data: s.data as AcceptedSuggestion,
                });
              }
            }}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const mouseEvent = new MouseEvent("click", {
                  bubbles: true,
                  cancelable: true,
                });
                onSuggestionClick(s.data, s.isAccepted, mouseEvent);
              }
            }}
          />
          <!-- Visible suggestion arc (no pointer events, clicks go through to touch target) -->
          <path
            d={annularTrapezoidPath(
              s.startAngle,
              s.endAngle,
              suggestionOuterRadius,
              suggestionInnerRadius,
              suggestionGapAngle,
            )}
            fill={isPending
              ? "var(--color-warning-500)"
              : "var(--color-success-500)"}
            fill-opacity={isPending ? 0.75 : 0.8}
            stroke="none"
            class="suggestion-arc"
            class:pending={isPending}
            class:accepted={!isPending}
            filter="url(#softGlow)"
            pointer-events="none"
          />
          {#if isPending}
            <!-- Visual indicator for pending (dashed outline on inner edge) -->
            <path
              d={arcPath(s.startAngle, s.endAngle, suggestionInnerRadius)}
              fill="none"
              stroke="var(--color-warning-500)"
              stroke-width="0.5"
              stroke-linecap="round"
              stroke-dasharray="1 1"
              opacity="0.8"
              class="pointer-events-none"
            />
          {/if}
        {/if}
        {#if !isPending}
          <circle
            role="button"
            tabindex="0"
            cx={handlePos.x}
            cy={handlePos.y}
            r="1.2"
            fill="var(--color-success-500)"
            stroke="var(--color-bg-app)"
            stroke-opacity="0.9"
            stroke-width="0.3"
            class="resize-handle"
            onpointerdown={(e) =>
              startResize(s.data.suggestionId, s.data.duration, e)}
          />
        {/if}
      {/if}
    {/each}

    <!-- Event arcs as annular trapezoids (same color per lane, with lane packing) -->
    {#each normalizedEvents as ev (ev.ref.id)}
      {@const isAllDay = ev.ref.timeLabel === "all-day"}
      {@const laneColor = getLaneColor(ev.lane)}
      {@const laneFade = Math.max(0.6, 0.9 - ev.lane * 0.08)}
      <!-- Calculate radii based on lane - each lane is a ring between eventBaseRadius and eventInnerRadius -->
      {@const totalEventDepth = eventBaseRadius - eventInnerRadius}
      {@const laneHeight = totalEventDepth / Math.max(maxEventLanes, 1)}
      {@const eventOuterR = eventBaseRadius - ev.lane * laneHeight}
      {@const eventInnerRCalc = eventOuterR - laneHeight + 0.5}
      <!-- Annular trapezoid (filled wedge shape) -->
      <path
        role="button"
        tabindex="0"
        d={annularTrapezoidPath(ev.startAngle, ev.endAngle, eventOuterR, eventInnerRCalc)}
        fill={laneColor}
        fill-opacity={isAllDay ? 0.35 : laneFade * 0.7}
        stroke="none"
        class="event-arc"
        class:all-day={isAllDay}
        filter="url(#softGlow)"
        onmouseenter={(e) => hoverEvent(ev.ref, e)}
        onmousemove={updateMouse}
        onmouseleave={clearHover}
        onclick={() => dispatch("eventSelected", ev.ref)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            dispatch("eventSelected", ev.ref);
          }
        }}
      />
    {/each}

    <!-- Gap arcs removed - gaps are no longer visible on the timeline -->

    <!-- Current time indicator -->
    {#if true}
      {@const timeX =
        center + (outerRadius - 2) * Math.cos(currentTimeAngle - Math.PI / 2)}
      {@const timeY =
        center + (outerRadius - 2) * Math.sin(currentTimeAngle - Math.PI / 2)}
      <line
        x1={center}
        y1={center}
        x2={timeX}
        y2={timeY}
        stroke="var(--color-primary)"
        stroke-width="0.5"
        stroke-linecap="round"
        filter="url(#glow)"
      />
      <circle
        cx={timeX}
        cy={timeY}
        r="1.2"
        fill="var(--color-primary)"
        filter="url(#glow)"
      />
    {/if}

    <!-- Center circle -->
    <circle
      cx={center}
      cy={center}
      r="15"
      fill="var(--color-bg-app)"
      fill-opacity="0.95"
      stroke="var(--color-border-default)"
      stroke-opacity="0.6"
      stroke-width="0.3"
    />
  </svg>

  <!-- Center display -->
  <button
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent p-2 text-center"
    onclick={handleCenterClick}
  >
    <div
      class="text-[clamp(10px,3vw,16px)] font-light tracking-wide text-base-content/80"
    >
      {formatDate(selectedDateCurrent)}
    </div>
    <div
      class="mt-0.5 text-[clamp(6px,1.5vw,8px)] tracking-widest text-[var(--color-text-muted)] uppercase"
    >
      tap to change
    </div>
  </button>

  <input
    bind:this={centerDateInput}
    type="date"
    class="pointer-events-none absolute opacity-0"
    value={selectedDateCurrent.toISOString().slice(0, 10)}
    onchange={handleDateChange}
  />

  <!-- Tooltips (fixed position) -->
  {#if hoveredEvent}
    <div
      class="pointer-events-none fixed z-[1000] max-w-[220px] animate-[fadeIn_0.15s_ease] rounded-lg border border-base-300/70 bg-base-100/98 p-3 shadow-lg backdrop-blur-md"
      style="left: {mousePos.x}px; top: {mousePos.y}px;"
    >
      <div class="mb-1 text-sm font-medium">{hoveredEvent.title}</div>
      <div class="text-xs text-[var(--color-text-secondary)]">
        {hoveredEvent.timeLabel === "all-day"
          ? "All day"
          : `${dateToHM(new Date(hoveredEvent.start))} - ${dateToHM(new Date(hoveredEvent.end))}`}
      </div>
      {#if hoveredEvent.description}
        <div class="mt-1 text-[10px] text-[var(--color-text-muted)] italic">
          {hoveredEvent.description}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Gap tooltip removed - gaps are no longer visible -->

  {#if showLog}
    <div
      class="pointer-events-none absolute bottom-1 left-1 text-[8px] text-[var(--color-text-muted)] opacity-70"
    >
      events: {normalizedEvents.length} | timetable: {normalizedTimetableEvents.length}
      | gaps: {normalizedGaps.length} | suggestions:
      {normalizedSuggestions.length}
    </div>
  {/if}

  <!-- Suggestion Card -->
  {#if selectedSuggestion}
    <div
      class="fixed inset-0 bg-base-content/40 backdrop-blur-sm"
      style="z-index: 2100;"
      onclick={closeSuggestionCard}
      onkeydown={(e) => e.key === "Escape" && closeSuggestionCard()}
      role="button"
      tabindex="-1"
      aria-label="Close"
    ></div>
    <SuggestionCard
      suggestion={selectedSuggestion.suggestion}
      taskTitle={getTaskTitle(selectedSuggestion.suggestion.memoId)}
      isAccepted={selectedSuggestion.isAccepted}
      position={selectedSuggestion.position}
      onAccept={handleAccept}
      onSkip={handleSkip}
      onDelete={handleDelete}
      onClose={closeSuggestionCard}
      onDurationChange={handleDurationChange}
    />
  {/if}
</div>

<style>
  /* Prevent text selection and enable touch for draggable elements */
  .suggestion-arc,
  .resize-handle {
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
  }

  /* Prevent selection on the entire SVG during interactions */
  .timeline-svg {
    overflow: visible;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }


  .event-arc {
    transition: stroke-opacity 120ms ease, stroke-width 120ms ease;
  }

  .event-arc:hover,
  .event-arc:focus {
    stroke-opacity: 1;
  }
</style>