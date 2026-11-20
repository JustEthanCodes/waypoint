export type ModeGroup = 'metro' | 'rail' | 'tram' | 'bus' | 'ferry' | 'cable';

export interface RouteGeometry {
  id: string;
  shortName: string;
  longName: string;
  mode: ModeGroup;
  color: string;
  /** Simplified polyline as [lng, lat] pairs */
  shape: [number, number][];
  /** Approx. headway in minutes at peak — used by the vehicle simulation */
  headwayMin: number;
}

export interface StopPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  modes: ModeGroup[];
  /** True when the stop serves more than one line (drawn as interchange ring) */
  interchange: boolean;
  /** True for interchanges and non-bus stops — used for map label/zoom thinning */
  major?: boolean;
}

export interface CityBundle {
  cityId: string;
  generatedAt: string;
  source: {
    name: string;
    url: string;
    license: string;
    attribution: string;
  };
  routes: RouteGeometry[];
  stops: StopPoint[];
}

export interface City {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  timezone: string;
  /** live = bundled ETL geometry in repo; planned = roster entry, map data in pipeline */
  status: 'live' | 'planned';
  /** Transit mode(s) covered, for display */
  modes: string;
}

export interface Departure {
  /** Route display name, e.g. "164" or "M1" */
  displayName: string;
  headsign: string;
  agencyName: string;
  mode: string;
  /** ISO 8601 with UTC offset */
  arrival: string;
  scheduledArrival: string;
  realTime: boolean;
  cancelled: boolean;
}

export interface DeparturesResult {
  source: 'transitous' | 'transitland' | 'unavailable';
  stopName: string;
  resolvedStopId?: string;
  timezone?: string;
  departures: Departure[];
  error?: string;
}

export interface GeocodeResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country?: string;
  tz?: string;
  modes: string[];
  importance: number;
  areaPath: string;
}

export interface PlanLeg {
  mode: string;
  routeShortName: string | null;
  routeLongName: string | null;
  agencyName: string | null;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  startTime: string;
  endTime: string;
  realTime: boolean;
  distanceMeters: number | null;
  geometry: [number, number][];
}

export interface PlanItinerary {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  transfers: number;
  legs: PlanLeg[];
}

export interface PlanResult {
  from: { name: string; lat: number; lon: number } | null;
  to: { name: string; lat: number; lon: number } | null;
  itineraries: PlanItinerary[];
  error?: string;
}
