<script lang="ts" module>
  // Module-level cache (not reactive, intentional)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, svelte/prefer-svelte-reactivity
  const componentCache = new Map<string, any>();
</script>

<script lang="ts">
  /**
   * LazyLoad Component
   *
   * Generic wrapper for lazy-loading Svelte components with a skeleton placeholder.
   * Shows the skeleton while the component is loading, then renders the loaded component.
   * Components are cached after first load to prevent skeleton flash on tab switches.
   */

  import type { Snippet, Component } from "svelte";

  interface Props {
    /** Dynamic import function that returns the component module */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader: () => Promise<{ default: any }>;
    /** Props to pass to the loaded component */
    props?: Record<string, unknown>;
    /** Skeleton placeholder to show while loading */
    children?: Snippet;
    /** Cache key - defaults to loader.toString() */
    cacheKey?: string;
  }

  let { loader, props = {}, children, cacheKey }: Props = $props();

  // Derive the cache key from the loader function if not provided
  const key = $derived(cacheKey ?? loader.toString());

  // Track the loaded component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let LoadedComponent = $state<Component<any> | null>(null);
  let loadError = $state(false);

  // Load the component (with caching)
  $effect(() => {
    // Check cache first
    const cached = componentCache.get(key);
    if (cached) {
      LoadedComponent = cached;
      return;
    }

    // Not cached, load it
    LoadedComponent = null;
    loadError = false;

    loader()
      .then((module) => {
        componentCache.set(key, module.default);
        LoadedComponent = module.default;
      })
      .catch(() => {
        loadError = true;
      });
  });
</script>

{#if loadError}
  <div class="flex items-center justify-center p-8 text-error">
    <span>Failed to load component</span>
  </div>
{:else if LoadedComponent}
  <LoadedComponent {...props} />
{:else if children}
  {@render children()}
{:else}
  <!-- Default loading state if no skeleton provided -->
  <div class="flex items-center justify-center p-8">
    <span class="loading loading-md loading-spinner text-primary"></span>
  </div>
{/if}
