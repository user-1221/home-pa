<script lang="ts">
  /**
   * ChartPopover - Popover for showing chart segment details
   *
   * Shows on click, positioned near the clicked element.
   * Closes when clicking outside or pressing Escape.
   */
  import type { Snippet } from "svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    children: Snippet;
  }

  let { isOpen, onClose, position, children }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop to catch outside clicks -->
  <button
    class="fixed inset-0 z-40 cursor-default"
    onclick={onClose}
    aria-label="閉じる"
  ></button>

  <!-- Popover content -->
  <div
    class="fixed z-50 min-w-40 rounded-xl border border-base-300/50 bg-base-100 p-3 shadow-lg"
    style="left: {position.x}px; top: {position.y}px; transform: translate(-50%, calc(-100% - 8px));"
    role="dialog"
    aria-modal="true"
  >
    <!-- Arrow pointing down -->
    <div
      class="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-base-100"
      style="filter: drop-shadow(0 1px 1px rgba(0,0,0,0.05));"
    ></div>
    {@render children()}
  </div>
{/if}
