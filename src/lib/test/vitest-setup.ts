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
  findMany: vi.fn(() => Promise.resolve([])),
  findFirst: vi.fn(() => Promise.resolve(null)),
  findUnique: vi.fn(() => Promise.resolve(null)),
  create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      ...data,
      id: data.id ?? crypto.randomUUID(),
      createdAt: data.createdAt ?? new Date(),
    }),
  ),
  update: vi.fn(
    ({
      data,
      where,
    }: {
      data: Record<string, unknown>;
      where: { id: string };
    }) =>
      Promise.resolve({
        ...data,
        id: where.id,
      }),
  ),
  delete: vi.fn(() => Promise.resolve({})),
  upsert: vi.fn(
    ({
      create,
      update,
      where,
    }: {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      where: { id: string };
    }) => Promise.resolve({ ...create, ...update, id: where.id }),
  ),
};

const mockTaskLog = {
  create: vi.fn(() =>
    Promise.resolve({
      id: crypto.randomUUID(),
      createdAt: new Date(),
    }),
  ),
  findMany: vi.fn(() => Promise.resolve([])),
};

const mockCalendarEvent = {
  findMany: vi.fn(() => Promise.resolve([])),
  findUnique: vi.fn(() => Promise.resolve(null)),
  create: vi.fn(() => Promise.resolve({})),
  update: vi.fn(() => Promise.resolve({})),
  delete: vi.fn(() => Promise.resolve({})),
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
  fetchMemos: vi.fn(() => Promise.resolve([])),
  createMemo: vi.fn((data: Record<string, unknown>) => {
    const id = (data.id as string) ?? crypto.randomUUID();
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
  updateMemo: vi.fn(
    ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
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
    },
  ),
  deleteMemo: vi.fn(() => Promise.resolve(true)),
  logSuggestionComplete: vi.fn(() => Promise.resolve({})),
  markMemoAccepted: vi.fn(() => Promise.resolve({})),
  resetMemoAcceptedToday: vi.fn(() => Promise.resolve({})),
  markMemoRejected: vi.fn(() => Promise.resolve({})),
  addDeadlineAcceptedSlot: vi.fn(() => Promise.resolve({})),
  removeDeadlineAcceptedSlot: vi.fn(() => Promise.resolve({})),
  updateAcceptedSlotDuration: vi.fn(() => Promise.resolve({})),
  advanceEventLinkedDeadline: vi.fn(() => Promise.resolve({})),
  logTaskCompletion: vi.fn(() => Promise.resolve({})),
}));

vi.mock(
  "$lib/features/assistant/services/suggestions/enrich.remote.ts",
  () => ({
    enrichMemo: vi.fn(() =>
      Promise.resolve({
        genre: "その他",
        importance: "medium",
        sessionDuration: 30,
        totalDurationExpected: 60,
      }),
    ),
  }),
);

vi.mock("$lib/features/assistant/services/sync.remote.ts", () => ({
  loadSyncData: vi.fn(() =>
    Promise.resolve({
      memos: [],
      events: [],
      gaps: [],
    }),
  ),
}));

vi.mock("$lib/features/calendar/state/calendar.functions.remote.ts", () => ({
  fetchEvents: vi.fn(() => Promise.resolve([])),
  createEvent: vi.fn(() => Promise.resolve({})),
  updateEvent: vi.fn(() => Promise.resolve({})),
  deleteEvent: vi.fn(() => Promise.resolve(true)),
  fetchTimetables: vi.fn(() => Promise.resolve([])),
  createTimetable: vi.fn(() => Promise.resolve({})),
  updateTimetable: vi.fn(() => Promise.resolve({})),
  deleteTimetable: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("$lib/features/focus/state/focus.remote.ts", () => ({
  logFocusSession: vi.fn(() => Promise.resolve({})),
}));

vi.mock("$lib/features/transit/state/transit.remote.ts", () => ({
  fetchDirections: vi.fn(() => Promise.resolve(null)),
}));

// ============================================================================
// Global fetch mock
// ============================================================================

globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: false,
    status: 500,
    json: async () => ({}),
  } as Response),
) as unknown as typeof fetch;

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
