<script lang="ts">
  /**
   * PixelSprite Component
   *
   * Animates through a series of frame images for pixel art characters.
   * Uses setInterval to cycle through frames when playing.
   */

  interface Props {
    /** Array of image paths for animation frames */
    frames: string[];
    /** Whether animation is playing */
    playing?: boolean;
    /** Frames per second (default: 8) */
    fps?: number;
    /** CSS class for sizing */
    class?: string;
    /** Alt text for accessibility */
    alt?: string;
  }

  let {
    frames,
    playing = true,
    fps = 8,
    class: className = "h-36",
    alt = "Pixel character",
  }: Props = $props();

  let frameIndex = $state(0);

  // Preload all frames to ensure smooth animation
  $effect(() => {
    frames.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  });

  // Animation loop
  $effect(() => {
    if (!playing || frames.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
    }, 1000 / fps);

    return () => clearInterval(interval);
  });

  // Reset to first frame when not playing
  $effect(() => {
    if (!playing) {
      frameIndex = 0;
    }
  });

  let currentFrame = $derived(frames[frameIndex] ?? frames[0] ?? "");
</script>

{#if currentFrame}
  <img
    src={currentFrame}
    {alt}
    class="{className} pixelated w-auto select-none"
    draggable="false"
  />
{:else}
  <!-- Placeholder when no frames -->
  <div
    class="{className} flex items-center justify-center text-base-content/30"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-12 w-12"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  </div>
{/if}

<style>
  .pixelated {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }
</style>
