/**
 * Application Settings State
 *
 * Manages user preferences. DB-synced when authenticated.
 * Falls back to localStorage for initial render before DB load.
 *
 * @scope singleton
 * @owner src/routes/+layout.svelte
 * @cleanup none - State persists across navigation
 */
import { browser } from "$app/environment";

// Active hours for gap finding in assistant view
let activeStartTime = $state("08:00");
let activeEndTime = $state("23:00");
let isLoaded = $state(false);
let isSaving = $state(false);

// Load from localStorage as fallback (for initial render)
if (browser) {
  const savedStart = localStorage.getItem("activeStartTime");
  const savedEnd = localStorage.getItem("activeEndTime");
  if (savedStart) activeStartTime = savedStart;
  if (savedEnd) activeEndTime = savedEnd;
}

/**
 * Load settings from DB (called after authentication)
 */
async function loadFromDB(): Promise<void> {
  if (!browser) return;

  try {
    const { fetchUserSettings } = await import(
      "$lib/features/assistant/state/user-settings.remote"
    );
    const settings = await fetchUserSettings({});

    activeStartTime = settings.activeStartTime;
    activeEndTime = settings.activeEndTime;

    // Update localStorage as cache
    localStorage.setItem("activeStartTime", activeStartTime);
    localStorage.setItem("activeEndTime", activeEndTime);

    isLoaded = true;
  } catch (err) {
    console.error("[settings] Failed to load from DB:", err);
    // Keep localStorage values as fallback
    isLoaded = true;
  }
}

/**
 * Save to DB
 */
async function saveToDB(): Promise<void> {
  if (!browser) return;

  isSaving = true;
  try {
    const { updateActiveTime } = await import(
      "$lib/features/assistant/state/user-settings.remote"
    );
    await updateActiveTime({
      activeStartTime,
      activeEndTime,
    });

    // Update localStorage as cache
    localStorage.setItem("activeStartTime", activeStartTime);
    localStorage.setItem("activeEndTime", activeEndTime);
  } catch (err) {
    console.error("[settings] Failed to save to DB:", err);
    throw err;
  } finally {
    isSaving = false;
  }
}

export const settingsState = {
  get activeStartTime() {
    return activeStartTime;
  },
  get activeEndTime() {
    return activeEndTime;
  },
  get isLoaded() {
    return isLoaded;
  },
  get isSaving() {
    return isSaving;
  },

  setActiveStartTime(value: string) {
    activeStartTime = value;
    // Don't save immediately - UI component handles debounce
  },

  setActiveEndTime(value: string) {
    activeEndTime = value;
    // Don't save immediately - UI component handles debounce
  },

  // Explicit save method for UI to call
  async save(): Promise<void> {
    await saveToDB();
  },

  // Load from DB (called in bootstrap)
  async loadFromDB(): Promise<void> {
    await loadFromDB();
  },
};
