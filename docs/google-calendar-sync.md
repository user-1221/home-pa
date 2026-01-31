# Google Calendar Sync

One-way import system for syncing Google Calendar events to Home-PA.

## Overview

Home-PA supports importing events from Google Calendar using OAuth 2.0 authentication. Key features:

- **One-way sync**: Events are imported from Google Calendar (read-only)
- **Multi-calendar support**: Users can sync multiple calendars
- **Incremental sync**: Uses Google's sync tokens for efficient updates
- **Automatic token refresh**: Access tokens refreshed transparently

## Authentication

### OAuth Configuration

Uses **Better Auth** with Google OAuth provider.

**File:** `src/lib/auth.ts`

**Scopes requested:**

- `openid`, `email`, `profile` - Basic user info
- `https://www.googleapis.com/auth/calendar.readonly` - Calendar list access
- `https://www.googleapis.com/auth/calendar.events.readonly` - Event read access

**OAuth settings:**

- `accessType: "offline"` - Enables refresh tokens
- `prompt: "consent"` - Always shows consent screen (ensures refresh token)

### Connection Methods

| Method           | Use Case                       | Implementation                             |
| ---------------- | ------------------------------ | ------------------------------------------ |
| Initial Sign-In  | New users                      | `authClient.signIn.social()` on auth page  |
| Link to Existing | Add Google to existing account | `authClient.linkSocial()` in SettingsPopup |

### Token Management

Access tokens expire after 1 hour. The system handles this automatically:

1. Before API calls, `getValidAccessToken()` checks expiration
2. If expired (with 5-minute buffer), refreshes using `oauth2Client.refreshAccessToken()`
3. Updated tokens stored in `Account` model
4. Refresh token persists until user revokes or Google requires re-auth (~1 year)

## Sync Mechanism

### Two Sync Modes

**Full Sync** (`performFullSync`):

- Fetches ALL events across 3-year window (1 year past, 2 years future)
- Handles pagination (250 events per page)
- Used on:
  - Initial setup (no sync token exists)
  - Sync token expiration (410 GONE error)

**Incremental Sync** (`performIncrementalSync`):

- Fetches only CHANGED events since last sync
- Uses `syncToken` from previous sync (Google's change tracking)
- Much more efficient for ongoing syncs

### Sync Flow

```
User clicks "Sync Now"
    │
    ▼
CalendarSettings.svelte
    │ googleSyncState.triggerSync()
    ▼
Remote Function: triggerSync (command)
    │
    ├─> getValidAccessToken()
    │   └─> Refresh if expired
    │
    ├─> Query GoogleCalendarSync (enabled calendars)
    │
    ▼
sync-engine.ts::performSync()
    │
    ├─> listEvents() (Google Calendar API)
    │   └─> Returns events + nextSyncToken
    │
    ├─> googleEventToLocal() (event-mapper.ts)
    │   ├─> Extract title, times, timezone
    │   ├─> Parse recurrence rules (RRULE)
    │   ├─> Convert Google color → hex
    │   └─> Build iCalendar VEVENT data
    │
    ├─> applyChanges()
    │   ├─> Check duplicates by UID
    │   ├─> Create or update CalendarEvent
    │   └─> Delete cancelled events
    │
    └─> Update syncToken for next sync
    │
    ▼
Return SyncResult
    │ { created, updated, deleted, errors }
    ▼
UI updates + calendar refresh
```

### Event Transformation

Google events are converted to local format:

| Google Field       | Local Field | Notes                                     |
| ------------------ | ----------- | ----------------------------------------- |
| `id`               | `uid`       | Stored as `{googleEventId}@google.com`    |
| `summary`          | `summary`   | Event title                               |
| `start.date`       | `dtstart`   | All-day: date only                        |
| `start.dateTime`   | `dtstart`   | Timed: with timezone                      |
| `end.date`         | `dtend`     | All-day: exclusive → inclusive conversion |
| `recurrence`       | `rrule`     | RRULE extracted from array                |
| `colorId`          | `color`     | Google ID → hex color mapping             |
| `status=cancelled` | -           | Event deleted from local DB               |

Full iCalendar VEVENT is stored in `icalData` for recurrence expansion.

## Database Models

### Account (OAuth tokens)

```prisma
model Account {
  accessToken           String?    // OAuth access token
  refreshToken          String?    // Refresh token (offline access)
  accessTokenExpiresAt  DateTime?  // Token expiration time
  providerId            String     // "google"
  userId                String     // Reference to User
}
```

### GoogleCalendarSync (sync configuration)

```prisma
model GoogleCalendarSync {
  id                String   @id
  userId            String
  googleCalendarId  String   // "primary" or specific calendar ID
  calendarName      String   // Display name
  calendarColor     String?  // Google's color
  syncToken         String?  // For incremental sync
  lastSyncAt        DateTime?
  syncEnabled       Boolean  @default(true)
  lastError         String?  // Error message if sync failed
  errorCount        Int      @default(0)

  @@unique([userId, googleCalendarId])
}
```

### CalendarEvent (synced events)

```prisma
model CalendarEvent {
  id              String   @id
  userId          String

  // iCalendar fields
  uid             String   @unique  // "googleEventId@google.com"
  summary         String
  dtstart         DateTime
  dtend           DateTime?
  isAllDay        Boolean

  // Sync metadata
  calendarId      String?         // Google calendar ID
  etag            String?         // For conflict detection
  syncStatus      String          // "local" | "synced" | "modified" | "deleted"
  lastSyncedAt    DateTime?

  // Recurrence
  rrule           String?
  hasRecurrence   Boolean

  // Storage
  icalData        String          // Raw VEVENT for round-trip
}
```

## Remote Functions API

All functions in `src/lib/features/calendar/state/google-sync.remote.ts`:

| Function                | Type    | Description                                           |
| ----------------------- | ------- | ----------------------------------------------------- |
| `checkGoogleConnection` | query   | Check if Google is linked, return synced calendars    |
| `listGoogleCalendars`   | query   | List all available calendars in user's Google account |
| `enableCalendarSync`    | command | Enable sync for selected calendar IDs                 |
| `disableCalendarSync`   | command | Disable sync for specific calendar                    |
| `triggerSync`           | command | Manually trigger sync (all or specific calendar)      |
| `disconnectGoogle`      | command | Remove all sync configs (keeps events in DB)          |

### Usage Example

```typescript
import {
  checkGoogleConnection,
  triggerSync,
} from "$lib/features/calendar/state/gcal-sync";

// Check connection status
const { isConnected, calendars } = await checkGoogleConnection();

// Trigger sync for all calendars
const result = await triggerSync();
console.log(`Created: ${result.created}, Updated: ${result.updated}`);
```

## Multi-Calendar Selection

### User Flow

1. User clicks "Manage Calendars" in Settings
2. `CalendarSelector.svelte` modal opens
3. Fetches available calendars via `listGoogleCalendars()`
4. User toggles calendars with checkboxes
5. Saves via `enableCalendarSync(selectedIds)`

### Storage

- Each calendar tracked separately in `GoogleCalendarSync`
- One row per calendar per user (unique constraint)
- `syncEnabled` controls whether calendar syncs
- Disabling preserves config for re-enabling later

## Key Files

| File                                                                        | Purpose                                     |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| `src/lib/auth.ts`                                                           | Better Auth configuration with Google OAuth |
| `src/lib/auth-client.ts`                                                    | Client-side auth SDK                        |
| `src/lib/features/calendar/state/google-sync.remote.ts`                     | Remote functions (server)                   |
| `src/lib/features/calendar/state/google-sync.svelte.ts`                     | State management                            |
| `src/lib/features/calendar/state/gcal-sync.ts`                              | Barrel export                               |
| `src/lib/features/calendar/services/google-calendar/sync-engine.ts`         | Sync orchestration                          |
| `src/lib/features/calendar/services/google-calendar/event-mapper.ts`        | Event conversion                            |
| `src/lib/features/calendar/services/google-calendar/google-calendar-api.ts` | Google API wrapper                          |
| `src/lib/features/calendar/components/GoogleCalendarConnect.svelte`         | Connect/disconnect UI                       |
| `src/lib/features/calendar/components/CalendarSelector.svelte`              | Calendar selection UI                       |
| `src/lib/features/calendar/components/CalendarSettings.svelte`              | Settings integration                        |
| `prisma/schema.prisma`                                                      | Database models                             |

## State Management

`GoogleSyncState` class (`google-sync.svelte.ts`):

```typescript
class GoogleSyncState {
  // Reactive state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  calendars: SyncedCalendar[];
  syncStatus: "idle" | "syncing" | "error";
  lastSyncAt: Date | null;

  // Methods
  checkConnection(); // Check if Google linked
  fetchAvailableCalendars(); // Get list of Google calendars
  enableSync(calendarIds); // Enable sync for calendars
  disableSync(calendarId); // Disable sync for calendar
  triggerSync(calendarId?); // Manual sync trigger
  disconnect(); // Unlink Google
  clearError(); // Clear error state
}
```

## Troubleshooting

### Token Expiration (401 Unauthorized)

**Symptom:** Sync fails with authentication error

**Cause:** Access token expired and refresh failed

**Resolution:**

1. Check if refresh token exists in Account model
2. If missing, user needs to re-authenticate (disconnect + reconnect)
3. Google may require re-consent after ~1 year

### Sync Token Invalidation (410 GONE)

**Symptom:** Incremental sync fails

**Cause:** Sync token expired (Google invalidates after ~7 days of inactivity)

**Resolution:** System automatically falls back to full sync

### Duplicate Events

**Symptom:** Same event appears multiple times

**Cause:** UID mismatch or multiple calendar sources

**Resolution:**

- Events are matched by `uid` field (`googleEventId@google.com`)
- Check if event exists in multiple synced calendars
- Verify unique constraint on `CalendarEvent.uid`

### Missing Events

**Symptom:** Events not appearing after sync

**Cause:**

- Event outside sync window (1 year past to 2 years future)
- Calendar not enabled for sync
- Sync error (check `lastError` in `GoogleCalendarSync`)

**Resolution:**

1. Check `syncEnabled` status
2. Check `lastError` field for errors
3. Verify event falls within time window
4. Trigger manual sync

## Limitations

1. **One-way only**: Changes in Home-PA don't sync back to Google
2. **Manual trigger**: No automatic scheduled sync (cron job not implemented)
3. **No real-time**: Changes require manual sync to appear
4. **Read-only scopes**: Cannot modify Google Calendar events
5. **Single user**: No shared calendar collaboration features
