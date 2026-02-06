/**
 * @fileoverview Remote Functions for Some-Timing Items
 *
 * CRUD operations for "sometime today" items that don't have a specific time slot.
 */

import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";

// ============================================================================
// HELPER - Get authenticated user
// ============================================================================

function getAuthenticatedUser(): string {
  const event = getRequestEvent();
  if (!event.locals.user?.id) {
    throw new Error("Unauthorized");
  }
  return event.locals.user.id;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const DateRangeSchema = v.object({
  start: v.string(), // ISO date string
  end: v.string(), // ISO date string
});

const CreateItemSchema = v.object({
  title: v.string(),
  date: v.string(), // ISO date string (YYYY-MM-DD)
  description: v.optional(v.string()),
  color: v.optional(v.string()),
  importance: v.optional(v.picklist(["low", "medium", "high"])),
  rrule: v.optional(v.string()),
});

const UpdateItemSchema = v.object({
  id: v.string(),
  updates: v.object({
    title: v.optional(v.string()),
    date: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    importance: v.optional(v.picklist(["low", "medium", "high"])),
    rrule: v.optional(v.string()),
  }),
});

const DeleteItemSchema = v.object({
  id: v.string(),
});

// ============================================================================
// TYPES
// ============================================================================

export interface SomeTimingItemData {
  id: string;
  title: string;
  date: string; // ISO date string
  description?: string;
  color?: string;
  importance?: "low" | "medium" | "high";
  hasRecurrence: boolean;
  rrule?: string;
  masterItemId?: string;
}

// ============================================================================
// REMOTE FUNCTIONS
// ============================================================================

/**
 * Load some-timing items for a date range
 */
export const loadSomeTimingItems = query(DateRangeSchema, async (input) => {
  const userId = getAuthenticatedUser();
  const { start, end } = input;

  const startDate = new Date(start);
  const endDate = new Date(end);

  const items = await prisma.someTimingItem.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: "asc" },
  });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    date: item.date.toISOString(),
    description: item.description ?? undefined,
    color: item.color ?? undefined,
    importance: item.importance as "low" | "medium" | "high" | undefined,
    hasRecurrence: item.hasRecurrence,
    rrule: item.rrule ?? undefined,
    masterItemId: item.masterItemId ?? undefined,
  }));
});

/**
 * Create a new some-timing item
 */
export const createSomeTimingItem = command(CreateItemSchema, async (data) => {
  const userId = getAuthenticatedUser();

  // Parse date to UTC midnight
  const [year, month, day] = data.date.split("-").map(Number);
  const dateUTC = new Date(Date.UTC(year, month - 1, day));

  const item = await prisma.someTimingItem.create({
    data: {
      userId,
      title: data.title,
      date: dateUTC,
      description: data.description,
      color: data.color,
      importance: data.importance,
      rrule: data.rrule,
      hasRecurrence: !!data.rrule,
    },
  });

  return {
    id: item.id,
    title: item.title,
    date: item.date.toISOString(),
    description: item.description ?? undefined,
    color: item.color ?? undefined,
    importance: item.importance as "low" | "medium" | "high" | undefined,
    hasRecurrence: item.hasRecurrence,
    rrule: item.rrule ?? undefined,
    masterItemId: item.masterItemId ?? undefined,
  };
});

/**
 * Update a some-timing item
 */
export const updateSomeTimingItem = command(UpdateItemSchema, async (input) => {
  const userId = getAuthenticatedUser();
  const { id, updates } = input;

  // Build update object
  const updateData: Record<string, unknown> = {};

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined)
    updateData.description = updates.description;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.importance !== undefined)
    updateData.importance = updates.importance;
  if (updates.rrule !== undefined) {
    updateData.rrule = updates.rrule;
    updateData.hasRecurrence = !!updates.rrule;
  }
  if (updates.date !== undefined) {
    const [year, month, day] = updates.date.split("-").map(Number);
    updateData.date = new Date(Date.UTC(year, month - 1, day));
  }

  const item = await prisma.someTimingItem.update({
    where: {
      id,
      userId,
    },
    data: updateData,
  });

  return {
    id: item.id,
    title: item.title,
    date: item.date.toISOString(),
    description: item.description ?? undefined,
    color: item.color ?? undefined,
    importance: item.importance as "low" | "medium" | "high" | undefined,
    hasRecurrence: item.hasRecurrence,
    rrule: item.rrule ?? undefined,
    masterItemId: item.masterItemId ?? undefined,
  };
});

/**
 * Delete a some-timing item
 */
export const deleteSomeTimingItem = command(DeleteItemSchema, async (input) => {
  const userId = getAuthenticatedUser();
  const { id } = input;

  await prisma.someTimingItem.delete({
    where: {
      id,
      userId,
    },
  });

  return { success: true };
});
