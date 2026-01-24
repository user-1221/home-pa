<script lang="ts">
  /**
   * ModalContainer Component
   *
   * Provides a stable modal wrapper for lazy-loaded content.
   * The modal structure (including animation) stays constant while
   * content inside can be swapped without re-triggering animation.
   *
   * @scope form
   * @owner Parent component that controls modal visibility
   * @cleanup Unmounts when parent conditionally removes it
   */

  import type { Snippet } from "svelte";

  interface Props {
    /** Whether to use fullscreen mobile style with slide-up animation */
    fullscreenMobile?: boolean;
    /** Z-index for the modal */
    zIndex?: number;
    /** Maximum width of the modal box */
    maxWidth?: string;
    /** Callback when escape key is pressed or backdrop is clicked */
    onClose?: () => void;
    /** Modal content */
    children: Snippet;
  }

  let {
    fullscreenMobile = false,
    zIndex = 2100,
    maxWidth = "500px",
    onClose,
    children,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose?.();
    }
  }
</script>

<div
  class="modal-open modal md:modal-middle {fullscreenMobile
    ? 'modal-mobile-fullscreen'
    : ''}"
  style="z-index: {zIndex};"
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="modal-box overflow-hidden p-0 {fullscreenMobile
      ? 'h-full w-full rounded-none border-none bg-base-100 shadow-none md:h-auto md:max-h-[90vh] md:overflow-y-auto md:rounded-2xl md:border md:border-base-300/50 md:shadow-xl'
      : ''}"
    style="max-width: {maxWidth};"
    onclick={(e: MouseEvent) => e.stopPropagation()}
    onkeydown={handleKeydown}
  >
    {@render children()}
  </div>
  <div class="modal-backdrop bg-black/40 backdrop-blur-sm"></div>
</div>
