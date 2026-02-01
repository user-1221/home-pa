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
 *
 * @scope page
 * @owner src/routes/assistant/+page.svelte
 * @cleanup destroy() called in onDestroy() to clear minute interval
 */

import { getContext, setContext } from "svelte";

import { dataState } from "$lib/bootstrap/data.svelte.ts";
import { settingsState } from "$lib/bootstrap/settings.svelte.ts";
import { calendarState } from "$lib/features/calendar/state/calendar.svelte.ts";
import { calendarVisibilityState } from "$lib/features/calendar/state/calendar-visibility.svelte.ts";
import { GapFinder, type Event } from "../services/gap-finder.ts";
import {
  enrichGapsWithLocation,
  type EnrichableEvent,
  type EventSource,
} from "../services/suggestions/gap-enrichment.ts";
import type { Event as CalendarEvent, Gap } from "$lib/types.ts";
import { startOfDay, endOfDay } from "$lib/utils/date-utils.ts";
import {
  loadTimetableData,
  getTimetableEventsForDate,
  getBlockingTimetableEvents,
  type TimetableEvent,
} from "$lib/features/calendar/services/timetable-events.ts";
import {
  subtractBlockersFromGaps,
  type TimeBlocker,
} from "../services/gap-computation/gap-modifier.ts";

// ============================================================================
// HELPER FUNCTIONS (module-level utilities)
// ============================================================================

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
 * Clear the last loaded date key to force a reload (internal use)
 */
function clearTimetableDateCache(): void {
  lastLoadedDateKey = null;
  isTimetableLoaded = false;
}

/**
 * Clear timetable cache.
 * Called when assistant page mounts to ensure fresh data after navigation.
 */
export function clearTimetableCache(): void {
  lastLoadedDateKey = null;
  isTimetableLoaded = false;
}

/**
 * Load timetable events for a given date.
 *
 * This is a fire-and-forget async function. Components should use reactive
 * state (unifiedGapState.isReady) to know when loading is complete, rather
 * than awaiting this function.
 *
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
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gap event with additional metadata for filtering and location
 */
interface GapEventWithMeta extends Event {
  isAllDay?: boolean;
  isMidnightCrossing?: boolean;
  source: EventSource;
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
      source: "calendar" as EventSource,
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
    source: "calendar" as EventSource,
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
    source: "timetable",
  };
}

/**
 * Convert gap-finder events to enrichable events with source info
 */
function toEnrichableEvents(events: GapEventWithMeta[]): EnrichableEvent[] {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    source: e.source,
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
export class UnifiedGapState {
  // ============================================================================
  // Time State (instance-scoped)
  // ============================================================================

  /**
   * Current time in minutes since midnight
   * Updates every minute to trigger gap recalculation
   */
  private _currentTimeMinutes = $state(getCurrentMinutes());

  /**
   * Timeout ID for initial minute boundary sync
   */
  private initialTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Interval ID for minute updates
   */
  private minuteInterval: ReturnType<typeof setInterval> | null = null;

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
  // Blocker State (for availableGaps computation)
  // ============================================================================

  /**
   * Accepted memos that block time slots
   * Updated via setBlockers() from schedule.ts
   */
  private _acceptedBlockers = $state<Map<string, TimeBlocker>>(new Map());

  /**
   * Moved suggestions that block time slots
   * Updated via setBlockers() from schedule.ts
   */
  private _movedBlockers = $state<TimeBlocker[]>([]);

  // ============================================================================
  // Constructor & Lifecycle
  // ============================================================================

  constructor() {
    // Start minute updates on client-side only
    if (typeof window !== "undefined") {
      this.startMinuteUpdates();
    }
  }

  /**
   * Start the minute update interval
   */
  private startMinuteUpdates(): void {
    // Calculate ms until next minute boundary for precise updates
    const now = new Date();
    const msUntilNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    // First update at next minute boundary
    this.initialTimeout = setTimeout(() => {
      this._currentTimeMinutes = getCurrentMinutes();

      // Then update every 60 seconds
      this.minuteInterval = setInterval(() => {
        this._currentTimeMinutes = getCurrentMinutes();
      }, 60_000);
    }, msUntilNextMinute);
  }

  /**
   * Clean up timers. Must be called when the state is destroyed.
   */
  destroy(): void {
    if (this.initialTimeout) {
      clearTimeout(this.initialTimeout);
      this.initialTimeout = null;
    }
    if (this.minuteInterval) {
      clearInterval(this.minuteInterval);
      this.minuteInterval = null;
    }
  }

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
  isReady = $derived.by((): boolean => {
    return isTimetableLoaded && !isTimetableLoading;
  });

  // ============================================================================
  // Derived State
  // ============================================================================

  /**
   * Current time in minutes (reactive)
   */
  get currentTime(): number {
    return this._currentTimeMinutes;
  }

  /**
   * Current time as HH:mm string
   */
  get currentTimeStr(): string {
    return minutesToTime(this._currentTimeMinutes);
  }

  /**
   * Whether the selected date is today
   */
  isTodaySelected = $derived.by((): boolean => {
    const now = new Date();
    return dateKey(dataState.selectedDate) === dateKey(now);
  });

  /**
   * All gap-finder events for the selected date
   * Combines calendar events, occurrences, and timetable blocking events
   * Filtered by calendar visibility settings
   */
  allEvents = $derived.by((): GapEventWithMeta[] => {
    const selectedDate = dataState.selectedDate;
    const events = calendarState.events;
    const occurrences = calendarState.occurrences;

    // Combine master events and recurring occurrences
    // Inherit calendarId from master event for occurrences
    const allCalendarEvents = [
      ...events,
      ...occurrences.map((occ) => ({
        id: occ.id,
        title: occ.title,
        start: occ.start,
        end: occ.end,
        timeLabel: occ.timeLabel,
        calendarId: events.find((e) => e.id === occ.masterEventId)?.calendarId,
      })),
    ];

    // Filter by calendar visibility settings
    const visibleCalendarEvents = allCalendarEvents.filter((e) =>
      calendarVisibilityState.isEventVisible(e),
    );

    // Convert to gap-finder format
    const calendarGapEvents = visibleCalendarEvents
      .map((e) => calendarEventToGapEvent(e, selectedDate))
      .filter((e): e is GapEventWithMeta => e !== null);

    // Convert timetable events
    const timetableGapEvents = timetableBlockingEvents.map(
      timetableEventToGapEvent,
    );

    return [...calendarGapEvents, ...timetableGapEvents];
  });

  /**
   * Computed gaps with past time blocking
   * This is the PRIMARY gap computation that respects:
   * - Active time settings (extended by events outside active hours)
   * - Past time (when viewing today)
   * - All calendar and timetable events
   */
  computedGaps = $derived.by((): Gap[] => {
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
      const currentTimeStr = minutesToTime(this._currentTimeMinutes);

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
  });

  /**
   * Enriched gaps with location labels
   * This is the FINAL gap state used for schedule generation
   */
  enrichedGaps = $derived.by((): Gap[] => {
    const gaps = this.computedGaps;
    const enrichableEvents = toEnrichableEvents(this.allEvents);
    return enrichGapsWithLocation(gaps, enrichableEvents);
  });

  /**
   * Available gaps after subtracting blockers (accepted + moved suggestions)
   * Used for schedule regeneration - new suggestions only fill truly available gaps.
   */
  availableGaps = $derived.by((): Gap[] => {
    return subtractBlockersFromGaps(
      this.enrichedGaps,
      this._acceptedBlockers,
      this._movedBlockers,
    );
  });

  /**
   * Gaps available for drag operations (only accepted suggestions subtracted)
   *
   * During drag, other pending/moved suggestions should NOT block movement.
   * Only accepted suggestions and calendar events are hard blockers.
   * After drag completes, overlapping moved suggestions are removed and
   * regeneration fills the remaining gaps.
   */
  gapsForDrag = $derived.by((): Gap[] => {
    // Only subtract accepted blockers, not moved ones
    return subtractBlockersFromGaps(
      this.enrichedGaps,
      this._acceptedBlockers,
      [], // No moved blockers during drag
    );
  });

  /**
   * Whether regeneration is needed
   * True when gaps have changed since last regeneration
   */
  needsRegeneration = $derived.by((): boolean => {
    return this.gapVersion !== this.lastRegeneratedVersion;
  });

  /**
   * Whether regeneration should happen now
   * True when on assistant tab AND regeneration is needed
   */
  shouldRegenerateNow = $derived.by((): boolean => {
    return this.isOnAssistantTab && this.needsRegeneration;
  });

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
   * Update blocker state for availableGaps computation
   *
   * Called by schedule.ts after any change to accepted/moved suggestions.
   * This triggers reactive updates to availableGaps.
   *
   * @param accepted - Map of memoId -> time blocker info
   * @param moved - Array of moved suggestion time blockers
   */
  setBlockers(accepted: Map<string, TimeBlocker>, moved: TimeBlocker[]): void {
    this._acceptedBlockers = accepted;
    this._movedBlockers = moved;
  }

  /**
   * Load timetable events for the selected date.
   *
   * This is fire-and-forget - do NOT await. Use `isReady` to reactively
   * know when loading is complete.
   *
   * @param forceReload - If true, ignores the date cache and reloads anyway
   */
  loadTimetableEvents(forceReload = false): void {
    if (forceReload) {
      clearTimetableDateCache();
    }
    // Fire-and-forget: don't await, let reactive state handle UI updates
    loadTimetableForDate(dataState.selectedDate, forceReload);
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
// CONTEXT
// ============================================================================

const UNIFIED_GAP_STATE_KEY = Symbol("unified-gap-state");

/**
 * Set the UnifiedGapState in context.
 * Call this in assistant/+page.svelte before child components render.
 */
export function setUnifiedGapState(state: UnifiedGapState): void {
  setContext(UNIFIED_GAP_STATE_KEY, state);
}

/**
 * Get the UnifiedGapState from context.
 * Throws if not set - call must be within assistant page tree.
 */
export function getUnifiedGapState(): UnifiedGapState {
  const state = getContext<UnifiedGapState | undefined>(UNIFIED_GAP_STATE_KEY);
  if (!state) {
    throw new Error(
      "UnifiedGapState not found in context. Ensure this component is within the assistant page tree.",
    );
  }
  return state;
}

// ============================================================================
// CROSS-TREE ACCESS (for components outside assistant tree)
// ============================================================================

/**
 * Active instance reference for cross-tree callers (e.g., TimetablePopup)
 */
let activeInstance: UnifiedGapState | null = null;

/**
 * Register the active UnifiedGapState instance.
 * Called by assistant/+page.svelte when mounting.
 */
export function registerUnifiedGapState(state: UnifiedGapState): void {
  activeInstance = state;
}

/**
 * Unregister the active UnifiedGapState instance.
 * Called by assistant/+page.svelte when unmounting.
 */
export function unregisterUnifiedGapState(): void {
  activeInstance = null;
}

/**
 * Reload timetable events from outside the assistant tree.
 * Used by TimetablePopup after saving timetable config.
 *
 * @param force - If true, ignores date cache and forces reload
 * @returns true if reload was triggered, false if assistant page not mounted
 */
export function reloadTimetableEvents(force?: boolean): boolean {
  if (activeInstance) {
    activeInstance.loadTimetableEvents(force);
    return true;
  }
  // No active instance - assistant page not mounted
  // Timetable changes will be picked up when user navigates to assistant page
  console.warn(
    "[unified-gaps] reloadTimetableEvents called but assistant page not mounted. Changes will apply on next visit.",
  );
  return false;
}

/**
 * Get the active UnifiedGapState instance (for dev console).
 * Returns null if assistant page is not mounted.
 */
export function getActiveUnifiedGapState(): UnifiedGapState | null {
  return activeInstance;
}
