/**
 * SSE Hub - Central connection manager for Server-Sent Events
 * Manages connections per user and enables broadcasting to all user's devices
 */

import type { SSEConnection, SSEEvent } from "./types";

const encoder = new TextEncoder();

const STALE_THRESHOLD_MS = 60_000; // 60 seconds without heartbeat = stale
const CLEANUP_INTERVAL_MS = 60_000; // Check every 60 seconds
const MAX_CONNECTIONS_PER_USER = 5;

class SSEHub {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleConnections();
    }, CLEANUP_INTERVAL_MS);
    console.log("[SSE] Stale connection cleanup started");
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, userConnections] of this.connections) {
      for (const [deviceId, connection] of userConnections) {
        const timeSinceHeartbeat = now - connection.lastHeartbeat.getTime();
        if (timeSinceHeartbeat > STALE_THRESHOLD_MS) {
          console.log(
            `[SSE] Removing stale connection: user=${userId.slice(0, 8)}... device=${deviceId.slice(0, 8)}... (${Math.round(timeSinceHeartbeat / 1000)}s stale)`,
          );
          this.unregister(userId, deviceId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[SSE] Cleaned up ${cleaned} stale connection(s)`);
    }
  }

  private evictOldestConnection(
    userId: string,
    userConnections: Map<string, SSEConnection>,
  ): void {
    let oldestDeviceId: string | null = null;
    let oldestTime = Infinity;

    for (const [deviceId, connection] of userConnections) {
      const connectedTime = connection.connectedAt.getTime();
      if (connectedTime < oldestTime) {
        oldestTime = connectedTime;
        oldestDeviceId = deviceId;
      }
    }

    if (oldestDeviceId) {
      console.log(
        `[SSE] Device limit exceeded for user=${userId.slice(0, 8)}... - evicting oldest device=${oldestDeviceId.slice(0, 8)}...`,
      );
      this.unregister(userId, oldestDeviceId);
    }
  }
  /** Map<userId, Map<deviceId, SSEConnection>> */
  private connections = new Map<string, Map<string, SSEConnection>>();

  /**
   * Register a new SSE connection
   */
  register(
    userId: string,
    deviceId: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): void {
    let userConnections = this.connections.get(userId);
    if (!userConnections) {
      userConnections = new Map();
      this.connections.set(userId, userConnections);
    }

    // Close existing connection for this device if any
    const existing = userConnections.get(deviceId);
    if (existing) {
      try {
        existing.controller.close();
      } catch {
        // Already closed
      }
    }

    // Enforce per-user device limit (before adding new connection)
    const currentCount = userConnections.has(deviceId)
      ? userConnections.size - 1 // Will be replaced
      : userConnections.size;

    if (currentCount >= MAX_CONNECTIONS_PER_USER) {
      this.evictOldestConnection(userId, userConnections);
    }

    const now = new Date();
    userConnections.set(deviceId, {
      userId,
      deviceId,
      controller,
      connectedAt: now,
      lastHeartbeat: now,
    });

    console.log(
      `[SSE] Connection registered: user=${userId.slice(0, 8)}... device=${deviceId.slice(0, 8)}... (${userConnections.size} devices)`,
    );
  }

  /**
   * Remove a connection
   */
  unregister(userId: string, deviceId: string): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const connection = userConnections.get(deviceId);
    if (connection) {
      try {
        connection.controller.close();
      } catch {
        // Already closed
      }
      userConnections.delete(deviceId);
    }

    // Clean up empty user maps
    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }

    console.log(
      `[SSE] Connection unregistered: user=${userId.slice(0, 8)}... device=${deviceId.slice(0, 8)}...`,
    );
  }

  /**
   * Broadcast an event to all of a user's devices
   * @param userId - User to broadcast to
   * @param event - Event to send
   * @param excludeDeviceId - Optional device ID to exclude (typically the source)
   */
  broadcast<T>(
    userId: string,
    event: SSEEvent<T>,
    excludeDeviceId?: string,
  ): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const message = this.formatSSEMessage(event);
    const data = encoder.encode(message);

    for (const [deviceId, connection] of userConnections) {
      if (excludeDeviceId && deviceId === excludeDeviceId) {
        continue;
      }

      try {
        connection.controller.enqueue(data);
      } catch {
        // Connection failed, clean it up
        this.unregister(userId, deviceId);
      }
    }
  }

  /**
   * Send an event to a specific device
   */
  sendToDevice<T>(
    userId: string,
    deviceId: string,
    event: SSEEvent<T>,
  ): boolean {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return false;

    const connection = userConnections.get(deviceId);
    if (!connection) return false;

    const message = this.formatSSEMessage(event);
    const data = encoder.encode(message);

    try {
      connection.controller.enqueue(data);
      return true;
    } catch {
      this.unregister(userId, deviceId);
      return false;
    }
  }

  /**
   * Send a heartbeat to keep connections alive
   */
  sendHeartbeat(userId: string, deviceId: string): boolean {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return false;

    const connection = userConnections.get(deviceId);
    if (!connection) return false;

    const message = ": heartbeat\n\n";
    const data = encoder.encode(message);

    try {
      connection.controller.enqueue(data);
      connection.lastHeartbeat = new Date();
      return true;
    } catch {
      this.unregister(userId, deviceId);
      return false;
    }
  }

  /**
   * Get the number of connected devices for a user
   */
  getConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size ?? 0;
  }

  /**
   * Check if a user has any connected devices
   */
  isUserConnected(userId: string): boolean {
    return this.getConnectionCount(userId) > 0;
  }

  /**
   * Get all connection stats (for debugging)
   */
  getStats(): { totalUsers: number; totalConnections: number } {
    let totalConnections = 0;
    for (const userConnections of this.connections.values()) {
      totalConnections += userConnections.size;
    }
    return {
      totalUsers: this.connections.size,
      totalConnections,
    };
  }

  /**
   * Format an event as SSE message
   */
  private formatSSEMessage<T>(event: SSEEvent<T>): string {
    const data = JSON.stringify(event);
    return `data: ${data}\n\n`;
  }
}

/** Singleton SSE hub instance */
export const sseHub = new SSEHub();
