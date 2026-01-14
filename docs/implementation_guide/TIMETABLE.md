# Timetable System

## Overview

The timetable system allows users to configure weekly class schedules that block time on the timeline. Timetable events are integrated into gap calculation, preventing suggestions during scheduled classes.

## Data Model

### TimetableConfig

Global configuration for the timetable system.

```typescript
interface TimetableConfig {
  id: string;
  userId: string;
  dayStartTime: string; // "HH:mm" format, e.g., "08:30"
  lunchStartTime: string; // Lunch break start
  lunchEndTime: string; // Lunch break end
  breakDuration: number; // Minutes between classes
  cellDuration: number; // Minutes per class slot
  exceptionRanges: ExceptionRange[]; // Holidays, vacations
}

interface ExceptionRange {
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD"
}
```

### TimetableCell

Individual class slots in the weekly schedule.

```typescript
interface TimetableCell {
  id: string;
  configId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  slotIndex: number; // 1st period, 2nd period, etc.
  title: string; // Class name
  attendance: "出席する" | "出席しない"; // Attend or not
  workAllowed: "作業可" | "作業不可"; // Can work during class or not
}
```

## Key Concepts

### Attendance vs Work Allowed

- **出席する (Attend)**: The cell represents a class you attend
- **出席しない (Skip)**: The cell is empty/skipped
- **作業可 (Work OK)**: Can do tasks during this time (e.g., free period)
- **作業不可 (No Work)**: Time is blocked for suggestions

Only cells where `attendance = "出席する"` AND `workAllowed = "作業不可"` block time for suggestions.

### Exception Date Ranges

Periods when the timetable doesn't apply (holidays, vacations, etc.):

- When a selected date falls within an exception range, no timetable events are generated
- Managed in TimetablePopup under "休講期間（時間割を適用しない期間）"
- Supports multiple ranges

## Integration with Gap Calculation

### Flow

```
User selects date in assistant view
    ↓
unifiedGapState.loadTimetableEvents()
    ↓
loadTimetableData() - Fetches config and cells
    ↓
getTimetableEventsForDate(date, config, cells)
    - Checks if date is in exception range (returns empty if so)
    - Filters cells for selected day's weekday
    - Only includes cells where attendance = "出席する"
    ↓
getBlockingTimetableEvents(events)
    - Filters to only events where workAllowed = "作業不可"
    ↓
timetableBlockingEvents updated (reactive $state)
    ↓
Included in unifiedGapState.allEvents
    ↓
Used in gap calculation (blocks time)
```

### Event Generation

Timetable cells are converted to events with calculated times:

```typescript
function getTimetableEventsForDate(
  date: Date,
  config: TimetableConfig,
  cells: TimetableCell[],
): TimetableEvent[] {
  // 1. Check if date is in exception range
  if (isDateInExceptionRange(date, config.exceptionRanges)) {
    return [];
  }

  // 2. Get weekday (0-6)
  const weekday = date.getDay();

  // 3. Filter cells for this weekday
  const dayCells = cells.filter((c) => c.dayOfWeek === weekday);

  // 4. Calculate times for each cell
  return dayCells.map((cell) => {
    const startMinutes = calculateSlotStartTime(
      cell.slotIndex,
      config.dayStartTime,
      config.lunchStartTime,
      config.lunchEndTime,
      config.breakDuration,
      config.cellDuration,
    );
    const endMinutes = startMinutes + config.cellDuration;

    return {
      id: `timetable-${cell.id}`,
      title: cell.title,
      start: minutesToDate(date, startMinutes),
      end: minutesToDate(date, endMinutes),
      workAllowed: cell.workAllowed,
    };
  });
}
```

## UI Configuration

### TimetablePopup

Location: `src/lib/features/utilities/components/TimetablePopup.svelte`

**Sections:**

1. **時間設定 (Time Settings)**
   - Day start time
   - Lunch break times
   - Break duration between classes
   - Class duration

2. **時間割 (Weekly Schedule)**
   - Grid of cells (rows = periods, columns = weekdays)
   - Click cell to edit title, attendance, work-allowed

3. **休講期間 (Exception Ranges)**
   - Add/remove date ranges when timetable doesn't apply
   - Useful for holidays, vacations, exam periods

## File References

| Purpose          | File                                                    |
| ---------------- | ------------------------------------------------------- |
| Event generation | `features/calendar/services/timetable-events.ts`        |
| Config UI        | `features/utilities/components/TimetablePopup.svelte`   |
| Gap integration  | `features/assistant/state/unified-gaps.svelte.ts`       |
| Database schema  | `prisma/schema.prisma` (TimetableConfig, TimetableCell) |

## Usage Example

### Adding a Weekly Class Schedule

1. Open Settings → Timetable
2. Configure time settings (day start, lunch, breaks)
3. Click on cells to add classes
4. Set "出席する" for classes you attend
5. Set "作業不可" to block time for suggestions
6. Add exception ranges for holidays

### Handling Vacations

1. Open Settings → Timetable
2. Scroll to "休講期間" section
3. Add date range (e.g., 2025-03-20 to 2025-04-05 for spring break)
4. Timetable events won't appear during this period

## Troubleshooting

### Timetable events not showing

**Check:**

1. Cell has `attendance = "出席する"`
2. Selected date's weekday matches cell's `dayOfWeek`
3. Date is not in an exception range

### Events not blocking time

**Check:**

1. Cell has `workAllowed = "作業不可"`
2. Only blocking events affect gap calculation
3. Check `unifiedGapState.timetableBlockingEvents` in devtools

### Exception range not working

**Check:**

1. Date format is correct (YYYY-MM-DD)
2. Start date is before or equal to end date
3. Config is saved (check database)
