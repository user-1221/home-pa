/**
 * Profile Remote Functions
 * All exports MUST be query() or command() - no regular functions allowed
 */
import { query, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { prisma } from "$lib/server/prisma";

// ============= Schemas =============

const SaveProfileSchema = v.object({
  displayName: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(100)))),
  nearestStationId: v.optional(v.nullable(v.string())),
  nearestStationName: v.optional(v.nullable(v.string())),
  nearestStationCoord: v.optional(
    v.nullable(v.object({ lat: v.number(), lon: v.number() })),
  ),
  workplaceStationId: v.optional(v.nullable(v.string())),
  workplaceStationName: v.optional(v.nullable(v.string())),
  workplaceStationCoord: v.optional(
    v.nullable(v.object({ lat: v.number(), lon: v.number() })),
  ),
  status: v.optional(
    v.nullable(v.picklist(["学生", "会社員", "どちらでもない"])),
  ),
  markOnboardingComplete: v.optional(v.boolean()),
});

const CompletedToursSchema = v.object({
  completedTours: v.array(v.string()),
});

// ============= Remote Functions =============

/**
 * Fetch user profile for current user
 */
export const fetchProfile = query(v.optional(v.object({})), async () => {
  const event = getRequestEvent();
  const userId = event.locals.user?.id;
  if (!userId) throw new Error("Unauthorized");

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    return {
      displayName: null,
      nearestStationId: null,
      nearestStationName: null,
      nearestStationCoord: null,
      workplaceStationId: null,
      workplaceStationName: null,
      workplaceStationCoord: null,
      status: null,
      onboardingCompleted: false,
      completedTours: [],
    };
  }

  return {
    displayName: settings.displayName,
    nearestStationId: settings.nearestStationId,
    nearestStationName: settings.nearestStationName,
    nearestStationCoord: settings.nearestStationCoord as {
      lat: number;
      lon: number;
    } | null,
    workplaceStationId: settings.workplaceStationId,
    workplaceStationName: settings.workplaceStationName,
    workplaceStationCoord: settings.workplaceStationCoord as {
      lat: number;
      lon: number;
    } | null,
    status: settings.status,
    onboardingCompleted: settings.onboardingCompleted,
    completedTours: (settings.completedTours as string[]) ?? [],
  };
});

/**
 * Save profile fields (partial update)
 */
export const saveProfile = command(SaveProfileSchema, async (input) => {
  const event = getRequestEvent();
  const userId = event.locals.user?.id;
  if (!userId) throw new Error("Unauthorized");

  const data: Record<string, unknown> = {};

  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.nearestStationId !== undefined)
    data.nearestStationId = input.nearestStationId;
  if (input.nearestStationName !== undefined)
    data.nearestStationName = input.nearestStationName;
  if (input.nearestStationCoord !== undefined)
    data.nearestStationCoord = input.nearestStationCoord;
  if (input.workplaceStationId !== undefined)
    data.workplaceStationId = input.workplaceStationId;
  if (input.workplaceStationName !== undefined)
    data.workplaceStationName = input.workplaceStationName;
  if (input.workplaceStationCoord !== undefined)
    data.workplaceStationCoord = input.workplaceStationCoord;
  if (input.status !== undefined) data.status = input.status;
  if (input.markOnboardingComplete) data.onboardingCompleted = true;

  return prisma.userSettings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
});

/**
 * Mark onboarding as completed (for skip flow)
 */
export const completeOnboarding = command(
  v.optional(v.object({})),
  async () => {
    const event = getRequestEvent();
    const userId = event.locals.user?.id;
    if (!userId) throw new Error("Unauthorized");

    return prisma.userSettings.upsert({
      where: { userId },
      update: { onboardingCompleted: true },
      create: { userId, onboardingCompleted: true },
    });
  },
);

/**
 * Update completed tours list
 */
export const updateCompletedTours = command(
  CompletedToursSchema,
  async (input) => {
    const event = getRequestEvent();
    const userId = event.locals.user?.id;
    if (!userId) throw new Error("Unauthorized");

    return prisma.userSettings.upsert({
      where: { userId },
      update: { completedTours: input.completedTours },
      create: { userId, completedTours: input.completedTours },
    });
  },
);
