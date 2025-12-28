/**
 * @fileoverview Core Data Store - Reactive Class
 *
 * This module provides centralized state management for the personal assistant application.
 * It manages the selected date for calendar/assistant views.
 *
 * Migrated from writable stores to Svelte 5 reactive class ($state).
 */

/**
 * Core data store reactive class
 */
class DataState {
  // ============================================================================
  // Reactive State
  // ============================================================================

  /**
   * Currently selected date
   */
  selectedDate = $state<Date>(new Date());

  // ============================================================================
  // Date Operations
  // ============================================================================

  /**
   * Set the selected date
   */
  setSelectedDate(date: Date): void {
    this.selectedDate = date;
  }

  /**
   * Move to today
   */
  goToToday(): void {
    this.selectedDate = new Date();
  }

  /**
   * Move to the next day
   */
  nextDay(): void {
    const current = this.selectedDate;
    this.selectedDate = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() + 1,
    );
  }

  /**
   * Move to the previous day
   */
  previousDay(): void {
    const current = this.selectedDate;
    this.selectedDate = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate() - 1,
    );
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Reset to initial state
   */
  reset(): void {
    this.selectedDate = new Date();
  }
}

/**
 * Global data state instance
 */
export const dataState = new DataState();
