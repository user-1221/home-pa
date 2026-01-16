/**
 * SSE Endpoint - Server-Sent Events for real-time sync
 *
 * GET /api/sse?deviceId=<uuid>
 *
 * Establishes a persistent SSE connection for real-time updates.
 * Events are routed by channel (timer, calendar, tasks, etc.)
 */

import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { sseHub } from "$lib/server/sse/hub";

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export const GET: RequestHandler = async ({ url, locals }) => {
  // Auth check
  if (!locals.user?.id) {
    throw error(401, "Unauthorized");
  }

  const userId = locals.user.id;
  const deviceId = url.searchParams.get("deviceId");

  if (!deviceId) {
    throw error(400, "deviceId query parameter is required");
  }

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Register this connection
      sseHub.register(userId, deviceId, controller);

      // Send initial connection confirmation
      const encoder = new TextEncoder();
      const connectEvent = JSON.stringify({
        channel: "system",
        type: "connected",
        payload: { deviceId },
        sourceDeviceId: "server",
        timestamp: new Date().toISOString(),
      });
      controller.enqueue(encoder.encode(`data: ${connectEvent}\n\n`));

      // Set up heartbeat to keep connection alive
      heartbeatTimer = setInterval(() => {
        const alive = sseHub.sendHeartbeat(userId, deviceId);
        if (!alive) {
          // Connection is dead, clear heartbeat
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        }
      }, HEARTBEAT_INTERVAL);
    },

    cancel() {
      // Clean up on disconnect
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      sseHub.unregister(userId, deviceId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
};
