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
  <path
    stroke-linecap="round"
    stroke-linejoin="round"
    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
  />
</svg>
