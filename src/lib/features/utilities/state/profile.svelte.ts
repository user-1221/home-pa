/**
 * User Profile State
 *
 * Manages profile data (display name, stations, status, onboarding, tours).
 * DB-synced when authenticated. Falls back to localStorage for initial render.
 *
 * @scope singleton
 * @owner src/routes/+layout.svelte
 * @cleanup none - State persists across navigation
 */
import { browser } from "$app/environment";
import {
  fetchProfile,
  saveProfile,
  completeOnboarding,
  updateCompletedTours,
} from "./profile.ts";

// ============================================================================
// Types
// ============================================================================

export interface StationProfile {
  id: string;
  name: string;
  coord: { lat: number; lon: number };
}

export type ProfileStatus = "学生" | "会社員" | "どちらでもない";

// ============================================================================
// State
// ============================================================================

let displayName = $state<string | null>(null);
let nearestStation = $state<StationProfile | null>(null);
let workplaceStation = $state<StationProfile | null>(null);
let status = $state<ProfileStatus | null>(null);
let onboardingCompleted = $state(false);
let completedTours = $state<string[]>([]);
let isLoaded = $state(false);
let isSaving = $state(false);

// Load from localStorage as fallback (for initial render)
if (browser) {
  const cached = localStorage.getItem("profileState");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      displayName = parsed.displayName ?? null;
      nearestStation = parsed.nearestStation ?? null;
      workplaceStation = parsed.workplaceStation ?? null;
      status = parsed.status ?? null;
      onboardingCompleted = parsed.onboardingCompleted ?? false;
      completedTours = parsed.completedTours ?? [];
    } catch {
      // Ignore invalid cache
    }
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

function saveToLocalStorage(): void {
  if (!browser) return;
  localStorage.setItem(
    "profileState",
    JSON.stringify({
      displayName,
      nearestStation,
      workplaceStation,
      status,
      onboardingCompleted,
      completedTours,
    }),
  );
}

// ============================================================================
// Exported state object
// ============================================================================

export const profileState = {
  get displayName() {
    return displayName;
  },
  get nearestStation() {
    return nearestStation;
  },
  get workplaceStation() {
    return workplaceStation;
  },
  get status() {
    return status;
  },
  get onboardingCompleted() {
    return onboardingCompleted;
  },
  get completedTours() {
    return completedTours;
  },
  get isLoaded() {
    return isLoaded;
  },
  get isSaving() {
    return isSaving;
  },

  /**
   * Load profile from DB (called in bootstrap after auth)
   */
  async loadFromDB(): Promise<void> {
    if (!browser) return;

    try {
      const profile = await fetchProfile({});

      displayName = profile.displayName;
      nearestStation = profile.nearestStationId
        ? {
            id: profile.nearestStationId,
            name: profile.nearestStationName ?? "",
            coord: profile.nearestStationCoord ?? { lat: 0, lon: 0 },
          }
        : null;
      workplaceStation = profile.workplaceStationId
        ? {
            id: profile.workplaceStationId,
            name: profile.workplaceStationName ?? "",
            coord: profile.workplaceStationCoord ?? { lat: 0, lon: 0 },
          }
        : null;
      status = profile.status as ProfileStatus | null;
      onboardingCompleted = profile.onboardingCompleted;
      completedTours = profile.completedTours;

      saveToLocalStorage();
      isLoaded = true;
    } catch (err) {
      console.error("[profile] Failed to load from DB:", err);
      // Keep localStorage values as fallback
      isLoaded = true;
    }
  },

  /**
   * Save profile data to DB
   */
  async save(data: {
    displayName?: string | null;
    nearestStation?: StationProfile | null;
    workplaceStation?: StationProfile | null;
    status?: ProfileStatus | null;
    markOnboardingComplete?: boolean;
  }): Promise<void> {
    if (!browser) return;

    isSaving = true;
    try {
      await saveProfile({
        displayName: data.displayName,
        nearestStationId: data.nearestStation?.id ?? null,
        nearestStationName: data.nearestStation?.name ?? null,
        nearestStationCoord: data.nearestStation?.coord ?? null,
        workplaceStationId: data.workplaceStation?.id ?? null,
        workplaceStationName: data.workplaceStation?.name ?? null,
        workplaceStationCoord: data.workplaceStation?.coord ?? null,
        status: data.status,
        markOnboardingComplete: data.markOnboardingComplete,
      });

      // Update local state
      if (data.displayName !== undefined) displayName = data.displayName;
      if (data.nearestStation !== undefined)
        nearestStation = data.nearestStation;
      if (data.workplaceStation !== undefined)
        workplaceStation = data.workplaceStation;
      if (data.status !== undefined) status = data.status;
      if (data.markOnboardingComplete) onboardingCompleted = true;

      saveToLocalStorage();
    } catch (err) {
      console.error("[profile] Failed to save:", err);
      throw err;
    } finally {
      isSaving = false;
    }
  },

  /**
   * Mark onboarding as completed without saving profile data (skip flow)
   */
  async markOnboardingComplete(): Promise<void> {
    if (!browser) return;

    isSaving = true;
    try {
      await completeOnboarding({});
      onboardingCompleted = true;
      saveToLocalStorage();
    } catch (err) {
      console.error("[profile] Failed to complete onboarding:", err);
      throw err;
    } finally {
      isSaving = false;
    }
  },

  /**
   * Check if a page tour has been completed
   */
  hasCompletedTour(pageId: string): boolean {
    return completedTours.includes(pageId);
  },

  /**
   * Mark a page tour as completed
   */
  async markTourCompleted(pageId: string): Promise<void> {
    if (completedTours.includes(pageId)) return;

    const updated = [...completedTours, pageId];
    completedTours = updated;
    saveToLocalStorage();

    try {
      await updateCompletedTours({ completedTours: updated });
    } catch (err) {
      console.error("[profile] Failed to save tour completion:", err);
    }
  },

  /**
   * Reset all completed tours (for replay)
   */
  async resetTours(): Promise<void> {
    completedTours = [];
    saveToLocalStorage();

    try {
      await updateCompletedTours({ completedTours: [] });
    } catch (err) {
      console.error("[profile] Failed to reset tours:", err);
    }
  },
};
