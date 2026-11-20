import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { TRANSITOUS_BASE, TRANSITOUS_HEADERS, fetchTimeout, cached } from '#lib/server/http';

export const prerender = false;

interface Leg {
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

interface Itinerary {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  transfers: number;
  legs: Leg[];
}

interface PlanResult {
  from: { name: string; lat: number; lon: number } | null;
  to: { name: string; lat: number; lon: number } | null;
  itineraries: Itinerary[];
  error?: string;
}

/** Decode a Google polyline encoded at precision 6 (MOTIS v6). */
function decodePolyline(str: string, precision = 6): [number, number][] {
  if (!str) return [];
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lng / factor, lat / factor]);
  }
  return points;
}

function modeColor(mode: string): string {
  const m = mode.toUpperCase();
  if (m.includes('SUBWAY') || m === 'METRO') return '#d6492b';
  if (m.includes('RAIL') || m.includes('TRAIN')) return '#2e7de4';
  if (m.includes('TRAM')) return '#25a05c';
  if (m.includes('BUS') || m.includes('COACH')) return '#c9a227';
  if (m.includes('FERRY') || m.includes('SHIP')) return '#17a589';
  if (m.includes('WALK') || m.includes('FOOT')) return '#8a8779';
  if (m.includes('BIKE')) return '#8e44ad';
  return '#6b6a63';
}

async function resolvePlace(textOrCoord: string): Promise<{ name: string; lat: number; lon: number } | null> {
  // If it's "lat,lon" — accept directly
  const parts = textOrCoord.split(',').map((s) => s.trim());
  if (parts.length === 2 && Number.isFinite(Number(parts[0])) && Number.isFinite(Number(parts[1]))) {
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    return { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon };
  }
  // Otherwise geocode via Transitous
  const res = await fetchTimeout(
    `${TRANSITOUS_BASE}/v1/geocode?text=${encodeURIComponent(textOrCoord)}&type=STOP`,
    { headers: TRANSITOUS_HEADERS }
  );
  if (!res.ok) return null;
  const entries = (await res.json()) as Array<{ name: string; lat: number; lon: number; importance?: number; areas?: { name: string }[] }>;
  if (!entries.length) return null;
  const best = [...entries].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))[0];
  if (!best) return null;
  return { name: best.name, lat: Number(best.lat), lon: Number(best.lon) };
}

export const GET: RequestHandler = async ({ url }) => {
  const from = url.searchParams.get('from')?.trim() ?? '';
  const to = url.searchParams.get('to')?.trim() ?? '';
  if (!from || !to) throw error(400, 'Required params: from, to');

  const time = url.searchParams.get('time')?.trim() || new Date().toISOString();
  const arriveBy = url.searchParams.get('arriveBy') === 'true';
  const cacheKey = `plan:${from}:${to}:${time}:${arriveBy}`;

  try {
    const result = await cached(cacheKey, 30_000, async () => {
      const fromPlace = await resolvePlace(from);
      const toPlace = await resolvePlace(to);
      if (!fromPlace || !toPlace) {
        return { from: fromPlace, to: toPlace, itineraries: [], error: 'Could not resolve one of the places.' } satisfies PlanResult;
      }

      const params = new URLSearchParams({
        fromPlace: `${fromPlace.lat},${fromPlace.lon}`,
        toPlace: `${toPlace.lat},${toPlace.lon}`,
        time,
        arriveBy: String(arriveBy),
        numItineraries: '5',
        timetableView: 'true',
        detailedLegs: 'true',
        realtimeMode: 'REALTIME'
      });

      const res = await fetchTimeout(`${TRANSITOUS_BASE}/v6/plan?${params}`, { headers: TRANSITOUS_HEADERS }, 25_000);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Transitous plan responded ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as any;

      const itineraries: Itinerary[] = (data.itineraries ?? []).map((it: any) => {
        const legs: Leg[] = (it.legs ?? []).map((leg: any) => {
          const geometry = decodePolyline(leg.legGeometry?.points ?? '', 6);
          return {
            mode: leg.mode ?? '',
            routeShortName: leg.routeShortName ?? leg.route?.shortName ?? null,
            routeLongName: leg.routeLongName ?? leg.route?.longName ?? null,
            agencyName: leg.agencyName ?? leg.agency?.name ?? null,
            from: { name: leg.from?.name ?? '', lat: Number(leg.from?.lat ?? 0), lon: Number(leg.from?.lon ?? 0) },
            to: { name: leg.to?.name ?? '', lat: Number(leg.to?.lat ?? 0), lon: Number(leg.to?.lon ?? 0) },
            startTime: leg.startTime ?? '',
            endTime: leg.endTime ?? '',
            realTime: Boolean(leg.realTime),
            distanceMeters: leg.distance != null ? Number(leg.distance) : null,
            geometry
          };
        });
        const startTime = it.startTime ?? legs[0]?.startTime ?? '';
        const endTime = it.endTime ?? legs[legs.length - 1]?.endTime ?? '';
        const transfers = Math.max(0, legs.filter((l) => l.mode !== 'WALK' && l.mode !== 'FOOT').length - 1);
        const durationMinutes = startTime && endTime
          ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
          : 0;
        return { startTime, endTime, durationMinutes, transfers, legs };
      });

      return { from: fromPlace, to: toPlace, itineraries } satisfies PlanResult;
    });

    return json(result);
  } catch (err) {
    console.error('[plan] upstream failed:', err);
    throw error(502, 'Journey planning is temporarily unavailable');
  }
};
