/**
 * Types for event-linked deadline tasks
 */

/** How to calculate deadline from event time */
export type EventDeadlineOffset =
  | "same_day_after" // Deadline is same day as event ends
  | "1_day_before" // Deadline is 24h before event starts
  | "1_day_after"; // Deadline is 24h after event ends

/** Type of linked source */
export type EventLinkType = "calendar" | "timetable";

/** Event link data stored on Memo */
export interface EventLinkData {
  type: EventLinkType;
  calendarEventId?: string; // For calendar events
  timetableCellId?: string; // For timetable items
  offset: EventDeadlineOffset;
  trackedOccurrenceDate?: Date; // Which occurrence we're tracking
  suggestionAvailableFrom?: Date; // When suggestion can start appearing (null = immediately)
}

/** Input for creating event-tagged task */
export interface CreateEventTaggedTaskInput {
  title: string; // User must enter manually
  linkType: EventLinkType;
  calendarEventId?: string;
  timetableCellId?: string;
  offset: EventDeadlineOffset;
  locationPreference?: string;
}

/** Offset option for UI display */
export interface OffsetOption {
  value: EventDeadlineOffset;
  label: string;
  description: string;
}

/** Predefined offset options */
export const OFFSET_OPTIONS: OffsetOption[] = [
  {
    value: "same_day_after",
    label: "イベント当日（終了後）",
    description: "イベントが終わった後、その日中に完了",
  },
  {
    value: "1_day_before",
    label: "イベント1日前",
    description: "イベント開始の24時間前まで",
  },
  {
    value: "1_day_after",
    label: "イベント1日後",
    description: "イベント終了から24時間以内",
  },
];
