<script lang="ts">
  /**
   * ModalSkeleton Component
   *
   * Generic skeleton placeholder for modal dialogs.
   * Used while lazy-loading modal components.
   */

  import Skeleton from "../Skeleton.svelte";

  interface Props {
    /** Number of skeleton rows to display */
    rows?: number;
    /** Whether to use fullscreen mobile style */
    fullscreenMobile?: boolean;
  }

  let { rows = 5, fullscreenMobile = false }: Props = $props();
</script>

<div
  class="modal-open modal z-[2100] {fullscreenMobile
    ? 'modal-mobile-fullscreen md:modal-middle'
    : 'modal-middle'}"
>
  <div
    class="modal-box {fullscreenMobile
      ? 'h-full w-full max-w-4xl md:h-auto md:w-11/12'
      : ''}"
  >
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <Skeleton variant="text" width="140px" height="24px" />
      <Skeleton variant="circle" width="32px" height="32px" />
    </div>

    <!-- Content rows -->
    {#each Array(rows) as _, i (i)}
      <div class="mb-3">
        <Skeleton
          variant="text"
          width={i % 2 === 0 ? "100%" : "80%"}
          height="40px"
        />
      </div>
    {/each}

    <!-- Footer buttons -->
    <div class="mt-6 flex justify-end gap-2">
      <Skeleton variant="text" width="80px" height="36px" />
      <Skeleton variant="text" width="100px" height="36px" />
    </div>
  </div>
  <div class="modal-backdrop bg-black/40 backdrop-blur-sm"></div>
</div>
