/**
 * Device identification utilities
 *
 * Provides consistent device identification across the app
 * for cross-device sync features (SSE, timer sync, etc.)
 */

const DEVICE_ID_KEY = "device_id";

/**
 * Get or create a persistent device ID
 * Returns 'server' if localStorage is unavailable (SSR)
 */
export function getDeviceId(): string {
  if (typeof localStorage === "undefined") {
    return "server";
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Get a human-readable device name based on user agent
 */
export function getDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "Server";
  }

  const ua = navigator.userAgent;
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Mac")) return "Mac";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Linux")) return "Linux";
  return "Browser";
}
