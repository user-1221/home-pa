/**
 * Task Form State - Svelte 5 Reactive Class
 *
 * Manages the state of the task creation/editing form.
 * This form creates rich Memo objects with type, deadline, recurrence, etc.
 *
 * Migrated from writable stores to Svelte 5 reactive class ($state).
 */

import type {
  MemoType,
  LocationPreference,
  ImportanceLevel,
  RecurrenceGoal,
} from "../../../types.ts";
import type {
  EventLinkType,
  EventDeadlineOffset,
} from "../types/event-link.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Task data for editing (used by form actions)
 */
export interface TaskEditData {
  id: string;
  title: string;
  type: MemoType;
  deadline?: Date;
  recurrenceGoal?: RecurrenceGoal;
  locationPreference: LocationPreference;
  importance?: ImportanceLevel;
  genre?: string;
  sessionDuration?: number;
  totalDurationExpected?: number;
}

/**
 * Event link data for form (links deadline task to calendar event or timetable)
 */
export interface TaskFormEventLink {
  type: EventLinkType;
  calendarEventId?: string;
  timetableCellId?: string;
  eventTitle: string; // For display in form
  offset: EventDeadlineOffset;
}

/**
 * Task form data interface
 */
export interface TaskFormData {
  title: string;
  type: MemoType;
  deadline: string; // ISO date string for input binding
  recurrenceCount: number;
  recurrencePeriod: "day" | "week" | "month";
  locationPreference: LocationPreference;
  importance: ImportanceLevel | "";
  genre: string;
  sessionDuration: number | null; // Minutes per session (null = not set)
  totalDurationExpected: number | null; // Total expected time in minutes (null = not set)
  isEditing: boolean;
  editingId: string | null;
  // Track original LLM-enriched values to detect clearing
  originalGenre?: string;
  originalSessionDuration?: number;
  originalTotalDurationExpected?: number;
  // Event link (for deadline tasks linked to calendar events or timetable)
  eventLink: TaskFormEventLink | null;
}

/**
 * Form validation errors
 */
export interface TaskFormErrors {
  title?: string;
  deadline?: string;
  recurrence?: string;
  enrichedFieldsCleared?: string; // Warning when LLM-enriched fields are emptied
  general?: string;
}

// ============================================================================
// Initial State
// ============================================================================

const initialFormState: TaskFormData = {
  title: "",
  type: "バックログ",
  deadline: "",
  recurrenceCount: 1,
  recurrencePeriod: "week",
  locationPreference: "no_preference",
  importance: "",
  genre: "",
  sessionDuration: null,
  totalDurationExpected: null,
  isEditing: false,
  editingId: null,
  originalGenre: undefined,
  originalSessionDuration: undefined,
  originalTotalDurationExpected: undefined,
  eventLink: null,
};

// ============================================================================
// Task Form State Class
// ============================================================================

/**
 * Task form state reactive class
 */
class TaskFormState {
  // ============================================================================
  // Reactive State
  // ============================================================================

  /** Whether the task form modal/sheet is visible */
  isOpen = $state(false);

  /** Whether the form is currently being submitted */
  isSubmitting = $state(false);

  /** Form validation errors */
  errors = $state<TaskFormErrors>({});

  // Form fields
  title = $state("");
  type = $state<MemoType>("バックログ");
  deadline = $state("");
  recurrenceCount = $state(1);
  recurrencePeriod = $state<"day" | "week" | "month">("week");
  locationPreference = $state<LocationPreference>("no_preference");
  importance = $state<ImportanceLevel | "">("");
  genre = $state("");
  sessionDuration = $state<number | null>(null);
  totalDurationExpected = $state<number | null>(null);
  isEditing = $state(false);
  editingId = $state<string | null>(null);

  // Track original LLM-enriched values to detect clearing
  originalGenre = $state<string | undefined>(undefined);
  originalSessionDuration = $state<number | undefined>(undefined);
  originalTotalDurationExpected = $state<number | undefined>(undefined);

  // Event link (for deadline tasks linked to calendar events or timetable)
  eventLink = $state<TaskFormEventLink | null>(null);

  // ============================================================================
  // Derived State (getters)
  // ============================================================================

  /**
   * Whether the form has required content
   */
  get hasContent(): boolean {
    return this.title.trim() !== "";
  }

  /**
   * Whether the form is valid
   */
  get isValid(): boolean {
    // Must have title
    if (!this.title.trim()) return false;

    // If 期限付き, must have deadline OR eventLink (deadline will be calculated from event)
    if (this.type === "期限付き" && !this.deadline && !this.eventLink)
      return false;

    // No validation errors
    if (Object.keys(this.errors).length > 0) return false;

    return true;
  }

  /**
   * Whether deadline field should be shown
   */
  get showDeadlineField(): boolean {
    return this.type === "期限付き";
  }

  /**
   * Whether recurrence fields should be shown
   */
  get showRecurrenceFields(): boolean {
    return this.type === "ルーティン";
  }

  /**
   * Check if any LLM-enriched fields have been cleared during editing
   * Returns array of cleared field names, or false if none
   */
  get enrichedFieldsCleared(): string[] | false {
    if (!this.isEditing) return false;

    const clearedFields: string[] = [];

    // Check genre - was set, now empty
    if (this.originalGenre && !this.genre.trim()) {
      clearedFields.push("ジャンル");
    }

    // Check sessionDuration - was set, now null/0
    if (this.originalSessionDuration && !this.sessionDuration) {
      clearedFields.push("セッション時間");
    }

    // Check totalDurationExpected - was set, now null/0
    if (this.originalTotalDurationExpected && !this.totalDurationExpected) {
      clearedFields.push("合計時間");
    }

    return clearedFields.length > 0 ? clearedFields : false;
  }

  /**
   * Get form data as an object (for compatibility)
   */
  get formData(): TaskFormData {
    return {
      title: this.title,
      type: this.type,
      deadline: this.deadline,
      recurrenceCount: this.recurrenceCount,
      recurrencePeriod: this.recurrencePeriod,
      locationPreference: this.locationPreference,
      importance: this.importance,
      genre: this.genre,
      sessionDuration: this.sessionDuration,
      totalDurationExpected: this.totalDurationExpected,
      isEditing: this.isEditing,
      editingId: this.editingId,
      originalGenre: this.originalGenre,
      originalSessionDuration: this.originalSessionDuration,
      originalTotalDurationExpected: this.originalTotalDurationExpected,
      eventLink: this.eventLink,
    };
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Update a single field
   */
  updateField<K extends keyof TaskFormData>(
    field: K,
    value: TaskFormData[K],
  ): void {
    // Type-safe field updates
    switch (field) {
      case "title":
        this.title = value as string;
        break;
      case "type":
        this.type = value as MemoType;
        break;
      case "deadline":
        this.deadline = value as string;
        break;
      case "recurrenceCount":
        this.recurrenceCount = value as number;
        break;
      case "recurrencePeriod":
        this.recurrencePeriod = value as "day" | "week" | "month";
        break;
      case "locationPreference":
        this.locationPreference = value as LocationPreference;
        break;
      case "importance":
        this.importance = value as ImportanceLevel | "";
        break;
      case "genre":
        this.genre = value as string;
        break;
      case "sessionDuration":
        this.sessionDuration = value as number | null;
        break;
      case "totalDurationExpected":
        this.totalDurationExpected = value as number | null;
        break;
      case "isEditing":
        this.isEditing = value as boolean;
        break;
      case "editingId":
        this.editingId = value as string | null;
        break;
      case "originalGenre":
        this.originalGenre = value as string | undefined;
        break;
      case "originalSessionDuration":
        this.originalSessionDuration = value as number | undefined;
        break;
      case "originalTotalDurationExpected":
        this.originalTotalDurationExpected = value as number | undefined;
        break;
      case "eventLink":
        this.eventLink = value as TaskFormEventLink | null;
        break;
    }

    // Clear error for this field if any
    if (field === "title" || field === "deadline") {
      this.clearFieldError(field as keyof TaskFormErrors);
    }
  }

  /**
   * Update multiple fields at once
   */
  updateFields(updates: Partial<TaskFormData>): void {
    for (const [key, value] of Object.entries(updates)) {
      this.updateField(
        key as keyof TaskFormData,
        value as TaskFormData[keyof TaskFormData],
      );
    }
  }

  /**
   * Set form data for editing an existing task
   */
  setFormForEditing(task: TaskEditData): void {
    this.title = task.title;
    this.type = task.type;
    this.deadline = task.deadline
      ? task.deadline.toISOString().split("T")[0]
      : "";
    this.recurrenceCount = task.recurrenceGoal?.count ?? 1;
    this.recurrencePeriod = task.recurrenceGoal?.period ?? "week";
    this.locationPreference = task.locationPreference;
    this.importance = task.importance ?? "";
    this.genre = task.genre ?? "";
    this.sessionDuration = task.sessionDuration ?? null;
    this.totalDurationExpected = task.totalDurationExpected ?? null;
    this.isEditing = true;
    this.editingId = task.id;
    // Track original LLM-enriched values
    this.originalGenre = task.genre;
    this.originalSessionDuration = task.sessionDuration;
    this.originalTotalDurationExpected = task.totalDurationExpected;
    this.errors = {};
  }

  /**
   * Reset form to initial state
   */
  reset(): void {
    this.title = initialFormState.title;
    this.type = initialFormState.type;
    this.deadline = initialFormState.deadline;
    this.recurrenceCount = initialFormState.recurrenceCount;
    this.recurrencePeriod = initialFormState.recurrencePeriod;
    this.locationPreference = initialFormState.locationPreference;
    this.importance = initialFormState.importance;
    this.genre = initialFormState.genre;
    this.sessionDuration = initialFormState.sessionDuration;
    this.totalDurationExpected = initialFormState.totalDurationExpected;
    this.isEditing = initialFormState.isEditing;
    this.editingId = initialFormState.editingId;
    this.originalGenre = initialFormState.originalGenre;
    this.originalSessionDuration = initialFormState.originalSessionDuration;
    this.originalTotalDurationExpected =
      initialFormState.originalTotalDurationExpected;
    this.eventLink = initialFormState.eventLink;
    this.errors = {};
    this.isSubmitting = false;
  }

  /**
   * Open the task form (for creating new task)
   */
  openForm(): void {
    this.reset();
    this.isOpen = true;
  }

  /**
   * Open the task form for editing
   */
  openFormForEditing(task: TaskEditData): void {
    this.setFormForEditing(task);
    this.isOpen = true;
  }

  /**
   * Close the task form
   */
  closeForm(): void {
    this.isOpen = false;
    // Reset after animation
    setTimeout(() => this.reset(), 300);
  }

  /**
   * Set validation error for a field
   */
  setFieldError(field: keyof TaskFormErrors, error: string): void {
    this.errors = { ...this.errors, [field]: error };
  }

  /**
   * Clear validation error for a field
   */
  clearFieldError(field: keyof TaskFormErrors): void {
    const newErrors = { ...this.errors };
    delete newErrors[field];
    this.errors = newErrors;
  }

  /**
   * Clear all validation errors
   */
  clearAllErrors(): void {
    this.errors = {};
  }

  /**
   * Set general error message
   */
  setGeneralError(message: string): void {
    this.errors = { ...this.errors, general: message };
  }

  /**
   * Set submitting state
   */
  setSubmitting(submitting: boolean): void {
    this.isSubmitting = submitting;
  }

  /**
   * Change task type (resets type-specific fields)
   */
  setType(type: MemoType): void {
    this.type = type;
    // Reset type-specific fields when changing type
    if (type !== "期限付き") {
      this.deadline = "";
      this.eventLink = null; // Clear event link when changing away from deadline type
    }
    if (type !== "ルーティン") {
      this.recurrenceCount = 1;
      this.recurrencePeriod = "week";
    }
  }

  /**
   * Set event link for deadline tasks
   */
  setEventLink(eventLink: TaskFormEventLink | null): void {
    this.eventLink = eventLink;
    // When setting event link, switch to deadline type
    if (eventLink) {
      this.type = "期限付き";
      // Clear manual deadline since it will be calculated from event
      this.deadline = "";
    }
  }

  /**
   * Clear event link
   */
  clearEventLink(): void {
    this.eventLink = null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global task form state instance
 */
export const taskFormState = new TaskFormState();

// ============================================================================
// Backwards Compatibility Exports
// ============================================================================

/**
 * @deprecated Use taskFormState directly instead
 * Legacy export for backwards compatibility with store subscriptions
 */
export const taskForm = {
  subscribe(callback: (value: TaskFormData) => void) {
    // Initial call
    callback(taskFormState.formData);
    // Return unsubscribe (Svelte 5 handles reactivity differently)
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.errors directly instead
 */
export const taskFormErrors = {
  subscribe(callback: (value: TaskFormErrors) => void) {
    callback(taskFormState.errors);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.isSubmitting directly instead
 */
export const isTaskFormSubmitting = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskFormState.isSubmitting);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.isOpen directly instead
 */
export const isTaskFormOpen = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskFormState.isOpen);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.hasContent directly instead
 */
export const hasTaskFormContent = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskFormState.hasContent);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.isValid directly instead
 */
export const isTaskFormValid = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskFormState.isValid);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.isEditing directly instead
 */
export const isTaskFormEditing = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskFormState.isEditing);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.showDeadlineField directly instead
 */
export const showDeadlineField = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskFormState.showDeadlineField);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.showRecurrenceFields directly instead
 */
export const showRecurrenceFields = {
  subscribe(callback: (value: boolean) => void) {
    callback(taskFormState.showRecurrenceFields);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState.enrichedFieldsCleared directly instead
 */
export const hasEnrichedFieldsCleared = {
  subscribe(callback: (value: string[] | false) => void) {
    callback(taskFormState.enrichedFieldsCleared);
    return () => {};
  },
};

/**
 * @deprecated Use taskFormState methods directly instead
 * Legacy actions object for backwards compatibility
 */
export const taskFormActions = {
  updateField: <K extends keyof TaskFormData>(
    field: K,
    value: TaskFormData[K],
  ) => taskFormState.updateField(field, value),
  updateFields: (updates: Partial<TaskFormData>) =>
    taskFormState.updateFields(updates),
  setFormForEditing: (task: TaskEditData) =>
    taskFormState.setFormForEditing(task),
  resetForm: () => taskFormState.reset(),
  openForm: () => taskFormState.openForm(),
  openFormForEditing: (task: TaskEditData) =>
    taskFormState.openFormForEditing(task),
  closeForm: () => taskFormState.closeForm(),
  setFieldError: (field: keyof TaskFormErrors, error: string) =>
    taskFormState.setFieldError(field, error),
  clearAllErrors: () => taskFormState.clearAllErrors(),
  setGeneralError: (message: string) => taskFormState.setGeneralError(message),
  setSubmitting: (submitting: boolean) =>
    taskFormState.setSubmitting(submitting),
  setType: (type: MemoType) => taskFormState.setType(type),
};
