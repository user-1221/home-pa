<script lang="ts">
  /**
   * AssistantPageSkeleton Component
   *
   * Skeleton placeholder for PersonalAssistantView.
   * Shows a circular timeline placeholder and info panel skeleton.
   */

  import Skeleton from "../Skeleton.svelte";
</script>

<div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-base-100">
  <!-- Main content area -->
  <div class="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
    <!-- Circular timeline placeholder -->
    <div class="relative mb-6">
      <!-- Outer ring -->
      <div
        class="flex h-72 w-72 items-center justify-center rounded-full border-4 border-base-300 md:h-80 md:w-80"
      >
        <!-- Inner content -->
        <div class="flex flex-col items-center gap-2">
          <Skeleton variant="text" width="80px" height="14px" />
          <Skeleton variant="text" width="120px" height="32px" />
          <Skeleton variant="text" width="60px" height="12px" />
        </div>
      </div>

      <!-- Time markers around the circle (decorative skeleton dots) -->
      {#each Array(12) as _, i (i)}
        <div
          class="absolute h-2 w-2 rounded-full bg-base-300"
          style="
            top: {50 - 45 * Math.cos((i * 30 * Math.PI) / 180)}%;
            left: {50 + 45 * Math.sin((i * 30 * Math.PI) / 180)}%;
            transform: translate(-50%, -50%);
          "
        ></div>
      {/each}
    </div>

    <!-- Info panel skeleton -->
    <div class="w-full max-w-md space-y-3 px-4">
      <!-- Date header -->
      <div class="flex items-center justify-between">
        <Skeleton variant="text" width="100px" height="20px" />
        <Skeleton variant="text" width="60px" height="16px" />
      </div>

      <!-- Info rows -->
      {#each Array(3) as _, i (i)}
        <div
          class="flex items-center justify-between rounded-lg bg-base-200/50 p-3"
        >
          <div class="flex items-center gap-3">
            <Skeleton variant="circle" width="32px" height="32px" />
            <div class="flex flex-col gap-1">
              <Skeleton variant="text" width="120px" height="14px" />
              <Skeleton variant="text" width="80px" height="12px" />
            </div>
          </div>
          <Skeleton variant="text" width="50px" height="14px" />
        </div>
      {/each}
    </div>
  </div>

  <!-- Loading indicator -->
  <div class="flex items-center justify-center pb-4">
    <span class="loading loading-sm loading-spinner text-primary"></span>
    <span class="ml-2 text-sm text-base-content/60">Loading...</span>
  </div>
</div>
