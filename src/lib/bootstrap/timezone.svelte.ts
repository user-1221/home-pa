/**
 * @fileoverview Timezone state - Svelte 5 Reactive Class
 *
 * Manages the application's timezone settings using Svelte 5 runes.
 */

// ============================================================================
// Timezone State Class
// ============================================================================

/**
 * Timezone state reactive class
 */
class TimezoneState {
  /** Current IANA timezone identifier */
  value = $state<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);

  /**
   * Human-friendly timezone label
   */
  get label(): string {
    return this.value;
  }

  /**
   * Set timezone to a specific value
   */
  set(tz: string): void {
    this.value = tz;
  }

  /**
   * Detect and set timezone from browser
   */
  detect(): void {
    this.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global timezone state instance
 */
export const timezoneState = new TimezoneState();

// ============================================================================
// Backwards Compatibility Exports
// ============================================================================

/**
 * @deprecated Use timezoneState.value directly instead
 * Legacy store for backwards compatibility
 */
export const timezone = {
  subscribe(callback: (value: string) => void) {
    callback(timezoneState.value);
    return () => {};
  },
  set(value: string) {
    timezoneState.value = value;
  },
};

/**
 * @deprecated Use timezoneState methods directly instead
 * Legacy actions object for backwards compatibility
 */
export const timezoneActions = {
  set(tz: string): void {
    timezoneState.set(tz);
  },
  detect(): void {
    timezoneState.detect();
  },
};

/**
 * @deprecated Use timezoneState.label directly instead
 * Legacy derived store for backwards compatibility
 */
export const timezoneLabel = {
  subscribe(callback: (value: string) => void) {
    callback(timezoneState.label);
    return () => {};
  },
};
