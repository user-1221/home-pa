/**
 * SSE Client - Browser-side EventSource manager
 *
 * Manages a persistent SSE connection with:
 * - Channel-based event routing
 * - Auto-reconnect with exponential backoff
 * - Device identification
 */

import type { SSEEvent } from "$lib/server/sse/types";

type SSEHandler<T = unknown> = (event: SSEEvent<T>) => void;

interface ReconnectState {
  attempts: number;
  delay: number;
  maxAttempts: number;
  maxDelay: number;
  baseDelay: number;
}

class SSEClient {
  private eventSource: EventSource | null = null;
  private handlers = new Map<string, SSEHandler>();
  private deviceId: string | null = null;
  private reconnect: ReconnectState = {
    attempts: 0,
    delay: 1000,
    baseDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 10,
  };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private visibilityHandler: (() => void) | null = null;

  /**
   * Connect to the SSE endpoint
   */
  connect(deviceId: string): void {
    if (this.eventSource || this.isConnecting) {
      return;
    }

    this.deviceId = deviceId;
    this.isConnecting = true;

    try {
      this.eventSource = new EventSource(`/api/sse?deviceId=${deviceId}`);

      this.eventSource.onopen = () => {
        console.log("[SSE] Connected");
        this.isConnecting = false;
        // Reset reconnect state on successful connection
        this.reconnect.attempts = 0;
        this.reconnect.delay = this.reconnect.baseDelay;
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEEvent;
          this.routeEvent(data);
        } catch (err) {
          console.error("[SSE] Failed to parse event:", err);
        }
      };

      this.eventSource.onerror = () => {
        console.warn("[SSE] Connection error");
        this.isConnecting = false;
        this.cleanup();
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error("[SSE] Failed to create EventSource:", err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearVisibilityHandler();
    this.cleanup();
    this.handlers.clear();
    this.deviceId = null;
    this.reconnect.attempts = 0;
    this.reconnect.delay = this.reconnect.baseDelay;
  }

  /**
   * Register a handler for a channel
   */
  on<T = unknown>(channel: string, handler: SSEHandler<T>): void {
    this.handlers.set(channel, handler as SSEHandler);
  }

  /**
   * Remove a handler for a channel
   */
  off(channel: string): void {
    this.handlers.delete(channel);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /**
   * Route an event to its handler
   */
  private routeEvent(event: SSEEvent): void {
    const handler = this.handlers.get(event.channel);
    if (handler) {
      try {
        handler(event);
      } catch (err) {
        console.error(
          `[SSE] Handler error for channel "${event.channel}":`,
          err,
        );
      }
    }
  }

  /**
   * Clean up the current connection
   */
  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Clean up the visibility change handler
   */
  private clearVisibilityHandler(): void {
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.deviceId) {
      return;
    }

    if (this.reconnect.attempts >= this.reconnect.maxAttempts) {
      console.error("[SSE] Max reconnect attempts reached, giving up");
      return;
    }

    // Skip reconnect if page is hidden (save resources)
    if (typeof document !== "undefined" && document.hidden) {
      // Clean up any existing handler before adding a new one
      this.clearVisibilityHandler();

      // Wait for page to become visible
      this.visibilityHandler = () => {
        if (!document.hidden) {
          this.clearVisibilityHandler();
          this.scheduleReconnect();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
      return;
    }

    console.log(
      `[SSE] Reconnecting in ${this.reconnect.delay}ms (attempt ${this.reconnect.attempts + 1}/${this.reconnect.maxAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnect.attempts++;
      this.reconnect.delay = Math.min(
        this.reconnect.delay * 2,
        this.reconnect.maxDelay,
      );
      if (this.deviceId) {
        this.connect(this.deviceId);
      }
    }, this.reconnect.delay);
  }
}

/** Singleton SSE client instance */
export const sseClient = new SSEClient();
