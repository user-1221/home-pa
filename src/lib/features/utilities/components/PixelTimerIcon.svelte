<script lang="ts">
  interface Props {
    class?: string;
    style?: string;
  }
  let { class: className = "h-6 w-6", style }: Props = $props();
</script>

<!-- Pixel art style walking figure icon -->
<svg
  class={className}
  {style}
  fill="currentColor"
  viewBox="0 0 16 16"
  aria-hidden="true"
  style:image-rendering="pixelated"
>
  <!-- Simple pixel art character silhouette -->
  <!-- Head -->
  <rect x="6" y="1" width="4" height="4" />
  <!-- Body -->
  <rect x="6" y="5" width="4" height="4" />
  <!-- Left arm -->
  <rect x="4" y="6" width="2" height="3" />
  <!-- Right arm -->
  <rect x="10" y="6" width="2" height="3" />
  <!-- Left leg -->
  <rect x="6" y="9" width="2" height="4" />
  <!-- Right leg -->
  <rect x="8" y="9" width="2" height="4" />
  <!-- Feet -->
  <rect x="5" y="13" width="2" height="2" />
  <rect x="9" y="13" width="2" height="2" />
</svg>
