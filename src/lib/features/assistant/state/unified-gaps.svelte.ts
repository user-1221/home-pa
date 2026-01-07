/**
 * @fileoverview Unified Gap State - Svelte 5 Reactive System
 *
 * This module provides a single source of truth for gap computation and enrichment.
 * It uses Svelte 5 runes for proper reactivity without polling.
 *
 * Key features:
 * - Reactive current time (updates every minute)
 * - Automatic gap computation when dependencies change
 * - Automatic enrichment of gaps with location labels
 * - Past time blocking for today's gaps
 * - Regeneration tracking for lazy schedule updates
 *
 * Data Flow:
 *   selectedDate + events + activeTime + currentTime
 *       ↓
 *   computedGaps (with past time blocking)
 *       ↓
 *   enrichedGaps (with location labels)
 *       ↓
 *   needsRegeneration flag → schedule regeneration (when on assistant tab)
 */

import { dataState } from "$lib/bootstrap/data.svelte.ts";
import { settingsState } from "$lib/bootstrap/settings.svelte.ts";
import { calendarState } from "$lib/features/calendar/state/calendar.svelte.ts";
import { GapFinder, type Event } from "../services/gap-finder.ts";
import {
  enrichGapsWithLocation,
  type EnrichableEvent,
} from "../services/suggestions/gap-enrichment.ts";
import type { Event as CalendarEvent, Gap } from "$lib/types.ts";
import { startOfDay, endOfDay } from "$lib/utils/date-utils.ts";
import {
  loadTimetableData,
  getTimetableEventsForDate,
  getBlockingTimetableEvents,
  type TimetableEvent,
} from "$lib/features/calendar/services/timetable-events.ts";

// ============================================================================
// REACTIVE TIME STATE
// ============================================================================

/**
 * Current time in minutes since midnight
 * Updates every minute to trigger gap recalculation
 */
let currentTimeMinutes = $state(getCurrentMinutes());

/**
 * Get current minutes since midnight
 */
function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Convert minutes to HH:mm format
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Get date key for comparison (YYYY-MM-DD)
 * Uses local date components to avoid timezone issues
 */
function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Update current time every minute
if (typeof window !== "undefined") {
  // Calculate ms until next minute boundary for precise updates
  const now = new Date();
  const msUntilNextMinute =
    (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

  // First update at next minute boundary
  setTimeout(() => {
    currentTimeMinutes = getCurrentMinutes();

    // Then update every 60 seconds
    setInterval(() => {
      currentTimeMinutes = getCurrentMinutes();
    }, 60_000);
  }, msUntilNextMinute);
}

// ============================================================================
// TIMETABLE STATE
// ============================================================================

/**
 * Timetable blocking events for the selected date
 */
let timetableBlockingEvents = $state<TimetableEvent[]>([]);
let lastLoadedDateKey: string | null = null;

/**
 * Whether timetable data is currently loading
 */
let isTimetableLoading = $state(false);

/**
 * Whether timetable has been loaded at least once for the current date
 */
let isTimetableLoaded = $state(false);

/**
 * Promise that resolves when timetable loading completes
 * Used to wait for timetable before computing gaps
 */
let timetableLoadPromise: Promise<void> | null = null;
let timetableLoadResolve: (() => void) | null = null;

/**
 * Clear the last loaded date key to force a reload
 */
function clearTimetableDateCache(): void {
  lastLoadedDateKey = null;
  isTimetableLoaded = false;
}

/**
 * Load timetable events for a given date
 * @param forceReload - If true, ignores the date cache and reloads anyway
 */
async function loadTimetableForDate(
  date: Date,
  forceReload = false,
): Promise<void> {
  const key = dateKey(date);
  if (!forceReload && key === lastLoadedDateKey) return;

  // Reset loaded state when loading new date
  if (key !== lastLoadedDateKey) {
    isTimetableLoaded = false;
  }

  lastLoadedDateKey = key;
  isTimetableLoading = true;

  // Create a new promise for waiting
  timetableLoadPromise = new Promise((resolve) => {
    timetableLoadResolve = resolve;
  });

  try {
    const { config, cells } = await loadTimetableData();
    const allEvents = getTimetableEventsForDate(date, config, cells);
    timetableBlockingEvents = getBlockingTimetableEvents(allEvents);
    console.log(
      `[unified-gaps] Loaded ${timetableBlockingEvents.length} blocking timetable events for ${key}`,
    );
  } catch (err) {
    console.error("[unified-gaps] Failed to load timetable:", err);
    timetableBlockingEvents = [];
  } finally {
    isTimetableLoading = false;
    isTimetableLoaded = true;

    // Signal that loading is complete
    if (timetableLoadResolve) {
      timetableLoadResolve();
      timetableLoadResolve = null;
    }
    timetableLoadPromise = null;
  }
}

/**
 * Wait for timetable to finish loading
 * Resolves immediately if already loaded
 */
async function waitForTimetable(): Promise<void> {
  if (isTimetableLoaded && !isTimetableLoading) return;
  if (timetableLoadPromise) {
    await timetableLoadPromise;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gap event with additional metadata for filtering
 */
interface GapEventWithMeta extends Event {
  isAllDay?: boolean;
  isMidnightCrossing?: boolean;
}

/**
 * Convert calendar event to gap-finder event format
 */
function calendarEventToGapEvent(
  event:
    | CalendarEvent
    | { start: Date; end: Date; id: string; title: string; timeLabel?: string },
  targetDate: Date,
): GapEventWithMeta | null {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  const targetDayStart = startOfDay(targetDate);
  const targetDayEnd = endOfDay(targetDate);

  // Check if event overlaps with target date
  if (eventStart.getTime() > targetDayEnd.getTime()) return null;
  if (eventEnd.getTime() < targetDayStart.getTime()) return null;

  // Handle all-day events - these should block the entire day
  if (event.timeLabel === "all-day") {
    return {
      id: event.id,
      title: event.title,
      start: "00:00",
      end: "23:59",
      crossesMidnight: false,
      isAllDay: true,
    };
  }

  // Determine start/end times for this specific day
  const normalizedTarget = startOfDay(targetDate);
  const normalizedEventStart = startOfDay(eventStart);
  const normalizedEventEnd = startOfDay(eventEnd);

  const startsOnTarget =
    normalizedEventStart.getTime() === normalizedTarget.getTime();
  const endsOnTarget =
    normalizedEventEnd.getTime() === normalizedTarget.getTime();

  const startTime = startsOnTarget
    ? event.start.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "00:00";

  const endTime = endsOnTarget
    ? event.end.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "23:59";

  // Detect midnight-crossing events (started on previous day and ends on target date)
  const isMidnightCrossing = !startsOnTarget && startTime === "00:00";

  return {
    id: event.id,
    title: event.title,
    start: startTime,
    end: endTime,
    crossesMidnight: startTime > endTime,
    isMidnightCrossing,
  };
}

/**
 * Convert timetable event to gap-finder event format
 */
function timetableEventToGapEvent(ttEvent: TimetableEvent): GapEventWithMeta {
  return {
    id: ttEvent.id,
    title: `[時間割] ${ttEvent.title}`,
    start: ttEvent.start.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    end: ttEvent.end.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    crossesMidnight: false,
    isAllDay: false,
    isMidnightCrossing: false,
  };
}

/**
 * Convert gap-finder events to enrichable events
 */
function toEnrichableEvents(events: Event[]): EnrichableEvent[] {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
  }));
}

// ============================================================================
// UNIFIED GAP STATE CLASS
// ============================================================================

/**
 * Unified Gap State
 *
 * Provides reactive gap computation with:
 * - Automatic enrichment
 * - Past time blocking
 * - Regeneration tracking
 */
class UnifiedGapState {
  // ============================================================================
  // Internal State
  // ============================================================================

  /**
   * Whether the user is currently on the assistant tab
   */
  isOnAssistantTab = $state(false);

  /**
   * Version counter to track changes that require regeneration
   * Increments when enriched gaps change
   */
  private gapVersion = $state(0);

  /**
   * Last version that was used for schedule generation
   */
  private lastRegeneratedVersion = $state(0);

  // ============================================================================
  // Loading State (exposed for consumers)
  // ============================================================================

  /**
   * Whether timetable data is currently loading
   */
  get isTimetableLoading(): boolean {
    return isTimetableLoading;
  }

  /**
   * Whether timetable has been loaded for the current date
   */
  get isTimetableLoaded(): boolean {
    return isTimetableLoaded;
  }

  /**
   * Whether data is ready for schedule generation
   * True when timetable is loaded (or not loading)
   */
  get isReady(): boolean {
    return isTimetableLoaded && !isTimetableLoading;
  }

  // ============================================================================
  // Derived State
  // ============================================================================

  /**
   * Current time in minutes (reactive)
   */
  get currentTime(): number {
    return currentTimeMinutes;
  }

  /**
   * Current time as HH:mm string
   */
  get currentTimeStr(): string {
    return minutesToTime(currentTimeMinutes);
  }

  /**
   * Whether the selected date is today
   */
  get isTodaySelected(): boolean {
    const now = new Date();
    return dateKey(dataState.selectedDate) === dateKey(now);
  }

  /**
   * All gap-finder events for the selected date
   * Combines calendar events, occurrences, and timetable blocking events
   */
  get allEvents(): Event[] {
    const selectedDate = dataState.selectedDate;
    const events = calendarState.events;
    const occurrences = calendarState.occurrences;

    // Combine master events and recurring occurrences
    const allCalendarEvents = [
      ...events,
      ...occurrences.map((occ) => ({
        id: occ.id,
        title: occ.title,
        start: occ.start,
        end: occ.end,
        timeLabel: occ.timeLabel,
      })),
    ];

    // Convert to gap-finder format
    const calendarGapEvents = allCalendarEvents
      .map((e) => calendarEventToGapEvent(e, selectedDate))
      .filter((e): e is Event => e !== null);

    // Convert timetable events
    const timetableGapEvents = timetableBlockingEvents.map(
      timetableEventToGapEvent,
    );

    return [...calendarGapEvents, ...timetableGapEvents];
  }

  /**
   * Computed gaps with past time blocking
   * This is the PRIMARY gap computation that respects:
   * - Active time settings (extended by events outside active hours)
   * - Past time (when viewing today)
   * - All calendar and timetable events
   */
  get computedGaps(): Gap[] {
    // Calculate effective day boundaries by extending to include events
    // that occur before/after the configured active times
    const activeStart = settingsState.activeStartTime;
    const activeEnd = settingsState.activeEndTime;

    // First pass: Find effective start time from non-midnight-crossing events
    // Midnight-crossing events should NOT extend the start time backward
    let effectiveStart = activeStart;
    let effectiveEnd = activeEnd;

    for (const event of this.allEvents) {
      const eventWithMeta = event as GapEventWithMeta;

      // Skip midnight-crossing events and all-day events for boundary extension
      if (eventWithMeta.isMidnightCrossing || eventWithMeta.isAllDay) {
        continue;
      }

      // Extend boundaries for regular events
      if (event.start < effectiveStart) {
        effectiveStart = event.start;
      }

      if (event.end > effectiveEnd) {
        effectiveEnd = event.end;
      }
    }

    // Second pass: Filter events and adjust midnight-crossing events
    const filteredEvents: Event[] = [];

    for (const event of this.allEvents) {
      const eventWithMeta = event as GapEventWithMeta;

      // All-day events block the entire day
      if (eventWithMeta.isAllDay) {
        filteredEvents.push(event);
        continue;
      }

      // Midnight-crossing events (started on previous day):
      // - If they end before or at effective start time, exclude completely
      // - If they end after effective start time, include only the portion within active time
      if (eventWithMeta.isMidnightCrossing) {
        if (event.end <= effectiveStart) {
          // Ends before active time starts, exclude
          continue;
        }
        // Include but adjust start to effective start (the portion before active time doesn't matter)
        filteredEvents.push({
          ...event,
          start: effectiveStart,
        });
        continue;
      }

      // Regular events - include as-is
      filteredEvents.push(event);
    }

    const gf = new GapFinder({
      dayStart: effectiveStart,
      dayEnd: effectiveEnd,
    });

    // Use filtered events for gap finding
    const eventsWithPastBlocker = [...filteredEvents];

    // Block past time when viewing today
    // Only block from effective start time to current time
    if (this.isTodaySelected) {
      const currentTimeStr = minutesToTime(currentTimeMinutes);

      // Only add blocker if current time is after effective start time
      if (currentTimeStr > effectiveStart) {
        eventsWithPastBlocker.push({
          id: "__past_time_blocker__",
          title: "Past Time",
          start: effectiveStart,
          end: currentTimeStr,
        });
      }
    }

    return gf.findGaps(eventsWithPastBlocker);
  }

  /**
   * Enriched gaps with location labels
   * This is the FINAL gap state used for schedule generation
   */
  get enrichedGaps(): Gap[] {
    const gaps = this.computedGaps;
    const enrichableEvents = toEnrichableEvents(this.allEvents);
    return enrichGapsWithLocation(gaps, enrichableEvents);
  }

  /**
   * Whether regeneration is needed
   * True when gaps have changed since last regeneration
   */
  get needsRegeneration(): boolean {
    return this.gapVersion !== this.lastRegeneratedVersion;
  }

  /**
   * Whether regeneration should happen now
   * True when on assistant tab AND regeneration is needed
   */
  get shouldRegenerateNow(): boolean {
    return this.isOnAssistantTab && this.needsRegeneration;
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Mark that gaps have changed (triggers regeneration need)
   */
  markGapsChanged(): void {
    this.gapVersion++;
  }

  /**
   * Mark that regeneration has completed
   */
  markRegenerated(): void {
    this.lastRegeneratedVersion = this.gapVersion;
  }

  /**
   * Set whether user is on assistant tab
   */
  setOnAssistantTab(isOn: boolean): void {
    this.isOnAssistantTab = isOn;
  }

  /**
   * Force a gap version increment (for manual regeneration triggers)
   */
  forceRegeneration(): void {
    this.gapVersion++;
  }

  /**
   * Load timetable events for the selected date
   * Should be called when the component mounts or date changes
   * @param forceReload - If true, ignores the date cache and reloads anyway
   */
  async loadTimetableEvents(forceReload = false): Promise<void> {
    if (forceReload) {
      clearTimetableDateCache();
    }
    await loadTimetableForDate(dataState.selectedDate, forceReload);
  }

  /**
   * Wait for timetable data to finish loading
   * Use this before computing gaps or generating schedules
   */
  async waitForTimetable(): Promise<void> {
    await waitForTimetable();
  }

  /**
   * Initialize gap state - loads timetable and waits for it
   * Call this once when entering the assistant view
   */
  async initialize(): Promise<void> {
    await this.loadTimetableEvents();
    console.log("[unified-gaps] Initialized, ready:", this.isReady);
  }

  // ============================================================================
  // Static Utility Methods
  // ============================================================================

  /**
   * Convert minutes since midnight to HH:mm format
   */
  static minutesToTime(minutes: number): string {
    return minutesToTime(minutes);
  }

  /**
   * Get date key for comparison (YYYY-MM-DD)
   */
  static dateKey(date: Date): string {
    return dateKey(date);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Global unified gap state instance
 */
export const unifiedGapState = new UnifiedGapState();

// Note: currentTimeMinutes is NOT exported because it's a $state that gets reassigned.
// Access via unifiedGapState.currentTime instead.
