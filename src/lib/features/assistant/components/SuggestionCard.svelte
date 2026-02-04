<script lang="ts">
  import { onMount } from "svelte";
  import Button from "$lib/features/shared/components/Button.svelte";

  // Common fields for both pending and accepted suggestions
  interface SuggestionDisplay {
    startTime: string;
    endTime: string;
    duration: number;
  }

  interface Props {
    suggestion: SuggestionDisplay;
    taskTitle: string;
    isAccepted: boolean;
    position?: { x: number; y: number };
    /** Maximum allowed duration in minutes (for constraint feedback) */
    maxDuration?: number;
    onAccept?: () => void;
    onSkip?: () => void;
    onDelete?: () => void;
    onClose?: () => void;
    /** Called when user changes duration (accepted suggestions only) */
    onDurationChange?: (newDuration: number) => void;
  }

  let {
    suggestion,
    taskTitle,
    isAccepted,
    position = { x: 0, y: 0 },
    maxDuration,
    onAccept,
    onSkip,
    onDelete,
    onClose,
    onDurationChange,
  }: Props = $props();

  // Local state for duration slider
  let sliderDuration = $state(suggestion.duration);
  let isDraggingSlider = $state(false);

  // Min/max duration constraints
  const MIN_DURATION = 5;
  const effectiveMaxDuration = $derived(maxDuration ?? 180); // Default 3 hours max

  // Update slider when suggestion changes
  // Safety null check: suggestion may become stale during regeneration
  $effect(() => {
    if (!isDraggingSlider && suggestion) {
      sliderDuration = suggestion.duration;
    }
  });

  function handleSliderChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = Math.round(Number(target.value) / 5) * 5; // Snap to 5-min increments
    sliderDuration = newValue;
  }

  function handleSliderCommit() {
    isDraggingSlider = false;
    if (sliderDuration !== suggestion.duration) {
      onDurationChange?.(sliderDuration);
    }
  }

  function handleSliderStart() {
    isDraggingSlider = true;
  }

  function formatDuration(minutes: number): string {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes}m`;
  }

  let cardElement: HTMLDivElement | null = null;
  let adjustedPosition = $state({ x: position.x, y: position.y });

  // Adjust position to keep card within viewport
  onMount(() => {
    if (!cardElement) return;

    const rect = cardElement.getBoundingClientRect();
    const navHeight = 80; // --bottom-nav-height
    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = position.x;
    let newY = position.y;

    // Adjust horizontal position
    if (newX + rect.width > viewportWidth - padding) {
      newX = viewportWidth - rect.width - padding;
    }
    if (newX < padding) {
      newX = padding;
    }

    // Adjust vertical position (account for bottom nav)
    if (newY + rect.height > viewportHeight - navHeight - padding) {
      newY = viewportHeight - navHeight - padding - rect.height;
    }
    if (newY < padding) {
      newY = padding;
    }

    adjustedPosition = { x: newX, y: newY };
  });

  function handleAccept() {
    onAccept?.();
    onClose?.();
  }

  function handleSkip() {
    onSkip?.();
    onClose?.();
  }

  function handleDelete() {
    onDelete?.();
    onClose?.();
  }
</script>

<div
  bind:this={cardElement}
  class="fixed max-w-[300px] min-w-[240px] animate-[cardAppear_0.3s_ease] rounded-xl border border-base-300 bg-base-100 p-4 shadow-lg"
  class:border-success={isAccepted}
  class:shadow-xl={isAccepted}
  style="left: {adjustedPosition.x}px; top: {adjustedPosition.y}px; z-index: 1000;"
  role="dialog"
  aria-label="Suggestion details"
>
  <div class="mb-2 flex items-start justify-between">
    <h4 class="flex-1 pr-2 text-base font-normal text-base-content">
      {taskTitle}
    </h4>
    <Button
      variant="ghost"
      size="sm"
      class="h-7 min-h-7 w-7 p-0"
      onclick={onClose}
      aria-label="Close"
    >
      ×
    </Button>
  </div>

  <div class="mb-4">
    <div
      class="mb-2 flex items-center justify-between rounded-lg bg-base-200 p-2"
    >
      <span class="text-sm text-base-content"
        >{suggestion.startTime} - {suggestion.endTime}</span
      >
      <span class="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
        >{isDraggingSlider ? sliderDuration : suggestion.duration}分</span
      >
    </div>

    {#if isAccepted}
      <!-- Duration adjustment slider for accepted suggestions -->
      <div class="mb-3">
        <div
          class="mb-1 flex items-center justify-between text-xs text-[var(--color-text-secondary)]"
        >
          <span>時間調整</span>
          <span class="text-primary">
            {formatDuration(sliderDuration)}
            {#if effectiveMaxDuration < 180}
              <span class="text-[var(--color-text-muted)]">
                (最大 {formatDuration(effectiveMaxDuration)})
              </span>
            {/if}
          </span>
        </div>
        <input
          type="range"
          min={MIN_DURATION}
          max={effectiveMaxDuration}
          step="5"
          value={sliderDuration}
          class="range w-full range-primary range-sm"
          oninput={handleSliderChange}
          onmousedown={handleSliderStart}
          ontouchstart={handleSliderStart}
          onmouseup={handleSliderCommit}
          ontouchend={handleSliderCommit}
          onchange={handleSliderCommit}
        />
        <div
          class="mt-1 flex justify-between text-[10px] text-[var(--color-text-muted)]"
        >
          <span>{MIN_DURATION}m</span>
          <span>{formatDuration(effectiveMaxDuration)}</span>
        </div>
      </div>

      <span
        class="inline-block rounded-full bg-success/10 px-3 py-1 text-xs text-success"
        >承認済み</span
      >
    {:else}
      <span
        class="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
        >提案中</span
      >
    {/if}
  </div>

  <div class="flex gap-2">
    {#if isAccepted}
      <Button variant="danger" fullWidth onclick={handleDelete}>削除</Button>
    {:else}
      <Button variant="success" fullWidth onclick={handleAccept}>承認</Button>
      <Button variant="secondary" fullWidth onclick={handleSkip}>
        スキップ
      </Button>
    {/if}
  </div>
</div>
