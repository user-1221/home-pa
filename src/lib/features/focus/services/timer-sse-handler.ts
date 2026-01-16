/**
 * Timer SSE Handler
 *
 * Handles real-time timer sync events from other devices.
 * Registers with the SSE client to receive timer channel events.
 */

import { sseClient } from "$lib/features/shared/services/sse-client";
import type { SSEEvent } from "$lib/server/sse/types";
import type { FocusState, PomodoroState } from "../state";
import { getDeviceId } from "$lib/utils/device";

// ============================================================================
// Timer Event Types
// ============================================================================

export type TimerEventType = "started" | "stopped" | "moved" | "updated";

export interface TimerEventPayload {
  memoId?: string;
  taskTitle?: string;
  startedAt?: string;
  plannedEndTime?: string;
  mode?: "normal" | "pomodoro";
  pomodoroState?: PomodoroState;
  deviceName?: string;
  targetDeviceId?: string;
}

export type TimerSSEEvent = SSEEvent<TimerEventPayload>;

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Initialize the timer SSE handler
 * Call this once when FocusIndicator mounts
 */
export function initTimerSSEHandler(focusState: FocusState): () => void {
  const handler = (event: SSEEvent<TimerEventPayload>) => {
    // Ignore events from this device
    if (event.sourceDeviceId === getDeviceId()) {
      return;
    }

    switch (event.type) {
      case "started":
        focusState.handleRemoteTimerStarted(event.payload);
        break;
      case "stopped":
        focusState.handleRemoteTimerStopped();
        break;
      case "moved":
        focusState.handleRemoteTimerMoved(event.payload);
        break;
      case "updated":
        focusState.handleRemoteTimerUpdated(event.payload);
        break;
    }
  };

  sseClient.on("timer", handler);

  // Return cleanup function
  return () => {
    sseClient.off("timer");
  };
}
