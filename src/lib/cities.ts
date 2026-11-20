import type { City } from './types';

/**
 * Curated global roster. `live` cities have bundled, real ETL geometry
 * (see scripts/etl.mjs) and render the full Mini Metro map.
 * `planned` cities are selectable in the globe but their map tiles
 * are produced by the nightly ETL once feeds are wired up — the
 * worldwide search still works for them today via Transitous.
 */
export const CITIES: City[] = [
  { id: 'nyc-subway', name: 'New York City', country: 'United States', countryCode: 'US', lat: 40.73, lon: -73.99, timezone: 'America/New_York', status: 'live', modes: 'Subway · Bus · LIRR' },
  { id: 'boston', name: 'Boston', country: 'United States', countryCode: 'US', lat: 42.36, lon: -71.06, timezone: 'America/New_York', status: 'live', modes: 'Subway · Commuter Rail · Bus · Ferry' },
  { id: 'berlin', name: 'Berlin', country: 'Germany', countryCode: 'DE', lat: 52.52, lon: 13.405, timezone: 'Europe/Berlin', status: 'live', modes: 'U-Bahn · S-Bahn · Tram · Bus · Regional rail' },
  { id: 'oslo', name: 'Oslo', country: 'Norway', countryCode: 'NO', lat: 59.9139, lon: 10.7522, timezone: 'Europe/Oslo', status: 'live', modes: 'Metro · Tram · Bus · National rail' },
  { id: 'stockholm', name: 'Stockholm', country: 'Sweden', countryCode: 'SE', lat: 59.3293, lon: 18.0686, timezone: 'Europe/Stockholm', status: 'live', modes: 'Metro · Commuter Rail · Tram · Bus' },
  { id: 'copenhagen', name: 'Copenhagen', country: 'Denmark', countryCode: 'DK', lat: 55.6761, lon: 12.5683, timezone: 'Europe/Copenhagen', status: 'live', modes: 'Metro · S-train · Regional rail · Bus' },

  { id: 'london', name: 'London', country: 'United Kingdom', countryCode: 'GB', lat: 51.5072, lon: -0.1276, timezone: 'Europe/London', status: 'live', modes: 'Underground · Overground · DLR · Elizabeth line · National Rail' },
  { id: 'paris', name: 'Paris', country: 'France', countryCode: 'FR', lat: 48.8566, lon: 2.3522, timezone: 'Europe/Paris', status: 'planned', modes: 'Métro · RER · Tram · Bus' },
  { id: 'sydney', name: 'Sydney', country: 'Australia', countryCode: 'AU', lat: -33.8688, lon: 151.2093, timezone: 'Australia/Sydney', status: 'planned', modes: 'Metro · Train · Light Rail · Ferry · Bus' },
  { id: 'melbourne', name: 'Melbourne', country: 'Australia', countryCode: 'AU', lat: -37.8136, lon: 144.9631, timezone: 'Australia/Melbourne', status: 'planned', modes: 'Metro · Tram · Bus' },
  { id: 'milan', name: 'Milan', country: 'Italy', countryCode: 'IT', lat: 45.4642, lon: 9.19, timezone: 'Europe/Rome', status: 'planned', modes: 'Metro · Tram · Bus' },
  { id: 'rome', name: 'Rome', country: 'Italy', countryCode: 'IT', lat: 41.9028, lon: 12.4964, timezone: 'Europe/Rome', status: 'planned', modes: 'Metro · Tram · Bus' },
  { id: 'toronto', name: 'Toronto', country: 'Canada', countryCode: 'CA', lat: 43.6532, lon: -79.3832, timezone: 'America/Toronto', status: 'planned', modes: 'Subway · Streetcar · Bus · GO Rail' },
  { id: 'vancouver', name: 'Vancouver', country: 'Canada', countryCode: 'CA', lat: 49.2827, lon: -123.1207, timezone: 'America/Vancouver', status: 'planned', modes: 'SkyTrain · SeaBus · Bus' },
  { id: 'chicago', name: 'Chicago', country: 'United States', countryCode: 'US', lat: 41.8781, lon: -87.6298, timezone: 'America/Chicago', status: 'planned', modes: 'L · Metra · Bus' },
  { id: 'amsterdam', name: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', lat: 52.3676, lon: 4.9041, timezone: 'Europe/Amsterdam', status: 'planned', modes: 'Metro · Tram · Train · Bus' },
  { id: 'madrid', name: 'Madrid', country: 'Spain', countryCode: 'ES', lat: 40.4168, lon: -3.7038, timezone: 'Europe/Madrid', status: 'planned', modes: 'Metro · Cercanías · Bus' },
  { id: 'helsinki', name: 'Helsinki', country: 'Finland', countryCode: 'FI', lat: 60.1699, lon: 24.9384, timezone: 'Europe/Helsinki', status: 'planned', modes: 'Metro · Tram · Commuter Rail · Bus' },
  { id: 'vienna', name: 'Vienna', country: 'Austria', countryCode: 'AT', lat: 48.2082, lon: 16.3738, timezone: 'Europe/Vienna', status: 'planned', modes: 'U-Bahn · Tram · Bus · S-Bahn' },
  { id: 'warsaw', name: 'Warsaw', country: 'Poland', countryCode: 'PL', lat: 52.2297, lon: 21.0122, timezone: 'Europe/Warsaw', status: 'planned', modes: 'Metro · Tram · Bus' },
  { id: 'lisbon', name: 'Lisbon', country: 'Portugal', countryCode: 'PT', lat: 38.7223, lon: -9.1393, timezone: 'Europe/Lisbon', status: 'planned', modes: 'Metro · Tram · Bus' },
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', countryCode: 'JP', lat: 35.6762, lon: 139.6503, timezone: 'Asia/Tokyo', status: 'planned', modes: 'Subway · JR · Private rail · Bus' },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', countryCode: 'SG', lat: 1.3521, lon: 103.8198, timezone: 'Asia/Singapore', status: 'planned', modes: 'MRT · LRT · Bus' },
  { id: 'hongkong', name: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK', lat: 22.3193, lon: 114.1694, timezone: 'Asia/Hong_Kong', status: 'planned', modes: 'MTR · Tram · Bus · Ferry' },
  { id: 'saopaulo', name: 'São Paulo', country: 'Brazil', countryCode: 'BR', lat: -23.5505, lon: -46.6333, timezone: 'America/Sao_Paulo', status: 'planned', modes: 'Metro · CPTM · Bus' }
];

export const LIVE_CITIES = CITIES.filter((c) => c.status === 'live');

export function getCity(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}
