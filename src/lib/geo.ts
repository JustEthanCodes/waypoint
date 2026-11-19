/**
 * Vehicle simulation math.
 *
 * We do NOT claim these are live vehicle positions (no VehiclePositions feed
 * from Transitous). We compute positions from each route's simplified shape
 * and approximate headways, so the map feels alive while the station panel
 * carries the genuinely live departures.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const R = 6371000; // earth radius, meters
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance between two [lng, lat] points, in meters. */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Cumulative length of a polyline in meters. */
export function polylineLength(shape: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < shape.length; i++) total += haversineMeters(shape[i - 1]!, shape[i]!);
  return total;
}

/** Interpolated point + bearing (degrees, 0 = north) at distance `d` meters along the polyline. */
export function pointAtDistance(
  shape: [number, number][],
  d: number
): { lat: number; lon: number; bearing: number } {
  if (shape.length === 0) return { lat: 0, lon: 0, bearing: 0 };
  if (shape.length === 1) return { lat: shape[0]![1], lon: shape[0]![0], bearing: 0 };

  let remaining = Math.max(0, d);
  for (let i = 1; i < shape.length; i++) {
    const seg = haversineMeters(shape[i - 1]!, shape[i]!);
    if (seg === 0) continue;
    if (remaining <= seg || i === shape.length - 1) {
      const t = Math.min(1, remaining / seg);
      const [lng1, lat1] = shape[i - 1]!;
      const [lng2, lat2] = shape[i]!;
      const lat = lat1 + (lat2 - lat1) * t;
      const lon = lng1 + (lng2 - lng1) * t;
      const bearing = bearingBetween(shape[i - 1]!, shape[i]!);
      return { lat, lon, bearing };
    }
    remaining -= seg;
  }
  const last = shape[shape.length - 1]!;
  return { lat: last[1], lon: last[0], bearing: 0 };
}

export function bearingBetween(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Typ. average line speed (m/s, incl. dwell time) per mode group. */
export const MODE_SPEED: Record<string, number> = {
  metro: 11,
  rail: 15,
  tram: 7.5,
  bus: 8.5,
  ferry: 5.5,
  cable: 4
};

/** Deterministic per-route phase offset so lines don't all pulse in sync. */
export function routePhase(routeId: string): number {
  let h = 2166136261;
  for (let i = 0; i < routeId.length; i++) {
    h ^= routeId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
