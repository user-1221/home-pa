<script lang="ts">
  /**
   * StationInput - Autocomplete component for Japanese station selection.
   * Uses NAVITIME searchStations API via remote functions.
   * Validates that the selected station exists in the API.
   */
  import { searchStations } from "$lib/features/transit/services/index.ts";
  import type { TransportNode } from "$lib/features/transit/services/transit-api.remote.ts";
  import type { StationProfile } from "$lib/features/utilities/state/profile.svelte.ts";

  interface Props {
    /** Input label */
    label?: string;
    /** Placeholder text */
    placeholder?: string;
    /** Selected station (bindable) */
    selectedStation?: StationProfile | null;
    /** External error message */
    error?: string;
  }

  let {
    label,
    placeholder = "駅名を入力",
    selectedStation = $bindable<StationProfile | null>(null),
    error: externalError,
  }: Props = $props();

  // Internal state
  let searchQuery = $state(selectedStation?.name ?? "");
  let results = $state<TransportNode[]>([]);
  let isSearching = $state(false);
  let showDropdown = $state(false);
  let internalError = $state<string | undefined>(undefined);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let hasSelectedFromDropdown = $state(!!selectedStation);
  let inputElement: HTMLInputElement | undefined = $state();

  const inputId = `station-${Math.random().toString(36).slice(2, 9)}`;
  const displayError = $derived(externalError ?? internalError);

  // Sync searchQuery when selectedStation changes externally
  $effect(() => {
    if (selectedStation) {
      searchQuery = selectedStation.name;
      hasSelectedFromDropdown = true;
    }
  });

  async function search(query: string): Promise<void> {
    if (query.length < 1) {
      results = [];
      showDropdown = false;
      return;
    }

    isSearching = true;
    try {
      const result = await searchStations({ word: query, limit: 5 });
      results = result.items ?? [];
      showDropdown = results.length > 0;

      if (results.length === 0 && query.length > 0) {
        internalError = "駅が見つかりません";
      } else {
        internalError = undefined;
      }
    } catch (err) {
      console.error("[StationInput] Search failed:", err);
      internalError = "検索に失敗しました";
      results = [];
      showDropdown = false;
    } finally {
      isSearching = false;
    }
  }

  function handleInput(): void {
    hasSelectedFromDropdown = false;
    selectedStation = null;
    internalError = undefined;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      search(searchQuery);
    }, 300);
  }

  function handleSelect(station: TransportNode): void {
    selectedStation = {
      id: station.id,
      name: station.name,
      coord: station.coord,
    };
    searchQuery = station.name;
    hasSelectedFromDropdown = true;
    showDropdown = false;
    internalError = undefined;
    results = [];
  }

  function handleBlur(): void {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      showDropdown = false;

      if (searchQuery && !hasSelectedFromDropdown) {
        internalError = "候補から駅を選択してください";
      }
    }, 200);
  }

  function handleFocus(): void {
    if (results.length > 0 && !hasSelectedFromDropdown) {
      showDropdown = true;
    }
  }

  function handleClear(): void {
    searchQuery = "";
    selectedStation = null;
    hasSelectedFromDropdown = false;
    results = [];
    showDropdown = false;
    internalError = undefined;
    inputElement?.focus();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      showDropdown = false;
    }
  }

  // Base input classes (matching TextInput)
  const baseClasses =
    "w-full rounded-lg border bg-base-100 px-3 py-2 text-sm transition-all duration-200 placeholder:text-base-content/40 focus:outline-none";

  const stateClasses = $derived(() => {
    if (displayError) {
      return "border-[var(--color-error-500)] bg-[var(--color-error-100)]/30 focus:border-[var(--color-error-500)] focus:ring-2 focus:ring-[var(--color-error-500)]/20";
    }
    return "border-base-300 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20";
  });

  const combinedClasses = $derived(
    [baseClasses, stateClasses()].filter(Boolean).join(" "),
  );
</script>

<div class="relative flex flex-col gap-1">
  {#if label}
    <label for={inputId} class="text-xs font-medium text-base-content/70">
      {label}
    </label>
  {/if}

  <div class="relative">
    <input
      id={inputId}
      bind:this={inputElement}
      bind:value={searchQuery}
      oninput={handleInput}
      onblur={handleBlur}
      onfocus={handleFocus}
      onkeydown={handleKeydown}
      class={combinedClasses}
      {placeholder}
      type="text"
      autocomplete="off"
      role="combobox"
      aria-expanded={showDropdown}
      aria-controls="{inputId}-listbox"
      aria-invalid={displayError ? "true" : undefined}
      aria-describedby={displayError ? `${inputId}-error` : undefined}
    />

    {#if searchQuery}
      <button
        type="button"
        class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-base-content/40 transition-colors hover:text-base-content/70"
        onclick={handleClear}
        aria-label="クリア"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    {/if}

    {#if isSearching}
      <div class="absolute top-1/2 right-2 -translate-y-1/2" aria-hidden="true">
        <span class="loading loading-xs loading-spinner text-base-content/40"
        ></span>
      </div>
    {/if}
  </div>

  {#if showDropdown}
    <ul
      id="{inputId}-listbox"
      role="listbox"
      class="absolute top-full z-50 mt-1 max-h-[200px] w-full overflow-auto rounded-lg border border-base-300 bg-base-100 shadow-lg"
    >
      {#each results as station (station.id)}
        <li role="option" aria-selected="false">
          <button
            type="button"
            class="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-50)]"
            onmousedown={(e: MouseEvent) => {
              e.preventDefault();
              handleSelect(station);
            }}
          >
            <div class="flex flex-col">
              <span class="font-medium text-base-content">
                {station.name}
              </span>
              {#if station.ruby}
                <span class="text-xs text-base-content/50">
                  {station.ruby}
                </span>
              {/if}
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if displayError}
    <p
      id="{inputId}-error"
      class="text-xs text-[var(--color-error-500)]"
      role="alert"
    >
      {displayError}
    </p>
  {/if}
</div>
