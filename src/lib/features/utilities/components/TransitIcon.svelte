<script lang="ts">
  interface Props {
    class?: string;
    style?: string;
  }
  let { class: className = "h-6 w-6", style }: Props = $props();
</script>

<svg
  class={className}
  {style}
  fill="none"
  viewBox="0 0 24 24"
  stroke="currentColor"
  stroke-width="2"
  aria-hidden="true"
>
  <!-- Train front body (square with more padding) -->
  <rect x="4" y="4" width="16" height="16" rx="1.5" />
  <!-- Large front window (rectangular with padding, thinner line) -->
  <rect x="6.5" y="7" width="11" height="7" stroke-width="1.5" />
  <!-- Two headlights (with padding from bottom, thinner line) -->
  <circle cx="8" cy="17" r="1.2" stroke-width="1.5" />
  <circle cx="16" cy="17" r="1.2" stroke-width="1.5" />
</svg>
