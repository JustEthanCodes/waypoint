/**
 * Curated feed configuration for the nightly ETL.
 * All feeds below are publicly downloadable without authentication.
 * Feeds marked needsKey require free registration and are disabled by default.
 *
 * `license` / `attribution` are stored per-feed and rendered on /about.
 */
export const FEEDS = [
  {
    cityId: 'nyc-subway',
    name: 'New York City Subway',
    gtfsUrl: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip',
    license: 'MTA Open Data — reuse permitted with attribution (https://new.mta.info/developers)',
    attribution: 'Metropolitan Transportation Authority (MTA), New York City',
    sourceUrl: 'https://new.mta.info/developers/agency/new-york-city-transit'
  },
  {
    cityId: 'boston',
    name: 'MBTA (Boston)',
    gtfsUrl: 'https://cdn.mbta.com/MBTA_GTFS.zip',
    license: 'MBTA Open Data — see https://www.mbta.com/developers/terms',
    attribution: 'Massachusetts Bay Transportation Authority (MBTA)',
    sourceUrl: 'https://www.mbta.com/developers'
  },

  // ── Region-filtered national feeds (no key required) ─────────────────────
  {
    cityId: 'oslo',
    name: 'Oslo & Viken (Entur, national feed)',
    gtfsUrl: 'https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs-basic.zip',
    license: 'NLOD — Norwegian License for Open Government Data',
    attribution: 'Entur AS (Norway) — national GTFS basic aggregate, region-filtered to Oslo/Viken',
    sourceUrl: 'https://developer.entur.no/open-data/timetable',
    bbox: { minLat: 59.74, maxLat: 60.1, minLng: 10.35, maxLng: 11.15 }
  },
  {
    cityId: 'stockholm',
    name: 'Stockholm (Trafiklab national feed, mirror)',
    gtfsUrl: 'https://data.public-transport.earth/gtfs/se',
    license: 'CC0 1.0 — public-transport.earth mirror of Trafiklab’s national GTFS',
    attribution: 'Trafiklab / Samtrafiken (Sweden) — region-filtered to Stockholm',
    sourceUrl: 'https://eu.data.public-transport.earth/',
    bbox: { minLat: 59.17, maxLat: 59.58, minLng: 17.55, maxLng: 19.05 },
    // Official T-bana colors: blue (T10/11), red (T13/14), green (T17/18/19)
    routeColors: { '10': '#005cab', '11': '#005cab', '13': '#ee3124', '14': '#ee3124', '17': '#009249', '18': '#009249', '19': '#009249' }
  },
  {
    cityId: 'copenhagen',
    name: 'Copenhagen (Din Offentlige Transport, mirror)',
    gtfsUrl: 'https://data.public-transport.earth/gtfs/dk',
    license: 'Din Offentlige Transport (see source) — national NAP feed, community mirror',
    attribution: 'Rejseplanen A/S / Din Offentlige Transport (Denmark) — region-filtered to Copenhagen',
    sourceUrl: 'https://eu.data.public-transport.earth/',
    bbox: { minLat: 55.45, maxLat: 55.95, minLng: 12.0, maxLng: 13.0 }
  },
  {
    cityId: 'berlin',
    name: 'Berlin–Brandenburg (VBB)',
    gtfsUrl: 'https://www.vbb.de/gtfs',
    license: 'VBB open data — see vbb.de/gtfs',
    attribution: 'Verkehrsverbund Berlin-Brandenburg (VBB) — region-filtered to Berlin',
    sourceUrl: 'https://www.vbb.de/gtfs',
    bbox: { minLat: 52.31, maxLat: 52.7, minLng: 13.08, maxLng: 13.75 }
  },

  // ── Feeds requiring free registration (set env var, flip enabled: true) ──
  {
    cityId: 'london',
    name: 'London (National Rail + TfL, mirror)',
    gtfsUrl: 'https://github.com/planarnetwork/gb-transit/releases/latest/download/gtfs-rail-and-tfl.zip',
    license: 'UK Open Government Licence (National Rail + TfL open data)',
    attribution: 'planarnetwork/gb-transit (National Rail + TfL, region-filtered to Greater London)',
    sourceUrl: 'https://planarnetwork.github.io/gb-transit/feeds',
    bbox: { minLat: 51.25, maxLat: 51.72, minLng: -0.6, maxLng: 0.45 },
    // Skip replacement buses; keep only routes whose representative shape
    // stays mostly inside London (drops intercity services passing through)
    dropRouteTypes: [714],
    routeBboxFilter: { minShare: 0.25, maxKm: 60 }
  },
];

export const DEFAULT_HEADWAY_MIN = { metro: 6, rail: 15, tram: 8, bus: 12, ferry: 30, cable: 10 };
