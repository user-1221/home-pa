/**
 * @fileoverview Devtools state - Svelte 5 Reactive Class
 *
 * Provides development tools for debugging store state.
 */

// ============================================================================
// Devtools State Class
// ============================================================================

/**
 * Devtools state reactive class
 */
class DevtoolsState {
  /** Whether devtools logging is enabled */
  enabled = $state<boolean>(false);

  /**
   * Enable devtools logging
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable devtools logging
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Toggle devtools logging
   */
  toggle(): void {
    this.enabled = !this.enabled;
  }

  /**
   * Log a value if devtools is enabled
   */
  log(name: string, value: unknown): void {
    if (this.enabled) {
      console.debug(`[store:${name}]`, value);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global devtools state instance
 */
export const devtoolsState = new DevtoolsState();

// ============================================================================
// Backwards Compatibility Exports
// ============================================================================

/**
 * @deprecated Use devtoolsState.enabled directly instead
 */
export const devtoolsEnabled = {
  subscribe(callback: (value: boolean) => void) {
    callback(devtoolsState.enabled);
    return () => {};
  },
  set(value: boolean) {
    devtoolsState.enabled = value;
  },
};

/**
 * @deprecated Use devtoolsState methods directly instead
 */
export const devtools = {
  enable(): void {
    devtoolsState.enable();
  },
  disable(): void {
    devtoolsState.disable();
  },
  toggle(): void {
    devtoolsState.toggle();
  },
  /**
   * Log store values when devtools is enabled
   * Note: This legacy method expects a store with subscribe method.
   * For Svelte 5 reactive state, use devtoolsState.log() directly.
   */
  logStore<T>(
    name: string,
    store: { subscribe: (cb: (v: T) => void) => () => void },
  ): void {
    store.subscribe((value) => {
      devtoolsState.log(name, value);
    });
  },
};
