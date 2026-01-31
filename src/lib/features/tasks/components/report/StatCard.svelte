<script lang="ts">
  /**
   * StatCard - Individual statistic display card
   *
   * Shows a label, value, and optional sub-info in a clean card format.
   */

  interface Props {
    label: string;
    value: string | number;
    subInfo?: string;
  }

  let { label, value, subInfo }: Props = $props();
</script>

<div
  class="flex flex-col rounded-xl border border-base-300/50 bg-base-100 p-4 shadow-sm"
>
  <span class="text-xs text-base-content/60">{label}</span>
  <span class="mt-1 text-2xl font-semibold tracking-tight text-base-content">
    {value}
  </span>
  {#if subInfo}
    <span class="mt-1 text-xs text-base-content/50">{subInfo}</span>
  {/if}
</div>
