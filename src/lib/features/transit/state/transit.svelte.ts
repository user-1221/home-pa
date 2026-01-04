/**
 * Transit State Management
 *
 * Manages user location, route calculations, and caching.
 * Uses Svelte 5 runes for reactivity.
 */

import { calendarState } from "$lib/features/calendar/state/calendar.svelte.ts";
import type { Event } from "$lib/types.ts";
import type { ExpandedOccurrence } from "$lib/features/calendar/state/calendar.types.ts";
import {
  searchRoutes,
  searchAddress,
  searchStations,
  type Route,
  type RouteSearchResult,
  type AddressItem,
  type TransportNode,
} from "../services/transit-api.remote.ts";
import {
  loadSyncData,
  saveCachedTransit,
  removeCachedTransit,
  clearCachedTransit,
  type SyncedCachedTransit,
} from "$lib/features/assistant/services/sync.remote.ts";

// ============================================================================
// Types
// ============================================================================

export interface UserLocation {
  lat: number;
  lon: number;
  timestamp: number; // When location was captured
  accuracy?: number; // GPS accuracy in meters
}

export interface DepartureOption {
  bufferMinutes: number; // 5, 10, or 20 minutes before event
  departureTime: Date;
  arrivalTime: Date;
  route: Route;
  label: string;
}

export interface TransitInfo {
  event: Event | ExpandedOccurrence;
  eventLocation: string;
  eventStart: Date;
  importance: string;
  bufferMinutes: number; // Recommended buffer based on importance
  recommendedDeparture: DepartureOption | null; // The recommended departure option
  leaveNowRoute: Route | null;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const LOCATION_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const LOCATION_DISTANCE_THRESHOLD_M = 100; // 100 meters

// Buffer times based on event importance
const IMPORTANCE_BUFFER_MAP: Record<string, number> = {
  high: 20, // Important events: arrive 20 min early
  medium: 10, // Normal events: arrive 10 min early
  low: 5, // Low priority: arrive 5 min early
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if cached location is still valid
 */
function isLocationValid(location: UserLocation | null): boolean {
  if (!location) return false;
  const now = Date.now();
  return now - location.timestamp < LOCATION_CACHE_DURATION_MS;
}

/**
 * Check if new location is significantly different from cached
 */
function isLocationChanged(
  cached: UserLocation | null,
  current: UserLocation,
): boolean {
  if (!cached) return true;
  const distance = calculateDistance(
    cached.lat,
    cached.lon,
    current.lat,
    current.lon,
  );
  return distance > LOCATION_DISTANCE_THRESHOLD_M;
}

/**
 * Format datetime for API (YYYY-MM-DDTHH:mm:ss)
 */
function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Get the next event with a location
 */
function getNextEventWithLocation(): Event | ExpandedOccurrence | null {
  const now = new Date();

  // Combine events and occurrences
  const allEvents: (Event | ExpandedOccurrence)[] = [
    ...calendarState.events,
    ...calendarState.occurrences,
  ];

  // Filter to future events with location
  const futureEventsWithLocation = allEvents.filter((event) => {
    const hasLocation =
      ("address" in event && event.address) ||
      ("location" in event && event.location);
    const isFuture = new Date(event.start) > now;
    return hasLocation && isFuture;
  });

  // Sort by start time and return the first one
  futureEventsWithLocation.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  return futureEventsWithLocation[0] ?? null;
}

/**
 * Get location string from event
 */
function getEventLocation(event: Event | ExpandedOccurrence): string {
  if ("address" in event && event.address) {
    return event.address;
  }
  if ("location" in event && event.location) {
    return event.location;
  }
  return "";
}

/**
 * Get event ID (handles both Event and ExpandedOccurrence)
 */
function getEventId(event: Event | ExpandedOccurrence): string {
  // ExpandedOccurrence has eventId, Event has id
  if ("eventId" in event) {
    // Include the start time for occurrences to differentiate them
    return `${event.eventId}-${new Date(event.start).getTime()}`;
  }
  return event.id;
}

// ============================================================================
// Transit State Class
// ============================================================================

class TransitState {
  // User location (cached)
  userLocation = $state<UserLocation | null>(null);
  isLoadingLocation = $state(false);
  locationError = $state<string | null>(null);

  // Transit info for next event
  transitInfo = $state<TransitInfo | null>(null);
  isLoadingRoutes = $state(false);
  routeError = $state<string | null>(null);

  // Cache for route results (keyed by start+goal+time)
  private routeCache = new Map<string, RouteSearchResult>();

  // Cache for geocoding results (keyed by address string)
  private geocodeCache = new Map<string, AddressItem | null>();

  // Cache context for transit info (to avoid redundant API calls)
  private lastTransitContext: {
    eventId: string;
    eventLocation: string;
    userLocation: UserLocation;
  } | null = null;

  // Whether synced transit data has been loaded
  private isSyncLoaded = false;

  // ============================================================================
  // Location Methods
  // ============================================================================

  /**
   * Get current user location via Geolocation API
   * Uses cache if available and recent
   */
  async getCurrentLocation(forceRefresh = false): Promise<UserLocation | null> {
    // Use cache if valid and not forcing refresh
    if (!forceRefresh && isLocationValid(this.userLocation)) {
      console.log("[Transit] Using cached location");
      return this.userLocation;
    }

    // Check if geolocation is available
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      this.locationError = "このブラウザでは位置情報がサポートされていません";
      console.error("[Transit] Geolocation not supported");
      return null;
    }

    console.log("[Transit] Requesting geolocation permission...");
    this.isLoadingLocation = true;
    this.locationError = null;

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation: UserLocation = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            timestamp: Date.now(),
            accuracy: position.coords.accuracy,
          };

          // Only update if location changed significantly or cache expired
          if (
            !isLocationValid(this.userLocation) ||
            isLocationChanged(this.userLocation, newLocation)
          ) {
            console.log("[Transit] Location updated:", newLocation);
            this.userLocation = newLocation;
          } else {
            console.log("[Transit] Location unchanged, keeping cache");
          }

          this.isLoadingLocation = false;
          resolve(this.userLocation);
        },
        (error) => {
          console.error("[Transit] Geolocation error:", error);
          this.locationError = this.getLocationErrorMessage(error);
          this.isLoadingLocation = false;
          resolve(this.userLocation); // Return cached location if available
        },
        {
          enableHighAccuracy: false, // Try low accuracy first (faster, uses network)
          timeout: 15000, // 15 seconds
          maximumAge: LOCATION_CACHE_DURATION_MS,
        },
      );
    });
  }

  private getLocationErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return "位置情報の許可が必要です。ブラウザの設定で位置情報を許可してください。";
      case error.POSITION_UNAVAILABLE:
        return "位置情報を取得できません。GPSまたはネットワーク位置情報が利用できません。";
      case error.TIMEOUT:
        return "位置情報の取得がタイムアウトしました。再試行してください。";
      default:
        return "位置情報の取得に失敗しました。";
    }
  }

  // ============================================================================
  // Geocoding Methods
  // ============================================================================

  /**
   * Geocode a location string to coordinates
   * Handles both station names and addresses:
   * - If it looks like a station (contains 駅, station keywords), try transport_node first
   * - Otherwise try address geocoding
   * - Falls back to the other if first attempt fails
   */
  async geocodeAddress(
    location: string,
  ): Promise<{ lat: number; lon: number } | null> {
    // Check cache first
    if (this.geocodeCache.has(location)) {
      const cached = this.geocodeCache.get(location);
      return cached?.coord ?? null;
    }

    console.log("[Transit] Geocoding location:", location);

    // Detect if this looks like a station/transport node
    const stationKeywords = [
      "駅",
      "停留所",
      "バス停",
      "空港",
      "港",
      "ターミナル",
    ];
    const looksLikeStation = stationKeywords.some((keyword) =>
      location.includes(keyword),
    );

    try {
      let coord: { lat: number; lon: number } | null = null;

      if (looksLikeStation) {
        // Try station search first
        console.log("[Transit] Trying station search for:", location);
        coord = await this.tryStationSearch(location);

        // Fall back to address search if station search fails
        if (!coord) {
          console.log("[Transit] Station not found, trying address search...");
          coord = await this.tryAddressSearch(location);
        }
      } else {
        // Try address search first
        console.log("[Transit] Trying address search for:", location);
        coord = await this.tryAddressSearch(location);

        // Fall back to station search if address search fails
        if (!coord) {
          console.log("[Transit] Address not found, trying station search...");
          coord = await this.tryStationSearch(location);
        }
      }

      if (coord) {
        // Cache successful result
        this.geocodeCache.set(location, { coord } as AddressItem);
        console.log("[Transit] Geocoded to:", coord);
        return coord;
      } else {
        console.log("[Transit] No geocoding result for:", location);
        this.geocodeCache.set(location, null);
        return null;
      }
    } catch (error) {
      console.error("[Transit] Geocoding failed:", error);
      this.geocodeCache.set(location, null);
      return null;
    }
  }

  /**
   * Try to find coordinates via station/transport node search
   */
  private async tryStationSearch(
    query: string,
  ): Promise<{ lat: number; lon: number } | null> {
    try {
      const result = await searchStations({ word: query, limit: 1 });
      const station = result.items?.[0];
      if (station?.coord) {
        console.log("[Transit] Found station:", station.name, station.coord);
        return station.coord;
      }
      return null;
    } catch (error) {
      console.error("[Transit] Station search failed:", error);
      return null;
    }
  }

  /**
   * Try to find coordinates via address geocoding
   */
  private async tryAddressSearch(
    query: string,
  ): Promise<{ lat: number; lon: number } | null> {
    try {
      const result = await searchAddress({ word: query, limit: 1 });
      const address = result.items?.[0];
      if (address?.coord) {
        console.log("[Transit] Found address:", address.name, address.coord);
        return address.coord;
      }
      return null;
    } catch (error) {
      console.error("[Transit] Address search failed:", error);
      return null;
    }
  }

  // ============================================================================
  // Route Methods
  // ============================================================================

  /**
   * Load transit info for the next event with location
   */
  async loadNextEventTransit(): Promise<void> {
    const event = getNextEventWithLocation();
    if (!event) {
      console.log("[Transit] No upcoming event with location");
      this.transitInfo = null;
      this.lastTransitContext = null;
      return;
    }

    const location = await this.getCurrentLocation();
    if (!location) {
      this.routeError = "Could not get current location";
      return;
    }

    const eventId = getEventId(event);
    const eventLocation = getEventLocation(event);

    // Check if we can use cached transit info
    if (this.canUseCachedTransitInfo(eventId, eventLocation, location)) {
      console.log(
        "[Transit] Using cached transit info (event and location unchanged)",
      );
      return;
    }

    await this.loadEventTransit(event, location);
  }

  /**
   * Check if we can use the cached transit info
   * Returns true if:
   * - We have cached transit info
   * - The event ID is the same
   * - The event location is the same
   * - The user location hasn't changed significantly (below threshold)
   */
  private canUseCachedTransitInfo(
    eventId: string,
    eventLocation: string,
    currentLocation: UserLocation,
  ): boolean {
    // No cached info available
    if (!this.transitInfo || !this.lastTransitContext) {
      return false;
    }

    // Event changed
    if (this.lastTransitContext.eventId !== eventId) {
      console.log("[Transit] Event changed, will refresh routes");
      return false;
    }

    // Event location changed
    if (this.lastTransitContext.eventLocation !== eventLocation) {
      console.log("[Transit] Event location changed, will refresh routes");
      return false;
    }

    // User location changed significantly
    const distance = calculateDistance(
      this.lastTransitContext.userLocation.lat,
      this.lastTransitContext.userLocation.lon,
      currentLocation.lat,
      currentLocation.lon,
    );

    if (distance > LOCATION_DISTANCE_THRESHOLD_M) {
      console.log(
        `[Transit] User moved ${Math.round(distance)}m (threshold: ${LOCATION_DISTANCE_THRESHOLD_M}m), will refresh routes`,
      );
      return false;
    }

    // All conditions met, can use cached info
    return true;
  }

  /**
   * Load transit info for a specific event
   */
  async loadEventTransit(
    event: Event | ExpandedOccurrence,
    userLocation: UserLocation,
  ): Promise<void> {
    const eventLocation = getEventLocation(event);
    if (!eventLocation) {
      this.routeError = "Event has no location";
      return;
    }

    this.isLoadingRoutes = true;
    this.routeError = null;

    try {
      // Geocode the event address to coordinates
      const goalCoord = await this.geocodeAddress(eventLocation);
      if (!goalCoord) {
        this.routeError = `住所から座標を取得できませんでした: ${eventLocation}`;
        this.isLoadingRoutes = false;
        return;
      }

      const startCoord = { lat: userLocation.lat, lon: userLocation.lon };
      const eventStart = new Date(event.start);

      // Get buffer time based on event importance
      const importance =
        ("importance" in event && event.importance) || "medium";
      const bufferMinutes = IMPORTANCE_BUFFER_MAP[importance] ?? 10;

      console.log(
        "[Transit] Event importance:",
        importance,
        "→ buffer:",
        bufferMinutes,
        "min",
      );

      // Calculate target arrival time (event start - buffer)
      const targetArrival = new Date(
        eventStart.getTime() - bufferMinutes * 60 * 1000,
      );

      let recommendedDeparture: DepartureOption | null = null;

      // Only search if target arrival is in the future
      if (targetArrival > new Date()) {
        const route = await this.searchArriveByRoute(
          startCoord,
          goalCoord,
          targetArrival,
        );

        if (route) {
          recommendedDeparture = {
            bufferMinutes,
            departureTime: new Date(route.summary.move.from_time),
            arrivalTime: targetArrival,
            route,
            label: this.getBufferLabel(bufferMinutes),
          };
        }
      }

      // Also get a "leave now" route
      const leaveNowRoute = await this.searchLeaveNowRoute(
        startCoord,
        goalCoord,
      );

      this.transitInfo = {
        event,
        eventLocation,
        eventStart,
        importance,
        bufferMinutes,
        recommendedDeparture,
        leaveNowRoute,
        isLoading: false,
        error: null,
      };

      // Store context for cache validation
      this.lastTransitContext = {
        eventId: getEventId(event),
        eventLocation,
        userLocation,
      };

      console.log("[Transit] Transit info loaded:", {
        eventLocation,
        goalCoord,
        importance,
        bufferMinutes,
        hasRecommendedDeparture: !!recommendedDeparture,
        hasLeaveNowRoute: !!leaveNowRoute,
      });

      // Sync to server (fire and forget)
      this.syncTransitInfo();
    } catch (error) {
      console.error("[Transit] Failed to load transit info:", error);
      this.routeError =
        error instanceof Error ? error.message : "Failed to load routes";
    } finally {
      this.isLoadingRoutes = false;
    }
  }

  /**
   * Search for a route with goal_time (arrive by)
   */
  async searchArriveByRoute(
    start: { lat: number; lon: number },
    goal: { lat: number; lon: number },
    arriveBy: Date,
  ): Promise<Route | null> {
    const cacheKey = `${start.lat},${start.lon}-${goal.lat},${goal.lon}-arrive-${arriveBy.getTime()}`;

    // Check cache
    if (this.routeCache.has(cacheKey)) {
      const cached = this.routeCache.get(cacheKey);
      return cached?.items?.[0] ?? null;
    }

    try {
      const result = await searchRoutes({
        start,
        goal,
        goalTime: formatDateTime(arriveBy),
        limit: 1,
      });

      this.routeCache.set(cacheKey, result);
      return result.items?.[0] ?? null;
    } catch (error) {
      console.error("[Transit] Route search failed:", error);
      return null;
    }
  }

  /**
   * Search for "Leave Now" route
   */
  async searchLeaveNowRoute(
    start: { lat: number; lon: number },
    goal: { lat: number; lon: number },
  ): Promise<Route | null> {
    const now = new Date();
    const cacheKey = `${start.lat},${start.lon}-${goal.lat},${goal.lon}-now-${Math.floor(now.getTime() / 60000)}`;

    // Check cache (1-minute resolution for "now")
    if (this.routeCache.has(cacheKey)) {
      const cached = this.routeCache.get(cacheKey);
      return cached?.items?.[0] ?? null;
    }

    try {
      const result = await searchRoutes({
        start,
        goal,
        startTime: formatDateTime(now),
        limit: 3,
      });

      this.routeCache.set(cacheKey, result);
      return result.items?.[0] ?? null;
    } catch (error) {
      console.error("[Transit] Leave now route search failed:", error);
      return null;
    }
  }

  /**
   * Refresh all route data (called on "Leave Now" or manual refresh)
   */
  async refreshRoutes(): Promise<void> {
    // Clear context to force refresh
    this.lastTransitContext = null;
    // Force refresh location
    await this.getCurrentLocation(true);
    // Reload transit info
    await this.loadNextEventTransit();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getBufferLabel(minutes: number): string {
    switch (minutes) {
      case 5:
        return "5分前に到着";
      case 10:
        return "10分前に到着";
      case 20:
        return "余裕を持って到着";
      default:
        return `${minutes}分前`;
    }
  }

  /**
   * Clear route and geocode cache
   */
  clearCache(): void {
    this.routeCache.clear();
    this.geocodeCache.clear();
    this.lastTransitContext = null;
    console.log("[Transit] Cache cleared");
  }

  /**
   * Get the next event with location (for display)
   */
  getNextEventWithLocation(): Event | ExpandedOccurrence | null {
    return getNextEventWithLocation();
  }

  // ============================================================================
  // Sync Methods
  // ============================================================================

  /**
   * Load synced transit cache from server
   * Should be called once on app initialization
   */
  async loadSyncedTransit(): Promise<void> {
    if (this.isSyncLoaded) {
      console.log("[Transit] Sync data already loaded");
      return;
    }

    try {
      console.log("[Transit] Loading synced transit cache...");
      const data = await loadSyncData({});

      // Load cached transit info if available for upcoming events
      if (data.cachedTransit.length > 0) {
        const now = new Date();
        // Find the first valid cached transit (event in future)
        const validCached = data.cachedTransit.find(
          (t) => new Date(t.eventStart) > now,
        );

        if (validCached) {
          try {
            const parsed = JSON.parse(validCached.transitData);
            // Restore transit info (but without loading states)
            this.transitInfo = {
              ...parsed,
              isLoading: false,
              error: null,
            };
            this.lastTransitContext = {
              eventId: validCached.eventId,
              eventLocation: validCached.eventLocation,
              userLocation: {
                lat: validCached.userLat,
                lon: validCached.userLon,
                timestamp: new Date(validCached.cachedAt).getTime(),
              },
            };
            console.log(
              "[Transit] Restored cached transit for event:",
              validCached.eventId,
            );
          } catch (parseError) {
            console.error(
              "[Transit] Failed to parse cached transit:",
              parseError,
            );
          }
        }
      }

      this.isSyncLoaded = true;
      console.log("[Transit] Sync data loaded");
    } catch (error) {
      console.error("[Transit] Failed to load synced transit:", error);
    }
  }

  /**
   * Sync current transit info to server
   */
  async syncTransitInfo(): Promise<void> {
    if (!this.transitInfo || !this.lastTransitContext) return;

    try {
      // Serialize transit info (excluding loading states)
      const transitData = JSON.stringify({
        event: this.transitInfo.event,
        eventLocation: this.transitInfo.eventLocation,
        eventStart: this.transitInfo.eventStart,
        importance: this.transitInfo.importance,
        bufferMinutes: this.transitInfo.bufferMinutes,
        recommendedDeparture: this.transitInfo.recommendedDeparture,
        leaveNowRoute: this.transitInfo.leaveNowRoute,
      });

      await saveCachedTransit({
        transitInfo: {
          eventId: this.lastTransitContext.eventId,
          eventLocation: this.lastTransitContext.eventLocation,
          eventStart: this.transitInfo.eventStart.toISOString(),
          userLat: this.lastTransitContext.userLocation.lat,
          userLon: this.lastTransitContext.userLocation.lon,
          transitData,
          cachedAt: new Date().toISOString(),
        },
      });

      console.log(
        "[Transit] Synced transit info for event:",
        this.lastTransitContext.eventId,
      );
    } catch (error) {
      console.error("[Transit] Failed to sync transit info:", error);
    }
  }

  /**
   * Clear synced transit cache
   */
  async clearSyncedTransit(): Promise<void> {
    try {
      await clearCachedTransit({});
      console.log("[Transit] Cleared synced transit cache");
    } catch (error) {
      console.error("[Transit] Failed to clear synced transit:", error);
    }
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const transitState = new TransitState();
