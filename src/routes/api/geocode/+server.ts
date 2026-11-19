import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GeocodeResult } from '#lib/types';
import { TRANSITOUS_BASE, TRANSITOUS_HEADERS, cached, fetchTimeout } from '#lib/server/http';

export const prerender = false;

interface TransitousGeocodeEntry {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tz?: string;
  modes?: string[];
  importance?: number;
  country?: string;
  areas?: { name: string }[];
}

export const GET: RequestHandler = async ({ url }) => {
  const text = url.searchParams.get('text')?.trim() ?? '';
  if (text.length < 2) throw error(400, 'text must be at least 2 characters');

  const key = `geocode:${text.toLowerCase()}`;
  try {
    const results = await cached(key, 60_000, async () => {
      const res = await fetchTimeout(
        `${TRANSITOUS_BASE}/v1/geocode?text=${encodeURIComponent(text)}&type=STOP`,
        { headers: TRANSITOUS_HEADERS }
      );
      if (!res.ok) throw new Error(`Transitous geocode responded ${res.status}`);
      const entries = (await res.json()) as TransitousGeocodeEntry[];
      return entries.slice(0, 9).map<GeocodeResult>((e) => ({
        id: e.id,
        name: e.name,
        lat: Number(e.lat),
        lon: Number(e.lon),
        tz: e.tz,
        country: e.country,
        modes: e.modes ?? [],
        importance: e.importance ?? 0,
        areaPath: (e.areas ?? [])
          .map((a) => a.name)
          .filter(Boolean)
          .slice(-3)
          .join(' › ')
      }));
    });
    return json(results);
  } catch (err) {
    console.error('[geocode] upstream failed:', err);
    throw error(502, 'Stop search is temporarily unavailable');
  }
};
