<script lang="ts">
  /**
   * SlidingSelector Component
   *
   * A segmented control with a sliding indicator that smoothly
   * animates between options when selection changes.
   * Similar to SlidingTabs but for general option selection.
   */

  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    options: Option[];
    selected: string;
    onSelect?: (value: string) => void;
    class?: string;
  }

  const {
    options,
    selected,
    onSelect,
    class: className = "",
  }: Props = $props();

  const selectedIndex = $derived(
    options.findIndex((o) => o.value === selected),
  );
</script>

<div
  role="group"
  class="relative flex flex-shrink-0 rounded-md bg-base-200/50 p-1 {className}"
>
  <!-- Sliding indicator -->
  <div
    class="absolute top-1 left-1 h-[calc(100%-8px)] rounded-sm bg-[var(--color-primary)] shadow-md transition-transform duration-300 ease-out"
    style="width: calc({100 /
      options.length}% - 4px); transform: translateX(calc({selectedIndex} * (100% + {8 /
      options.length}px)))"
  ></div>

  {#each options as option (option.value)}
    <button
      type="button"
      class="relative z-10 flex flex-1 items-center justify-center rounded-sm px-3 py-2.5 text-sm font-medium transition-colors duration-200
        {selected === option.value ? 'text-white' : 'text-base-content/70'}"
      onclick={() => onSelect?.(option.value)}
      aria-pressed={selected === option.value}
    >
      {option.label}
    </button>
  {/each}
</div>
