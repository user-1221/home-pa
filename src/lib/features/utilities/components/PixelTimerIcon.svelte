<script lang="ts">
  interface Props {
    class?: string;
    style?: string;
  }
  let { class: className = "h-6 w-6", style }: Props = $props();
</script>

<!-- Pixel-art "watch knight" icon (16x16, crisp edges, single-color) -->
<svg
  class={className}
  {style}
  fill="currentColor"
  viewBox="0 0 16 16"
  aria-hidden="true"
  style:image-rendering="pixelated"
  shape-rendering="crispEdges"
>
  <!--
    Design goals:
    - Reads as a medieval guard/knight, not a generic person
    - Helmet slit + cape + grounded sword silhouette
    - 1-bit (single color) for theme consistency
  -->

  <!-- Helmet (top + faceplate) -->
  <rect x="6" y="1" width="4" height="1" />
  <rect x="5" y="2" width="6" height="1" />
  <rect x="5" y="3" width="6" height="2" />
  <!-- Visor slit -->
  <rect x="6" y="4" width="4" height="1" />

  <!-- Torso / armor -->
  <rect x="6" y="5" width="4" height="1" />
  <rect x="5" y="6" width="6" height="2" />

  <!-- Cape (left flowing blocky shape) -->
  <rect x="3" y="5" width="2" height="1" />
  <rect x="2" y="6" width="3" height="1" />
  <rect x="2" y="7" width="3" height="1" />
  <rect x="3" y="8" width="2" height="1" />
  <rect x="4" y="9" width="1" height="2" />

  <!-- Arms -->
  <rect x="4" y="6" width="1" height="2" />
  <rect x="11" y="6" width="1" height="2" />

  <!-- Sword held grounded (right side) -->
  <!-- Handle -->
  <rect x="12" y="8" width="1" height="1" />
  <!-- Guard -->
  <rect x="11" y="9" width="3" height="1" />
  <!-- Blade (down to ground) -->
  <rect x="12" y="10" width="1" height="4" />
  <!-- Tip -->
  <rect x="12" y="14" width="1" height="1" />

  <!-- Legs (slight walking stance) -->
  <rect x="6" y="8" width="2" height="3" />
  <rect x="8" y="8" width="2" height="2" />
  <rect x="9" y="10" width="1" height="1" />

  <!-- Boots -->
  <rect x="5" y="11" width="3" height="1" />
  <rect x="8" y="11" width="3" height="1" />
</svg>
