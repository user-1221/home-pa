/**
 * User Settings Remote Functions
 * All exports MUST be query() or command() - no regular functions allowed
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";

// ============= Schemas =============

const UpdateActiveTimeSchema = v.object({
  activeStartTime: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
  activeEndTime: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
});

// ============= Remote Functions =============

/**
 * Fetch user settings for current user
 */
export const fetchUserSettings = query(v.optional(v.object({})), async () => {
  const event = getRequestEvent();
  const userId = event.locals.user?.id;
  if (!userId) throw new Error("Unauthorized");

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  // Return defaults if not found
  if (!settings) {
    return {
      id: null,
      activeStartTime: "08:00",
      activeEndTime: "23:00",
    };
  }

  return {
    id: settings.id,
    activeStartTime: settings.activeStartTime,
    activeEndTime: settings.activeEndTime,
  };
});

/**
 * Update active time settings
 */
export const updateActiveTime = command(
  UpdateActiveTimeSchema,
  async (input) => {
    const event = getRequestEvent();
    const userId = event.locals.user?.id;
    if (!userId) throw new Error("Unauthorized");

    return prisma.userSettings.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });
  },
);
