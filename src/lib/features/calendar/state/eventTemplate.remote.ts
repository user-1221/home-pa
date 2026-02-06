/**
 * Event Template Remote Functions (Server-side)
 *
 * Server-side Remote Functions for event template operations.
 * Templates store event patterns for autocomplete suggestions based on past events.
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
// SCHEMAS
// ============================================================================

const TemplateSearchSchema = v.object({
  titlePrefix: v.string(),
  limit: v.optional(v.number()),
});

const TemplateSaveSchema = v.object({
  title: v.string(),
  importance: v.picklist(["low", "medium", "high"]),
  color: v.optional(v.string()),
  address: v.optional(v.string()),
  timeLabel: v.picklist(["all-day", "timed"]),
  defaultStartTime: v.optional(v.string()),
  defaultEndTime: v.optional(v.string()),
  defaultDuration: v.optional(v.number()),
});

// ============================================================================
// TYPES
// ============================================================================

export interface EventTemplateData {
  id: string;
  title: string;
  importance: "low" | "medium" | "high";
  color?: string;
  address?: string;
  timeLabel: "all-day" | "timed";
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultDuration?: number;
  useCount: number;
  lastUsedAt: string;
}

// ============================================================================
// REMOTE FUNCTIONS
// ============================================================================

/**
 * Search for event templates matching a title prefix
 * Used for autocomplete suggestions when typing event title
 */
export const searchTemplates = query(TemplateSearchSchema, async (input) => {
  const userId = getAuthenticatedUser();
  const limit = input.limit ?? 5;

  if (!input.titlePrefix.trim()) {
    return [];
  }

  try {
    const templates = await prisma.eventTemplate.findMany({
      where: {
        userId,
        title: {
          contains: input.titlePrefix.trim(),
          mode: "insensitive",
        },
      },
      orderBy: [
        { useCount: "desc" }, // Most used first
        { lastUsedAt: "desc" }, // Most recently used
      ],
      take: limit,
    });

    return templates.map(
      (t): EventTemplateData => ({
        id: t.id,
        title: t.title,
        importance: t.importance as "low" | "medium" | "high",
        color: t.color ?? undefined,
        address: t.address ?? undefined,
        timeLabel: t.timeLabel as "all-day" | "timed",
        defaultStartTime: t.defaultStartTime ?? undefined,
        defaultEndTime: t.defaultEndTime ?? undefined,
        defaultDuration: t.defaultDuration ?? undefined,
        useCount: t.useCount,
        lastUsedAt: t.lastUsedAt.toISOString(),
      }),
    );
  } catch (err) {
    console.error("[searchTemplates] Error:", err);
    return [];
  }
});

/**
 * Save or update an event template
 * Called when an event is created or updated to learn from user patterns
 */
export const saveTemplate = command(TemplateSaveSchema, async (input) => {
  const userId = getAuthenticatedUser();

  try {
    // Check if template with same title+importance exists
    const existing = await prisma.eventTemplate.findUnique({
      where: {
        userId_title_importance: {
          userId,
          title: input.title.trim(),
          importance: input.importance,
        },
      },
    });

    if (existing) {
      // Update existing template
      const updated = await prisma.eventTemplate.update({
        where: { id: existing.id },
        data: {
          color: input.color ?? existing.color,
          address: input.address ?? existing.address,
          timeLabel: input.timeLabel,
          defaultStartTime: input.defaultStartTime ?? existing.defaultStartTime,
          defaultEndTime: input.defaultEndTime ?? existing.defaultEndTime,
          defaultDuration: input.defaultDuration ?? existing.defaultDuration,
          useCount: existing.useCount + 1,
          lastUsedAt: new Date(),
        },
      });

      return {
        id: updated.id,
        isNew: false,
      };
    } else {
      // Create new template
      const created = await prisma.eventTemplate.create({
        data: {
          userId,
          title: input.title.trim(),
          importance: input.importance,
          color: input.color,
          address: input.address,
          timeLabel: input.timeLabel,
          defaultStartTime: input.defaultStartTime,
          defaultEndTime: input.defaultEndTime,
          defaultDuration: input.defaultDuration,
          useCount: 1,
          lastUsedAt: new Date(),
        },
      });

      return {
        id: created.id,
        isNew: true,
      };
    }
  } catch (err) {
    console.error("[saveTemplate] Error:", err);
    throw new Error("Failed to save template");
  }
});

/**
 * Get all templates for the current user (for management UI)
 */
export const getAllTemplates = query(v.object({}), async () => {
  const userId = getAuthenticatedUser();

  try {
    const templates = await prisma.eventTemplate.findMany({
      where: { userId },
      orderBy: [{ useCount: "desc" }, { lastUsedAt: "desc" }],
    });

    return templates.map(
      (t): EventTemplateData => ({
        id: t.id,
        title: t.title,
        importance: t.importance as "low" | "medium" | "high",
        color: t.color ?? undefined,
        address: t.address ?? undefined,
        timeLabel: t.timeLabel as "all-day" | "timed",
        defaultStartTime: t.defaultStartTime ?? undefined,
        defaultEndTime: t.defaultEndTime ?? undefined,
        defaultDuration: t.defaultDuration ?? undefined,
        useCount: t.useCount,
        lastUsedAt: t.lastUsedAt.toISOString(),
      }),
    );
  } catch (err) {
    console.error("[getAllTemplates] Error:", err);
    return [];
  }
});

/**
 * Delete a template
 */
export const deleteTemplate = command(
  v.object({ id: v.string() }),
  async (input) => {
    const userId = getAuthenticatedUser();

    try {
      await prisma.eventTemplate.deleteMany({
        where: {
          id: input.id,
          userId, // Ensure user owns this template
        },
      });

      return { success: true };
    } catch (err) {
      console.error("[deleteTemplate] Error:", err);
      throw new Error("Failed to delete template");
    }
  },
);
