/**
 * @fileoverview UI State - Reactive Class
 *
 * Manages minimal global UI state.
 * Feature-specific UI state (modals, panels) should be managed locally.
 *
 * Migrated from writable stores to Svelte 5 reactive class ($state).
 */

import type { ViewMode } from "../types.ts";

class UIState {
  /** Calendar view mode (day, week, month, list) */
  viewMode = $state<ViewMode>("day");

  /** Global loading state */
  isLoading = $state(false);

  /** Global error message */
  errorMessage = $state<string | null>(null);

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
  }

  setError(message: string | null): void {
    this.errorMessage = message;
  }

  clearError(): void {
    this.errorMessage = null;
  }

  reset(): void {
    this.viewMode = "day";
    this.isLoading = false;
    this.errorMessage = null;
  }
}

export const uiState = new UIState();
