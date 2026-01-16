/**
 * Server-Sent Events (SSE) type definitions
 * Generic infrastructure for real-time cross-device sync
 */

/**
 * Event sent through SSE to connected clients
 */
export interface SSEEvent<T = unknown> {
  /** Channel identifier (e.g., "timer", "calendar", "tasks") */
  channel: string;
  /** Event type within the channel (e.g., "started", "updated", "deleted") */
  type: string;
  /** Event payload data */
  payload: T;
  /** Device ID that triggered this event */
  sourceDeviceId: string;
  /** ISO timestamp when event was created */
  timestamp: string;
}

/**
 * Represents an active SSE connection
 */
export interface SSEConnection {
  userId: string;
  deviceId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  connectedAt: Date;
  lastHeartbeat: Date;
}

/**
 * Helper to create an SSE event
 */
export function createSSEEvent<T>(
  channel: string,
  type: string,
  payload: T,
  sourceDeviceId: string,
): SSEEvent<T> {
  return {
    channel,
    type,
    payload,
    sourceDeviceId,
    timestamp: new Date().toISOString(),
  };
}
