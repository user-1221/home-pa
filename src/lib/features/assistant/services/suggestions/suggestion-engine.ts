/**
 * Suggestion Engine
 *
 * Orchestrates the entire suggestion pipeline from memos to scheduled suggestions.
 *
 * ============================================================================
 * PIPELINE OVERVIEW
 * ============================================================================
 *
 * Phase 1: Prepare Memos
 *   1.1 Filter active memos (not completed)
 *   1.2 Reset period counters and daily flags (acceptedToday, completedToday)
 *   1.3 Enrich memos with LLM (fill missing fields)
 *
 * Phase 2: Generate Suggestions
 *   2.1 Score each memo → generate Suggestions (need, importance, duration)
 *   2.2 Filter hidden suggestions (need < DISPLAY_THRESHOLD of 0.5)
 *   2.3 Reduce scores for accepted deadline tasks (can have multiple sessions)
 *
 * Phase 3: Schedule Suggestions
 *   3.1 Enrich gaps with location (based on nearby events)
 *   3.2 Schedule suggestions into gaps using priority-based algorithm
 *
 * ============================================================================
 * ACCEPTANCE FLOW
 * ============================================================================
 *
 * When a user accepts a suggestion:
 *
 * Routine Tasks:
 *   1. accept() calls markMemoAccepted() → sets routineState.acceptedToday = true
 *   2. This is persisted to DB and local store
 *   3. On regenerate(), scoring function returns 0 → filtered out as hidden
 *   4. Task won't appear again until next day (acceptedToday resets)
 *
 * Backlog Tasks:
 *   1. accept() calls markMemoAccepted() → sets backlogState.acceptedToday = true
 *   2. This is persisted to DB and local store
 *   3. On regenerate(), scoring function returns 0.5 (base score, lowest visible)
 *   4. Task remains visible but at lowest priority for additional sessions
 *
 * Deadline Tasks:
 *   1. accept() adds to acceptedSuggestions store
 *   2. On regenerate(), reduceScoresForAcceptedDeadlines() lowers priority
 *   3. Task can still appear (multiple work sessions allowed) but at lower priority
 *
 * ============================================================================
 * DAILY RESET
 * ============================================================================
 *
 * At day boundary (when scoring runs on a new day):
 *   - resetPeriodIfNeeded() checks lastCompletedDay vs currentTime
 *   - If new day: acceptedToday and completedToday are reset to false
 *   - This allows tasks to appear in suggestions again
 *
 * ============================================================================
 * SCORING THRESHOLDS
 * ============================================================================
 *
 * - DISPLAY_THRESHOLD (0.5): Tasks with need < 0.5 are hidden
 * - MANDATORY_THRESHOLD (1.0): Tasks with need >= 1.0 must be scheduled
 *
 * Task Type Score Ranges:
 *   - Routine: 0.0 - 0.9 (never mandatory, grows over time)
 *   - Deadline: 0.1 - 1.0 (mandatory near deadline)
 *   - Backlog: 0.5 - 0.7 (always visible, never mandatory)
 *
 * ============================================================================
 *
 * This is a pure service module - no store coupling.
 * Store integration happens via schedule.ts.
 *
 * @example
 * ```ts
 * const engine = createEngine();
 * const schedule = await engine.generateSchedule(memos, gaps);
 * ```
 */

import type { Memo, Gap, Suggestion } from "$lib/types.ts";

// Import from sibling modules
import {
  enrichMemo,
  enrichMemos,
  type LLMEnrichmentConfig,
} from "./llm-enrichment.ts";
import { resetPeriodIfNeeded } from "./period-utils.ts";
import {
  createSuggestionFromMemo,
  isHidden,
  markRoutineAccepted,
  markRoutineCompleted,
  markBacklogAccepted,
  markBacklogCompleted,
  resetBacklogAcceptance,
  recordDeadlineSession,
  resetRoutineAcceptance,
} from "./suggestion-scoring.ts";
import {
  scheduleSuggestions,
  type ScheduleResult,
  type DurationExtensionConfig,
  DEFAULT_EXTENSION_CONFIG,
} from "./suggestion-scheduler.ts";
import {
  enrichGapsWithLocation,
  type EnrichableEvent,
} from "./gap-enrichment.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the suggestion engine
 */
export interface EngineConfig {
  /** LLM enrichment config (optional - falls back to defaults) */
  llm?: Partial<LLMEnrichmentConfig>;

  /**
   * Duration extension config (optional)
   * Controls how suggestion durations are extended when extra gap time is available
   *
   * - enabled: Whether to extend durations (default: true)
   * - minExtensionMinutes: Minimum extra gap time before extending (default: 15)
   * - maxExtensionFactor: Maximum multiplier for base duration (default: 2.0)
   * - extensionStepMinutes: Extension granularity (default: 15)
   */
  durationExtension?: Partial<DurationExtensionConfig>;

  /** Enable LLM enrichment (default: true, but gracefully skips if not configured) */
  enableLLMEnrichment?: boolean;

  /** Current time provider (useful for testing) */
  getCurrentTime?: () => Date;
}

/**
 * Options for schedule generation
 */
export interface GenerateScheduleOptions {
  /** Override current time (for testing) */
  currentTime?: Date;

  /** Events for location enrichment (optional) */
  events?: EnrichableEvent[];

  /** Skip LLM enrichment for this call */
  skipLLMEnrichment?: boolean;

  /**
   * Set of memo IDs that are already accepted
   * Suggestions for these memos will have reduced scores
   * (always lower than mandatory, so they appear as lower-priority duplicates)
   */
  acceptedMemoIds?: Set<string>;
}

/**
 * Input for marking a session as complete
 */
export interface SessionCompleteInput {
  /** ID of the memo that was worked on */
  memoId: string;

  /** Minutes spent in this session */
  minutesSpent: number;

  /** Current time (optional, defaults to now) */
  currentTime?: Date;
}

/**
 * Result of marking a session complete
 */
export interface SessionCompleteResult {
  /** Updated memo */
  memo: Memo;

  /** Whether the memo is now fully completed */
  isNowComplete: boolean;

  /** For routines: whether goal for period was just reached */
  goalReached?: boolean;
}

/**
 * Summary of engine pipeline execution
 */
export interface PipelineSummary {
  /** Number of memos processed */
  memosProcessed: number;

  /** Number of active (non-completed) memos */
  activeMemos: number;

  /** Number of suggestions generated */
  suggestionsGenerated: number;

  /** Number of gaps available */
  gapsAvailable: number;

  /** Number of suggestions scheduled */
  suggestionsScheduled: number;

  /** Execution time in ms */
  executionTimeMs: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_ENGINE_CONFIG: Required<EngineConfig> = {
  llm: {},
  durationExtension: DEFAULT_EXTENSION_CONFIG,
  enableLLMEnrichment: true,
  getCurrentTime: () => new Date(),
};

// ============================================================================
// Helper Functions (Pure, Testable)
// ============================================================================

/**
 * Filter memos to only active ones (not completed)
 *
 * @param memos - All memos
 * @returns Only memos where completionState !== "completed"
 */
export function filterActiveMemos(memos: Memo[]): Memo[] {
  return memos.filter((memo) => memo.status.completionState !== "completed");
}

/**
 * Reset period counters for memos if new period has started
 * (e.g., new day/week/month for routines)
 *
 * @param memos - Memos to process
 * @param currentTime - Current time for period checking
 * @returns Memos with reset counters where needed
 */
export function resetMemoPeriodsIfNeeded(
  memos: Memo[],
  currentTime: Date,
): Memo[] {
  return memos.map((memo) => resetPeriodIfNeeded(memo, currentTime));
}

/**
 * Convert memos to suggestions by scoring each one
 *
 * @param memos - Enriched memos to score
 * @param currentTime - Current time for need calculation
 * @returns Suggestion for each memo
 */
export function memosToSuggestions(
  memos: Memo[],
  currentTime: Date,
): Suggestion[] {
  return memos.map((memo) => createSuggestionFromMemo(memo, currentTime));
}

/**
 * Filter out hidden suggestions (need < 0.5)
 * NEW: Tasks below display threshold should not be shown
 *
 * @param suggestions - All suggestions
 * @returns Only suggestions that should be displayed
 */
export function filterVisibleSuggestions(
  suggestions: Suggestion[],
): Suggestion[] {
  return suggestions.filter((s) => !isHidden(s));
}

/**
 * Score reduction factor for deadline tasks that have already been accepted today
 * Ensures their duplicates are always lower priority than mandatory (need >= 1.0)
 */
const DEADLINE_ACCEPTED_SCORE_REDUCTION = 0.5;
const DEADLINE_ACCEPTED_MAX_NEED = 0.85; // Always below mandatory threshold (1.0)

/**
 * Reduce scores for deadline tasks that have already been accepted
 *
 * For routine and backlog tasks:
 * - The scoring function (calculateRoutineNeed, calculateBacklogNeed) handles
 *   acceptedToday directly by returning a score < 0.5 when acceptedToday = true.
 * - These are then filtered out by filterVisibleSuggestions.
 *
 * For deadline tasks:
 * - Multiple work sessions may be scheduled, so we reduce (not hide) their score.
 * - This allows them to still appear but at lower priority than other tasks.
 *
 * @param suggestions - All generated suggestions
 * @param acceptedMemoIds - Set of memo IDs that are already accepted today
 * @param memos - Source memos (to check task type)
 * @returns Suggestions with reduced scores for accepted deadline tasks
 */
export function reduceScoresForAcceptedDeadlines(
  suggestions: Suggestion[],
  acceptedMemoIds: Set<string>,
  memos: Memo[],
): Suggestion[] {
  if (acceptedMemoIds.size === 0) {
    return suggestions;
  }

  // Build memo lookup
  const memoMap = new Map(memos.map((m) => [m.id, m]));

  return suggestions.map((s) => {
    if (!acceptedMemoIds.has(s.memoId)) {
      return s;
    }

    const memo = memoMap.get(s.memoId);

    // Only reduce scores for deadline tasks
    // Routine and backlog are handled by their scoring functions (return score < 0.5)
    if (memo?.type !== "期限付き") {
      return s;
    }

    // For deadline tasks: reduce scores to lower priority
    const reducedNeed = Math.min(
      s.need * DEADLINE_ACCEPTED_SCORE_REDUCTION,
      DEADLINE_ACCEPTED_MAX_NEED,
    );
    const reducedImportance = s.importance * DEADLINE_ACCEPTED_SCORE_REDUCTION;

    return {
      ...s,
      need: reducedNeed,
      importance: reducedImportance,
    };
  });
}

/**
 * Check if a memo is now complete based on time spent
 *
 * @param memo - Memo to check
 * @returns true if timeSpent >= totalDurationExpected
 */
export function isMemoComplete(memo: Memo): boolean {
  const totalExpected = memo.totalDurationExpected ?? 60; // Default 60 min
  return memo.status.timeSpentMinutes >= totalExpected;
}

/**
 * Check if routine goal is reached for current period
 *
 * @param memo - Routine memo to check
 * @returns true if completedCountThisPeriod >= recurrenceGoal.count
 */
export function isRoutineGoalReached(memo: Memo): boolean {
  if (memo.type !== "ルーティン" || !memo.recurrenceGoal) {
    return false;
  }
  const completions = memo.routineState?.completedCountThisPeriod ?? 0;
  return completions >= memo.recurrenceGoal.count;
}

// ============================================================================
// Suggestion Engine Class
// ============================================================================

/**
 * Main orchestrator for the suggestion system
 *
 * Provides a clean API for:
 * - Generating schedules from memos and gaps
 * - Tracking session completion
 * - Managing memo lifecycle
 */
export class SuggestionEngine {
  private config: Required<EngineConfig>;

  constructor(config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Generate a schedule from memos and gaps
   *
   * Full pipeline:
   * 1. Filter active memos
   * 2. Reset period counters
   * 3. Enrich with LLM (if enabled)
   * 4. Score memos → Suggestions
   * 5. Handle accepted-today logic
   * 6. Filter hidden suggestions (need < 0.5)
   * 7. Enrich gaps with location
   * 8. Schedule suggestions into gaps
   *
   * @param memos - All memos (will filter active ones)
   * @param gaps - Available time gaps
   * @param options - Optional overrides
   * @returns Schedule result with summary
   */
  async generateSchedule(
    memos: Memo[],
    gaps: Gap[],
    options: GenerateScheduleOptions = {},
  ): Promise<{ schedule: ScheduleResult; summary: PipelineSummary }> {
    const startTime = performance.now();
    const currentTime = options.currentTime ?? this.config.getCurrentTime();

    // Step 1: Filter active memos
    const activeMemos = filterActiveMemos(memos);

    // Step 2: Reset period counters if needed
    const memosWithResetPeriods = resetMemoPeriodsIfNeeded(
      activeMemos,
      currentTime,
    );

    // Step 3: LLM enrichment (optional)
    let enrichedMemos: Memo[];
    if (this.config.enableLLMEnrichment && !options.skipLLMEnrichment) {
      enrichedMemos = await enrichMemos(memosWithResetPeriods, this.config.llm);
    } else {
      enrichedMemos = memosWithResetPeriods;
    }

    // Step 4: Score memos → Suggestions
    let suggestions = memosToSuggestions(enrichedMemos, currentTime);

    // Step 5: Filter hidden suggestions (need < 0.5)
    // Routine/backlog tasks accepted today have score 0 from their scoring functions
    suggestions = filterVisibleSuggestions(suggestions);

    // Step 6: Reduce scores for accepted deadline tasks
    // Deadline tasks can have multiple work sessions, so we reduce (not hide) their score
    if (options.acceptedMemoIds && options.acceptedMemoIds.size > 0) {
      suggestions = reduceScoresForAcceptedDeadlines(
        suggestions,
        options.acceptedMemoIds,
        enrichedMemos,
      );
    }

    // Step 7: Enrich gaps with location (if events provided)
    let enrichedGaps: Gap[];
    if (options.events && options.events.length > 0) {
      enrichedGaps = enrichGapsWithLocation(gaps, options.events);
    } else {
      enrichedGaps = gaps;
    }

    // Step 8: Schedule suggestions into gaps
    const schedule = scheduleSuggestions(suggestions, enrichedGaps, {
      durationExtension: this.config.durationExtension,
    });

    // Build summary
    const endTime = performance.now();
    const summary: PipelineSummary = {
      memosProcessed: memos.length,
      activeMemos: activeMemos.length,
      suggestionsGenerated: suggestions.length,
      gapsAvailable: gaps.length,
      suggestionsScheduled: schedule.scheduled.length,
      executionTimeMs: Math.round(endTime - startTime),
    };

    return { schedule, summary };
  }

  /**
   * Mark a session as complete and update memo accordingly
   *
   * Updates:
   * - timeSpentMinutes += minutesSpent
   * - lastActivity = now
   * - Type-specific state updates (new explicit state flags)
   * - completionState = "completed" if done
   *
   * @param memo - The memo that was worked on
   * @param input - Session details
   * @returns Updated memo and status flags
   */
  markSessionComplete(
    memo: Memo,
    input: SessionCompleteInput,
  ): SessionCompleteResult {
    const currentTime = input.currentTime ?? this.config.getCurrentTime();

    // Update time spent and basic status
    let updatedMemo: Memo = {
      ...memo,
      lastActivity: currentTime,
      status: {
        ...memo.status,
        timeSpentMinutes: memo.status.timeSpentMinutes + input.minutesSpent,
        completionState:
          memo.status.completionState === "not_started"
            ? "in_progress"
            : memo.status.completionState,
      },
    };

    // Type-specific state updates using new explicit state functions
    switch (updatedMemo.type) {
      case "ルーティン":
        // Update routine state with completion
        updatedMemo = markRoutineCompleted(updatedMemo, currentTime);
        break;

      case "期限付き":
        // Record actual session duration for adaptive curve
        updatedMemo = recordDeadlineSession(
          updatedMemo,
          currentTime,
          input.minutesSpent,
        );
        break;

      case "バックログ":
        // Update backlog state with completion (also sets acceptedToday)
        updatedMemo = markBacklogCompleted(updatedMemo, currentTime);
        break;
    }

    // Check if now complete
    const isNowComplete = isMemoComplete(updatedMemo);
    if (isNowComplete) {
      updatedMemo = {
        ...updatedMemo,
        status: {
          ...updatedMemo.status,
          completionState: "completed",
        },
      };
    }

    // Check if routine goal reached
    const goalReached =
      updatedMemo.type === "ルーティン"
        ? isRoutineGoalReached(updatedMemo)
        : undefined;

    return {
      memo: updatedMemo,
      isNowComplete,
      goalReached,
    };
  }

  /**
   * Enrich a single memo with LLM suggestions
   *
   * Useful for enriching on memo creation/update.
   *
   * @param memo - Memo to enrich
   * @returns Enriched memo (or original if LLM disabled/fails)
   */
  async enrichMemo(memo: Memo): Promise<Memo> {
    if (!this.config.enableLLMEnrichment) {
      return memo;
    }
    return enrichMemo(memo, this.config.llm);
  }

  /**
   * Generate suggestions without scheduling
   *
   * Useful for previewing what suggestions would be generated.
   * NEW: Filters out hidden suggestions (need < 0.5)
   *
   * @param memos - Memos to score
   * @param currentTime - Optional time override
   * @returns Visible suggestions sorted by priority
   */
  generateSuggestions(memos: Memo[], currentTime?: Date): Suggestion[] {
    const time = currentTime ?? this.config.getCurrentTime();
    const activeMemos = filterActiveMemos(memos);
    const withResetPeriods = resetMemoPeriodsIfNeeded(activeMemos, time);
    const suggestions = memosToSuggestions(withResetPeriods, time);
    // Filter hidden suggestions
    return filterVisibleSuggestions(suggestions);
  }

  /**
   * Mark a suggestion as accepted (without full completion)
   *
   * NEW: For routine and backlog tasks, this marks acceptedToday = true
   * which treats the task as just completed for that day (low score, still visible)
   *
   * @param memo - The memo that was accepted
   * @param currentTime - Optional time override
   * @returns Updated memo with acceptance state
   */
  markAccepted(memo: Memo, currentTime?: Date): Memo {
    const time = currentTime ?? this.config.getCurrentTime();

    // For routine tasks, use the explicit acceptance tracking
    if (memo.type === "ルーティン") {
      return markRoutineAccepted(memo, time);
    }

    // For backlog tasks, use the explicit acceptance tracking
    if (memo.type === "バックログ") {
      return markBacklogAccepted(memo, time);
    }

    // For other types, just update lastActivity
    return {
      ...memo,
      lastActivity: time,
    };
  }

  /**
   * Mark a routine or backlog task as "missed" - resets acceptedToday flag
   *
   * This allows a task that was accepted but not completed
   * to be suggested again.
   *
   * @param memo - The memo that was missed
   * @param currentTime - Optional time override
   * @returns Updated memo with reset acceptance state
   */
  markMissed(memo: Memo, currentTime?: Date): Memo {
    const time = currentTime ?? this.config.getCurrentTime();

    if (memo.type === "ルーティン") {
      return resetRoutineAcceptance(memo, time);
    }

    if (memo.type === "バックログ") {
      return resetBacklogAcceptance(memo, time);
    }

    return memo;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<EngineConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<EngineConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new suggestion engine instance
 *
 * @example
 * ```ts
 * // Default configuration
 * const engine = createEngine();
 *
 * // Custom configuration
 * const engine = createEngine({
 *   enableLLMEnrichment: false,
 * });
 * ```
 *
 * @param config - Optional configuration overrides
 * @returns New SuggestionEngine instance
 */
export function createEngine(
  config: Partial<EngineConfig> = {},
): SuggestionEngine {
  return new SuggestionEngine(config);
}

// ============================================================================
// Convenience Exports
// ============================================================================

// Re-export commonly used types for convenience
export type { ScheduleResult, ScheduledBlock } from "./suggestion-scheduler.ts";

// Re-export scoring constants and functions
export {
  DISPLAY_THRESHOLD,
  MANDATORY_THRESHOLD,
  isHidden,
  markRoutineAccepted,
  markRoutineCompleted,
  markBacklogAccepted,
  markBacklogCompleted,
  resetBacklogAcceptance,
  recordDeadlineSession,
  resetRoutineAcceptance,
  importanceToNumber,
} from "./suggestion-scoring.ts";
