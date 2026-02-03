/**
 * Timetable Remote Functions
 * All exports MUST be query() or command() - no regular functions allowed
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";

// ============= Schemas =============

const ExceptionRangeSchema = v.object({
  start: v.string(), // YYYY-MM-DD
  end: v.string(), // YYYY-MM-DD
});

const TimetableConfigInputSchema = v.object({
  dayStartTime: v.string(),
  lunchStartTime: v.string(),
  lunchEndTime: v.string(),
  breakDuration: v.number(),
  cellDuration: v.number(),
  exceptionRanges: v.optional(v.array(ExceptionRangeSchema)),
  daysPerWeek: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(6)),
  ),
  slotsPerDay: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(6)),
  ),
});

const TimetableCellInputSchema = v.object({
  dayOfWeek: v.number(),
  slotIndex: v.number(),
  title: v.string(),
  attendance: v.picklist(["出席する", "出席しない"]),
  workAllowed: v.picklist(["作業可", "作業不可"]),
});

const DeleteCellInputSchema = v.object({
  id: v.string(),
});

// ============= Remote Functions =============

/**
 * Fetch timetable config for current user
 */
export const fetchTimetableConfig = query(
  v.optional(v.object({})),
  async () => {
    const event = getRequestEvent();
    const userId = event.locals.user?.id;
    if (!userId) throw new Error("Unauthorized");

    const config = await prisma.timetableConfig.findUnique({
      where: { userId },
    });

    // Return default if not found
    if (!config) {
      return {
        id: null,
        dayStartTime: "09:00",
        lunchStartTime: "12:00",
        lunchEndTime: "13:00",
        breakDuration: 10,
        cellDuration: 50,
        exceptionRanges: [] as Array<{ start: string; end: string }>,
        daysPerWeek: 5,
        slotsPerDay: 5,
      };
    }

    // Parse exceptionRanges from JSON
    const exceptionRanges = config.exceptionRanges
      ? (config.exceptionRanges as Array<{ start: string; end: string }>)
      : [];

    return {
      ...config,
      exceptionRanges,
      daysPerWeek: config.daysPerWeek ?? 5,
      slotsPerDay: config.slotsPerDay ?? 5,
    };
  },
);

/**
 * Upsert timetable config for current user
 */
export const upsertTimetableConfig = command(
  TimetableConfigInputSchema,
  async (input) => {
    const event = getRequestEvent();
    const userId = event.locals.user?.id;
    if (!userId) throw new Error("Unauthorized");

    return prisma.timetableConfig.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });
  },
);

/**
 * Fetch all timetable cells for current user
 */
export const fetchTimetableCells = query(v.optional(v.object({})), async () => {
  const event = getRequestEvent();
  const userId = event.locals.user?.id;
  if (!userId) throw new Error("Unauthorized");

  return prisma.timetableCell.findMany({
    where: { userId },
    orderBy: [{ dayOfWeek: "asc" }, { slotIndex: "asc" }],
  });
});

/**
 * Upsert a single timetable cell
 */
export const upsertTimetableCell = command(
  TimetableCellInputSchema,
  async (input) => {
    const event = getRequestEvent();
    const userId = event.locals.user?.id;
    if (!userId) throw new Error("Unauthorized");

    return prisma.timetableCell.upsert({
      where: {
        userId_dayOfWeek_slotIndex: {
          userId,
          dayOfWeek: input.dayOfWeek,
          slotIndex: input.slotIndex,
        },
      },
      update: input,
      create: { userId, ...input },
    });
  },
);

/**
 * Delete a timetable cell by ID
 */
export const deleteTimetableCell = command(
  DeleteCellInputSchema,
  async (input) => {
    const event = getRequestEvent();
    const userId = event.locals.user?.id;
    if (!userId) throw new Error("Unauthorized");

    // Verify ownership before deleting
    const existing = await prisma.timetableCell.findFirst({
      where: { id: input.id, userId },
    });

    if (!existing) {
      throw new Error("Cell not found or unauthorized");
    }

    return prisma.timetableCell.delete({
      where: { id: input.id },
    });
  },
);
