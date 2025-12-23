<script lang="ts">
  import { toastState } from "$lib/bootstrap/index.svelte.ts";
  import { fly } from "svelte/transition";
</script>

<div
  class="pointer-events-none fixed top-4 right-4 z-[9999] flex flex-col gap-2 sm:top-3 sm:right-3 sm:left-3"
>
  {#each toastState.toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-center justify-end"
      transition:fly={{ y: -20, duration: 300 }}
      role="status"
      aria-live="polite"
    >
      <button
        class="toast-dot"
        onclick={() => toastState.remove(toast.id)}
        aria-label={`${toast.type}: ${toast.message}`}
      >
        <span aria-hidden="true">
          {toast.type === "success" ? "✓" : "✕"}
        </span>
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-dot {
    height: 44px;
    width: 44px;
    min-height: 44px;
    min-width: 44px;
    border: none;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    color: #fff;
    background: var(--color-primary);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    transition:
      transform 120ms ease,
      box-shadow 120ms ease,
      opacity 120ms ease;
  }

  .toast-dot:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.16);
  }

  .toast-dot:active {
    transform: scale(0.98);
  }

  .toast-dot:focus-visible {
    outline: 2px solid var(--color-primary-300, #cde4ff);
    outline-offset: 2px;
  }

  /* State colors */
  :global(.toast-dot)[aria-label^="success"] {
    background: var(--color-success-500, #22c55e);
  }

  :global(.toast-dot)[aria-label^="error"] {
    background: var(--color-error-500, #ef4444);
  }

  :global(.toast-dot)[aria-label^="info"] {
    background: var(--color-primary, #2563eb);
  }
</style>
