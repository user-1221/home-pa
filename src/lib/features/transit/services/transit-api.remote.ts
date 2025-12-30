/**
 * Transit API Remote Functions
 *
 * Server-side Remote Functions for secure NAVITIME API calls via RapidAPI.
 * API key stays on server, never exposed to client.
 */

import { query } from "$app/server";
import { env } from "$env/dynamic/private";
import * as v from "valibot";

// ============================================================================
// Constants
// ============================================================================

const ROUTE_TRANSIT_HOST = "navitime-route-totalnavi.p.rapidapi.com";
const TRANSPORT_NODE_HOST = "navitime-transport.p.rapidapi.com";
const GEOCODING_HOST = "navitime-geocoding.p.rapidapi.com";

// ============================================================================
// Schemas
// ============================================================================

const CoordSchema = v.object({
  lat: v.number(),
  lon: v.number(),
});

const RouteSearchInputSchema = v.object({
  start: CoordSchema,
  goal: CoordSchema,
  startTime: v.optional(v.string()), // ISO datetime
  goalTime: v.optional(v.string()), // ISO datetime (for arrive-by search)
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(10))),
});

const NearbyStationsInputSchema = v.object({
  coord: CoordSchema,
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20))),
  term: v.optional(v.number()), // Max walking time in minutes
  walkSpeed: v.optional(v.number()), // Walking speed in km/h
});

const StationSearchInputSchema = v.object({
  word: v.string(),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20))),
  offset: v.optional(v.number()),
});

const AddressSearchInputSchema = v.object({
  word: v.string(),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20))),
  offset: v.optional(v.number()),
  sort: v.optional(v.string()), // "code_asc", "code_desc", "name_asc", "name_desc"
});

const AddressAutocompleteInputSchema = v.object({
  word: v.string(),
});

// ============================================================================
// Response Types
// ============================================================================

export interface RouteSection {
  type: "point" | "move";
  coord?: { lat: number; lon: number };
  name?: string;
  node_id?: string;
  gateway?: string;
  from_time?: string;
  to_time?: string;
  time?: number;
  distance?: number;
  move?: string;
  line_name?: string;
  transport?: {
    id: string;
    name: string;
    color: string;
    type: string;
    company?: { id: string; name: string };
    fare?: Record<string, number>;
  };
}

export interface Route {
  sections: RouteSection[];
  summary: {
    no: string;
    start: { coord: { lat: number; lon: number }; name: string };
    goal: { coord: { lat: number; lon: number }; name: string };
    move: {
      from_time: string;
      to_time: string;
      time: number;
      distance: number;
      walk_distance: number;
      transit_count: number;
      fare?: Record<string, number>;
    };
  };
}

export interface RouteSearchResult {
  items: Route[];
  unit: {
    coord_unit: string;
    currency: string;
    datum: string;
    distance: string;
    time: string;
  };
}

export interface TransportNode {
  id: string;
  name: string;
  ruby?: string;
  types: string[];
  address_name?: string;
  coord: { lat: number; lon: number };
  distance?: number;
  time?: number;
  gateway?: string;
}

export interface NearbyStationsResult {
  items: TransportNode[];
  unit: {
    datum: string;
    coord_unit: string;
    distance?: string;
    time?: string;
  };
}

export interface StationSearchResult {
  count?: { total: number; offset: number; limit: number };
  items: TransportNode[];
  unit: { datum: string; coord_unit: string };
}

export interface AddressItem {
  code: string;
  name: string;
  postal_code?: string;
  coord: { lat: number; lon: number };
  details: Array<{
    code: string;
    name: string;
    ruby?: string;
    level: string;
  }>;
  is_end: boolean;
}

export interface AddressSearchResult {
  count?: { total: number; offset: number; limit: number };
  items: AddressItem[];
  unit: { datum: string; coord_unit: string };
}

export interface AddressAutocompleteResult {
  items: AddressItem[];
  unit: { datum: string; coord_unit: string };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getRapidApiHeaders(host: string): Record<string, string> {
  const apiKey = env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY environment variable is not set");
  }
  return {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": host,
  };
}

function formatCoord(coord: { lat: number; lon: number }): string {
  return `${coord.lat},${coord.lon}`;
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ============================================================================
// Remote Functions
// ============================================================================

/**
 * Search for transit routes between two coordinates
 *
 * @param input - Start/goal coordinates and optional time parameters
 * @returns Route search results from NAVITIME API
 */
export const searchRoutes = query(
  RouteSearchInputSchema,
  async (input): Promise<RouteSearchResult> => {
    console.log("[Transit API] Searching routes:", input);

    const params = new URLSearchParams({
      start: formatCoord(input.start),
      goal: formatCoord(input.goal),
      datum: "wgs84",
      coord_unit: "degree",
      limit: String(input.limit ?? 5),
    });

    // Add time parameter (departure or arrival time)
    if (input.goalTime) {
      // Arrive-by search
      params.set("goal_time", input.goalTime);
    } else if (input.startTime) {
      // Depart-at search
      params.set("start_time", input.startTime);
    } else {
      // Default to current time
      params.set("start_time", formatDateTime(new Date()));
    }

    const url = `https://${ROUTE_TRANSIT_HOST}/route_transit?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: getRapidApiHeaders(ROUTE_TRANSIT_HOST),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Transit API] Error response:", errorText);
        throw new Error(`Transit API error: ${response.status}`);
      }

      const result = (await response.json()) as RouteSearchResult;
      console.log(
        "[Transit API] Routes found:",
        result.items?.length ?? 0,
      );
      return result;
    } catch (error) {
      console.error("[Transit API] Request failed:", error);
      throw error;
    }
  },
);

/**
 * Find nearby stations/stops based on coordinates
 *
 * @param input - Coordinates and optional parameters
 * @returns Nearby stations sorted by walking distance
 */
export const findNearbyStations = query(
  NearbyStationsInputSchema,
  async (input): Promise<NearbyStationsResult> => {
    console.log("[Transit API] Finding nearby stations:", input);

    const params = new URLSearchParams({
      coord: formatCoord(input.coord),
      datum: "wgs84",
      coord_unit: "degree",
      limit: String(input.limit ?? 10),
      term: String(input.term ?? 30), // Max 30 min walk by default
    });

    if (input.walkSpeed) {
      params.set("walk_speed", String(input.walkSpeed));
    }

    const url = `https://${TRANSPORT_NODE_HOST}/transport_node/around?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: getRapidApiHeaders(TRANSPORT_NODE_HOST),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Transit API] Error response:", errorText);
        throw new Error(`Transit API error: ${response.status}`);
      }

      const result = (await response.json()) as NearbyStationsResult;
      console.log(
        "[Transit API] Stations found:",
        result.items?.length ?? 0,
      );
      return result;
    } catch (error) {
      console.error("[Transit API] Request failed:", error);
      throw error;
    }
  },
);

/**
 * Search for stations by keyword
 *
 * @param input - Search keyword and optional pagination
 * @returns Matching stations
 */
export const searchStations = query(
  StationSearchInputSchema,
  async (input): Promise<StationSearchResult> => {
    console.log("[Transit API] Searching stations:", input.word);

    const params = new URLSearchParams({
      word: input.word,
      datum: "wgs84",
      coord_unit: "degree",
      limit: String(input.limit ?? 10),
      offset: String(input.offset ?? 0),
    });

    const url = `https://${TRANSPORT_NODE_HOST}/transport_node?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: getRapidApiHeaders(TRANSPORT_NODE_HOST),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Transit API] Error response:", errorText);
        throw new Error(`Transit API error: ${response.status}`);
      }

      const result = (await response.json()) as StationSearchResult;
      console.log(
        "[Transit API] Stations found:",
        result.items?.length ?? 0,
      );
      return result;
    } catch (error) {
      console.error("[Transit API] Request failed:", error);
      throw error;
    }
  },
);

/**
 * Search for addresses by keyword (geocoding)
 *
 * @param input - Search keyword (address string) and optional parameters
 * @returns Address search results with coordinates
 */
export const searchAddress = query(
  AddressSearchInputSchema,
  async (input): Promise<AddressSearchResult> => {
    console.log("[Transit API] Searching address:", input.word);

    const params = new URLSearchParams({
      word: input.word,
      datum: "wgs84",
      coord_unit: "degree",
      limit: String(input.limit ?? 5),
      offset: String(input.offset ?? 0),
      sort: input.sort ?? "code_asc",
    });

    const url = `https://${GEOCODING_HOST}/address?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: getRapidApiHeaders(GEOCODING_HOST),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Transit API] Geocoding error response:", errorText);
        throw new Error(`Geocoding API error: ${response.status}`);
      }

      const result = (await response.json()) as AddressSearchResult;
      console.log(
        "[Transit API] Addresses found:",
        result.items?.length ?? 0,
      );
      return result;
    } catch (error) {
      console.error("[Transit API] Geocoding request failed:", error);
      throw error;
    }
  },
);

/**
 * Get address autocomplete suggestions
 *
 * @param input - Partial address string for autocomplete
 * @returns Address autocomplete suggestions with coordinates
 */
export const autocompleteAddress = query(
  AddressAutocompleteInputSchema,
  async (input): Promise<AddressAutocompleteResult> => {
    console.log("[Transit API] Autocompleting address:", input.word);

    const params = new URLSearchParams({
      word: input.word,
      datum: "wgs84",
      coord_unit: "degree",
    });

    const url = `https://${GEOCODING_HOST}/address/autocomplete?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: getRapidApiHeaders(GEOCODING_HOST),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Transit API] Autocomplete error response:", errorText);
        throw new Error(`Autocomplete API error: ${response.status}`);
      }

      const result = (await response.json()) as AddressAutocompleteResult;
      console.log(
        "[Transit API] Autocomplete results:",
        result.items?.length ?? 0,
      );
      return result;
    } catch (error) {
      console.error("[Transit API] Autocomplete request failed:", error);
      throw error;
    }
  },
);

