<script lang="ts">
  import CalendarTabView from "$lib/features/calendar/components/CalendarTabView.svelte";
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import ModalContainer from "$lib/features/shared/components/ModalContainer.svelte";
  import ModalSkeletonContent from "$lib/features/shared/components/skeletons/ModalSkeletonContent.svelte";
  import { eventFormState } from "$lib/bootstrap/compat.svelte.ts";
</script>

<CalendarTabView />

<!-- Event Form Modal (lazy-loaded with stable container to prevent re-animation) -->
{#if eventFormState.isOpen}
  <ModalContainer fullscreenMobile onClose={() => eventFormState.close()}>
    <LazyLoad
      loader={() =>
        import("$lib/features/calendar/components/EventForm.svelte")}
      props={{ contentOnly: true }}
    >
      <ModalSkeletonContent rows={6} />
    </LazyLoad>
  </ModalContainer>
{/if}
