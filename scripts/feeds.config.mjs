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

  // ── Feeds requiring free registration (set env var, flip enabled: true) ──
  {
    cityId: 'oslo',
    name: 'Entur — Norway (national)',
    gtfsUrl: 'https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs-basic.zip',
    license: 'NLOD (Norwegian License for Open Government Data)',
    attribution: 'Entur AS, Norway',
    sourceUrl: 'https://developer.entur.no/open-data/timetable',
    enabled: false, // 100+ MB; enable once region filtering is in place
    note: 'National aggregate; large download. Prefer regional Oslo feed when available.'
  },
  {
    cityId: 'stockholm',
    name: 'SL — Stockholm (via Trafiklab)',
    gtfsUrl: null, // requires TRAFIKLAB_KEY: https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key={KEY}
    license: 'CC-BY 4.0 (Trafiklab / Samtrafiken)',
    attribution: 'Trafikförvaltningen (SL), via Trafiklab',
    sourceUrl: 'https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/',
    enabled: false,
    note: 'Set TRAFIKLAB_KEY and restore gtfsUrl to build.'
  },
  {
    cityId: 'london',
    name: 'Greater London (TfL)',
    gtfsUrl: null, // TfL does not publish a single all-modes GTFS zip; use Transitous region list / BoDS for buses
    license: 'Open Government Licence v3',
    attribution: 'Transport for London',
    sourceUrl: 'https://tfl.gov.uk/info-for/open-data-users/',
    enabled: false,
    note: 'TfL publishes mode-specific datasets; wire via Transitous region config or BoDS bus feed.'
  }
];

export const DEFAULT_HEADWAY_MIN = { metro: 6, rail: 15, tram: 8, bus: 12, ferry: 30, cable: 10 };
