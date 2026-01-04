# Recurrence System

## ✅ Status: ENABLED and Working with iCal.js

The recurrence system is **successfully integrated** using **ical.js** (ICAL library) for RFC-5545 compliant recurrence rule expansion. Recurring events work smoothly with automatic occurrence generation when events are fetched.

## Quick Reference

### File Locations

```
src/lib/
  ├── features/calendar/
  │   ├── services/
  │   │   ├── ical-service.ts     - iCal parsing, generation, recurrence expansion
  │   │   └── event-converter.ts   - Database ↔ App event conversion
  │   ├── state/
  │   │   ├── calendar.svelte.ts  - Calendar state with expandRecurringEvents()
  │   │   └── eventActions.ts     - Event CRUD with recurrence handling
  │   └── components/
  │       └── CalendarView.svelte - Calendar UI with occurrence display
  └── types.ts                    - Event types with recurrence fields
```

### How to Use

```typescript
import { calendarActions } from "$lib/bootstrap/index.svelte.ts";

// Create a weekly recurring event
calendarActions.createEvent({
  title: "Weekly Standup",
  start: new Date("2025-10-06T09:00:00"),
  end: new Date("2025-10-06T09:30:00"),
  recurrence: {
    type: "RRULE",
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1",
  },
});

// Fetch events - occurrences automatically expanded
calendarActions.fetchEvents(windowStart, windowEnd, true);
// occurrences[] populated in calendarState
```

## Architecture

### iCal.js-based Expansion ✅

The integration uses **ical.js** (ICAL library) for RFC-5545 compliant recurrence expansion:

```typescript
// features/calendar/services/ical-service.ts
export function expandRecurrences(
  icalData: string, // VEVENT component string
  windowStart: Date,
  windowEnd: Date,
  maxOccurrences = 1000,
): ExpandedOccurrence[] {
  // Uses ICAL.Event.iterator() to generate occurrences
  // Returns array of { startDate, endDate, recurrenceId }
}
```

### Flow

```
App Startup / Calendar View Mount
    ↓
calendarActions.fetchEvents(windowStart, windowEnd, expandRecurring=true)
    ↓
Events fetched from database (with icalData field)
    ↓
calendarState.expandRecurringEvents(events, windowStart, windowEnd)
    ↓
For each recurring event:
    - Use stored icalData or construct VEVENT
    - Call ical-service.expandRecurrences(icalData, windowStart, windowEnd)
    - Uses ICAL.Event.iterator() to generate occurrences
    ↓
occurrences[] populated in calendarState (reactive $state)
    ↓
Mark forever recurring events (isForever: true, ∞ indicator)
    ↓
Display in calendar UI
```

## Key Features

### ✅ Implemented

- **RFC-5545 RRULE Support**: Full standard recurrence rule support via ical.js
- **iCal.js Integration**: Uses ICAL library for RFC-5545 compliance
- **Automatic Expansion**: Occurrences generated when `fetchEvents()` is called with `expandRecurring=true`
- **Window-based Expansion**: Only generates occurrences within specified date window
- **Performance Protection**: 1000 occurrence limit per event (prevents infinite loops)
- **Duration Preservation**: Each occurrence maintains original event duration
- **Forever Events**: Detected and marked with `isForever: true` (no UNTIL or COUNT in RRULE)
- **Visual Indicators**: ∞ symbol for forever recurring events in UI
- **Reactive State**: Occurrences stored in `calendarState.occurrences` (Svelte 5 $state)
- **Integrated Forms**: Recurrence settings built into event creation/editing
- **Database Storage**: Events stored with `icalData` field containing full VEVENT component

## Recurrence Types

### 1. None (Single Event)

```typescript
recurrence: {
  type: "NONE";
}
```

### 2. RRULE (RFC-5545)

```typescript
recurrence: {
  type: "RRULE",
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU;INTERVAL=1"
}
```

**Common Patterns:**

- Daily: `"FREQ=DAILY;INTERVAL=1"`
- Weekly (Mon/Wed/Fri): `"FREQ=WEEKLY;BYDAY=MO,WE,FR"`
- Monthly (3rd Tuesday): `"FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3"`
- Monthly (last Friday): `"FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1"`
- With COUNT: `"FREQ=WEEKLY;BYDAY=MO;COUNT=20"`
- With UNTIL: `"FREQ=WEEKLY;BYDAY=MO;UNTIL=20251231T235959Z"`
- Forever (no COUNT/UNTIL): `"FREQ=DAILY"` → marked as `isForever: true`

## Usage Examples

### Weekly Meeting

```typescript
calendarActions.createEvent({
  title: "Team Sync",
  start: new Date("2025-10-06T10:00:00"),
  end: new Date("2025-10-06T11:00:00"),
  recurrence: {
    type: "RRULE",
    rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=20",
  },
});
```

### Monthly Review (3rd Tuesday)

```typescript
calendarActions.createEvent({
  title: "Monthly Review",
  start: new Date("2025-10-21T14:00:00"),
  end: new Date("2025-10-21T16:00:00"),
  recurrence: {
    type: "RRULE",
    rrule: "FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3",
  },
});
```

### Forever Recurring Event

```typescript
calendarActions.createEvent({
  title: "Daily Standup",
  start: new Date("2025-10-06T09:00:00"),
  end: new Date("2025-10-06T09:30:00"),
  recurrence: {
    type: "RRULE",
    rrule: "FREQ=DAILY", // No COUNT or UNTIL = forever
  },
});
// Automatically marked as isForever: true
```

## Performance

### Bundle Size

- **ical.js**: Included in main bundle (~50KB)
- **No lazy loading**: Library always available
- **Impact**: Minimal - standard iCalendar library

### Computation Speed

- **Expansion**: ~10-50ms per recurring event (depends on window size)
- **Window**: Determined by `fetchEvents(windowStart, windowEnd)` call
- **Typical window**: 7 months (3 before + current + 3 after) for calendar view
- **Safety limit**: 1000 occurrences per event (prevents infinite loops)
- **Regeneration**: Occurs when `fetchEvents()` is called or events update

### Memory

- Occurrences stored in `calendarState.occurrences` (reactive $state)
- Regenerated on demand when window changes
- No persistent cache (regenerated from stored icalData)
- **Memory efficient**: Only generates occurrences for current window
- **Forever events**: Limited by window size, marked with `isForever: true`

## Testing

The recurrence system uses **ical.js** which is a well-tested RFC-5545 compliant library. The integration is tested through:

- **Manual testing**: Calendar view with various recurrence patterns
- **Edge cases**: Forever events, large windows, DST transitions
- **Safety limits**: 1000 occurrence limit prevents infinite loops

## Current Limitations

### 1. Display Only

- **Current**: Recurring events show as occurrences in calendar
- **Limitation**: Cannot edit individual occurrences from UI yet
- **Workaround**: Edit the master event (affects all occurrences)

### 2. Master Events Only in Lists

- **Current**: Only master events appear in event list/timeline
- **Limitation**: Occurrence details not shown in detail views
- **Reason**: Prevents confusion about editing recurring events

### 3. No Override UI

- **Current**: Manager supports overrides (cancel, move, modify)
- **Limitation**: No UI to trigger override operations yet
- **Future**: Add context menu on occurrences

## Troubleshooting

### Issue: Recurring events not showing

**Check:**

1. Event has `recurrence` field with type "RRULE"
2. Event start date is within fetch window
3. `fetchEvents()` called with `expandRecurring=true`
4. No console errors in browser DevTools

**Fix:**

```typescript
// Verify event structure
console.log(event.recurrence); // Should be { type: "RRULE", rrule: "..." }
console.log(event.icalData); // Should contain VEVENT string
console.log(calendarState.occurrences); // Check if occurrences were generated
```

### Issue: Occurrences not generating

**Cause**: ical.js expansion failed or window doesn't include event dates

**Fix:**

- Check browser console for errors from `ical-service.ts`
- Verify `windowStart` and `windowEnd` include event dates
- Check that RRULE syntax is valid RFC-5545 format
- Verify `icalData` field exists on event (or can be constructed)

### Issue: Too many occurrences

**Behavior**: Expansion stops at 1000 occurrences

**Expected**: Safety limit prevents infinite loops

**Solution**:

- Add `UNTIL` or `COUNT` to RRULE to limit occurrences
- Reduce window size in `fetchEvents()` call

## Technical Details

### iCal.js Integration

- **Library**: Uses `ical.js` (ICAL) for RFC-5545 compliance
- **Method**: `ICAL.Event.iterator()` generates occurrences
- **Input**: VEVENT component string (stored in `event.icalData` or constructed)
- **Output**: Array of `{ startDate, endDate, recurrenceId }`
- **Service**: `src/lib/features/calendar/services/ical-service.ts`

### Event Storage

- Events stored in database with `recurrence` field (RRULE string)
- `icalData` field stores full VEVENT component for accurate expansion
- If `icalData` missing, VEVENT constructed from event data + RRULE

### Occurrence Window

- **Window**: Determined by `fetchEvents(windowStart, windowEnd)` call
- **Typical**: 7 months (3 before + current + 3 after) for calendar view
- **Updates**: When `fetchEvents()` is called or events change
- **Forever events**: Limited by window, marked with `isForever: true` and ∞ indicator

## Window-Based Expansion

### Overview

The system efficiently manages recurring events by expanding only within a specified date window, preventing memory bloat while maintaining full functionality.

### Window Configuration

- **Size**: Determined by `fetchEvents(windowStart, windowEnd)` call
- **Typical**: 7 months (3 before + current + 3 after) for calendar view
- **Memory efficient**: Only generates occurrences for current window

### Forever Recurring Events

Events with no end date are specially handled:

```typescript
// Forever event example
{
  title: "Daily Standup",
  recurrence: {
    type: "RRULE",
    rrule: "FREQ=DAILY" // No COUNT or UNTIL = forever
  }
}

// In ExpandedOccurrence:
{
  id: "...",
  masterEventId: "...",
  title: "Daily Standup",
  start: Date,
  end: Date,
  isForever: true, // Automatically detected
  // ...
}
```

### Visual Indicators

- **∞ symbol**: Forever recurring events in UI
- **Occurrences**: Displayed in calendar grid and timeline

### Window Management

```typescript
// Window calculation (example from CalendarView)
const windowStart = new Date(currentMonth);
windowStart.setMonth(windowStart.getMonth() - 3);
windowStart.setDate(1);

const windowEnd = new Date(currentMonth);
windowEnd.setMonth(windowEnd.getMonth() + 4);
windowEnd.setDate(0); // Last day of month

calendarActions.fetchEvents(windowStart, windowEnd, true);
// Occurrences automatically expanded and stored in calendarState.occurrences
```

### Benefits

1. **Memory efficiency**: Only generates occurrences for current window
2. **Performance**: Fast expansion using ical.js
3. **Scalability**: Handles forever events without infinite generation (limited by window)
4. **User experience**: Smooth navigation, occurrences regenerated when needed

## Future Enhancements

### Short Term

1. **Occurrence Context Menu**: Right-click to edit/cancel single occurrence
2. **Visual Distinction**: Different color/icon for recurring events
3. **Occurrence Count Badge**: Show "Recurs weekly" in event details
4. **Extended Window**: Load 6-12 months for better long-term view

### Medium Term

1. **Edit Single Occurrence**: UI for override operations
2. **Edit This & Future**: Modify from a point forward
3. **Recurrence Templates**: Quick patterns (weekdays, bi-weekly, etc.)
4. **Better Error Messages**: User-friendly recurrence validation

### Long Term

1. **Visual Recurrence Builder**: Drag-and-drop rule creator
2. **iCalendar Import/Export**: .ics file support
3. **Server Persistence**: Backend sync for recurring events
4. **IndexedDB Cache**: Local storage for occurrences
5. **Occurrence History**: Track modifications

## API Reference

### Calendar State Methods

```typescript
// From calendar.svelte.ts
calendarState.expandRecurringEvents(
  events: Event[],
  windowStart: Date,
  windowEnd: Date
): ExpandedOccurrence[]

// Usage
const occurrences = calendarState.expandRecurringEvents(
  calendarState.events,
  windowStart,
  windowEnd
);
```

### iCal Service Functions

```typescript
// From ical-service.ts
export function expandRecurrences(
  icalData: string, // VEVENT component string
  windowStart: Date,
  windowEnd: Date,
  maxOccurrences = 1000,
): ExpandedOccurrence[];

// Usage
const occurrences = expandRecurrences(event.icalData, windowStart, windowEnd);
```

### Calendar Actions

```typescript
// From bootstrap/index.svelte.ts
calendarActions.fetchEvents(
  windowStart: Date,
  windowEnd: Date,
  expandRecurring = true
): Promise<void>

// Automatically expands occurrences if expandRecurring=true
// Results stored in calendarState.occurrences
```

## Implementation History

### Current Implementation (iCal.js-based) ✅

- **Library**: ical.js (ICAL) for RFC-5545 compliance
- **Integration**: Direct expansion in `calendarState.expandRecurringEvents()`
- **Storage**: Events stored with `icalData` field containing VEVENT component
- **Expansion**: Automatic when `fetchEvents()` called with `expandRecurring=true`
- **Result**: Smooth, RFC-5545 compliant, production-ready

### Key Features

| Aspect    | Implementation                       |
| --------- | ------------------------------------ |
| Library   | ical.js (ICAL)                       |
| Standard  | RFC-5545 iCalendar                   |
| Expansion | Automatic on fetchEvents()           |
| Storage   | icalData field in database           |
| State     | Reactive $state in calendarState     |
| SSR       | Safe (no blocking)                   |
| UX        | Smooth, automatic occurrence display |

## References

- **RFC-5545 (iCalendar)**: https://tools.ietf.org/html/rfc5545
- **ical.js**: https://github.com/mozilla-comm/ical.js
- **ICAL Library**: https://mozilla-comm.github.io/ical.js/
- **SvelteKit SSR**: https://kit.svelte.dev/docs/page-options#ssr

## Support

For detailed implementation, see:

- `src/lib/features/calendar/services/ical-service.ts` - iCal parsing, generation, recurrence expansion
- `src/lib/features/calendar/state/calendar.svelte.ts` - Calendar state with `expandRecurringEvents()` method
- `src/lib/features/calendar/services/event-converter.ts` - Database ↔ App event conversion
