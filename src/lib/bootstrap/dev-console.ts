/**
 * @fileoverview Dev Console - Browser developer tools integration
 *
 * Exposes application state to window.pa for debugging.
 * Only active in development mode; tree-shaken in production builds.
 *
 * Usage in browser console:
 *   pa.help()           - List available commands
 *   pa.timeline.gaps()  - Show gaps with location labels
 *   pa.tasks.items      - Access task list
 */

import { dev, browser } from "$app/environment";

import { dataState } from "./data.svelte.ts";
import { uiState } from "./ui.svelte.ts";
import { timezoneState } from "./timezone.svelte.ts";
import { settingsState } from "./settings.svelte.ts";
import { toastState } from "./toast.svelte.ts";
import { devtoolsState } from "./devtools.svelte.ts";
import { taskState } from "../features/tasks/state/taskActions.svelte.ts";
import { calendarState } from "../features/calendar/state/calendar.svelte.ts";
import { scheduleState } from "../features/assistant/state/schedule.svelte.ts";
import { focusState } from "../features/focus/state/index.ts";
import { getActiveUnifiedGapState } from "../features/assistant/state/unified-gaps.svelte.ts";

// ============================================================================
// Timeline Commands
// ============================================================================

function timelineGaps(): void {
  const gapState = getActiveUnifiedGapState();
  if (!gapState) {
    console.warn(
      "[pa.timeline] Not on assistant page - UnifiedGapState not registered",
    );
    return;
  }

  console.log(
    "%c[Timeline Location State - enrichedGaps]",
    "color: #7bbebb; font-weight: bold;",
  );
  console.table(
    gapState.enrichedGaps.map((g) => ({
      id: g.gapId,
      time: `${g.start}-${g.end}`,
      duration: `${g.duration}min`,
      location: g.locationLabel ?? "unknown",
    })),
  );
}

function timelineAvailable(): void {
  const gapState = getActiveUnifiedGapState();
  if (!gapState) {
    console.warn("[pa.timeline] Not on assistant page");
    return;
  }

  console.log(
    "%c[Timeline Available Gaps - for scheduling]",
    "color: #4ade80; font-weight: bold;",
  );
  console.table(
    gapState.availableGaps.map((g) => ({
      id: g.gapId,
      time: `${g.start}-${g.end}`,
      duration: `${g.duration}min`,
      location: g.locationLabel ?? "unknown",
    })),
  );
}

function timelineRaw(): void {
  const gapState = getActiveUnifiedGapState();
  if (!gapState) {
    console.warn("[pa.timeline] Not on assistant page");
    return;
  }

  console.log(
    "%c[Timeline Computed Gaps - raw]",
    "color: #60a5fa; font-weight: bold;",
  );
  console.table(
    gapState.computedGaps.map((g) => ({
      id: g.gapId,
      time: `${g.start}-${g.end}`,
      duration: `${g.duration}min`,
    })),
  );
}

function timelineEvents(): void {
  const gapState = getActiveUnifiedGapState();
  if (!gapState) {
    console.warn("[pa.timeline] Not on assistant page");
    return;
  }

  console.log(
    "%c[Timeline Events - used for location enrichment]",
    "color: #facc15; font-weight: bold;",
  );
  console.table(
    gapState.allEvents.map((e) => ({
      id: e.id,
      title: e.title,
      time: `${e.start}-${e.end}`,
      source: e.source,
    })),
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function help(): void {
  const gapState = getActiveUnifiedGapState();
  const taskCount = taskState.items.length;
  const eventCount = calendarState.events.length;
  const gapCount = gapState?.enrichedGaps.length ?? 0;

  console.log(
    `
%cHome-PA Dev Console%c

%cTimeline Commands:%c (requires assistant page)
  pa.timeline.gaps()      - Enriched gaps with location labels (${gapCount} gaps)
  pa.timeline.available() - Gaps available for scheduling
  pa.timeline.raw()       - Computed gaps (no location)
  pa.timeline.events()    - Events used for location enrichment

%cState Objects:%c
  pa.tasks       - Task state (${taskCount} tasks)
  pa.calendar    - Calendar state (${eventCount} events)
  pa.schedule    - Suggestion engine state
  pa.focus       - Pomodoro/focus session state
  pa.data        - Selected date state
  pa.ui          - UI toggle state
  pa.timezone    - Timezone state
  pa.settings    - User settings
  pa.toast       - Toast notifications
  pa.devtools    - Devtools logging toggle

%cExamples:%c
  pa.tasks.items                    - Get all tasks
  pa.tasks.active                   - Get active tasks
  pa.calendar.events                - Get all events
  pa.toast.success('Hello!')        - Show a toast
  pa.devtools.toggle()              - Toggle debug logging
`,
    "font-size: 16px; font-weight: bold; color: #7bbebb;",
    "",
    "font-weight: bold; color: #4ade80;",
    "",
    "font-weight: bold; color: #60a5fa;",
    "",
    "font-weight: bold; color: #facc15;",
    "",
  );
}

// ============================================================================
// API Interface
// ============================================================================

export interface DevConsoleAPI {
  // Core state
  data: typeof dataState;
  ui: typeof uiState;
  timezone: typeof timezoneState;
  settings: typeof settingsState;
  toast: typeof toastState;
  devtools: typeof devtoolsState;

  // Feature state
  tasks: typeof taskState;
  calendar: typeof calendarState;
  schedule: typeof scheduleState;
  focus: typeof focusState;

  // Timeline commands
  timeline: {
    gaps: () => void;
    available: () => void;
    raw: () => void;
    events: () => void;
  };

  // Helpers
  help: () => void;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize dev console.
 * No-op in production (tree-shaken away).
 */
export function initDevConsole(): void {
  if (!dev || !browser) {
    return;
  }

  const pa: DevConsoleAPI = {
    // Core state
    data: dataState,
    ui: uiState,
    timezone: timezoneState,
    settings: settingsState,
    toast: toastState,
    devtools: devtoolsState,

    // Feature state
    tasks: taskState,
    calendar: calendarState,
    schedule: scheduleState,
    focus: focusState,

    // Timeline commands
    timeline: {
      gaps: timelineGaps,
      available: timelineAvailable,
      raw: timelineRaw,
      events: timelineEvents,
    },

    // Helpers
    help,
  };

  window.pa = pa;

  console.log(
    "%cHome-PA Dev Console ready! Type %cpa.help()%c for commands.",
    "color: #7bbebb;",
    "color: #facc15; font-weight: bold;",
    "color: #7bbebb;",
  );
}
