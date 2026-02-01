/**
 * CalendarVisibilityState manages which calendars are visible in the app.
 * Controls filtering for both timeline displays and gap calculations (affecting suggestions).
 *
 * @scope singleton
 * @owner src/routes/+layout.svelte (via bootstrap)
 * @cleanup none - State persists across navigation
 */
export class CalendarVisibilityState {
  /** Set of hidden Google Calendar IDs (empty = all visible) */
  hiddenCalendars = $state<Set<string>>(new Set());

  /** Whether local (non-Google) events are visible */
  showLocalEvents = $state(true);

  /**
   * Toggle visibility for a specific Google Calendar
   */
  toggleCalendar(calendarId: string): void {
    const newSet = new Set(this.hiddenCalendars);
    if (newSet.has(calendarId)) {
      newSet.delete(calendarId); // Show
    } else {
      newSet.add(calendarId); // Hide
    }
    this.hiddenCalendars = newSet;
  }

  /**
   * Toggle local events visibility
   */
  toggleLocalEvents(): void {
    this.showLocalEvents = !this.showLocalEvents;
  }

  /**
   * Check if an event should be visible based on current settings
   */
  isEventVisible(event: { calendarId?: string | null }): boolean {
    if (event.calendarId) {
      // Google synced event - visible if NOT in hidden set
      return !this.hiddenCalendars.has(event.calendarId);
    } else {
      // Local event - use local events toggle
      return this.showLocalEvents;
    }
  }

  /**
   * Show all calendars (reset to default)
   */
  showAll(): void {
    this.hiddenCalendars = new Set();
    this.showLocalEvents = true;
  }
}

// Singleton instance
export const calendarVisibilityState = new CalendarVisibilityState();
