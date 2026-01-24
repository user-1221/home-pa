<script lang="ts">
  /**
   * ModalSkeletonContent Component
   *
   * Skeleton content for modal dialogs without the modal wrapper.
   * Used with ModalContainer for lazy-loading scenarios where
   * the modal wrapper needs to stay stable while content loads.
   *
   * @see ModalContainer for the wrapper component
   * @see ModalSkeleton for standalone usage (includes wrapper)
   */

  import Skeleton from "../Skeleton.svelte";

  interface Props {
    /** Number of skeleton rows to display */
    rows?: number;
  }

  let { rows = 5 }: Props = $props();
</script>

<!-- Header -->
<div
  class="sticky top-0 z-10 flex min-h-14 flex-shrink-0 items-center justify-between border-b border-base-300 bg-base-100 px-4 md:min-h-16 md:px-5"
>
  <Skeleton variant="circle" width="32px" height="32px" />
  <Skeleton variant="text" width="120px" height="24px" />
  <Skeleton variant="text" width="60px" height="32px" />
</div>

<!-- Content rows -->
<div class="flex-1 overflow-y-auto p-4 md:p-5">
  <div class="space-y-4">
    {#each Array(rows) as _, i (i)}
      <div class="space-y-1.5">
        <Skeleton variant="text" width="60px" height="14px" />
        <Skeleton
          variant="text"
          width={i % 2 === 0 ? "100%" : "80%"}
          height="40px"
        />
      </div>
    {/each}
  </div>
</div>

<!-- Footer buttons -->
<div
  class="hidden flex-shrink-0 items-center justify-end gap-3 border-t border-base-300 bg-base-100 p-4 md:flex md:p-5"
>
  <Skeleton variant="text" width="80px" height="36px" />
  <Skeleton variant="text" width="100px" height="36px" />
</div>
