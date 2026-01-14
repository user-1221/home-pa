# System Design

## Architecture

### Stack

- **Frontend**: SvelteKit (Svelte 5 with runes)
- **Backend**: SvelteKit server + Prisma ORM
- **Database**: MongoDB 7 (Docker container via `infra/dev.docker-compose.yml`)
- **Authentication**: better-auth with HTTP-only cookies
- **Validation**: valibot (schema validation)
- **Infrastructure**: Docker Compose (`infra/dev.docker-compose.yml`)

### Directory Structure

```
src/
├── routes/              # SvelteKit routes
├── lib/
│   ├── features/        # Feature modules (calendar, tasks, assistant, etc.)
│   │   ├── {feature}/
│   │   │   ├── components/  # UI components
│   │   │   ├── state/       # Svelte 5 reactive state classes
│   │   │   └── services/    # Business logic (optional)
│   │   └── shared/          # Shared components across features
│   ├── bootstrap/       # App initialization & global state
│   ├── server/          # Server-only code (Prisma, env)
│   ├── utils/           # Utility functions
│   └── types.ts         # Shared type definitions
infra/                   # Infrastructure configs
scripts/                 # Dev scripts (up.sh, down.sh)
static/                  # Public static files
```

## Core Features

### 1. Calendar System

Full-featured calendar with event management and recurring events.

**Capabilities:**

- Event CRUD (create, read, update, delete)
- Event types: All-day, some-timing (date only), timed events
- Recurring events with RFC-5545 RRULE support via ical.js
- Import/Export .ics files
- 7-month sliding window for occurrence expansion

**Key Files:**

- `features/calendar/state/calendar.svelte.ts` - Calendar state class
- `features/calendar/state/eventForm.svelte.ts` - Event form state
- `features/calendar/services/ical-service.ts` - iCal parsing/generation
- `features/calendar/services/event-converter.ts` - DB ↔ App conversion

### 2. Task/Memo System

Rich task management with three task types and LLM enrichment.

**Task Types:**

- **期限付き** (Deadline): Time-bound tasks with deadlines
- **バックログ** (Backlog): Undeadlined tasks ranked by neglect
- **ルーティン** (Routine): Recurring goals (e.g., 3x per week)

**Capabilities:**

- Task CRUD with type-specific fields
- Event linking for deadline tasks
- LLM-powered metadata enrichment (genre, importance, duration)
- Graceful degradation when LLM unavailable

**Key Files:**

- `features/tasks/state/taskActions.svelte.ts` - Task CRUD operations
- `features/tasks/state/taskForm.svelte.ts` - Task form state
- `features/tasks/types/event-link.ts` - Event linking types

### 3. Assistant/Suggestion System

Intelligent schedule suggestions based on gaps and task priorities.

**Capabilities:**

- Gap detection in calendar (finds free time)
- Smart suggestion scoring (need, importance, duration)
- Location-based matching (home/workplace preferences)
- Effective active time calculation (extends for events)
- Timetable integration with exception ranges

**Key Files:**

- `features/assistant/state/unified-gaps.svelte.ts` - Gap computation
- `features/assistant/state/schedule.ts` - Schedule state
- `features/assistant/services/gap-finder.ts` - Gap detection algorithm
- `features/assistant/services/suggestions/` - Suggestion engine

### 4. Focus/Pomodoro System

Timer-based focus sessions for task completion.

**Capabilities:**

- Pomodoro timer with work/break intervals
- Duration picker for flexible sessions
- Visual progress indicator
- Quick-start from suggestions

**Key Files:**

- `features/focus/state/focus.svelte.ts` - Focus state
- `features/focus/components/FocusIndicator.svelte` - Progress UI

### 5. Timetable System

Weekly class schedule configuration that blocks time.

**Capabilities:**

- Weekly timetable configuration
- Exception date ranges (holidays, vacations)
- Integration with gap calculation (blocking events)
- Cell-based schedule with attendance/work-allowed settings

**Key Files:**

- `features/utilities/components/TimetablePopup.svelte` - Config UI
- `features/calendar/services/timetable-events.ts` - Event generation

### 6. Transit System

Route planning via NAVITIME API integration.

**Capabilities:**

- Route search with travel time
- Station search and nearby stations
- Address geocoding and autocomplete

**Key Files:**

- `features/transit/` - Transit feature module

## Data Flow

### Schedule Generation Flow

```
PersonalAssistantView (mount + today selected)
  ↓
scheduleActions.regenerate()
  ↓
engine.generateSchedule(memos, gaps)
  ↓
stableSerializeSchedule() - Cache comparison
  ↓
scheduleResult.set() - Update store if changed
  ↓
CircularTimeline - Render scheduled blocks as events
```

### Task Enrichment Flow

```
User creates task
  ↓
taskActions.create()
  ↓
Task added to store (minimal fields)
  ↓
enrichTaskInBackground() - Async
  ↓
enrichMemo() Remote Function - LLM call
  ↓
Store update - Add enrichment fields
  ↓
UI update - Remove loading overlay
```

### Gap Detection Flow

```
App Startup / Date Change / Event Update
  ↓
unifiedGapState.allEvents (reactive)
  - Calendar events + occurrences
  - Timetable blocking events
  ↓
unifiedGapState.computedGaps (reactive)
  - Effective active time calculation
  - Past time blocking (if today)
  ↓
unifiedGapState.enrichedGaps (reactive)
  - Location labels from surrounding events
  ↓
Used by suggestion scheduler
```

## Design Principles

### Feature-Based Organization

- Each feature in `features/{name}/` with state, components, services
- Keep files short (≤100 lines when practical)
- Follow K.I.S.S. principle

### State Management

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Reactive classes for feature state
- Remote Functions for type-safe server calls

### Type Safety

- No `any` types - use `unknown` with valibot validation
- No `as` assertions - fix types at source
- Discriminated unions with `type` field

### Documentation

- Keep docs up to date
- Remove stale documentation
- Deduplicate content
