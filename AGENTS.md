# AGENTS.md

This application is Home-PA (Personal Assistant), SvelteKit + Svelte 5 personal assistant application.

## Tech Stack & Tools

- Svelte, SvelteKit
  - Experimental Remote Functions are enabled.
- Bun (runtime, package manager, test runner)
- TailwindCSS & DaisyUI
- Prisma

## Directory Structure

```
src/lib/
├── features/           # Feature modules
│   ├── {feature}/      # assistant, calendar, tasks, memo, utilities, logs, etc
│   │   ├── components/ # UI components
│   │   ├── state/      # Svelte 5 reactive state classes
│   │   └── services/   # Business logic (optional)
│   └── shared/         # Shared components across features
├── utils/              # Utility functions
├── server/             # Server-only code
├── bootstrap/          # App initialization
└── types.ts            # Shared type definitions
```

## Svelte 5

- Use runes (e.g. `$state`) over stores.
- Use controller class if applicable.
- Use new Remote Functions for type-safe communication, over `+server.ts`.

## State Management

```typescript
// src/lib/features/{feature}/state/example.svelte.ts
import { getContext, setContext } from "svelte";

export class ExampleState {
  items = $state<Item[]>([]);

  get count(): number {
    return this.items.length;
  }

  add(item: Item): void {
    this.items.push(item);
  }
}

const EXAMPLE_STATE_KEY = Symbol("example-state");

export function setExampleState(state: ExampleState): void {
  setContext(EXAMPLE_STATE_KEY, state);
}

export function getExampleState(): ExampleState {
  const state = getContext<ExampleState | undefined>(EXAMPLE_STATE_KEY);
  if (!state) {
    throw new Error("ExampleState not found in context.");
  }
  return state;
}
```

```svelte
<script>
  import {
    ExampleState,
    setExampleState,
  } from "$lib/features/{feature}/state/example.svelte.ts";

  const exampleState = new ExampleState();
  setExampleState(exampleState);

  exampleState.add(item);
</script>

<span>Current count: {exampleState.count}</span>
```

### State Scopes

Every state class should declare its scope, owner, and cleanup strategy:

| Scope       | Lifetime                                                           | Instantiation Location                 |
| ----------- | ------------------------------------------------------------------ | -------------------------------------- |
| `singleton` | App lifetime                                                       | bootstrap.ts / +layout.svelte          |
| `layout`    | Layout component lifetime                                          | feature/+layout.svelte                 |
| `page`      | Page component lifetime                                            | feature/+page.svelte                   |
| `session`   | User interaction duration (has timers/intervals requiring cleanup) | Controller component, destroy() on end |
| `form`      | Form open/close cycle (transient UI state)                         | Dialog component, reset() on close     |

```typescript
/**
 * Manages task CRUD operations.
 * @scope singleton
 * @owner src/routes/+layout.svelte
 * @cleanup none - State persists across navigation
 */
export class TaskState { ... }
```

## Notes

- **Lint errors**: Remaining errors are `svelte/prefer-svelte-reactivity` warnings (use `SvelteDate`/`SvelteMap`/`SvelteSet`). Many are false positives - the pattern `new Map(this.x)` for immutable state updates is correct and doesn't need `SvelteMap`.
- **Unused variables**: Prefix with `_` to suppress (e.g., `_unused`).

## Commands

```bash
bun run dev        # Dev server
bun run build      # Build
bun run check      # Full check (type + lint + format)
bun run test       # Vitest（公式）
bun run test:watch # Watch mode（Vitest）
```

## Preferences

- CPU performance is rarely a concern, so no need to optimize for it in general.

## Architecture Patterns

### Feature Structure

Each feature follows this pattern:

```
{feature}/
├── components/     # UI components (.svelte)
├── state/          # Svelte 5 reactive state classes (.svelte.ts)
├── services/       # Business logic (optional)
├── utils/          # Feature-specific utilities (optional)
├── types/          # Feature-specific types (optional)
├── __tests__/      # Test files
└── index.ts        # Barrel exports
```

### Utils Directory

- Create `utils/` only when a feature has 2+ utility files
- Single utility functions can stay in the file that uses them

### Service Directory Depth

- Use flat structure for simple services (1-2 files)
- Use subdirectories when a service domain has 3+ files or distinct sub-concerns
  - Example: `assistant/services/suggestions/` (engine, scoring, scheduler, LLM)

### Cross-Feature Imports

Allowed cross-feature dependencies:

- assistant → calendar (gap calculation requires events)
- assistant → tasks (suggestion acceptance marks tasks)
- focus → tasks (timer completion logs progress)
- transit → calendar (route planning needs event locations)

Use dynamic imports for circular dependency prevention.

### Remote Functions

- Naming: `{feature}.remote.ts` or `{feature}.functions.remote.ts` (both acceptable)
- Location: In `state/` directory for data-fetching, `services/` for business logic

### Test File Location

- Place tests in `{feature}/__tests__/` directory
- Use `.test.ts` suffix

## Application design & Documentation

- Read `docs/` for application design and documentation.
- **UI work**: Always refer to `docs/skills/designer.md` for design guidelines.
- **After substantial UI changes**: Run `/web-design-guidelines` to review against best practices.

## TypeScript Debugger

### Checklist

1. **No `any`** - Use `unknown` and validate with valibot
2. **No `as`** - Fix types at source
3. **No `!`** - Explicit checks instead
4. **NO `value is T`** - Use valibot instead
5. **Discriminated unions** - Add `type` field to narrow

### Good Practices

1. `as const` - For literal types only
2. `value satisfies T` - Type-checks value without changing its type (safe, unlike `is T`)
3. Builtin narrowing - `typeof`, `Array.isArray`, `in`, `instanceof` are always safe
4. `T extends SomeType` if T is required to have some trait
5. `foo?.bar` - Use `?.` for safe property access
6. When refactoring - Fix ONE type error at a time (type inference changes)

### When Stuck - NEVER Give Up

**IMPORTANT: Every time you encounter a type error, repeat this checklist in your response before attempting a fix.**

When you're stuck and considering `any` or `as`, STOP:

1. **Read the library's documentation** - Most type issues come from misunderstanding the library API
2. **Search GitHub issues** (library repo) - Someone likely faced the same problem
3. Read error message more carefully
4. Use valibot to validate (if the type is unknown at runtime)
5. Ask the user

**`any` and `as` are admitting defeat.** Always use choose another method.
