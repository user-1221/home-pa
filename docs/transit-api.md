# Transit API Specification (NAVITIME API 2.0: /route_transit)

## Overview

This document specifies the Transit API integration for Home-PA using **NAVITIME API 2.0** “ルート検索（トータルナビ）” (endpoint: `/v1/route_transit`).

This API searches routes between two points using public transit (rail/bus etc.), including walking segments, and supports optional via points. The response includes route summaries, per-section details, and (optionally) route shapes (GeoJSON).  

Reference: NAVITIME API 2.0 Spec “ルート検索(トータルナビ)”.  

---

## Purpose

- Provide route planning and travel-time estimation for calendar events
- Support scheduled transit time display (depart/arrive-based search)
- Enable assistant suggestions to include travel buffers
- (Optional) Use timetable data / advanced options when contracted (see parameter notes)

> Note: `/route_transit` is route search; this is not the same as “operation status / delays” APIs. (Those are separate “運行情報” endpoints.)

---

## API Requirements

### Base URL

NAVITIME API 2.0 uses a URL that embeds the **Client ID (CID)**:

- `https://{HOST}/{CID}/v1/route_transit`

**Important:** If you are using an API marketplace offering, “URL体系が異なります” (the URL format differs). Use the marketplace’s base URL rules if applicable.

### Authentication

#### For NAVITIME API 2.0 (Official)

NAVITIME API 2.0 requires:

1) **Client ID (CID)** in the URL path  
- Example pattern: `https://{HOST}/{CID}/v1/...`

2) **Digital signature authentication** may be required unless it is omitted by applying access-origin restrictions (per NAVITIME documentation).  
- Signature is generated using the issued "署名鍵" (secret key) and your generated "リクエストコード".  
- The exact signature generation method is provided in materials NAVITIME supplies during introduction.

> Implementation note (Home-PA): keep signature generation on the server side only.

#### For RapidAPI (Home-PA Implementation)

RapidAPI requires HTTP headers for authentication:

- **`X-RapidAPI-Key`**: Your RapidAPI API key (stored as environment variable)
- **`X-RapidAPI-Host`**: The specific API host for each endpoint (varies by endpoint)

**Environment Variables Required:**
- `RAPIDAPI_KEY` - Your RapidAPI API key (used for `X-RapidAPI-Key` header)

**Request Headers:**
```typescript
{
  "x-rapidapi-key": env.RAPIDAPI_KEY,
  "x-rapidapi-host": "<endpoint-specific-host>"
}
```

**Note:** HTTP headers are case-insensitive, but RapidAPI examples use lowercase. Use lowercase for consistency with RapidAPI documentation.

> **Security Note**: All API calls must go through server-side Remote Functions. Never expose `RAPIDAPI_KEY` in client-side code.

### Endpoints

#### Route Search (Transit)

**NAVITIME API 2.0:**
- **GET** `/v1/route_transit`
- Full form: `GET https://{HOST}/{CID}/v1/route_transit?...`

**RapidAPI:**
- **GET** `https://navitime-route-totalnavi.p.rapidapi.com/route_transit`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-route-totalnavi.p.rapidapi.com`

**Complete Example Request:**
```typescript
const url = 'https://navitime-route-totalnavi.p.rapidapi.com/route_transit?start=35.665251%2C139.712092&goal=35.661971%2C139.703795&datum=wgs84&term=1440&limit=5&start_time=2020-08-19T10%3A00%3A00&coord_unit=degree';

const options = {
  method: 'GET',
  headers: {
    'x-rapidapi-key': env.RAPIDAPI_KEY,
    'x-rapidapi-host': 'navitime-route-totalnavi.p.rapidapi.com'
  }
};

const response = await fetch(url, options);
const result = await response.json();
```

**Note:** HTTP headers are case-insensitive, but RapidAPI examples use lowercase (`x-rapidapi-key`). Either format works, but lowercase matches RapidAPI's documentation.

#### Fare Comparison

**RapidAPI:**
- **GET** `https://navitime-route-totalnavi.p.rapidapi.com/fare_comparison`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-route-totalnavi.p.rapidapi.com`

#### Fare Table

**RapidAPI:**
- **GET** `https://navitime-route-totalnavi.p.rapidapi.com/fare_table`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-route-totalnavi.p.rapidapi.com`

#### Shape Transit (GeoJSON)

**RapidAPI:**
- **GET** `https://navitime-route-totalnavi.p.rapidapi.com/shape_transit`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-route-totalnavi.p.rapidapi.com`

#### Station/Stop Search (Transport Node)

**RapidAPI:**
- **GET** `https://navitime-transport.p.rapidapi.com/transport_node`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-transport.p.rapidapi.com`

**Purpose:** Search for stations, bus stops, ports, and other transport nodes by keyword or address.

**Complete Example Request:**
```typescript
const params = new URLSearchParams({
  word: "東京",           // Search keyword (station name, address, etc.)
  coord_unit: "degree",  // "degree" or "millisec"
  offset: "0",          // Pagination offset (default: 0)
  datum: "wgs84",       // "wgs84" or "tokyo"
  limit: "10"           // Number of results (default: 10)
});

const url = `https://navitime-transport.p.rapidapi.com/transport_node?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-transport.p.rapidapi.com"
  }
});

const result = await response.json();
```

#### Nearby Stations/Stops (Transport Node Around)

**RapidAPI:**
- **GET** `https://navitime-transport.p.rapidapi.com/transport_node/around`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-transport.p.rapidapi.com`

**Purpose:** Find nearby stations and stops based on coordinates. Includes walking distance and time calculations, considering station entrances/exits.

**Complete Example Request:**
```typescript
const params = new URLSearchParams({
  coord: "35.689457,139.691935",  // Latitude,longitude (comma-separated)
  limit: "10",                     // Number of results (default: 10)
  term: "60",                      // Maximum walking time in minutes (default: 60)
  datum: "wgs84",                  // "wgs84" or "tokyo"
  coord_unit: "degree",           // "degree" or "millisec"
  walk_speed: "5"                  // Walking speed in km/h (default: 4.8, min: 3.0, max: 8.0)
});

const url = `https://navitime-transport.p.rapidapi.com/transport_node/around?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-transport.p.rapidapi.com"
  }
});

const result = await response.json();
```

#### Address Search (Geocoding)

**RapidAPI:**
- **GET** `https://navitime-geocoding.p.rapidapi.com/address`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-geocoding.p.rapidapi.com`

**Purpose:** Search for addresses by keyword and get coordinates. Used for converting address strings to lat/lon for route planning.

**Complete Example Request:**
```typescript
const params = new URLSearchParams({
  word: "代々木",                  // Search keyword (address, place name, etc.)
  coord_unit: "degree",           // "degree" or "millisec"
  datum: "wgs84",                 // "wgs84" or "tokyo"
  limit: "10",                    // Number of results (default: 10)
  sort: "code_asc",               // Sort order: "code_asc", "code_desc", "name_asc", "name_desc"
  offset: "0"                     // Pagination offset (default: 0)
});

const url = `https://navitime-geocoding.p.rapidapi.com/address?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-geocoding.p.rapidapi.com"
  }
});

const result = await response.json();
```

#### Address Autocomplete (Geocoding)

**RapidAPI:**
- **GET** `https://navitime-geocoding.p.rapidapi.com/address/autocomplete`
- Headers: `x-rapidapi-key`, `x-rapidapi-host: navitime-geocoding.p.rapidapi.com`

**Purpose:** Get address autocomplete suggestions as user types. Faster than full address search, optimized for real-time suggestions.

**Complete Example Request:**
```typescript
const params = new URLSearchParams({
  word: "とうk",                   // Partial search keyword (e.g., user typing "とうきょう")
  datum: "wgs84",                 // "wgs84" or "tokyo"
  coord_unit: "degree"            // "degree" or "millisec"
});

const url = `https://navitime-geocoding.p.rapidapi.com/address/autocomplete?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-geocoding.p.rapidapi.com"
  }
});

const result = await response.json();
```

### Request Parameters

Parameter names / behaviors below are taken from the NAVITIME spec table.

#### Required core parameters

- `start` (required): departure point
- `goal` (required): arrival point

**Accepted formats for `start` / `goal`:**
- Point as “地点のJSON表現”
- Node ID string (e.g., station node id)
- Comma-separated lat/lon: `lat,lon`

#### Time parameters (one of these sets is required depending on search type)

NAVITIME labels some of these as “(✔)” in the table; treat as conditionally required:

- `start_time`: departure datetime (`YYYY-MM-DDThh:mm:ss`)
- `goal_time`: arrival datetime (`YYYY-MM-DDThh:mm:ss`)
- `first_operation`: first-train search date (`YYYY-MM-DD`)  
  - Only available when using timetable data; not available on API marketplace
- `last_operation`: last-train search date (`YYYY-MM-DD`)  
  - Only available when using timetable data; not available on API marketplace

#### Via points

- `via`: array of point JSON (max 10 points)
  - Note: if using *bus timetable only* and specifying 4+ via points, it falls back to “average-time rail-only search” per spec.
- `via_type`: `specified` (default) or `optimal`

#### Exclusions / preferences

- `unuse`: exclude public transport modes (dot-separated list). See “unuse（公共移動手段・利用しないもの）” section for allowed values.
- `walk_route`: walking route preference (dot-separated list)
  - `avoid_step`, `avoid_escalator`, `avoid_rain`, `babycar`
  - **Mutual exclusion:** if `walk_route` is set, `walk_speed` must not be set (error).
- `walk_speed`: walking speed (km/h), default `4.8`, min `3.0`, max `8.0`, one decimal place
  - **Mutual exclusion:** if `walk_speed` is set, `walk_route` must not be set (error).
- `use_car`: boolean, default `false`
  - Cannot be combined with `via` (and `false` still errors if combined per spec note).
- `use_share_cycle`: boolean, default `false`
  - Only available when using timetable data; not available on API marketplace
- `bicycle_speed`: integer km/h, default `15`, min `5`, max `132` (valid only when `use_share_cycle=true`)
- `bicycle_condition`: preference string (valid only when `use_share_cycle=true`)
  - `recommend`, `total_distance`, `low_pitched`, `high_pitched`, `main_street`, `back_street`, `cycling_road`

#### Special tickets / commuter pass

- `special_pass`: special ticket identifiers (dot-separated list)
  - Only available when using timetable data; not available on API marketplace
- `commuter_pass`: commuter pass section JSON array (max 10)
  - There are multiple conditions where commuter pass is ignored (walk_route certain values, via specified, shinkansen, bus usage, >300km, etc.) per spec.
- `avoid_node`: avoid boarding/alighting at specified node IDs (dot-separated list)
- `commuter_pass_train_bus_transfer`: output discounted commuter pass price for rail-bus transfer (boolean)
  - Only valid if `options` includes `bus_commuter_pass` AND bus data is used; not API marketplace.

#### Output order and search constraints

- `order`: output sorting key (default `time_optimized`)
  - Allowed: `time_optimized`, `total_distance`, `walk_distance`, `fare`, `time`, `transit`, `commuter_pass_price`, `co2`
- `term`: search time window in minutes (default `1440`, max `2880`)
- `limit`: number of routes (default `5`, min `1`, max `10`)
  - Becomes invalid in certain multi-destination /巡回 conditions per spec notes.
- `unuse_turnback`: boolean, default `false` (disallow turnback)

#### Timetable vs average-time data sources

- `train_data`: `average` (default) or `timetable`
  - `timetable` requires a separate optional contract; not API marketplace.
- `bus_data`: `none` (default) or `timetable`
  - bus timetable requires optional contract; not API marketplace.

#### Additional output fields

- `options`: extra info flags (dot-separated list implied / multiple flags supported)
  - `railway_calling_at`, `bus_commuter_pass`, `congestion`, `co2`, `revision_info`
  - Several options are only available with timetable data and/or not available on API marketplace (see spec notes).

#### Shapes / localization / coordinate controls

- `shape`: boolean (default `false`)
  - If `true`, `shapes` (GeoJSON FeatureCollection) is included; shapes are equivalent to `/shape_transit` GeoJSON response format per spec note.
- `shape_color`: `railway_line` (use line color per railway line)
- `datum`: `wgs84` (default) or `tokyo`
- `coord_unit`: `degree` (default) or `millisec`
- `lang`: `ja`, `en`, `ko`, `zh-CN`, `zh-TW`, `th`
  - Multi-language option required; not API marketplace.

#### Advanced JSON parameters

- `bound_section`: JSON expression to specify alternate move types depending on walk distance (see spec link section)
- `use_section`: JSON expression to specify allowed trains/sections
  - Only available with train timetable data; not API marketplace.
- `move_priority`: priority factor (string) default `time_optimized`
  - Allowed: `time_optimized`, `total_distance`, `walk_distance`, `transit`

#### Encoding rule

Any parameter that uses **JSON expressions** (e.g., `via`, `goal` as array, `commuter_pass`, etc.) must be **URL-encoded** when sending the request.

### Example Requests (from spec)

1) With via + options:
- `/route_transit?start=00008247&goal=00005172&via=[{"node":"00006668"}]&start_time=2019-10-01T08:00:00&options=railway_calling_at`

2) One-to-many (goal as array):
- `/route_transit?start=00006668&goal=[{"node":"00005172"},{"node":"00000838"}]&start_time=2019-10-01T08:00:00`

3) Commuter pass section:
- `/route_transit?start=00005564&goal=00002128&commuter_pass=[{"link":"00000141","start":"00005947","goal":"00003544","direction":"up"}]&start_time=2019-10-01T08:00:00`

4) Avoid station:
- `/route_transit?start=00004254&goal=00007820&avoid_node=00003544&start_time=2020-12-01T10:00:00`

---

## Response Format

### Output formats

- JSON
- GeoJSON (when `shape=true`)

### Top-level response structure

```typescript
{
  "items": Route[],  // Array of route candidates
  "unit": Unit       // Units metadata
}
```

### Unit object

Metadata about units used in the response:

```typescript
{
  "coord_unit": "degree",    // "degree" or "millisec"
  "currency": "JPY",         // Currency code
  "datum": "wgs84",          // "wgs84" or "tokyo"
  "distance": "metre",       // Distance unit
  "time": "minute"           // Time unit
}
```

### Route object

Each route in `items[]` contains:

```typescript
{
  "sections": RouteSection[],  // Alternating point/move segments
  "summary": RouteSummary      // Overview of the route
}
```

### Route Summary

High-level overview of the route:

```typescript
{
  "no": string,              // Route number (e.g., "1", "2")
  "start": Point,            // Starting point
  "goal": Point,             // Destination point
  "move": {
    "from_time": string,     // ISO datetime with timezone (e.g., "2020-04-23T14:21:00+09:00")
    "to_time": string,       // ISO datetime with timezone
    "time": number,          // Total time in minutes
    "distance": number,       // Total distance in metres
    "walk_distance": number, // Total walking distance in metres
    "transit_count": number, // Number of transit transfers
    "fare": {                // Fare information
      "unit_0": number,      // Standard fare (JPY)
      "unit_48": number,     // IC card fare (JPY)
      // ... other fare types
    },
    "type": "move"
  }
}
```

### Section items

The `sections` array alternates between **point** and **move** segments:

#### Point Section

Represents a location (station, start, goal):

```typescript
{
  "type": "point",
  "coord": {
    "lat": number,
    "lon": number
  },
  "name": string,            // Location name (e.g., "表参道", "start", "goal")
  "node_id"?: string,        // Station node ID (e.g., "00007820")
  "node_types"?: string[],   // e.g., ["station"]
  "gateway"?: string,        // Station exit/gateway (e.g., "B4口")
  "numbering"?: {            // Platform/track numbering
    "departure"?: Array<{
      "number": string,       // e.g., "02"
      "symbol": string        // e.g., "Z", "G", "C", "F"
    }>,
    "arrival"?: Array<{
      "number": string,
      "symbol": string
    }>
  }
}
```

#### Move Section

Represents a movement segment (walking, train, bus, etc.):

```typescript
{
  "type": "move",
  "from_time": string,       // ISO datetime with timezone
  "to_time": string,         // ISO datetime with timezone
  "time": number,            // Duration in minutes
  "distance": number,         // Distance in metres
  "move": string,            // Move type: "walk", "local_train", "bus", etc.
  "line_name": string,       // Line/route name (e.g., "徒歩", "東京メトロ半蔵門線")
  "transport"?: {            // Transit details (only for transit moves)
    "id": string,            // Transport line ID
    "name": string,          // Line name
    "color": string,         // Hex color code (e.g., "#8F76D6")
    "type": string,          // Train type (e.g., "普通")
    "company": {
      "id": string,
      "name": string         // Company name (e.g., "東京地下鉄（メトロ）")
    },
    "fare": {                // Fare information by unit type
      "unit_0": number,      // Standard fare
      "unit_48": number,     // IC card fare
      // ... other fare types
    },
    "fare_detail": Array<{   // Detailed fare breakdown
      "id": string,
      "fare": number,
      "start": {
        "name": string,
        "node_id": string
      },
      "goal": {
        "name": string,
        "node_id": string
      }
    }>,
    "links": Array<{         // Route links
      "id": string,
      "name": string,
      "from": {
        "id": string,
        "name": string
      },
      "to": {
        "id": string,
        "name": string
      },
      "destination": {
        "id": string,
        "name": string
      },
      "direction": string    // "up" or "down"
    }>,
    "getoff"?: string        // Exit number/position
  }
}
```

### Complete Response Example

```json
{
  "items": [
    {
      "sections": [
        {
          "coord": { "lat": 35.665251, "lon": 139.712092 },
          "name": "start",
          "type": "point"
        },
        {
          "distance": 110,
          "from_time": "2020-04-23T14:21:00+09:00",
          "line_name": "徒歩",
          "move": "walk",
          "time": 3,
          "to_time": "2020-04-23T14:24:00+09:00",
          "type": "move"
        },
        {
          "coord": { "lat": 35.665226, "lon": 139.712009 },
          "gateway": "B4口",
          "name": "表参道",
          "node_id": "00007820",
          "node_types": ["station"],
          "numbering": {
            "departure": [{ "number": "02", "symbol": "Z" }]
          },
          "type": "point"
        },
        {
          "distance": 1300,
          "from_time": "2020-04-23T14:27:00+09:00",
          "line_name": "東京メトロ半蔵門線",
          "move": "local_train",
          "time": 2,
          "to_time": "2020-04-23T14:29:00+09:00",
          "transport": {
            "color": "#8F76D6",
            "company": {
              "id": "00000113",
              "name": "東京地下鉄（メトロ）"
            },
            "fare": {
              "unit_0": 170,
              "unit_48": 168
            },
            "id": "00000451",
            "name": "東京メトロ半蔵門線",
            "type": "普通"
          },
          "type": "move"
        }
        // ... more sections
      ],
      "summary": {
        "no": "1",
        "start": {
          "coord": { "lat": 35.665251, "lon": 139.712092 },
          "name": "start",
          "type": "point"
        },
        "goal": {
          "coord": { "lat": 35.661971, "lon": 139.703795 },
          "name": "goal",
          "type": "point"
        },
        "move": {
          "distance": 1820,
          "fare": {
            "unit_0": 170,
            "unit_48": 168
          },
          "from_time": "2020-04-23T14:21:00+09:00",
          "time": 15,
          "to_time": "2020-04-23T14:36:00+09:00",
          "transit_count": 0,
          "type": "move",
          "walk_distance": 520
        }
      }
    }
    // ... more route options
  ],
  "unit": {
    "coord_unit": "degree",
    "currency": "JPY",
    "datum": "wgs84",
    "distance": "metre",
    "time": "minute"
  }
}
```

### Key Fields for Home-PA Integration

**For travel time calculation:**
- `summary.move.time` - Total travel time in minutes
- `summary.move.from_time` / `summary.move.to_time` - Exact departure/arrival times (ISO format with timezone)

**For fare display:**
- `summary.move.fare.unit_0` - Standard fare (JPY)
- `summary.move.fare.unit_48` - IC card fare (JPY)

**For route visualization:**
- `sections[]` - Detailed step-by-step route (alternating point/move)
- `transport.color` - Line color hex code (e.g., "#8F76D6") for UI display
- `transport.name` - Line name (e.g., "東京メトロ半蔵門線") for display
- `line_name` - Display name for move segments (e.g., "徒歩", line names)

**For walking distance:**
- `summary.move.walk_distance` - Total walking distance in metres
- Individual walk segments in `sections[]` with `move: "walk"`

**For transfer count:**
- `summary.move.transit_count` - Number of transit transfers

**For station/platform information:**
- `node_id` - Station node ID for linking/display
- `gateway` - Station exit/gateway name (e.g., "B4口")
- `numbering.departure` / `numbering.arrival` - Platform/track numbers with symbols

### TypeScript Type Definitions (for reference)

```typescript
interface RouteTransitResponse {
  items: Route[];
  unit: Unit;
}

interface Unit {
  coord_unit: "degree" | "millisec";
  currency: string;
  datum: "wgs84" | "tokyo";
  distance: "metre";
  time: "minute";
}

interface Route {
  sections: RouteSection[];
  summary: RouteSummary;
}

interface RouteSummary {
  no: string;
  start: Point;
  goal: Point;
  move: MoveSummary;
}

interface MoveSummary {
  from_time: string;  // ISO datetime with timezone
  to_time: string;    // ISO datetime with timezone
  time: number;       // Minutes
  distance: number;   // Metres
  walk_distance: number; // Metres
  transit_count: number;
  fare: {
    unit_0?: number;   // Standard fare (JPY)
    unit_48?: number;  // IC card fare (JPY)
    [key: string]: number | undefined;
  };
  type: "move";
}

type RouteSection = PointSection | MoveSection;

interface PointSection {
  type: "point";
  coord: {
    lat: number;
    lon: number;
  };
  name: string;
  node_id?: string;
  node_types?: string[];
  gateway?: string;
  numbering?: {
    departure?: Array<{ number: string; symbol: string }>;
    arrival?: Array<{ number: string; symbol: string }>;
  };
}

interface MoveSection {
  type: "move";
  from_time: string;  // ISO datetime with timezone
  to_time: string;    // ISO datetime with timezone
  time: number;       // Minutes
  distance: number;   // Metres
  move: string;       // "walk", "local_train", "bus", etc.
  line_name: string;
  transport?: TransportDetails;
}

interface TransportDetails {
  id: string;
  name: string;
  color: string;      // Hex color code
  type: string;       // Train type (e.g., "普通")
  company: {
    id: string;
    name: string;
  };
  fare: {
    unit_0?: number;
    unit_48?: number;
    [key: string]: number | undefined;
  };
  fare_detail?: Array<{
    id: string;
    fare: number;
    start: { name: string; node_id: string };
    goal: { name: string; node_id: string };
  }>;
  links?: Array<{
    id: string;
    name: string;
    from: { id: string; name: string };
    to: { id: string; name: string };
    destination: { id: string; name: string };
    direction: "up" | "down";
  }>;
  getoff?: string;
}
```

---

## Transport Node Search Response Format

### Top-level response structure

```typescript
{
  "count": CountInfo,
  "items": TransportNode[],
  "unit": Unit
}
```

### Count object

Pagination information:

```typescript
{
  "total": number,    // Total number of matching results
  "offset": number,  // Current pagination offset
  "limit": number    // Number of results per page
}
```

### Transport Node object

Each node in `items[]` represents a station, bus stop, port, or other transport node:

```typescript
{
  "id": string,              // Node ID (e.g., "00006668") - use this as start/goal in route_transit
  "name": string,            // Node name (e.g., "東京")
  "ruby": string,            // Ruby/pronunciation (e.g., "とうきょう")
  "types": string[],         // Node types: ["station"], ["port"], ["bus_stop"], etc.
  "address_name": string,    // Full address (e.g., "東京都千代田区丸の内")
  "address_code": string,    // Address code (e.g., "13101055000")
  "coord": {
    "lat": number,          // Latitude
    "lon": number           // Longitude
  }
}
```

### Unit object

Same as route_transit response:

```typescript
{
  "datum": "wgs84" | "tokyo",
  "coord_unit": "degree" | "millisec"
}
```

### Complete Response Example

```json
{
  "count": {
    "total": 9,
    "offset": 0,
    "limit": 10
  },
  "items": [
    {
      "id": "00006668",
      "name": "東京",
      "ruby": "とうきょう",
      "types": ["station"],
      "address_name": "東京都千代田区丸の内",
      "address_code": "13101055000",
      "coord": {
        "lat": 35.680805,
        "lon": 139.767798
      }
    },
    {
      "id": "00006669",
      "name": "東京テレポート",
      "ruby": "とうきょうてれぽーと",
      "types": ["station"],
      "address_name": "東京都江東区青海",
      "address_code": "13108045000",
      "coord": {
        "lat": 35.627435,
        "lon": 139.778108
      }
    }
    // ... more results
  ],
  "unit": {
    "datum": "wgs84",
    "coord_unit": "degree"
  }
}
```

### TypeScript Type Definitions

```typescript
interface TransportNodeResponse {
  count: CountInfo;
  items: TransportNode[];
  unit: Unit;
}

interface CountInfo {
  total: number;
  offset: number;
  limit: number;
}

interface TransportNode {
  id: string;              // Use as start/goal in route_transit
  name: string;
  ruby: string;
  types: string[];         // ["station"], ["port"], ["bus_stop"], etc.
  address_name: string;
  address_code: string;
  coord: {
    lat: number;
    lon: number;
  };
}

interface Unit {
  datum: "wgs84" | "tokyo";
  coord_unit: "degree" | "millisec";
}
```

### Key Fields for Home-PA Integration

**For station selection:**
- `id` - Node ID to use as `start` or `goal` parameter in `/route_transit`
- `name` - Display name for the station/stop
- `ruby` - Pronunciation (useful for sorting/searching in Japanese)

**For location display:**
- `coord.lat` / `coord.lon` - Coordinates for map display
- `address_name` - Full address for context

**For filtering:**
- `types` - Array of node types (e.g., `["station"]`, `["port"]`, `["bus_stop"]`)
- Filter by `types.includes("station")` to show only train stations

**For pagination:**
- `count.total` - Total number of results
- `count.offset` / `count.limit` - Current pagination state

---

## Transport Node Around Response Format

### Top-level response structure

```typescript
{
  "items": TransportNodeAround[],
  "unit": UnitWithDistanceTime
}
```

### Transport Node Around object

Each node in `items[]` represents a nearby station, bus stop, port, or other transport node with walking distance/time:

```typescript
{
  "id": string,              // Node ID (e.g., "00006547") - use this as start/goal in route_transit
  "name": string,            // Node name (e.g., "都庁前")
  "ruby": string,            // Ruby/pronunciation (e.g., "とちょうまえ")
  "types": string[],         // Node types: ["station"], ["port"], ["bus_stop"], etc.
  "address_name": string,    // Full address (e.g., "東京都")
  "address_code": string,    // Address code (e.g., "13104070000")
  "coord": {
    "lat": number,          // Latitude
    "lon": number           // Longitude
  },
  "distance": number,       // Walking distance in metres
  "time": number,           // Walking time in minutes
  "gateway"?: string         // Station exit/gateway name (e.g., "A3口", "2番口")
}
```

### Unit object

Includes distance and time units:

```typescript
{
  "datum": "wgs84" | "tokyo",
  "coord_unit": "degree" | "millisec",
  "distance": "metre",
  "time": "minute"
}
```

### Complete Response Example

```json
{
  "items": [
    {
      "id": "00006547",
      "name": "都庁前",
      "ruby": "とちょうまえ",
      "types": ["station"],
      "address_name": "東京都",
      "address_code": "13104070000",
      "coord": {
        "lat": 35.690379,
        "lon": 139.692732
      },
      "distance": 276,
      "time": 6,
      "gateway": "A3口"
    },
    {
      "id": "00004813",
      "name": "西新宿",
      "ruby": "にししんじゅく",
      "types": ["station"],
      "address_name": "東京都",
      "address_code": "13104070000",
      "coord": {
        "lat": 35.69407,
        "lon": 139.692901
      },
      "distance": 648,
      "time": 10,
      "gateway": "2番口"
    }
    // ... more results (sorted by distance/time)
  ],
  "unit": {
    "datum": "wgs84",
    "coord_unit": "degree",
    "distance": "metre",
    "time": "minute"
  }
}
```

### TypeScript Type Definitions

```typescript
interface TransportNodeAroundResponse {
  items: TransportNodeAround[];
  unit: UnitWithDistanceTime;
}

interface TransportNodeAround {
  id: string;              // Use as start/goal in route_transit
  name: string;
  ruby: string;
  types: string[];         // ["station"], ["port"], ["bus_stop"], etc.
  address_name: string;
  address_code: string;
  coord: {
    lat: number;
    lon: number;
  };
  distance: number;        // Walking distance in metres
  time: number;           // Walking time in minutes
  gateway?: string;        // Station exit/gateway name
}

interface UnitWithDistanceTime {
  datum: "wgs84" | "tokyo";
  coord_unit: "degree" | "millisec";
  distance: "metre";
  time: "minute";
}
```

### Key Fields for Home-PA Integration

**For nearby station selection:**
- `id` - Node ID to use as `start` or `goal` parameter in `/route_transit`
- `name` - Display name for the station/stop
- `distance` - Walking distance in metres (useful for sorting/filtering)
- `time` - Walking time in minutes (useful for sorting/filtering)

**For location display:**
- `coord.lat` / `coord.lon` - Coordinates for map display
- `gateway` - Station exit/gateway name (e.g., "A3口") - useful for navigation

**For filtering:**
- `types` - Array of node types (e.g., `["station"]`, `["port"]`, `["bus_stop"]`)
- Filter by `types.includes("station")` to show only train stations
- Filter by `time <= maxWalkingTime` to show only stations within walking distance

**For sorting:**
- Results are typically sorted by `distance` (ascending) - nearest stations first
- Can also sort by `time` (ascending) - fastest walking time first

---

## Address Search Response Format

### Top-level response structure

```typescript
{
  "count": CountInfo,
  "items": AddressItem[],
  "unit": Unit
}
```

### Address Item object

Each address in `items[]` represents a matching address:

```typescript
{
  "code": string,              // Address code (e.g., "13113031000")
  "name": string,              // Full address name (e.g., "東京都渋谷区代々木")
  "postal_code"?: string,      // Postal code (e.g., "1510053")
  "coord": {
    "lat": number,            // Latitude
    "lon": number             // Longitude
  },
  "details": Array<{          // Hierarchical address breakdown
    "code": string,           // Administrative code
    "name": string,           // Administrative name
    "ruby"?: string,         // Pronunciation
    "level": string          // Administrative level ("1" = prefecture, "2" = city, "3" = district)
  }>,
  "is_end": boolean           // Whether this is a complete address (not a partial match)
}
```

### Complete Response Example

```json
{
  "count": {
    "total": 2282,
    "offset": 0,
    "limit": 10
  },
  "items": [
    {
      "code": "13113031000",
      "name": "東京都渋谷区代々木",
      "postal_code": "1510053",
      "coord": {
        "lat": 35.682372,
        "lon": 139.698866
      },
      "details": [
        {
          "code": "13",
          "name": "東京都",
          "ruby": "とうきょうと",
          "level": "1"
        },
        {
          "code": "13113",
          "name": "渋谷区",
          "ruby": "しぶやく",
          "level": "2"
        },
        {
          "code": "13113031",
          "name": "代々木",
          "ruby": "よよぎ",
          "level": "3"
        }
      ],
      "is_end": false
    }
    // ... more results
  ],
  "unit": {
    "datum": "wgs84",
    "coord_unit": "degree"
  }
}
```

### TypeScript Type Definitions

```typescript
interface AddressSearchResponse {
  count: CountInfo;
  items: AddressItem[];
  unit: Unit;
}

interface AddressItem {
  code: string;
  name: string;
  postal_code?: string;
  coord: {
    lat: number;
    lon: number;
  };
  details: Array<{
    code: string;
    name: string;
    ruby?: string;
    level: string;
  }>;
  is_end: boolean;
}
```

### Key Fields for Home-PA Integration

**For geocoding:**
- `coord.lat` / `coord.lon` - Use as `goal` coordinates in `/route_transit`
- `name` - Full address string for display
- `code` - Address code for caching/deduplication

**For display:**
- `details[]` - Hierarchical breakdown (prefecture → city → district)
- `postal_code` - Postal code for address validation

**For filtering:**
- `is_end` - `true` means complete address, `false` means partial match
- Filter by `is_end: true` to show only complete addresses

---

## Address Autocomplete Response Format

### Top-level response structure

```typescript
{
  "items": AddressAutocompleteItem[],
  "unit": Unit
}
```

### Address Autocomplete Item object

Similar to Address Item but optimized for autocomplete:

```typescript
{
  "code": string,              // Address code
  "name": string,              // Address name
  "coord": {
    "lat": number,
    "lon": number
  },
  "details": Array<{          // Hierarchical address breakdown
    "code": string,
    "name": string,
    "ruby"?: string,
    "level": string
  }>,
  "is_end": boolean           // Whether this is a complete address
}
```

### Complete Response Example

```json
{
  "items": [
    {
      "code": "13103",
      "name": "東京都港区",
      "coord": {
        "lat": 35.65807,
        "lon": 139.751413
      },
      "details": [
        {
          "code": "13",
          "name": "東京都",
          "ruby": "とうきょうと",
          "level": "1"
        },
        {
          "code": "13103",
          "name": "港区",
          "ruby": "みなとく",
          "level": "2"
        }
      ],
      "is_end": false
    }
    // ... more results
  ],
  "unit": {
    "datum": "wgs84",
    "coord_unit": "degree"
  }
}
```

### TypeScript Type Definitions

```typescript
interface AddressAutocompleteResponse {
  items: AddressAutocompleteItem[];
  unit: Unit;
}

interface AddressAutocompleteItem {
  code: string;
  name: string;
  coord: {
    lat: number;
    lon: number;
  };
  details: Array<{
    code: string;
    name: string;
    ruby?: string;
    level: string;
  }>;
  is_end: boolean;
}
```

### Key Fields for Home-PA Integration

**For autocomplete UI:**
- `name` - Display in dropdown/autocomplete list
- `details[]` - Show hierarchical breakdown for context
- `coord` - Store for later use in route search

**For selection:**
- Use `coord` as `goal` in `/route_transit` when user selects an address
- `code` - Use for caching/deduplication

---

## Error Handling

NAVITIME provides error responses with:
- HTTP status code (4xx client errors, 5xx server errors)
- JSON body with `status_code` and `message` string

Examples include:
- 400 invalid path/parameter/API/contract usage
- 401 invalid client or invalid signature

Home-PA should:
- Treat non-2xx as errors
- Surface actionable messages for auth/signature/config errors
- Implement retry/backoff only for transient server-side errors (5xx / timeouts), and only if it will not violate rate limits.

---

## Rate Limits

NAVITIME states that the concrete request limits depend on your contract and should be confirmed with sales. High-computation queries (e.g., long-distance routes, multi-point, certain modes) may require individual pre-confirmation.

Home-PA should:
- Add caching (short TTL) for identical queries
- Avoid firing repeated queries while user is dragging/typing (debounce)
- Prefer server-side aggregation and caching

---

## Integration Points

### Station/Stop Search

- Use `/transport_node` to search for stations and stops by keyword.
- Use `/transport_node/around` to find nearby stations based on current location or event coordinates.
- Display search results in autocomplete/typeahead UI for route planning.
- Display nearby stations sorted by walking distance/time for quick selection.
- Use returned `node_id` as `start`/`goal` parameters in `/route_transit` requests.
- Filter results by `types` array (e.g., show only `["station"]` for train stations).
- Use `gateway` field to show which station exit is closest.

### Address Geocoding

- Use `/address` to search for addresses and convert address strings to coordinates.
- Use `/address/autocomplete` for real-time address suggestions as user types.
- Convert event `address` field to coordinates using `/address` search.
- Use returned `coord` as `goal` parameter in `/route_transit` requests.
- Cache geocoding results by address string to avoid redundant API calls.
- Filter by `is_end: true` to show only complete addresses in autocomplete.

### Assistant View

- Use `/route_transit` to estimate travel time to/from events (buffer suggestions).
- If transit time + buffers exceed available gap, reduce suggestion duration or propose earlier departure.
- Use `/transport_node` to help users select origin/destination stations for route planning.

### Calendar Events

- Store (optional) event "origin/destination" metadata for route calculation.
- On event create/edit, use `/transport_node` to search and select stations.
- Compute "estimated travel time" using `/route_transit` and store result snapshot (with timestamp).
- Recompute on day-of or when user requests refresh.

### Schedule Suggestions

- When generating time blocks, subtract estimated travel time from gaps adjacent to travel-required events.
- Optionally factor "transit_count" / "walk_distance" / "fare" ordering depending on UX goals.

---

## Environment Variables

### RapidAPI Configuration

**Required Environment Variable (server-side only):**

- `RAPIDAPI_KEY` - Your RapidAPI API key (used for `X-RapidAPI-Key` header)

**Usage in Remote Functions:**

```typescript
import { env } from "$env/dynamic/private";

const rapidApiKey = env.RAPIDAPI_KEY;
if (!rapidApiKey) {
  throw new Error("RAPIDAPI_KEY environment variable is not set");
}

// Use in request headers (lowercase to match RapidAPI examples)
const headers = {
  "x-rapidapi-key": rapidApiKey,
  "x-rapidapi-host": "navitime-route-totalnavi.p.rapidapi.com", // varies by endpoint
};
```

**Endpoint-Specific Hosts:**

- `route_transit`: `navitime-route-totalnavi.p.rapidapi.com`
- `fare_comparison`: `navitime-route-totalnavi.p.rapidapi.com`
- `fare_table`: `navitime-route-totalnavi.p.rapidapi.com`
- `shape_transit`: `navitime-route-totalnavi.p.rapidapi.com`
- `transport_node` (station search): `navitime-transport.p.rapidapi.com`
- `transport_node/around` (nearby stations): `navitime-transport.p.rapidapi.com`
- `address` (address search): `navitime-geocoding.p.rapidapi.com`
- `address/autocomplete` (address autocomplete): `navitime-geocoding.p.rapidapi.com`

**Security Notes:**

- Store `RAPIDAPI_KEY` in `.env` file (not committed to git)
- Access via `$env/dynamic/private` in server-side Remote Functions only
- Never expose API key in client-side code or browser console
- All API calls must go through server-side Remote Functions

**Production Configuration:**

- **Development**: API key stored in `.env` file (local)
- **Production**: API key stored in Render environmental variable list (deployed environment)
- Ensure the same `RAPIDAPI_KEY` variable name is used in both environments

---

## Implementation Notes

### Service Location

- Service: `src/lib/features/utilities/services/transit-api.ts`
- Remote Functions: `src/lib/features/utilities/services/transit-api.remote.ts`
- State (optional): `src/lib/features/utilities/state/transit.svelte.ts`
- Components: `src/lib/features/utilities/components/TransitView.svelte`

### Suggested API wrapper behavior

- Always URL-encode JSON parameters (`via`, array `goal`, etc.)
- Normalize inputs:
  - Prefer node IDs when known (stations), else lat/lon for arbitrary points.
- Provide a typed request builder:
  - `buildRouteTransitQuery(params) -> URLSearchParams`
- Use consistent header pattern for all RapidAPI endpoints:
  ```typescript
  const getRapidApiHeaders = (host: string) => ({
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": host,
  });
  ```

### Complete Request Examples

#### Example 1: Route Search with Coordinates

```typescript
import { env } from "$env/dynamic/private";

// Build query parameters
const params = new URLSearchParams({
  start: "35.665251,139.712092",  // lat,lon (will be URL-encoded)
  goal: "35.661971,139.703795",
  datum: "wgs84",
  term: "1440",
  limit: "5",
  start_time: "2020-08-19T10:00:00",
  coord_unit: "degree"
});

const url = `https://navitime-route-totalnavi.p.rapidapi.com/route_transit?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-route-totalnavi.p.rapidapi.com"
  }
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const result = await response.json();
```

#### Example 2: Route Search with Station Node IDs

```typescript
const params = new URLSearchParams({
  start: "00008247",  // Station node ID
  goal: "00005172",
  start_time: "2024-12-30T08:00:00",
  limit: "5"
});

const url = `https://navitime-route-totalnavi.p.rapidapi.com/route_transit?${params.toString()}`;
// ... rest same as Example 1
```

#### Example 3: Route Search with Via Points (JSON encoding required)

```typescript
// Via points must be JSON-encoded
const viaPoints = JSON.stringify([{ node: "00006668" }]);
const params = new URLSearchParams({
  start: "00008247",
  goal: "00005172",
  via: viaPoints,  // URLSearchParams will encode this
  start_time: "2024-12-30T08:00:00"
});

const url = `https://navitime-route-totalnavi.p.rapidapi.com/route_transit?${params.toString()}`;
// ... rest same as Example 1
```

#### Example 4: Station/Stop Search (Transport Node)

```typescript
const params = new URLSearchParams({
  word: "東京",           // Search keyword
  coord_unit: "degree",
  offset: "0",
  datum: "wgs84",
  limit: "10"
});

const url = `https://navitime-transport.p.rapidapi.com/transport_node?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-transport.p.rapidapi.com"
  }
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const result = await response.json();

// Use node.id as start/goal in route_transit
const stationId = result.items[0]?.id; // e.g., "00006668"
```

#### Example 5: Find Nearby Stations (Transport Node Around)

```typescript
const params = new URLSearchParams({
  coord: "35.689457,139.691935",  // Current location or event coordinates
  limit: "10",
  term: "60",                     // Max 60 minutes walking time
  datum: "wgs84",
  coord_unit: "degree",
  walk_speed: "5"                 // 5 km/h walking speed
});

const url = `https://navitime-transport.p.rapidapi.com/transport_node/around?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-transport.p.rapidapi.com"
  }
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const result = await response.json();

// Results sorted by walking distance/time
// Use result.items[0].id for nearest station
const nearestStation = result.items[0]; // { id, name, distance, time, gateway, ... }
```

#### Example 6: Search Address (Geocoding)

```typescript
const params = new URLSearchParams({
  word: "代々木",
  coord_unit: "degree",
  datum: "wgs84",
  limit: "10",
  sort: "code_asc",
  offset: "0"
});

const url = `https://navitime-geocoding.p.rapidapi.com/address?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-geocoding.p.rapidapi.com"
  }
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const result = await response.json();

// Use coord for route search
const address = result.items[0];
if (address) {
  const goalCoord = address.coord; // { lat, lon }
  // Use in route_transit as goal parameter
}
```

#### Example 7: Address Autocomplete

```typescript
const params = new URLSearchParams({
  word: "とうk",  // Partial input as user types
  datum: "wgs84",
  coord_unit: "degree"
});

const url = `https://navitime-geocoding.p.rapidapi.com/address/autocomplete?${params.toString()}`;

const response = await fetch(url, {
  method: "GET",
  headers: {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": "navitime-geocoding.p.rapidapi.com"
  }
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const result = await response.json();

// Display in autocomplete dropdown
result.items.forEach((item) => {
  console.log(item.name, item.coord);
});
```

### Caching Strategy

- In-memory cache keyed by a normalized query string:
  - TTL: 1–10 minutes depending on feature (interactive vs background)
- Persisted cache (optional) for “commute routes”:
  - Keyed by (start node, goal node, time bucket)

### Testing

- Unit test the query builder:
  - mutual exclusion errors (walk_route vs walk_speed)
  - JSON encoding correctness
- Contract test against NAVITIME sandbox/test credentials if available.

### RapidAPI Example (Reference Implementation)

Home-PA may access NAVITIME data either via the official NAVITIME API 2.0 endpoints or via RapidAPI.
The following is a **RapidAPI-based browser demo** that:
1) Searches stations via `transport_node`
2) Searches routes via `route_transit` using selected station IDs

> Notes:
> - RapidAPI uses `X-RapidAPI-Key` and `X-RapidAPI-Host` headers.
> - The official NAVITIME API 2.0 uses a different base URL and authentication mechanism.
> - `start_time` should be sent in an ISO-like format consistent with the API expectations; include seconds (e.g., `YYYY-MM-DDTHH:MM:SS`).

#### Station Search (RapidAPI: transport_node)

- GET `https://navitime-transport.p.rapidapi.com/transport_node?word={query}`
- Returns a list of matching nodes in `items[]` (use `id` as `start`/`goal` in `/route_transit`).

#### Route Search (RapidAPI: route_transit)

- GET `https://navitime-route-totalnavi.p.rapidapi.com/route_transit?start={startNodeId}&goal={goalNodeId}&start_time={departureTime}`

The response includes:
- `items[]`: route candidates
- For each route:
  - `summary` (overview, includes `move.time` etc.)
  - `sections[]` (points and movement segments)

#### Example Code (RapidAPI)

```js
// --- Config ---
const RAPIDAPI_KEY = "YOUR_API_KEY";
const transporApiHost = "navitime-transport.p.rapidapi.com";
const totalnavApiHost = "navitime-route-totalnavi.p.rapidapi.com";

// --- DOM ---
const startStationInput = document.getElementById("startStationInput");
const startStationOptions = document.getElementById("startStationOptions");
const goalStationInput = document.getElementById("goalStationInput");
const goalStationOptions = document.getElementById("goalStationOptions");
const searchRouteButton = document.getElementById("searchRouteButton");
const routeResults = document.getElementById("routeResults");

let selectedStartStation = null;
let selectedGoalStation = null;

// Debounced station search using transport_node
function setupStationSearch(inputElement, optionsContainer, isStartStation) {
  let currentTimeout = null;

  inputElement.addEventListener("input", function () {
    const searchTerm = this.value.trim();
    optionsContainer.innerHTML = "";
    optionsContainer.style.display = "none";

    if (searchTerm.length < 1) return;

    if (currentTimeout) clearTimeout(currentTimeout);

    currentTimeout = setTimeout(async () => {
      const url = `https://navitime-transport.p.rapidapi.com/transport_node?word=${encodeURIComponent(
        searchTerm
      )}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": transporApiHost,
          },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        displayStationOptions(data.items, inputElement, optionsContainer, isStartStation);
      } catch (e) {
        console.error("Station search failed:", e);
        optionsContainer.innerHTML = "";
        optionsContainer.style.display = "none";
      }
    }, 300);
  });

  document.addEventListener("click", (event) => {
    if (!inputElement.parentElement.contains(event.target)) {
      optionsContainer.style.display = "none";
    }
  });

  inputElement.addEventListener("blur", () => {
    setTimeout(() => (optionsContainer.style.display = "none"), 200);
  });
}

function displayStationOptions(stations, inputElement, optionsContainer, isStartStation) {
  optionsContainer.innerHTML = "";
  if (!stations || stations.length === 0) return;

  stations.forEach((station) => {
    const optionDiv = document.createElement("div");
    optionDiv.className = "custom-option";
    optionDiv.textContent = station.name;

    optionDiv.addEventListener("click", () => {
      inputElement.value = station.name;
      const selected = { id: station.id, name: station.name };
      if (isStartStation) selectedStartStation = selected;
      else selectedGoalStation = selected;

      optionsContainer.style.display = "none";
    });

    optionsContainer.appendChild(optionDiv);
  });

  optionsContainer.style.display = "block";
}

setupStationSearch(startStationInput, startStationOptions, true);
setupStationSearch(goalStationInput, goalStationOptions, false);

searchRouteButton.addEventListener("click", searchRoute);

async function searchRoute() {
  if (!selectedStartStation) return alert("出発駅を選択してください。");
  if (!selectedGoalStation) return alert("目的駅を選択してください。");

  routeResults.innerHTML = '<p class="info-message">経路を検索中...</p>';

  // Prefer including seconds for start_time
  const departureTime = getNowDateTimeWithSeconds();

  const url = `https://navitime-route-totalnavi.p.rapidapi.com/route_transit?start=${encodeURIComponent(
    selectedStartStation.id
  )}&goal=${encodeURIComponent(selectedGoalStation.id)}&start_time=${encodeURIComponent(departureTime)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": totalnavApiHost,
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    displayRouteResults(data.items);
  } catch (e) {
    console.error("Route search failed:", e);
    routeResults.innerHTML = `<p class="info-message">経路の検索に失敗しました: ${
      e?.message ?? "不明なエラー"
    }</p>`;
  }
}

function displayRouteResults(items) {
  routeResults.innerHTML = "";

  if (!items || items.length === 0) {
    routeResults.innerHTML = '<p class="info-message">該当する経路が見つかりませんでした。</p>';
    return;
  }

  const tabsContainer = document.createElement("div");
  tabsContainer.className = "tabs";
  const tabContentsContainer = document.createElement("div");
  tabContentsContainer.className = "tab-contents";

  items.forEach((item, routeIndex) => {
    const tabButton = document.createElement("div");
    tabButton.className = "tab-button";
    tabButton.textContent = `経路 ${item.summary?.no ?? routeIndex + 1}`;
    tabButton.dataset.tabIndex = routeIndex;

    tabButton.addEventListener("click", function () {
      document.querySelectorAll(".tab-button").forEach((btn) => btn.classList.remove("active"));
      this.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));
      document.getElementById(`tab-content-${routeIndex}`).classList.add("active");
    });

    tabsContainer.appendChild(tabButton);

    const tabContent = document.createElement("div");
    tabContent.className = "tab-content";
    tabContent.id = `tab-content-${routeIndex}`;

    const totalMinutes = item.summary?.move?.time;
    const fareYen = item.summary?.move?.fare?.unit_0;

    tabContent.innerHTML = `
      <h3>経路 ${item.summary?.no ?? routeIndex + 1}</h3>
      <p><strong>所要時間:</strong> ${typeof totalMinutes === "number" ? `${totalMinutes}分` : "N/A"}</p>
      <p><strong>運賃:</strong> ${typeof fareYen === "number" ? `${fareYen}円` : "N/A"}</p>
    `;

    item.sections?.forEach((section) => {
      const segmentDiv = document.createElement("div");
      segmentDiv.className = "segment";

      if (section.type === "point") {
        segmentDiv.classList.add("point-segment");
        segmentDiv.innerHTML = `<div class="segment-info"><strong>${section.name ?? ""}</strong></div>`;
      } else if (section.type === "move") {
        const lineName = section.transport?.name ?? section.line_name ?? "不明な路線";
        const segmentTime = section.time;
        const segmentColor = section.transport?.color ?? "#cccccc";

        segmentDiv.innerHTML = `
          <div class="segment-info">
            <span class="line-color-stripe" style="background-color:${segmentColor};"></span>
            ${lineName}${typeof segmentTime === "number" ? ` (${segmentTime}分)` : ""}
          </div>
        `;
      }

      tabContent.appendChild(segmentDiv);
    });

    tabContentsContainer.appendChild(tabContent);
  });

  routeResults.appendChild(tabsContainer);
  routeResults.appendChild(tabContentsContainer);

  tabsContainer.querySelector(".tab-button").click();
}

// ISO-like datetime with seconds: YYYY-MM-DDTHH:MM:SS
function getNowDateTimeWithSeconds() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  const second = pad(d.getSeconds());
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}


---

## Status

**Status**: Specification complete (based on NAVITIME API 2.0 public spec pages)

**Last Updated**: 2025-12-30
