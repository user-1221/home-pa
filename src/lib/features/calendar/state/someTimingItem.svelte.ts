/**
 * @fileoverview Some-Timing Item State - Reactive Class
 *
 * Manages "sometime today" items that don't have a specific time slot.
 * These are flexible reminders/tasks for a given day.
 *
 * @scope singleton
 * @owner src/routes/+layout.svelte
 * @cleanup none - State persists across navigation
 */

import { getContext, setContext } from "svelte";
import {
  loadSomeTimingItems,
  createSomeTimingItem,
  updateSomeTimingItem,
  deleteSomeTimingItem,
  toggleSomeTimingItemComplete,
  type SomeTimingItemData,
} from "./someTimingItem.remote.ts";
import { startOfDay, endOfDay } from "$lib/utils/date-utils.ts";

// Re-export type for external use
export type { SomeTimingItemData };

// ============================================================================
// STATE CLASS
// ============================================================================

/**
 * Some-Timing Item state reactive class
 */
class SomeTimingItemState {
  // ============================================================================
  // Reactive State
  // ============================================================================

  /** All loaded items */
  items = $state<SomeTimingItemData[]>([]);

  /** Loading state */
  isLoading = $state(false);

  /** Error message if any */
  error = $state<string | null>(null);

  /** Currently loaded date range */
  loadedRange = $state<{ start: Date; end: Date } | null>(null);

  // ============================================================================
  // Derived State
  // ============================================================================

  /**
   * Get items for a specific date
   */
  getItemsForDate(date: Date): SomeTimingItemData[] {
    const dayStart = startOfDay(date).getTime();
    const dayEnd = endOfDay(date).getTime();

    return this.items.filter((item) => {
      const itemDate = new Date(item.date).getTime();
      return itemDate >= dayStart && itemDate <= dayEnd;
    });
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Load items for a date range
   */
  async loadForDateRange(start: Date, end: Date): Promise<void> {
    // Skip if already loaded for this range
    if (this.loadedRange) {
      const rangeStart = this.loadedRange.start.getTime();
      const rangeEnd = this.loadedRange.end.getTime();
      if (start.getTime() >= rangeStart && end.getTime() <= rangeEnd) {
        return;
      }
    }

    this.isLoading = true;
    this.error = null;

    try {
      const items = await loadSomeTimingItems({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      this.items = items;
      this.loadedRange = { start, end };
    } catch (err) {
      console.error("[SomeTimingItemState] Failed to load items:", err);
      this.error = err instanceof Error ? err.message : "Failed to load items";
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Reload items for the current date range
   */
  async reload(): Promise<void> {
    if (!this.loadedRange) return;

    // Clear the loaded range to force a reload
    const { start, end } = this.loadedRange;
    this.loadedRange = null;
    await this.loadForDateRange(start, end);
  }

  /**
   * Create a new item
   */
  async create(data: {
    title: string;
    date: string; // YYYY-MM-DD
    description?: string;
    color?: string;
    importance?: "low" | "medium" | "high";
    rrule?: string;
  }): Promise<SomeTimingItemData> {
    try {
      const item = await createSomeTimingItem(data);

      // Add to local state
      this.items = [...this.items, item];

      return item;
    } catch (err) {
      console.error("[SomeTimingItemState] Failed to create item:", err);
      throw err;
    }
  }

  /**
   * Update an existing item
   */
  async update(
    id: string,
    updates: {
      title?: string;
      date?: string;
      description?: string;
      color?: string;
      importance?: "low" | "medium" | "high";
      rrule?: string;
    },
  ): Promise<SomeTimingItemData> {
    try {
      const updatedItem = await updateSomeTimingItem({ id, updates });

      // Update local state
      this.items = this.items.map((item) =>
        item.id === id ? updatedItem : item,
      );

      return updatedItem;
    } catch (err) {
      console.error("[SomeTimingItemState] Failed to update item:", err);
      throw err;
    }
  }

  /**
   * Delete an item
   */
  async delete(id: string): Promise<void> {
    try {
      await deleteSomeTimingItem({ id });

      // Remove from local state
      this.items = this.items.filter((item) => item.id !== id);
    } catch (err) {
      console.error("[SomeTimingItemState] Failed to delete item:", err);
      throw err;
    }
  }

  /**
   * Toggle completion status of an item (server-side toggle)
   */
  async toggleComplete(id: string): Promise<void> {
    try {
      const updatedItem = await toggleSomeTimingItemComplete({ id });

      // Update local state
      this.items = this.items.map((item) =>
        item.id === id ? updatedItem : item,
      );
    } catch (err) {
      console.error("[SomeTimingItemState] Failed to toggle complete:", err);
      throw err;
    }
  }

  /**
   * Remove an item (alias for delete)
   */
  async remove(id: string): Promise<void> {
    await this.delete(id);
  }

  /**
   * Clear all items (used when logging out)
   */
  clear(): void {
    this.items = [];
    this.loadedRange = null;
    this.error = null;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

const SOME_TIMING_ITEM_STATE_KEY = Symbol("some-timing-item-state");

/**
 * Set the some-timing item state in context
 */
export function setSomeTimingItemState(state: SomeTimingItemState): void {
  setContext(SOME_TIMING_ITEM_STATE_KEY, state);
}

/**
 * Get the some-timing item state from context
 */
export function getSomeTimingItemState(): SomeTimingItemState {
  const state = getContext<SomeTimingItemState | undefined>(
    SOME_TIMING_ITEM_STATE_KEY,
  );
  if (!state) {
    throw new Error("SomeTimingItemState not found in context.");
  }
  return state;
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

/**
 * Global some-timing item state instance
 */
export const someTimingItemState = new SomeTimingItemState();
