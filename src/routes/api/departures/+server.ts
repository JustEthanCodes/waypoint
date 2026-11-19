import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Departure, DeparturesResult } from '#lib/types';
import {
  TRANSITOUS_BASE,
  TRANSITOUS_HEADERS,
  cached,
  fetchTimeout
} from '#lib/server/http';
import { TRANSITLAND_API_KEY } from '$app/env/private';

export const prerender = false;

const toRad = (d: number) => (d * Math.PI) / 180;
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

interface TransitousGeocodeEntry {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tz?: string;
  modes?: string[];
  importance?: number;
}

async function resolveTransitousStop(name: string, lat: number, lon: number) {
  const entries = await cached(`geocode:dep:${name.toLowerCase()}:${lat.toFixed(3)}:${lon.toFixed(3)}`, 60_000, async () => {
    const res = await fetchTimeout(
      `${TRANSITOUS_BASE}/v1/geocode?text=${encodeURIComponent(name)}&type=STOP`,
      { headers: TRANSITOUS_HEADERS }
    );
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    return (await res.json()) as TransitousGeocodeEntry[];
  });
  const scored = entries
    .map((e) => ({ e, d: haversineMeters(lat, lon, Number(e.lat), Number(e.lon)) }))
    .filter(({ d }) => d < 1500)
    .sort((a, b) => a.d - b.d || (b.e.importance ?? 0) - (a.e.importance ?? 0));
  return scored[0]?.e ?? null;
}

async function departuresFromTransitous(stop: TransitousGeocodeEntry, limit: number): Promise<DeparturesResult> {
  const data = await cached(`stoptimes:${stop.id}:${limit}`, 25_000, async () => {
    const res = await fetchTimeout(
      `${TRANSITOUS_BASE}/v5/stoptimes?stopId=${encodeURIComponent(stop.id)}&n=${limit}`,
      { headers: TRANSITOUS_HEADERS }
    );
    if (!res.ok) throw new Error(`stoptimes ${res.status}`);
    return res.json() as Promise<any>;
  });

  const departures: Departure[] = (data.stopTimes ?? []).map((t: any) => ({
    displayName: String(t.displayName ?? t.routeShortName ?? t.tripShortName ?? '').trim() || '—',
    headsign: t.headsign ?? '',
    agencyName: t.agencyName ?? '',
    mode: t.mode ?? '',
    arrival: t.place?.arrival ?? t.place?.scheduledArrival,
    scheduledArrival: t.place?.scheduledArrival ?? t.place?.arrival,
    realTime: Boolean(t.realTime),
    cancelled: Boolean(t.cancelled || t.tripCancelled)
  }));

  return {
    source: 'transitous',
    stopName: stop.name,
    resolvedStopId: stop.id,
    timezone: stop.tz ?? data.place?.tz,
    departures
  };
}

/** Best-effort Transitland fallback (only when TRANSITLAND_API_KEY is configured). */
async function departuresFromTransitland(name: string, lat: number, lon: number, limit: number): Promise<DeparturesResult | null> {
  const key = TRANSITLAND_API_KEY?.trim();
  if (!key) return null;
  try {
    const stopsRes = await fetchTimeout(
      `https://transit.land/api/v2/rest/stops?lat=${lat}&lon=${lon}&search_radius_meters=1200&query=${encodeURIComponent(name)}&apikey=${encodeURIComponent(key)}`,
      {},
      9000
    );
    if (!stopsRes.ok) return null;
    const stopsJson = (await stopsRes.json()) as any;
    const stops = stopsJson.stops ?? stopsJson.entities ?? [];
    if (!stops.length) return null;
    const best = stops
      .map((s: any) => ({ s, d: haversineMeters(lat, lon, Number(s.geometry?.coordinates?.[1] ?? s.lat), Number(s.geometry?.coordinates?.[0] ?? s.lon)) }))
      .sort((a: any, b: any) => a.d - b.d)[0]?.s;
    const stopKey = best.onestop_id ?? best.id;
    const stopName = best.name ?? name;
    if (!stopKey) return null;

    const depRes = await fetchTimeout(
      `https://transit.land/api/v2/rest/stops/${encodeURIComponent(stopKey)}/departures?apikey=${encodeURIComponent(key)}&limit=${limit}`,
      {},
      9000
    );
    if (!depRes.ok) return null;
    const depJson = (await depRes.json()) as any;
    const deps: Departure[] = (depJson.departures ?? []).map((d: any) => {
      const stopTime = d.stop_time ?? d;
      const route = d.trip?.route ?? d.route ?? {};
      const arrIso = stopTime.arrival_timestamp
        ? new Date(Number(stopTime.arrival_timestamp) * 1000).toISOString()
        : stopTime.departure_timestamp
          ? new Date(Number(stopTime.departure_timestamp) * 1000).toISOString()
          : undefined;
      return {
        displayName: route.route_short_name ?? route.route_long_name ?? '—',
        headsign: d.trip?.trip_headsign ?? stopTime.headsign ?? '',
        agencyName: route.agency?.agency_name ?? route.agency_name ?? '',
        mode: route.route_type ?? '',
        arrival: arrIso,
        scheduledArrival: arrIso,
        realTime: Boolean(stopTime.arrival_estimated_utc || stopTime.departure_estimated_utc),
        cancelled: false
      };
    });
    return {
      source: 'transitland',
      stopName,
      resolvedStopId: String(stopKey),
      departures: deps
    };
  } catch (err) {
    console.error('[departures] Transitland fallback failed:', err);
    return null;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const name = url.searchParams.get('name')?.trim();
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('n') ?? 12)));

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw error(400, 'Required params: name, lat, lon');
  }

  try {
    const stop = await resolveTransitousStop(name, lat, lon);
    if (stop) {
      return json(await departuresFromTransitous(stop, limit));
    }
    const fallback = await departuresFromTransitland(name, lat, lon, limit);
    if (fallback) return json(fallback);
    return json({
      source: 'unavailable',
      stopName: name,
      departures: [],
      error: 'Live departures are not yet covered at this stop. Try a major station nearby.'
    } satisfies DeparturesResult);
  } catch (err) {
    console.error('[departures] Transitous failed, trying Transitland:', err);
    const fallback = await departuresFromTransitland(name, lat, lon, limit);
    if (fallback) return json(fallback);
    return json({
      source: 'unavailable',
      stopName: name,
      departures: [],
      error: 'Live departures are temporarily unavailable. Showing scheduled service only when riding static data is available.'
    } satisfies DeparturesResult);
  }
};
