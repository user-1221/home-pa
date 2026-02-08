/**
 * Feature Flags
 *
 * Central configuration for enabling/disabling features.
 * Change a value and restart/rebuild to toggle a feature.
 */

export const featureFlags = {
  /** Max user accounts (0 = unlimited) */
  MAX_ACCOUNTS: 100,

  /** Transit mini app */
  TRANSIT_ENABLED: false,

  /** iCal import in Calendar Settings */
  ICAL_IMPORT_ENABLED: false,

  /** iCal export in Calendar Settings */
  ICAL_EXPORT_ENABLED: false,
} as const;
