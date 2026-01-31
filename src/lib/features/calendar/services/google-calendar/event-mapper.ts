/**
 * Event Mapper
 *
 * Converts between Google Calendar events and local app events.
 * Handles recurring events, all-day events, timezones, and deletions.
 */
import type { calendar_v3 } from "googleapis";
import type { Event } from "$lib/types.ts";

// ============================================================================
// TYPES
// ============================================================================

export interface MappedEvent {
  /** Google event ID (used for UID) */
  googleEventId: string;
  /** Mapped local event data */
  event: Omit<Event, "id">;
  /** Whether this event was cancelled/deleted */
  isCancelled: boolean;
  /** Google Calendar ID this event belongs to */
  calendarId: string;
  /** Google's etag for conflict detection */
  etag: string | null;
}

// ============================================================================
// MAIN MAPPING FUNCTION
// ============================================================================

/**
 * Convert a Google Calendar event to local Event format.
 *
 * @param googleEvent - Event from Google Calendar API
 * @param calendarId - Google Calendar ID
 * @returns Mapped event or null if event should be skipped
 */
export function googleEventToLocal(
  googleEvent: calendar_v3.Schema$Event,
  calendarId: string,
): MappedEvent | null {
  // Skip events without required fields
  if (!googleEvent.id || !googleEvent.summary) {
    return null;
  }

  // Check if event is cancelled
  const isCancelled = googleEvent.status === "cancelled";

  // If cancelled, return minimal info for deletion
  if (isCancelled) {
    return {
      googleEventId: googleEvent.id,
      event: {
        title: googleEvent.summary ?? "Untitled",
        start: new Date(),
        end: new Date(),
      },
      isCancelled: true,
      calendarId,
      etag: googleEvent.etag ?? null,
    };
  }

  // Parse start/end times
  const { start, end, isAllDay, tzid } = parseEventTimes(googleEvent);
  if (!start) {
    return null;
  }

  // Parse recurrence
  const recurrence = parseRecurrence(googleEvent);

  // Build the event object
  const event: Omit<Event, "id"> = {
    title: googleEvent.summary,
    start,
    end: end ?? start,
    description: googleEvent.description ?? undefined,
    address: googleEvent.location ?? undefined,
    timeLabel: isAllDay ? "all-day" : "timed",
    tzid,
    recurrence,
    color: googleEvent.colorId
      ? googleColorIdToHex(googleEvent.colorId)
      : undefined,
    // Store raw iCalendar data if available
    icalData: buildIcalData(googleEvent, isAllDay),
  };

  return {
    googleEventId: googleEvent.id,
    event,
    isCancelled: false,
    calendarId,
    etag: googleEvent.etag ?? null,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse start and end times from Google event.
 */
function parseEventTimes(googleEvent: calendar_v3.Schema$Event): {
  start: Date | null;
  end: Date | null;
  isAllDay: boolean;
  tzid: string | undefined;
} {
  const startData = googleEvent.start;
  const endData = googleEvent.end;

  if (!startData) {
    return { start: null, end: null, isAllDay: false, tzid: undefined };
  }

  // All-day event: uses date field (YYYY-MM-DD)
  if (startData.date) {
    const start = parseDateOnly(startData.date);
    let end = endData?.date ? parseDateOnly(endData.date) : start;

    // Google's all-day events use exclusive end date
    // Subtract 1 day to get inclusive end date
    if (end) {
      end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    }

    return {
      start,
      end,
      isAllDay: true,
      tzid: undefined,
    };
  }

  // Timed event: uses dateTime field
  if (startData.dateTime) {
    const start = new Date(startData.dateTime);
    const end = endData?.dateTime ? new Date(endData.dateTime) : null;
    const tzid = startData.timeZone ?? undefined;

    return {
      start,
      end,
      isAllDay: false,
      tzid,
    };
  }

  return { start: null, end: null, isAllDay: false, tzid: undefined };
}

/**
 * Parse a date-only string (YYYY-MM-DD) to UTC midnight Date.
 */
function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Parse recurrence rules from Google event.
 */
function parseRecurrence(
  googleEvent: calendar_v3.Schema$Event,
): Event["recurrence"] | undefined {
  const recurrence = googleEvent.recurrence;
  if (!recurrence || recurrence.length === 0) {
    return undefined;
  }

  // Find RRULE in recurrence array
  const rruleLine = recurrence.find((line) => line.startsWith("RRULE:"));
  if (!rruleLine) {
    return undefined;
  }

  // Extract RRULE value (without "RRULE:" prefix)
  const rruleValue = rruleLine.substring(6);

  return {
    type: "RRULE",
    rrule: rruleValue,
  };
}

/**
 * Convert Google's color ID to hex color.
 * Google has a predefined set of event colors (1-11).
 */
function googleColorIdToHex(colorId: string): string | undefined {
  const colorMap: Record<string, string> = {
    "1": "#a4bdfc", // Lavender
    "2": "#7ae7bf", // Sage
    "3": "#dbadff", // Grape
    "4": "#ff887c", // Flamingo
    "5": "#fbd75b", // Banana
    "6": "#ffb878", // Tangerine
    "7": "#46d6db", // Peacock
    "8": "#e1e1e1", // Graphite
    "9": "#5484ed", // Blueberry
    "10": "#51b749", // Basil
    "11": "#dc2127", // Tomato
  };
  return colorMap[colorId];
}

/**
 * Build iCalendar VEVENT data from Google event.
 * Used for recurrence expansion and round-trip fidelity.
 */
function buildIcalData(
  googleEvent: calendar_v3.Schema$Event,
  isAllDay: boolean,
): string {
  const lines: string[] = ["BEGIN:VEVENT"];

  // UID
  lines.push(`UID:${googleEvent.id}@google.com`);

  // SUMMARY
  if (googleEvent.summary) {
    lines.push(`SUMMARY:${escapeIcalText(googleEvent.summary)}`);
  }

  // DTSTART
  if (isAllDay && googleEvent.start?.date) {
    lines.push(
      `DTSTART;VALUE=DATE:${googleEvent.start.date.replace(/-/g, "")}`,
    );
  } else if (googleEvent.start?.dateTime) {
    const dt = new Date(googleEvent.start.dateTime);
    lines.push(`DTSTART:${formatIcalDateTime(dt)}`);
  }

  // DTEND
  if (isAllDay && googleEvent.end?.date) {
    lines.push(`DTEND;VALUE=DATE:${googleEvent.end.date.replace(/-/g, "")}`);
  } else if (googleEvent.end?.dateTime) {
    const dt = new Date(googleEvent.end.dateTime);
    lines.push(`DTEND:${formatIcalDateTime(dt)}`);
  }

  // RRULE
  if (googleEvent.recurrence) {
    for (const line of googleEvent.recurrence) {
      if (line.startsWith("RRULE:") || line.startsWith("EXDATE:")) {
        lines.push(line);
      }
    }
  }

  // DESCRIPTION
  if (googleEvent.description) {
    lines.push(`DESCRIPTION:${escapeIcalText(googleEvent.description)}`);
  }

  // LOCATION
  if (googleEvent.location) {
    lines.push(`LOCATION:${escapeIcalText(googleEvent.location)}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

/**
 * Escape special characters in iCalendar text.
 */
function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Format a Date as iCalendar UTC datetime (YYYYMMDDTHHMMSSZ).
 */
function formatIcalDateTime(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
