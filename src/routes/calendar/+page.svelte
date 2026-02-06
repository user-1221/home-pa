<script lang="ts">
  import CalendarTabView from "$lib/features/calendar/components/CalendarTabView.svelte";
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import ModalContainer from "$lib/features/shared/components/ModalContainer.svelte";
  import ModalSkeletonContent from "$lib/features/shared/components/skeletons/ModalSkeletonContent.svelte";
  import { eventFormState } from "$lib/bootstrap/compat.svelte.ts";
  import { toastState } from "$lib/bootstrap/toast.svelte.ts";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  // Handle Google OAuth callback query params (one-time on mount)
  onMount(() => {
    const googleError = page.url.searchParams.get("google_error");
    const googleConnected = page.url.searchParams.get("google_connected");

    if (googleConnected) {
      toastState.success("Google Calendar connected");
      goto("/calendar", { replaceState: true });
    } else if (googleError) {
      const messages: Record<string, string> = {
        denied: "Google Calendar access was denied",
        missing_code: "OAuth authorization failed",
        state_mismatch: "Security validation failed. Please try again.",
        missing_tokens: "Failed to get access tokens",
        exchange_failed: "Failed to connect Google Calendar",
      };
      toastState.error(messages[googleError] ?? "Google Calendar error");
      goto("/calendar", { replaceState: true });
    }
  });
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
