/**
 * @fileoverview Centralized Configuration for Suggestion System
 *
 * Single source of truth for all constants used across suggestion-related modules.
 * Previously scattered across suggestion-scoring.ts, suggestion-scheduler.ts, and gap-finder.ts.
 */

// ============================================================================
// SCORING CONFIGURATION
// ============================================================================

/**
 * Scoring thresholds and ranges for the suggestion system.
 *
 * Need Score Thresholds:
 * - Need < displayThreshold → Task NOT displayed
 * - Need ≥ mandatoryThreshold → Task is MANDATORY
 *
 * Per-type score ranges prevent certain task types from becoming mandatory.
 */
export const SCORING_CONFIG = {
  /** Tasks below this score are hidden from suggestions */
  displayThreshold: 0.5,

  /** Tasks at or above this score must be scheduled */
  mandatoryThreshold: 1.0,

  /** Routine tasks: 0.0-0.9 (never mandatory) */
  routine: {
    minScore: 0.0,
    maxScore: 0.9,
    /** Score cap when weekly goal is met */
    goalCapScore: 0.49,
  },

  /** Deadline tasks: 0.1-1.0 (can become mandatory) */
  deadline: {
    minScore: 0.1,
    maxScore: 1.0,
  },

  /** Backlog tasks: 0.5-0.7 (never mandatory, slow ramp) */
  backlog: {
    minScore: 0.5,
    maxScore: 0.7,
    /** Daily growth rate for saturation */
    dailyGrowth: 0.02,
  },
} as const;

// ============================================================================
// DURATION CONFIGURATION
// ============================================================================

/**
 * Duration constants for session length calculations.
 *
 * Note: These were previously duplicated as:
 * - DEFAULT_SESSION_DURATION (scoring.ts)
 * - MIN_DURATION_FLOOR (scoring.ts)
 */
export const DURATION_CONFIG = {
  /** Default session duration in minutes (used when memo has no sessionDuration) */
  defaultSession: 30,

  /** Absolute floor - no session can be shorter than this (used in deadline calculations) */
  absoluteFloor: 10,
} as const;

// ============================================================================
// EXTENSION CONFIGURATION
// ============================================================================

/**
 * Configuration for duration extension when fitting suggestions to gaps.
 *
 * Extension: When a gap has extra room, suggestions can be extended up to maxFactor.
 */
export const EXTENSION_CONFIG = {
  /** Enable duration extension when gaps have extra time */
  enabled: true,

  /** Minimum extra minutes required before extension kicks in */
  minExtraMinutes: 10,

  /** Maximum multiplier for session duration (2.0 = can double) */
  maxFactor: 2.0,

  /** Extension step size in minutes */
  stepMinutes: 10,
} as const;

// ============================================================================
// SHRINK CONFIGURATION
// ============================================================================

/**
 * Configuration for duration shrinking when gaps are smaller than calculated duration.
 *
 * Shrinking: Deadline tasks can shrink down to their baseDuration (original sessionDuration).
 * Routine and backlog tasks cannot shrink - they use full duration or are skipped.
 */
export const SHRINK_CONFIG = {
  /** Task types that allow shrinking (only deadline tasks) */
  allowedTypes: ["期限付き"] as const,

  /** Shrink/extension step size in minutes (snap to grid) */
  stepMinutes: 10,
} as const;

/**
 * Priority tiers for extension distribution when multiple tasks compete for a gap.
 *
 * After all tasks get their baseDuration, remaining gap time is distributed
 * in priority order: mandatory tasks extend first, then high-need, then normal.
 */
export const EXTENSION_TIERS = {
  /** Tier 1: need >= 1.0 (mandatory tasks get extension first) */
  mandatory: 1.0,

  /** Tier 2: need >= 0.75 (high-need tasks get extension second) */
  high: 0.75,

  /** Tier 3: need >= 0.5 (normal tasks get remaining extension) */
  normal: 0.5,
} as const;

// ============================================================================
// GAP CONFIGURATION
// ============================================================================

/**
 * Constants for gap calculation and UI display.
 *
 * Dot system: Each dot represents MINUTES_PER_DOT minutes of time.
 * Snapping: All times are aligned to SNAP_INCREMENT minute boundaries.
 * Buffer: BUFFER_BEFORE_EVENT minutes are reserved before fixed events.
 */
export const GAP_CONFIG = {
  /** Minutes represented by each dot in the timeline */
  minutesPerDot: 10,

  /** Edge buffer for dot placement (half of minutesPerDot) */
  dotEdgeMinutes: 5,

  /** Snap increment for drag operations */
  dragSnapMinutes: 10,

  /** Minimum dots required to contain a suggestion during drag */
  minDotsForDrag: 5,

  /**
   * Minimum duration for dragging, aligned to dragSnapMinutes.
   *
   * Set to 30 to allow 30-minute routine tasks to be draggable.
   * Durations stay on 10-minute boundaries via dragSnapMinutes.
   */
  minDragDuration: 30,

  /** Buffer time before fixed events (in minutes) */
  bufferBeforeEvent: 10,

  /** Time snapping increment (in minutes) */
  snapIncrement: 10,
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/** Type for the complete extension config object */
export type DurationExtensionConfig = typeof EXTENSION_CONFIG;

/** Type for shrink config */
export type ShrinkConfig = typeof SHRINK_CONFIG;

/** Type for extension tiers */
export type ExtensionTiers = typeof EXTENSION_TIERS;

/** Type for scoring config */
export type ScoringConfig = typeof SCORING_CONFIG;

/** Type for duration config */
export type DurationConfig = typeof DURATION_CONFIG;

/** Type for gap config */
export type GapConfig = typeof GAP_CONFIG;
