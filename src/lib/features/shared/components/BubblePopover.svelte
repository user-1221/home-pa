<script lang="ts">
  import { tick } from "svelte";
  import type { Snippet } from "svelte";

  interface Props {
    /** The element to anchor the popover to */
    anchor: HTMLElement | null;
    /** Whether the popover is open */
    isOpen: boolean;
    /** Called when the popover should close */
    onClose: () => void;
    /** Popover content */
    children: Snippet;
  }

  let { anchor, isOpen, onClose, children }: Props = $props();

  let popoverEl: HTMLDivElement | undefined = $state();
  let position = $state({ left: 0, top: 0, above: true, arrowLeft: "50%" });

  // Calculate position: initial placement then clamp after render
  $effect(() => {
    if (!isOpen || !anchor) return;

    // Wait for popover to render so we can measure it
    tick().then(() => {
      if (!popoverEl || !anchor) return;

      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popoverEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const padding = 8;
      const gap = 8; // gap between anchor and popover

      // Prefer above, fall back to below
      const above = anchorRect.top > popoverRect.height + gap + padding;
      const top = above
        ? anchorRect.top - gap - popoverRect.height
        : anchorRect.bottom + gap;

      // Center horizontally on anchor, then clamp to viewport
      const anchorCenterX = anchorRect.left + anchorRect.width / 2;
      const halfWidth = popoverRect.width / 2;

      let left = anchorCenterX - halfWidth;

      // Clamp to viewport edges
      if (left < padding) {
        left = padding;
      } else if (left + popoverRect.width > viewportWidth - padding) {
        left = viewportWidth - padding - popoverRect.width;
      }

      // Arrow should point to anchor center relative to the popover left edge
      const arrowX = anchorCenterX - left;
      // Clamp arrow within popover bounds (with some margin)
      const clampedArrowX = Math.max(
        12,
        Math.min(arrowX, popoverRect.width - 12),
      );

      position = {
        left,
        top,
        above,
        arrowLeft: `${clampedArrowX}px`,
      };
    });
  });

  // Close on outside click
  $effect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (
        popoverEl &&
        !popoverEl.contains(e.target as Node) &&
        anchor &&
        !anchor.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    // Delay to avoid closing immediately from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  });

  // Close on Escape
  $effect(() => {
    if (!isOpen) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if isOpen && anchor}
  <div
    bind:this={popoverEl}
    class="fixed z-[2200] animate-[fadeIn_0.15s_ease-out]"
    style="left: {position.left}px; top: {position.top}px;"
    role="dialog"
  >
    <div
      class="relative rounded-xl border border-base-300 bg-base-100 px-3 py-2 shadow-lg"
    >
      <!-- Arrow -->
      <div
        class="absolute h-2.5 w-2.5 rotate-45 border-base-300 bg-base-100 {position.above
          ? 'bottom-[-6px] border-r border-b'
          : 'top-[-6px] border-t border-l'}"
        style="left: {position.arrowLeft}; transform: translateX(-50%) rotate(45deg);"
      ></div>

      {@render children()}
    </div>
  </div>
{/if}

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
