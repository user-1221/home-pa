/**
 * @fileoverview UI Actions
 *
 * Contains initialization and business logic for UI state.
 * Navigation is handled via SvelteKit path-based routing.
 */

import { dataState } from "./data.svelte.ts";
import { uiState } from "./ui.svelte.ts";

export const uiActions = {
  setViewMode(mode: "day" | "list"): void {
    uiState.setViewMode(mode);
  },

  setSelectedDate(date: Date): void {
    dataState.setSelectedDate(date);
  },

  navigateDate(days: number): void {
    const currentDate = new Date(dataState.selectedDate);
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    this.setSelectedDate(newDate);
  },

  navigateToToday(): void {
    this.setSelectedDate(new Date());
  },

  setLoading(loading: boolean): void {
    uiState.setLoading(loading);
  },

  setError(message: string | null): void {
    uiState.setError(message);
  },

  clearError(): void {
    uiState.clearError();
  },

  initialize(): void {
    this.setSelectedDate(new Date());
  },
};
