# Real-Time Sync via Server-Sent Events (SSE)

This document describes the SSE infrastructure for real-time cross-device synchronization.

## Overview

The SSE system enables instant updates across all of a user's connected devices. When one device triggers an action (e.g., starts a timer), all other devices receive the update immediately without polling.

```
Device A triggers action
       ↓
Server-side remote function executes
       ↓
sseHub.broadcast(userId, event, excludeDeviceId)
       ↓
SSE endpoint streams event to all connected devices
       ↓
Client receives event, routes to channel handler
       ↓
UI updates instantly
```

## Architecture

### Server-Side

| File                            | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `src/lib/server/sse/types.ts`   | Type definitions (`SSEEvent`, `SSEConnection`) |
| `src/lib/server/sse/hub.ts`     | Connection manager singleton (`sseHub`)        |
| `src/routes/api/sse/+server.ts` | SSE streaming endpoint                         |

### Client-Side

| File                                                    | Purpose                           |
| ------------------------------------------------------- | --------------------------------- |
| `src/lib/features/shared/services/sse-client.ts`        | EventSource wrapper (`sseClient`) |
| `src/lib/features/shared/components/SSEProvider.svelte` | App-level connection manager      |
| `src/lib/utils/device.ts`                               | Device identification utilities   |

## Event Structure

All SSE events follow this structure:

```typescript
interface SSEEvent<T = unknown> {
  channel: string; // Feature identifier: "timer", "calendar", "tasks"
  type: string; // Action type: "started", "updated", "deleted"
  payload: T; // Event-specific data
  sourceDeviceId: string; // Device that triggered the event
  timestamp: string; // ISO timestamp
}
```

## Current Implementation: Timer Sync

### Files

- `src/lib/features/focus/services/timer-sse-handler.ts` - Channel handler
- `src/lib/features/focus/state/focus.remote.ts` - Broadcasts on timer actions
- `src/lib/features/focus/state/focus.svelte.ts` - Handler methods

### Events

| Event           | Trigger                            | Payload                                                                              |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------ |
| `timer:started` | User starts timer                  | `{ memoId, taskTitle, startedAt, plannedEndTime, mode, pomodoroState?, deviceName }` |
| `timer:stopped` | User stops/completes timer         | `{}`                                                                                 |
| `timer:moved`   | User moves timer to another device | `{ memoId, taskTitle, startedAt, ..., targetDeviceId }`                              |
| `timer:updated` | Pomodoro phase changes             | `{ pomodoroState }`                                                                  |

---

## Adding Real-Time Sync to Other Features

### Step 1: Create a Channel Handler

Create a handler file for your feature:

```typescript
// src/lib/features/{feature}/services/{feature}-sse-handler.ts

import { sseClient } from "$lib/features/shared/services/sse-client";
import type { SSEEvent } from "$lib/server/sse/types";
import { getDeviceId } from "$lib/utils/device";

// Define your event payload types
interface MyEventPayload {
  id: string;
  // ... other fields
}

export function initMyFeatureSSEHandler(state: MyFeatureState): () => void {
  const handler = (event: SSEEvent<MyEventPayload>) => {
    // Ignore events from this device (already handled locally)
    if (event.sourceDeviceId === getDeviceId()) {
      return;
    }

    switch (event.type) {
      case "created":
        state.handleRemoteCreated(event.payload);
        break;
      case "updated":
        state.handleRemoteUpdated(event.payload);
        break;
      case "deleted":
        state.handleRemoteDeleted(event.payload);
        break;
    }
  };

  sseClient.on("myfeature", handler);

  // Return cleanup function
  return () => {
    sseClient.off("myfeature");
  };
}
```

### Step 2: Add Handler Methods to State

Add methods to handle remote events:

```typescript
// src/lib/features/{feature}/state/{feature}.svelte.ts

class MyFeatureState {
  items = $state<Item[]>([]);

  // ... existing methods ...

  // SSE Event Handlers
  handleRemoteCreated(payload: { id: string; data: ItemData }): void {
    // Add item if not already present
    if (!this.items.find((i) => i.id === payload.id)) {
      this.items.push(payload.data);
    }
  }

  handleRemoteUpdated(payload: {
    id: string;
    changes: Partial<ItemData>;
  }): void {
    const item = this.items.find((i) => i.id === payload.id);
    if (item) {
      Object.assign(item, payload.changes);
    }
  }

  handleRemoteDeleted(payload: { id: string }): void {
    this.items = this.items.filter((i) => i.id !== payload.id);
  }
}
```

### Step 3: Add Broadcasts to Remote Functions

Import and use `sseHub` in your remote functions:

```typescript
// src/lib/features/{feature}/state/{feature}.remote.ts

import { sseHub } from "$lib/server/sse/hub";
import { createSSEEvent } from "$lib/server/sse/types";

export const createItem = command(CreateItemSchema, async (input) => {
  const userId = getAuthenticatedUser();

  // ... create item in database ...

  // Broadcast to other devices
  sseHub.broadcast(
    userId,
    createSSEEvent(
      "myfeature",
      "created",
      {
        id: newItem.id,
        data: newItem,
      },
      input.deviceId,
    ),
    input.deviceId, // Exclude triggering device
  );

  return { success: true, item: newItem };
});

export const updateItem = command(UpdateItemSchema, async (input) => {
  const userId = getAuthenticatedUser();

  // ... update item in database ...

  sseHub.broadcast(
    userId,
    createSSEEvent(
      "myfeature",
      "updated",
      {
        id: input.id,
        changes: input.changes,
      },
      input.deviceId,
    ),
    input.deviceId,
  );

  return { success: true };
});

export const deleteItem = command(DeleteItemSchema, async (input) => {
  const userId = getAuthenticatedUser();

  // ... delete item from database ...

  sseHub.broadcast(
    userId,
    createSSEEvent(
      "myfeature",
      "deleted",
      {
        id: input.id,
      },
      input.deviceId,
    ),
    input.deviceId,
  );

  return { success: true };
});
```

### Step 4: Initialize Handler on Component Mount

Initialize your handler when the relevant component mounts:

```svelte
<!-- src/lib/features/{feature}/components/MyFeature.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { myFeatureState } from "../state";
  import { initMyFeatureSSEHandler } from "../services/myfeature-sse-handler";

  onMount(() => {
    const cleanup = initMyFeatureSSEHandler(myFeatureState);
    return cleanup;
  });
</script>
```

### Step 5: Add deviceId to Your Schemas

Make sure your input schemas include `deviceId`:

```typescript
const CreateItemSchema = v.object({
  // ... your fields ...
  deviceId: v.string(),
});
```

And pass it from the client:

```typescript
import { getDeviceId } from "$lib/utils/device";

await createItem({
  // ... your data ...
  deviceId: getDeviceId(),
});
```

---

## Example: Calendar Sync

Here's how calendar sync would be implemented:

### Handler

```typescript
// src/lib/features/calendar/services/calendar-sse-handler.ts

import { sseClient } from "$lib/features/shared/services/sse-client";
import type { SSEEvent } from "$lib/server/sse/types";
import type { CalendarState } from "../state/calendar.svelte";
import { getDeviceId } from "$lib/utils/device";

interface CalendarEventPayload {
  id: string;
  event?: ParsedCalendarEvent;
}

export function initCalendarSSEHandler(
  calendarState: CalendarState,
): () => void {
  const handler = (event: SSEEvent<CalendarEventPayload>) => {
    if (event.sourceDeviceId === getDeviceId()) return;

    switch (event.type) {
      case "event_created":
        calendarState.handleRemoteEventCreated(event.payload);
        break;
      case "event_updated":
        calendarState.handleRemoteEventUpdated(event.payload);
        break;
      case "event_deleted":
        calendarState.handleRemoteEventDeleted(event.payload);
        break;
    }
  };

  sseClient.on("calendar", handler);
  return () => sseClient.off("calendar");
}
```

### Broadcast in Remote Function

```typescript
// In calendar.functions.remote.ts

export const createEvent = command(CreateEventSchema, async (input) => {
  const userId = getAuthenticatedUser();

  const newEvent = await prisma.calendarEvent.create({ ... });

  sseHub.broadcast(
    userId,
    createSSEEvent('calendar', 'event_created', {
      id: newEvent.id,
      event: newEvent,
    }, input.deviceId),
    input.deviceId,
  );

  return { success: true, event: newEvent };
});
```

---

## API Reference

### `sseHub` (Server-Side)

```typescript
// Register a connection (called by SSE endpoint)
sseHub.register(userId: string, deviceId: string, controller: ReadableStreamDefaultController): void

// Remove a connection
sseHub.unregister(userId: string, deviceId: string): void

// Broadcast to all user's devices (optionally exclude one)
sseHub.broadcast<T>(userId: string, event: SSEEvent<T>, excludeDeviceId?: string): void

// Send to specific device
sseHub.sendToDevice<T>(userId: string, deviceId: string, event: SSEEvent<T>): boolean

// Send heartbeat
sseHub.sendHeartbeat(userId: string, deviceId: string): boolean

// Check connection status
sseHub.getConnectionCount(userId: string): number
sseHub.isUserConnected(userId: string): boolean
```

### `sseClient` (Client-Side)

```typescript
// Connect to SSE endpoint
sseClient.connect(deviceId: string): void

// Disconnect
sseClient.disconnect(): void

// Register channel handler
sseClient.on<T>(channel: string, handler: (event: SSEEvent<T>) => void): void

// Remove channel handler
sseClient.off(channel: string): void

// Check connection status
sseClient.isConnected(): boolean
```

### `createSSEEvent` Helper

```typescript
import { createSSEEvent } from "$lib/server/sse/types";

const event = createSSEEvent(
  "channel", // channel name
  "type", // event type
  { data: "payload" }, // payload
  "deviceId", // source device ID
);
// Returns: { channel, type, payload, sourceDeviceId, timestamp }
```

---

## Limitations

1. **In-Memory Connections**: The connection store is in-memory, so it won't work with horizontal scaling. For multi-server deployments, use Redis pub/sub.

2. **No Persistence**: If the server restarts, all connections are lost. Clients auto-reconnect.

3. **One-Way Push**: SSE is server→client only. Client→server uses regular HTTP requests (remote functions).

---

## Debugging

Enable console logs to see SSE activity:

```
[SSE] Connection registered: user=abc123... device=def456... (2 devices)
[SSE] Connection unregistered: user=abc123... device=def456...
```

Client-side logs:

```
[SSE] Connected
[SSE] Reconnecting in 1000ms (attempt 1/10)
[Focus] Remote timer started: Task Title
```
