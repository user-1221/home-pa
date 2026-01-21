/**
 * Vitest Setup File
 *
 * Provides mocks for SvelteKit server-only modules and Prisma
 * so that tests can run in Node environment without the full
 * SvelteKit server context.
 *
 * IMPORTANT: Remote Functions modules must be mocked BEFORE they are imported.
 * The mocks here provide stub implementations that don't validate.
 */
import { vi } from "vitest";

// ============================================================================
// Mock $app/server - Remote Functions use these
// This MUST be defined before any remote function files are imported
// ============================================================================

vi.mock("$app/server", () => ({
  // query() wraps a function - return a mock that just returns the fn for testing
  query: vi.fn((_schema: unknown, fn: unknown) => fn),
  // command() is the same as query() but for mutations
  command: vi.fn((_schema: unknown, fn: unknown) => fn),
  // getRequestEvent() provides access to request context
  getRequestEvent: vi.fn(() => ({
    locals: {
      user: { id: "test-user-id", email: "test@example.com" },
    },
    request: new Request("http://localhost:3000"),
    url: new URL("http://localhost:3000"),
  })),
}));

// ============================================================================
// Mock $app/environment
// ============================================================================

vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
}));

// ============================================================================
// Mock $app/stores
// ============================================================================

vi.mock("$app/stores", () => ({
  page: {
    subscribe: vi.fn((fn: (value: unknown) => void) => {
      fn({ url: new URL("http://localhost:3000"), params: {} });
      return () => {};
    }),
  },
  navigating: {
    subscribe: vi.fn((fn: (value: unknown) => void) => {
      fn(null);
      return () => {};
    }),
  },
}));

// ============================================================================
// Mock Prisma Client
// ============================================================================

const mockMemo = {
  findMany: vi.fn().mockResolvedValue([]),
  findFirst: vi.fn().mockResolvedValue(null),
  findUnique: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockImplementation(({ data }) =>
    Promise.resolve({
      ...data,
      id: data.id ?? crypto.randomUUID(),
      createdAt: data.createdAt ?? new Date(),
    }),
  ),
  update: vi.fn().mockImplementation(({ data, where }) =>
    Promise.resolve({
      ...data,
      id: where.id,
    }),
  ),
  delete: vi.fn().mockResolvedValue({}),
  upsert: vi
    .fn()
    .mockImplementation(({ create, update, where }) =>
      Promise.resolve({ ...create, ...update, id: where.id }),
    ),
};

const mockTaskLog = {
  create: vi.fn().mockResolvedValue({
    id: crypto.randomUUID(),
    createdAt: new Date(),
  }),
  findMany: vi.fn().mockResolvedValue([]),
};

const mockCalendarEvent = {
  findMany: vi.fn().mockResolvedValue([]),
  findUnique: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
};

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    memo: mockMemo,
    taskLog: mockTaskLog,
    calendarEvent: mockCalendarEvent,
    $transaction: vi.fn((fn: unknown) => {
      if (typeof fn === "function") {
        return fn({
          memo: mockMemo,
          taskLog: mockTaskLog,
          calendarEvent: mockCalendarEvent,
        });
      }
      return Promise.resolve([]);
    }),
  },
}));

// ============================================================================
// Mock Remote Functions files directly
// These prevent the SvelteKit validation errors
// ============================================================================

// Store to track created memos for updateMemo to reference
const memoStore = new Map<string, Record<string, unknown>>();

vi.mock("$lib/features/tasks/state/memo.functions.remote.ts", () => ({
  fetchMemos: vi.fn().mockResolvedValue([]),
  createMemo: vi.fn().mockImplementation((data) => {
    const id = data.id ?? crypto.randomUUID();
    const memo = {
      ...data,
      id,
      createdAt: data.createdAt ?? new Date().toISOString(),
      status: data.status ?? {
        timeSpentMinutes: 0,
        completionState: "not_started",
      },
    };
    // Store for later updateMemo calls
    memoStore.set(id, memo);
    return Promise.resolve(memo);
  }),
  updateMemo: vi.fn().mockImplementation(({ id, updates }) => {
    // Get existing memo from store, or create a minimal one
    const existing = memoStore.get(id) ?? {
      id,
      title: "Unknown",
      type: "バックログ",
      createdAt: new Date().toISOString(),
      locationPreference: "no_preference",
      status: {
        timeSpentMinutes: 0,
        completionState: "not_started",
      },
    };
    // Apply updates
    const updated = { ...existing, ...updates };
    memoStore.set(id, updated);
    return Promise.resolve(updated);
  }),
  deleteMemo: vi.fn().mockResolvedValue(true),
  logSuggestionComplete: vi.fn().mockResolvedValue({}),
  markMemoAccepted: vi.fn().mockResolvedValue({}),
  resetMemoAcceptedToday: vi.fn().mockResolvedValue({}),
  markMemoRejected: vi.fn().mockResolvedValue({}),
  addDeadlineAcceptedSlot: vi.fn().mockResolvedValue({}),
  removeDeadlineAcceptedSlot: vi.fn().mockResolvedValue({}),
  updateAcceptedSlotDuration: vi.fn().mockResolvedValue({}),
  advanceEventLinkedDeadline: vi.fn().mockResolvedValue({}),
  logTaskCompletion: vi.fn().mockResolvedValue({}),
}));

vi.mock(
  "$lib/features/assistant/services/suggestions/enrich.remote.ts",
  () => ({
    enrichMemo: vi.fn().mockResolvedValue({
      genre: "その他",
      importance: "medium",
      sessionDuration: 30,
      totalDurationExpected: 60,
    }),
  }),
);

vi.mock("$lib/features/assistant/services/sync.remote.ts", () => ({
  loadSyncData: vi.fn().mockResolvedValue({
    memos: [],
    events: [],
    gaps: [],
  }),
}));

vi.mock("$lib/features/calendar/state/calendar.functions.remote.ts", () => ({
  fetchEvents: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({}),
  updateEvent: vi.fn().mockResolvedValue({}),
  deleteEvent: vi.fn().mockResolvedValue(true),
  fetchTimetables: vi.fn().mockResolvedValue([]),
  createTimetable: vi.fn().mockResolvedValue({}),
  updateTimetable: vi.fn().mockResolvedValue({}),
  deleteTimetable: vi.fn().mockResolvedValue(true),
}));

vi.mock("$lib/features/focus/state/focus.remote.ts", () => ({
  logFocusSession: vi.fn().mockResolvedValue({}),
}));

vi.mock("$lib/features/transit/state/transit.remote.ts", () => ({
  fetchDirections: vi.fn().mockResolvedValue(null),
}));

// ============================================================================
// Global fetch mock (if not already mocked)
// ============================================================================

if (typeof global.fetch === "undefined" || !vi.isMockFunction(global.fetch)) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
}

// ============================================================================
// Export mock utilities for tests to customize behavior
// ============================================================================

/**
 * Clear the memo store between tests
 * Call this in beforeEach to ensure isolation
 */
export function clearMemoStore() {
  memoStore.clear();
}

export { mockMemo, mockTaskLog, mockCalendarEvent, memoStore };
