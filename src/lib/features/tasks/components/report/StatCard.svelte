<script lang="ts">
  /**
   * StatCard - Individual statistic display card using DaisyUI stat component
   *
   * Shows a label, value, and optional sub-info with DaisyUI styling.
   */
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    value: string | number;
    subInfo?: string;
    valueColor?: "primary" | "secondary" | "error" | "success";
    icon?: Snippet;
  }

  let { label, value, subInfo, valueColor, icon }: Props = $props();

  // Build value class dynamically
  const valueClass = $derived(
    valueColor ? `stat-value text-${valueColor}` : "stat-value",
  );
</script>

<div class="stat">
  {#if icon}
    <div class="stat-figure text-base-content/40">
      {@render icon()}
    </div>
  {/if}
  <div class="stat-title">{label}</div>
  <div class={valueClass}>{value}</div>
  {#if subInfo}
    <div class="stat-desc">{subInfo}</div>
  {/if}
</div>
