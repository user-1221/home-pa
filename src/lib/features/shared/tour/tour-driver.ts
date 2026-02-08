/**
 * Tour Driver - Wrapper around Driver.js for consistent app tours.
 *
 * Provides per-page feature tours with automatic tracking of completion.
 * Tours only show once per page unless reset via Settings.
 */
import { driver, type DriveStep, type Config } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour-styles.css";
import { profileState } from "$lib/features/utilities/state/profile.svelte.ts";

export type { DriveStep };

/**
 * Create a configured Driver.js instance with app-consistent styling.
 */
function createDriver(
  pageId: string,
  steps: DriveStep[],
): ReturnType<typeof driver> {
  const config: Config = {
    steps,
    animate: true,
    overlayColor: "#000",
    overlayOpacity: 0.5,
    stagePadding: 8,
    stageRadius: 8,
    allowClose: true,
    overlayClickBehavior: "close" as const,
    smoothScroll: true,
    allowKeyboardControl: true,
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    showButtons: ["next", "previous", "close"],
    nextBtnText: "次へ",
    prevBtnText: "戻る",
    doneBtnText: "完了",
    popoverClass: "home-pa-tour",
    popoverOffset: 12,
    onDestroyed: () => {
      profileState.markTourCompleted(pageId);
    },
  };

  return driver(config);
}

/**
 * Start a page tour only if the user hasn't seen it yet.
 * Call this in onMount of each page component.
 */
export function startTourIfNew(pageId: string, steps: DriveStep[]): void {
  // Don't start if profile not loaded yet or tour already completed
  if (!profileState.isLoaded) return;
  if (profileState.hasCompletedTour(pageId)) return;
  // Don't start tour if onboarding hasn't been completed
  if (!profileState.onboardingCompleted) return;

  if (steps.length === 0) return;

  const tourDriver = createDriver(pageId, steps);
  tourDriver.drive();
}
