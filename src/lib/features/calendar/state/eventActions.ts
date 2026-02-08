/**
 * @fileoverview Event Actions
 *
 * Contains all business logic and operations for event management.
 * This includes CRUD operations, validation, and data transformations.
 *
 * @author Personal Assistant Team
 * @version 2.0.0
 */

import type { Event } from "../../../types.ts";
import { dataState } from "../../../bootstrap/data.svelte.ts";
import { calendarState } from "./calendar.svelte.ts";
import { eventFormState, type EventFormData } from "./eventForm.svelte.ts";
import { toastState } from "../../../bootstrap/toast.svelte.ts";
import {
  utcToLocalDateString,
  localDateTimeStringToUTC,
  createDateOnlyUTC,
} from "../../../utils/date-utils.ts";
import ICAL from "ical.js";
import { saveTemplate } from "./eventTemplate.remote.ts";

/**
 * Event Actions
 * Functions that handle event business logic and operations
 */
export const eventActions = {
  /**
   * Create a new event from the current form data
   */
  async create(): Promise<Event | null> {
    const formData = eventFormState.formData;

    // Clear previous errors
    eventFormState.clearAllErrors();

    // Validate form data
    const validationResult = eventFormState.validate();
    if (!validationResult.isValid) {
      return null;
    }

    try {
      // Set submitting state
      eventFormState.setSubmitting(true);

      // Create UTC dates for storage based on time label
      const { startDate, endDate } = createEventDates(formData);

      // Debug: verify storage vs input
      console.debug("[eventActions.create] form inputs", {
        startInput: formData.start,
        endInput: formData.end,
        timeLabel: formData.timeLabel,
      });
      console.debug("[eventActions.create] computed UTC dates", {
        startISO: startDate.toISOString(),
        endISO: endDate.toISOString(),
        startMs: startDate.getTime(),
        endMs: endDate.getTime(),
      });

      // Create the event via API
      const newEvent = await calendarState.createEvent({
        title: formData.title.trim(),
        start: startDate,
        end: endDate,
        description: formData.description?.trim() || undefined,
        address: formData.address?.trim() || undefined,
        importance: formData.importance || "medium",
        timeLabel: formData.timeLabel || "all-day",
        color: formData.color,
        recurrence: formData.recurrence,
      });

      if (!newEvent) {
        throw new Error("Failed to create event");
      }

      // Save template for future suggestions (fire and forget)
      saveEventTemplate(formData).catch((err) => {
        console.warn("[eventActions.create] Failed to save template:", err);
      });

      // Reset form and hide it
      eventFormState.reset();
      eventFormState.close();

      // Show success message
      toastState.success("Event created successfully");

      return newEvent;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create event";
      eventFormState.setGeneralError(message);
      return null;
    } finally {
      eventFormState.setSubmitting(false);
    }
  },

  /**
   * Update an existing event from the current form data
   */
  async update(): Promise<Event | null> {
    const formData = eventFormState.formData;

    if (!formData.editingId) {
      eventFormState.setGeneralError("No event selected for editing");
      return null;
    }

    // Clear previous errors
    eventFormState.clearAllErrors();

    // Validate form data
    const validationResult = eventFormState.validate();
    if (!validationResult.isValid) {
      return null;
    }

    try {
      // Set submitting state
      eventFormState.setSubmitting(true);

      // Create UTC dates for storage based on time label
      const { startDate, endDate } = createEventDates(formData);

      // Check if this is a recurring event (date/recurrence fields are locked in UI)
      const existingEvent = calendarState.getEvent(formData.editingId);
      const isRecurringEvent = existingEvent?.recurrence?.type === "RRULE";

      // For recurring events, omit timeLabel from the update
      // (date pickers are disabled but time can change, so start/end are still sent)
      // (recurrence is included because weekday selection can be modified)
      const updates: Partial<Omit<Event, "id">> = {
        title: formData.title.trim(),
        start: startDate,
        end: endDate,
        description: formData.description?.trim() || undefined,
        address: formData.address?.trim() || undefined,
        importance: formData.importance || "medium",
        color: formData.color,
        recurrence: formData.recurrence,
        ...(isRecurringEvent
          ? {}
          : {
              timeLabel: formData.timeLabel || "all-day",
            }),
      };

      // Update the event via API
      const success = await calendarState.updateEvent(
        formData.editingId,
        updates,
      );

      if (!success) {
        eventFormState.setGeneralError("Event not found");
        return null;
      }

      // Get the updated event from the state
      const updatedEvent = calendarState.getEvent(formData.editingId);

      if (!updatedEvent) {
        eventFormState.setGeneralError("Event not found after update");
        return null;
      }

      // Reset form and hide it
      eventFormState.reset();
      eventFormState.close();

      // Show success message
      toastState.success("Event updated successfully");

      return updatedEvent;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update event";
      eventFormState.setGeneralError(message);
      return null;
    } finally {
      eventFormState.setSubmitting(false);
    }
  },

  /**
   * Delete an event by ID
   */
  async delete(eventId: string): Promise<boolean> {
    try {
      const deleted = await calendarState.deleteEvent(eventId);

      if (deleted) {
        toastState.success("予定を削除しました");
      } else {
        toastState.error("予定が見つかりません");
      }

      return deleted;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "削除に失敗しました";
      toastState.error(message);
      return false;
    }
  },

  /**
   * Delete a single occurrence of a recurring event by adding EXDATE
   * Delegates to CalendarState.addExdateToEvent which uses ical.js for proper RFC 5545 compliance
   */
  async deleteOccurrence(
    eventId: string,
    occurrenceDate: Date,
  ): Promise<boolean> {
    try {
      const event = calendarState.getEvent(eventId);
      if (!event) {
        toastState.error("予定が見つかりません");
        return false;
      }

      // Verify this is a recurring event
      const currentRecurrence = event.recurrence;
      if (!currentRecurrence || currentRecurrence.type !== "RRULE") {
        toastState.error("繰り返し設定がありません");
        return false;
      }

      // Add EXDATE via calendarState (uses ical.js for proper iCal format)
      const success = await calendarState.addExdateToEvent(
        eventId,
        occurrenceDate,
      );

      if (success) {
        toastState.success("この予定を削除しました");
      }

      return success;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "削除に失敗しました";
      toastState.error(message);
      return false;
    }
  },

  /**
   * Delete this and all future occurrences by setting UNTIL on the recurrence rule
   * Uses ical.js for proper RFC 5545 compliance
   * Preserves existing EXDATE values
   */
  async deleteThisAndFuture(
    eventId: string,
    occurrenceDate: Date,
  ): Promise<boolean> {
    try {
      const event = calendarState.getEvent(eventId);
      if (!event) {
        toastState.error("予定が見つかりません");
        return false;
      }

      const currentRecurrence = event.recurrence;
      if (
        !currentRecurrence ||
        currentRecurrence.type !== "RRULE" ||
        !currentRecurrence.rrule
      ) {
        toastState.error("繰り返し設定がありません");
        return false;
      }

      // Parse RRULE using ical.js to ensure proper handling
      let recur: ICAL.Recur;
      try {
        recur = ICAL.Recur.fromString(currentRecurrence.rrule);
      } catch (parseError) {
        console.error(
          "[eventActions] Invalid RRULE:",
          currentRecurrence.rrule,
          parseError,
        );
        toastState.error("無効な繰り返しルールです");
        return false;
      }

      // Calculate UNTIL date: day before this occurrence
      const isAllDay = event.timeLabel === "all-day";
      const untilDate = new Date(occurrenceDate);
      untilDate.setUTCDate(untilDate.getUTCDate() - 1);

      let untilTime: ICAL.Time;
      if (isAllDay) {
        // All-day events: use DATE format (end of previous day)
        const year = untilDate.getUTCFullYear();
        const month = untilDate.getUTCMonth() + 1;
        const day = untilDate.getUTCDate();
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        untilTime = ICAL.Time.fromDateString(dateStr);
      } else {
        // Timed events: use DATE-TIME format in UTC (end of day)
        untilDate.setUTCHours(23, 59, 59, 0);
        untilTime = ICAL.Time.fromJSDate(untilDate, true); // true = UTC
      }

      // Set UNTIL on the recurrence (ical.js handles removing COUNT automatically)
      recur.until = untilTime;
      // Explicitly clear COUNT to avoid conflicts (ical.js uses null, not undefined)
      recur.count = null;

      // Convert back to RRULE string
      const newRrule = recur.toString();

      // IMPORTANT: When updating recurrence, we need to preserve existing EXDATE values
      // by updating the icalData directly instead of regenerating it
      if (event.icalData) {
        // Parse existing icalData to preserve EXDATE
        const icsContent = event.icalData.includes("BEGIN:VCALENDAR")
          ? event.icalData
          : `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${event.icalData}\r\nEND:VCALENDAR`;

        const jcalData = ICAL.parse(icsContent);
        const vcalendar = new ICAL.Component(jcalData);
        const vevent = vcalendar.getFirstSubcomponent("vevent");

        if (vevent) {
          // Update RRULE property while preserving EXDATE
          const rruleProp = vevent.getFirstProperty("rrule");
          if (rruleProp) {
            vevent.removeProperty(rruleProp);
          }
          vevent.addPropertyWithValue("rrule", recur);

          // Regenerate icalData with preserved EXDATE
          const newIcalData = vevent.toString();

          // Update with both new recurrence and preserved icalData
          // The icalData contains EXDATE and the updated RRULE
          const success = await calendarState.updateEvent(eventId, {
            recurrence: {
              type: "RRULE",
              rrule: newRrule,
            },
            icalData: newIcalData,
          });

          if (success) {
            toastState.success("これ以降の予定を削除しました");
          }

          return success;
        }
      }

      // Fallback: if no icalData, just update recurrence (will regenerate icalData)
      const success = await calendarState.updateEvent(eventId, {
        recurrence: {
          type: "RRULE",
          rrule: newRrule,
        },
      });

      if (success) {
        toastState.success("これ以降の予定を削除しました");
      }

      return success;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "削除に失敗しました";
      toastState.error(message);
      return false;
    }
  },

  /**
   * Start editing an event
   * @param event - The master event to edit
   * @param occurrenceDate - For recurring events: the specific occurrence date being edited
   */
  editEvent(event: Event, occurrenceDate?: Date): void {
    // Use the event's timeLabel directly, defaulting to "all-day" if not set
    const timeLabel = event.timeLabel || "all-day";

    // Set form data for editing (include occurrence date for recurring events)
    eventFormState.setForEditing(
      {
        ...event,
        timeLabel,
      },
      occurrenceDate,
    );

    // Show the form
    eventFormState.open();
  },

  /**
   * Start creating a new event
   */
  createNewEvent(): void {
    // Reset form and set to create mode
    eventFormState.reset();
    eventFormState.setCreateMode();
    eventFormState.initializeForNewEvent();

    // Show the form
    eventFormState.open();
  },

  /**
   * Cancel event editing/creation
   */
  cancelEventForm(): void {
    eventFormState.reset();
    eventFormState.close();
  },

  /**
   * Submit the event form (create or update based on editing state)
   */
  async submitEventForm(): Promise<Event | null> {
    const formData = eventFormState.formData;

    if (formData.isEditing) {
      return await this.update();
    } else {
      return await this.create();
    }
  },
};

/**
 * Validation function for event form data
 */
function _validateEventForm(formData: EventFormData): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Validate title
  if (!formData.title?.trim()) {
    errors.title = "タイトルを入力してください";
  }

  // Validate start/end times if they have content
  if ((formData.start || formData.end) && (!formData.start || !formData.end)) {
    errors.start = "開始時間と終了時間を入力してください";
    errors.end = "開始時間と終了時間を入力してください";
  }

  // If both start and end are provided, validate them
  if (formData.start && formData.end) {
    const startDate = new Date(formData.start);
    const endDate = new Date(formData.end);

    if (startDate >= endDate) {
      errors.end = "終了時間は開始時間より後にしてください";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Create UTC dates for event storage based on form data
 */
function createEventDates(formData: EventFormData): {
  startDate: Date;
  endDate: Date;
} {
  if (formData.timeLabel === "timed") {
    // For timed events, use actual start/end times
    if (!formData.start || !formData.end) {
      throw new Error("Timed events require both start and end times");
    }

    const startDate = localDateTimeStringToUTC(formData.start);
    const endDate = localDateTimeStringToUTC(formData.end);
    return { startDate, endDate };
  }

  // For date-only events (all-day)
  let startDateStr: string;
  let endDateStr: string;

  if (formData.start && formData.end) {
    // Extract date parts (remove time if present)
    startDateStr = formData.start.includes("T")
      ? formData.start.split("T")[0]
      : formData.start;
    endDateStr = formData.end.includes("T")
      ? formData.end.split("T")[0]
      : formData.end;
  } else {
    // Use selected date as fallback
    const currentSelectedDate = dataState.selectedDate;
    const dateString = utcToLocalDateString(currentSelectedDate);
    startDateStr = dateString;
    endDateStr = dateString;
  }

  // All-day events: can span multiple days
  // App uses inclusive end dates for all all-day events:
  // - Single-day: 12/12 00:00:00 to 12/12 23:59:59.999
  // - Multi-day: 12/12 00:00:00 to 12/15 23:59:59.999 (inclusive of last day)
  if (startDateStr === endDateStr) {
    // Single day all-day event - start at 00:00, end at 23:59:59.999 (inclusive)
    const startDate = createDateOnlyUTC(startDateStr);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999); // End of the same day
    return { startDate, endDate };
  } else {
    // Multi-day all-day event - start is first day 00:00, end is last day 23:59:59.999 (inclusive)
    const startDate = createDateOnlyUTC(startDateStr);
    const endDate = createDateOnlyUTC(endDateStr);
    endDate.setHours(23, 59, 59, 999); // End of the last day (inclusive)
    return { startDate, endDate };
  }
}

/**
 * Save event data as a template for future autocomplete suggestions
 */
async function saveEventTemplate(formData: EventFormData): Promise<void> {
  // Don't save templates for very short titles
  if (!formData.title || formData.title.trim().length < 2) {
    return;
  }

  // Extract time info for timed events
  let defaultStartTime: string | undefined;
  let defaultEndTime: string | undefined;
  let defaultDuration: number | undefined;

  if (formData.timeLabel === "timed" && formData.start && formData.end) {
    // Extract time portion from datetime strings
    const startParts = formData.start.split("T");
    const endParts = formData.end.split("T");

    if (startParts[1]) {
      defaultStartTime = startParts[1].substring(0, 5); // HH:mm
    }
    if (endParts[1]) {
      defaultEndTime = endParts[1].substring(0, 5); // HH:mm
    }

    // Calculate duration in minutes
    const startDate = new Date(formData.start);
    const endDate = new Date(formData.end);
    defaultDuration = Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60),
    );
  }

  await saveTemplate({
    title: formData.title.trim(),
    importance: formData.importance || "medium",
    color: formData.color,
    address: formData.address?.trim() || undefined,
    timeLabel: formData.timeLabel || "all-day",
    defaultStartTime,
    defaultEndTime,
    defaultDuration,
  });
}
