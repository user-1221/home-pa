<script lang="ts">
  import CalendarTabView from "$lib/features/calendar/components/CalendarTabView.svelte";
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import ModalSkeleton from "$lib/features/shared/components/skeletons/ModalSkeleton.svelte";
  import { eventFormState } from "$lib/bootstrap/compat.svelte.ts";
</script>

<CalendarTabView />

<!-- Event Form Modal (lazy-loaded) - rendered at page level to avoid stacking context issues -->
{#if eventFormState.isOpen}
  <LazyLoad
    loader={() => import("$lib/features/calendar/components/EventForm.svelte")}
  >
    <ModalSkeleton rows={6} fullscreenMobile={true} />
  </LazyLoad>
{/if}
