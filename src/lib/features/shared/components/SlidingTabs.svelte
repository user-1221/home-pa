<script lang="ts">
  /**
   * SlidingTabs Component
   *
   * A segmented control with a sliding indicator that smoothly
   * animates between tabs when selection changes.
   */

  interface Tab {
    id: string;
    label: string;
    badge?: string | number;
    icon?: import("svelte").Snippet;
  }

  interface Props {
    tabs: Tab[];
    selected: string;
    onSelect?: (id: string) => void;
  }

  const { tabs, selected, onSelect }: Props = $props();

  const selectedIndex = $derived(tabs.findIndex((t) => t.id === selected));
</script>

<div
  role="tablist"
  class="relative flex flex-shrink-0 rounded-xl bg-base-200/50 p-1"
>
  <!-- Sliding indicator -->
  <div
    class="absolute top-1 left-1 h-[calc(100%-8px)] rounded-lg bg-[var(--color-primary)] shadow-md transition-transform duration-300 ease-out"
    style="width: calc({100 /
      tabs.length}% - 4px); transform: translateX(calc({selectedIndex} * (100% + {8 /
      tabs.length}px)))"
  ></div>

  {#each tabs as tab (tab.id)}
    <button
      role="tab"
      class="relative z-10 flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200
        {selected === tab.id ? 'text-white' : 'text-base-content/60'}"
      onclick={() => onSelect?.(tab.id)}
      aria-selected={selected === tab.id}
    >
      {tab.label}
      {#if tab.badge !== undefined}
        <span
          class="rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-200
          {selected === tab.id
            ? 'bg-white/20 text-white'
            : 'bg-base-300/50 text-base-content/60'}"
        >
          {tab.badge}
        </span>
      {/if}
      {#if tab.icon}
        {@render tab.icon()}
      {/if}
    </button>
  {/each}
</div>
