# State Management

## Overview

HomePA uses **Svelte 5 runes** for reactive state management. State is organized in reactive classes within each feature module, with global state in the `bootstrap/` directory.

## Svelte 5 Runes

### Core Runes

| Rune          | Purpose                                      |
| ------------- | -------------------------------------------- |
| `$state<T>()` | Declare reactive state                       |
| `$derived`    | Computed values (automatically updates)      |
| `$effect`     | Side effects (runs when dependencies change) |

### Example: Reactive Class

```typescript
// src/lib/features/{feature}/state/example.svelte.ts
class ExampleState {
  // Reactive state
  items = $state<Item[]>([]);
  loading = $state(false);

  // Computed value
  get count(): number {
    return this.items.length;
  }

  // Derived (alternative syntax)
  get isEmpty(): boolean {
    return $derived(this.items.length === 0);
  }

  // Methods
  add(item: Item): void {
    this.items.push(item); // Mutating $state is fine
  }

  async fetchItems(): Promise<void> {
    this.loading = true;
    try {
      this.items = await fetchItemsRemote();
    } finally {
      this.loading = false;
    }
  }
}

// Export singleton instance
export const exampleState = new ExampleState();
```

## Directory Structure

```
src/lib/
├── bootstrap/           # Global state (app-wide)
│   ├── data.svelte.ts   # Core data (selectedDate, etc.)
│   ├── ui.svelte.ts     # UI state (viewMode, loading)
│   ├── toast.svelte.ts  # Toast notifications
│   ├── settings.svelte.ts # App settings
│   └── compat.svelte.ts # Compatibility exports
│
├── features/
│   ├── calendar/state/
│   │   ├── calendar.svelte.ts  # Calendar state class
│   │   ├── eventForm.svelte.ts # Event form state
│   │   └── eventActions.ts     # Business logic
│   │
│   ├── tasks/state/
│   │   ├── taskActions.svelte.ts # Task state class
│   │   └── taskForm.svelte.ts    # Task form state
│   │
│   └── assistant/state/
│       ├── unified-gaps.svelte.ts # Gap computation
│       └── schedule.ts            # Schedule state
```

## State Types

### 1. Feature State (Reactive Classes)

Each feature has a state class with `$state` and `$derived`:

```typescript
// features/calendar/state/calendar.svelte.ts
class CalendarState {
  events = $state<Event[]>([]);
  occurrences = $state<ExpandedOccurrence[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async fetchEvents(windowStart: Date, windowEnd: Date): Promise<void> {
    this.loading = true;
    try {
      const events = await fetchEventsRemote({ start, end });
      this.events = events;
      this.occurrences = this.expandRecurringEvents(
        events,
        windowStart,
        windowEnd,
      );
    } finally {
      this.loading = false;
    }
  }
}

export const calendarState = new CalendarState();
```

### 2. Form State

Forms have their own state classes for validation and submission:

```typescript
// features/calendar/state/eventForm.svelte.ts
class EventFormState {
  formData = $state<EventFormData>(initialFormData);
  errors = $state<Record<string, string>>({});
  isSubmitting = $state(false);
  isOpen = $state(false);

  updateField<K extends keyof EventFormData>(
    field: K,
    value: EventFormData[K],
  ): void {
    this.formData[field] = value;
    this.errors[field] = ""; // Clear error on change
  }

  validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!this.formData.title) {
      newErrors.title = "タイトルは必須です";
    }
    this.errors = newErrors;
    return Object.keys(newErrors).length === 0;
  }

  reset(): void {
    this.formData = { ...initialFormData };
    this.errors = {};
    this.isSubmitting = false;
  }
}

export const eventFormState = new EventFormState();
```

### 3. Computed State (Unified Gaps Example)

Complex derived state using `$derived`:

```typescript
// features/assistant/state/unified-gaps.svelte.ts
class UnifiedGapState {
  // Dependencies (reactive)
  private selectedDate = dataState.selectedDate;
  private events = calendarState.events;
  private occurrences = calendarState.occurrences;

  // Reactive current time (updates every minute)
  currentTime = $state(getCurrentTimeInMinutes());

  // Computed: all events including timetable
  get allEvents(): Event[] {
    return [
      ...this.events,
      ...this.occurrences,
      ...this.timetableBlockingEvents,
    ];
  }

  // Computed: gaps with past blocking
  get computedGaps(): Gap[] {
    const gaps = findGaps(this.allEvents, this.selectedDate);

    if (this.isTodaySelected) {
      return blockPastTime(gaps, this.currentTime);
    }
    return gaps;
  }

  // Computed: enriched gaps with location
  get enrichedGaps(): EnrichedGap[] {
    return enrichGapsWithLocation(this.computedGaps, this.allEvents);
  }

  constructor() {
    // Update current time every minute
    $effect(() => {
      const interval = setInterval(() => {
        this.currentTime = getCurrentTimeInMinutes();
      }, 60000);
      return () => clearInterval(interval);
    });
  }
}
```

## Bootstrap Layer

### Global State Instances

```typescript
// bootstrap/index.svelte.ts
export { dataState } from "./data.svelte.ts";
export { uiState } from "./ui.svelte.ts";
export { toastState } from "./toast.svelte.ts";
export { settingsState } from "./settings.svelte.ts";
```

### Data State

```typescript
// bootstrap/data.svelte.ts
class DataState {
  selectedDate = $state<Date>(new Date());
  memos = $state<SimpleMemo[]>([]); // Legacy simple memos
  suggestionLogs = $state<SuggestionLog[]>([]);
}

export const dataState = new DataState();
```

### UI State

```typescript
// bootstrap/ui.svelte.ts
class UIState {
  viewMode = $state<"day" | "list">("day");
  currentSuggestion = $state<Suggestion | null>(null);
  isLoading = $state(false);
  errorMessage = $state<string | null>(null);
}

export const uiState = new UIState();
```

### Toast State

```typescript
// bootstrap/toast.svelte.ts
interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

class ToastState {
  toasts = $state<Toast[]>([]);

  show(message: string, type: Toast["type"] = "info"): void {
    const id = crypto.randomUUID();
    this.toasts.push({ id, message, type });
    setTimeout(() => this.dismiss(id), 3000);
  }

  success(message: string): void {
    this.show(message, "success");
  }
  error(message: string): void {
    this.show(message, "error");
  }
  info(message: string): void {
    this.show(message, "info");
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toastState = new ToastState();
```

## Remote Functions

### Pattern

Server-side functions with type-safe client calls:

```typescript
// Server: features/{feature}/state/{feature}.functions.remote.ts
import { query, command } from "$app/server";
import * as v from "valibot";

export const fetchEvents = query({
  schema: v.object({
    start: v.string(),
    end: v.string(),
  }),
  async run({ start, end }) {
    // Server-side logic with DB access
    return prisma.event.findMany({
      where: {
        start: { gte: new Date(start) },
        end: { lte: new Date(end) },
      },
    });
  },
});

export const createEvent = command({
  schema: EventCreateSchema,
  async run(input) {
    // Mutation with validation
    return prisma.event.create({ data: input });
  },
});
```

### Client Usage

```typescript
// Client: Import and call with type safety
import { fetchEvents, createEvent } from "./calendar.functions.remote.ts";

// Query (read)
const events = await fetchEvents({ start: "2025-01-01", end: "2025-01-31" });

// Command (write)
const newEvent = await createEvent({
  title: "Meeting",
  start: new Date(),
  end: new Date(),
});
```

## Best Practices

### 1. Keep State Local

State should be as close to usage as possible:

```typescript
// Good: Feature-specific state in feature directory
// features/calendar/state/calendar.svelte.ts

// Avoid: Global state for feature-specific data
// bootstrap/calendar.svelte.ts
```

### 2. Use Getters for Computed Values

```typescript
class State {
  items = $state<Item[]>([]);

  // Good: Getter (reactive, computed on access)
  get count(): number {
    return this.items.length;
  }

  // Avoid: Method (not reactive)
  getCount(): number {
    return this.items.length;
  }
}
```

### 3. Mutate $state Directly

```typescript
// Good: Direct mutation
state.items.push(newItem);
state.items[0].name = "Updated";

// Avoid: Creating new arrays unnecessarily
state.items = [...state.items, newItem];
```

### 4. Use $effect for Side Effects

```typescript
class State {
  selectedDate = $state(new Date());

  constructor() {
    // Good: Effect for side effects
    $effect(() => {
      console.log("Date changed:", this.selectedDate);
      this.fetchEventsForDate(this.selectedDate);
    });
  }
}
```

### 5. Cleanup in Effects

```typescript
$effect(() => {
  const interval = setInterval(callback, 1000);

  // Return cleanup function
  return () => clearInterval(interval);
});
```

## Migration Notes

Some older code still uses Svelte 4 patterns:

| Old Pattern            | New Pattern            |
| ---------------------- | ---------------------- |
| `writable(value)`      | `$state(value)`        |
| `derived([a, b], ...)` | `$derived` or getter   |
| `$store` syntax        | Direct property access |

When modifying older files, prefer migrating to Svelte 5 runes.
