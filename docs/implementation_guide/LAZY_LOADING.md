# Lazy Loading

## Overview

HomePA uses lazy loading to improve initial page load performance. Heavy components (modals, route views) are loaded on-demand with skeleton placeholders shown during loading.

## LazyLoad Component

The `LazyLoad` wrapper handles dynamic imports with caching.

**Location:** `src/lib/features/shared/components/LazyLoad.svelte`

### Props

| Prop       | Type                                    | Default             | Description                              |
| ---------- | --------------------------------------- | ------------------- | ---------------------------------------- |
| `loader`   | `() => Promise<{ default: Component }>` | Required            | Dynamic import function                  |
| `props`    | `Record<string, unknown>`               | `{}`                | Props to pass to the loaded component    |
| `children` | `Snippet`                               | -                   | Skeleton placeholder shown while loading |
| `cacheKey` | `string`                                | `loader.toString()` | Optional custom cache key                |

### Usage

```svelte
<script>
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import ModalSkeleton from "$lib/features/shared/components/skeletons/ModalSkeleton.svelte";

  let showModal = $state(false);
</script>

{#if showModal}
  <LazyLoad
    loader={() => import("./MyModal.svelte")}
    props={{ onClose: () => (showModal = false) }}
  >
    <ModalSkeleton rows={4} />
  </LazyLoad>
{/if}
```

### Caching

Components are cached at the module level after first load. This means:

- **First open:** Skeleton shows briefly while component loads
- **Subsequent opens:** Component renders instantly (no skeleton flash)

The cache persists for the lifetime of the page session.

## Skeleton Components

### ModalSkeleton

Generic skeleton for modal dialogs.

**Location:** `src/lib/features/shared/components/skeletons/ModalSkeleton.svelte`

| Prop               | Type      | Default | Description                   |
| ------------------ | --------- | ------- | ----------------------------- |
| `rows`             | `number`  | `5`     | Number of content rows        |
| `fullscreenMobile` | `boolean` | `false` | Full height on mobile devices |

```svelte
<ModalSkeleton rows={6} fullscreenMobile={true} />
```

### TimetablePopupSkeleton

Specialized skeleton matching TimetablePopup layout (5-column grid).

**Location:** `src/lib/features/shared/components/skeletons/TimetablePopupSkeleton.svelte`

```svelte
<TimetablePopupSkeleton />
```

### AssistantPageSkeleton

Skeleton for PersonalAssistantView with circular timeline placeholder.

**Location:** `src/lib/features/shared/components/skeletons/AssistantPageSkeleton.svelte`

```svelte
<AssistantPageSkeleton />
```

## Currently Lazy-Loaded Components

| Component             | Location               | Trigger           | Bundle Size |
| --------------------- | ---------------------- | ----------------- | ----------- |
| TimetablePopup        | CalendarView.svelte    | Button click      | ~800 lines  |
| TimelinePopup         | CalendarView.svelte    | Date double-click | ~500 lines  |
| EventForm             | calendar/+page.svelte  | Click "+" or edit | ~1500 lines |
| TaskForm              | TaskView.svelte        | Click "add task"  | ~750 lines  |
| PersonalAssistantView | assistant/+page.svelte | Route navigation  | ~650 lines  |

**Total deferred:** ~4200 lines from initial bundle

## Animation Behavior with Lazy Loading

### The Re-Animation Problem

When lazy-loading animated modals (slide-up, fade-in, etc.), the component swap from skeleton to loaded content causes the **animation to replay**. This happens because the entire DOM subtree is replaced with a new element.

**Important:** `animation-fill-mode: forwards` does NOT prevent this because it's a completely new DOM element, not the same element with updated content.

### Solution: Use a Stable Wrapper

For animated modals, use `ModalContainer` to keep the animated wrapper stable while only the content inside changes:

```svelte
<script>
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import ModalContainer from "$lib/features/shared/components/ModalContainer.svelte";
  import ModalSkeletonContent from "$lib/features/shared/components/skeletons/ModalSkeletonContent.svelte";

  let formState = getFormState();
</script>

{#if formState.isOpen}
  <ModalContainer fullscreenMobile onClose={() => formState.close()}>
    <LazyLoad
      loader={() => import("./MyForm.svelte")}
      props={{ contentOnly: true }}
    >
      <ModalSkeletonContent rows={5} />
    </LazyLoad>
  </ModalContainer>
{/if}
```

### Key Components

| Component               | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `ModalContainer`        | Stable animated wrapper that doesn't get replaced |
| `ModalSkeletonContent`  | Skeleton content without modal wrapper            |
| Form with `contentOnly` | Form renders content only, no modal wrapper       |

### How It Works

1. `ModalContainer` provides the modal structure with animation
2. `LazyLoad` swaps content inside: skeleton → loaded form
3. The animated wrapper never gets replaced, so animation runs only once
4. Forms must support `contentOnly` prop to skip their own modal wrapper

### Components Using This Pattern

- `TaskForm` + `TaskView.svelte`
- `EventForm` + `calendar/+page.svelte`

## When to Use Lazy Loading

### Good Candidates

- **Modals:** User expects brief delay when opening
- **Secondary routes:** Skeleton fills navigation gap
- **Complex forms:** Large components with many dependencies
- **Feature-specific views:** Not needed on initial page load

### Poor Candidates

- **Primary route content:** Already code-split by SvelteKit
- **Small components:** Overhead not worth it (<100 lines)
- **Frequently toggled UI:** Constant loading/unloading is jarring
- **Critical path components:** Anything needed immediately on page load

## Creating New Skeletons

When adding a new lazy-loaded component:

1. Create a skeleton that matches the component's layout
2. Use the `Skeleton` component for consistent styling
3. Match key structural elements (headers, grids, lists)
4. Keep it simple - approximate, don't replicate

```svelte
<script lang="ts">
  import Skeleton from "../Skeleton.svelte";
</script>

<div class="modal-open modal">
  <div class="modal-box">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <Skeleton variant="text" width="120px" height="24px" />
      <Skeleton variant="circle" width="32px" height="32px" />
    </div>

    <!-- Content -->
    <Skeleton variant="text" width="100%" height="40px" />
  </div>
</div>
```

## Exports

All lazy loading components are exported from the shared components barrel:

```typescript
import {
  LazyLoad,
  ModalSkeleton,
  TimetablePopupSkeleton,
  AssistantPageSkeleton,
} from "$lib/features/shared/components";
```
