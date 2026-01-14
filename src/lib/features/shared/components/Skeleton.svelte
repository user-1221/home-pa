<script lang="ts">
  /**
   * Skeleton loader component for loading states.
   * Provides visual feedback while content is being fetched.
   */

  type SkeletonVariant = "card" | "text" | "circle";

  interface Props {
    /** Skeleton shape variant */
    variant?: SkeletonVariant;
    /** Custom width (CSS value) */
    width?: string;
    /** Custom height (CSS value) */
    height?: string;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    variant = "text",
    width,
    height,
    class: className = "",
  }: Props = $props();

  // Default dimensions per variant
  const defaults: Record<SkeletonVariant, { w: string; h: string }> = {
    card: { w: "100%", h: "120px" },
    text: { w: "100%", h: "16px" },
    circle: { w: "40px", h: "40px" },
  };

  const resolvedWidth = width ?? defaults[variant].w;
  const resolvedHeight = height ?? defaults[variant].h;
</script>

<div
  class="skeleton-loader {variant} {className}"
  style:width={resolvedWidth}
  style:height={resolvedHeight}
  aria-hidden="true"
>
  {#if variant === "card"}
    <!-- Card skeleton with internal structure -->
    <div class="skeleton-card-content">
      <div class="skeleton-line title"></div>
      <div class="skeleton-line subtitle"></div>
      <div class="skeleton-line short"></div>
    </div>
  {/if}
</div>

<style>
  .skeleton-loader {
    background: var(--color-bg-surface);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .skeleton-loader.text {
    border-radius: var(--radius-xs);
  }

  .skeleton-loader.circle {
    border-radius: 9999px;
  }

  .skeleton-loader.card {
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
  }

  .skeleton-card-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .skeleton-line {
    background: var(--color-border-default);
    border-radius: var(--radius-xs);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .skeleton-line.title {
    width: 60%;
    height: 18px;
  }

  .skeleton-line.subtitle {
    width: 80%;
    height: 14px;
    animation-delay: 0.1s;
  }

  .skeleton-line.short {
    width: 40%;
    height: 12px;
    animation-delay: 0.2s;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-loader,
    .skeleton-line {
      animation: none;
      opacity: 0.7;
    }
  }
</style>
