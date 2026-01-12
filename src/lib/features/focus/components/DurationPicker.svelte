<script lang="ts">
  /**
   * DurationPicker Component
   *
   * Shows quick preset buttons (25%, 50%, 75%, 100%) for selecting
   * how much of the planned duration the user actually worked.
   *
   * Used for past accepted suggestions when marking complete.
   */

  interface Props {
    plannedDuration: number; // minutes
    onSelect: (minutes: number) => void;
  }

  let { plannedDuration, onSelect }: Props = $props();

  // Preset percentages
  const presets = [
    { label: "25%", factor: 0.25 },
    { label: "50%", factor: 0.5 },
    { label: "75%", factor: 0.75 },
    { label: "100%", factor: 1 },
  ] as const;

  function calculateMinutes(factor: number): number {
    return Math.round(plannedDuration * factor);
  }

  function handleSelect(factor: number) {
    onSelect(calculateMinutes(factor));
  }
</script>

<div class="flex flex-col gap-2">
  <p class="text-xs text-[var(--color-text-secondary)]">実際の作業時間は？</p>
  <div class="flex flex-wrap gap-2">
    {#each presets as { label, factor } (label)}
      <button
        class="flex h-9 min-w-[60px] items-center justify-center rounded-lg border border-base-300 bg-base-100 px-3 text-sm font-medium transition-all duration-200 hover:border-success hover:bg-success/10 hover:text-success active:scale-95"
        onclick={() => handleSelect(factor)}
        title="{calculateMinutes(factor)}分"
      >
        <span>{label}</span>
        <span class="ml-1 text-xs text-[var(--color-text-muted)]">
          ({calculateMinutes(factor)}分)
        </span>
      </button>
    {/each}
  </div>
</div>
