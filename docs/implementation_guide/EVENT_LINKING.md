# Event Linking System

## Overview

The event linking system allows deadline tasks to derive their deadline from linked calendar events or timetable cells. This is useful for tasks like "prepare for meeting" or "finish homework before class."

## Use Cases

1. **Meeting Preparation**: Link task to meeting event, deadline = 1 day before
2. **Class Assignment**: Link task to class in timetable, deadline = same day after class
3. **Event Follow-up**: Link task to event, deadline = 1 day after event

## Data Model

### EventLinkData

Stored on the Memo (task) object:

```typescript
interface EventLinkData {
  type: EventLinkType;
  calendarEventId?: string; // For calendar events
  timetableCellId?: string; // For timetable items
  offset: EventDeadlineOffset;
  trackedOccurrenceDate?: Date; // Which occurrence we're tracking
  suggestionAvailableFrom?: Date; // When suggestion can start appearing
}

type EventLinkType = "calendar" | "timetable";

type EventDeadlineOffset =
  | "same_day_after" // Deadline is same day as event ends
  | "1_day_before" // Deadline is 24h before event starts
  | "1_day_after"; // Deadline is 24h after event ends
```

### Offset Options (UI Labels)

| Offset           | Japanese Label         | Description                          |
| ---------------- | ---------------------- | ------------------------------------ |
| `same_day_after` | イベント当日（終了後） | イベントが終わった後、その日中に完了 |
| `1_day_before`   | イベント1日前          | イベント開始の24時間前まで           |
| `1_day_after`    | イベント1日後          | イベント終了から24時間以内           |

## Deadline Calculation

### For Calendar Events

```typescript
function calculateDeadline(
  event: Event,
  offset: EventDeadlineOffset,
  occurrenceDate?: Date,
): Date {
  // Use occurrence date for recurring events
  const eventDate = occurrenceDate ?? event.start;

  switch (offset) {
    case "same_day_after":
      // End of the day the event ends
      return endOfDay(event.end ?? eventDate);

    case "1_day_before":
      // 24 hours before event starts
      return subDays(eventDate, 1);

    case "1_day_after":
      // 24 hours after event ends
      return addDays(event.end ?? eventDate, 1);
  }
}
```

### For Timetable Cells

```typescript
function calculateDeadlineFromTimetable(
  cell: TimetableCell,
  config: TimetableConfig,
  offset: EventDeadlineOffset,
  targetDate: Date,
): Date {
  // Get the event time for this occurrence
  const cellEvent = getTimetableEventForDate(cell, config, targetDate);

  // Same calculation as calendar events
  return calculateDeadline(cellEvent, offset);
}
```

## Recurring Event Handling

For recurring events, the system tracks which specific occurrence the task is linked to:

1. **trackedOccurrenceDate**: Stores the date of the specific occurrence
2. When calculating deadline, uses the occurrence date instead of master event date
3. Allows linking to "next Monday's class" vs "every Monday's class"

## Suggestion Timing

The `suggestionAvailableFrom` field controls when the task starts appearing in suggestions:

- If `null`: Task is available immediately
- If set: Task only appears after this date
- Useful for "don't remind me until 1 week before"

## UI Flow

### Creating an Event-Linked Task

```
User creates deadline task
    ↓
Clicks "イベントに紐付ける" (Link to Event)
    ↓
EventLinkSelector component opens
    ↓
User chooses link type:
  - カレンダーイベント (Calendar Event)
  - 時間割 (Timetable Cell)
    ↓
User selects specific event/cell
    ↓
User selects offset:
  - イベント1日前
  - イベント当日（終了後）
  - イベント1日後
    ↓
Deadline automatically calculated
    ↓
Task created with eventLink field
```

### Displaying Linked Tasks

- Tasks with eventLink show the linked event name
- Deadline displayed with "(from event)" indicator
- For recurring events: shows which occurrence

## File References

| Purpose           | File                                                 |
| ----------------- | ---------------------------------------------------- |
| Type definitions  | `features/tasks/types/event-link.ts`                 |
| Form handling     | `features/tasks/state/taskForm.svelte.ts`            |
| Event selector UI | `features/tasks/components/EventLinkSelector.svelte` |

## Example: Linking to a Meeting

```typescript
// Create task linked to meeting
const task: Memo = {
  id: "task-1",
  title: "Prepare presentation slides",
  type: "期限付き",
  eventLink: {
    type: "calendar",
    calendarEventId: "meeting-123",
    offset: "1_day_before",
    trackedOccurrenceDate: new Date("2025-01-20T14:00:00"),
    suggestionAvailableFrom: new Date("2025-01-13"), // 1 week before
  },
  // deadline is calculated as 2025-01-19T14:00:00
};
```

## Example: Linking to a Timetable Class

```typescript
// Create task linked to weekly class
const task: Memo = {
  id: "task-2",
  title: "Complete homework for Math class",
  type: "期限付き",
  eventLink: {
    type: "timetable",
    timetableCellId: "math-monday-1",
    offset: "same_day_after",
    trackedOccurrenceDate: new Date("2025-01-20"), // This Monday's class
  },
  // deadline is calculated as end of 2025-01-20
};
```

## Benefits

1. **Automatic Updates**: If event time changes, deadline updates automatically
2. **Recurring Support**: Link to specific occurrence of recurring events
3. **Context Awareness**: Suggestions know the task is related to an event
4. **Flexible Offsets**: Configure how much buffer time you need
