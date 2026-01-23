<script lang="ts">
  import { onDestroy } from "svelte";
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import AssistantPageSkeleton from "$lib/features/shared/components/skeletons/AssistantPageSkeleton.svelte";
  import {
    UnifiedGapState,
    setUnifiedGapState,
    registerUnifiedGapState,
    unregisterUnifiedGapState,
    clearTimetableCache,
    scheduleState,
  } from "$lib/features/assistant/state";

  // Clear stale timetable cache before creating new instance
  // Ensures fresh data after navigation (e.g., user edited timetable on /calendar)
  clearTimetableCache();

  // Instantiate page-scoped state
  const unifiedGapState = new UnifiedGapState();

  // Set context for child components
  setUnifiedGapState(unifiedGapState);

  // Inject into scheduleState (singleton) for gap access
  scheduleState.setUnifiedGapState(unifiedGapState);

  // Register for cross-tree access (e.g., TimetablePopup)
  registerUnifiedGapState(unifiedGapState);

  // Cleanup on page unmount
  onDestroy(() => {
    unifiedGapState.destroy();
    unregisterUnifiedGapState();
  });
</script>

<LazyLoad
  loader={() =>
    import("$lib/features/assistant/components/PersonalAssistantView.svelte")}
>
  <AssistantPageSkeleton />
</LazyLoad>
