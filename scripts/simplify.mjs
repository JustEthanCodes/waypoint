/**
 * Douglas–Peucker polyline simplification in meter space.
 * Input/output points are [lng, lat].
 */

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

/** Project [lng, lat] to local meters relative to origin [lng, lat]. */
function project(points, origin) {
  const cosLat = Math.cos(toRad(origin[1]));
  return points.map(([lng, lat]) => [
    toRad(lng - origin[0]) * R * cosLat,
    toRad(lat - origin[1]) * R
  ]);
}

function perpendicularDistance(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let maxDist = 0;
    let maxIdx = -1;
    const a = points[lo];
    const b = points[hi];
    for (let i = lo + 1; i < hi; i++) {
      const d = perpendicularDistance(points[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > epsilon && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([lo, maxIdx], [maxIdx, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify a [lng, lat] polyline, preserving endpoints. epsilon in meters. */
export function simplifyShape(shape, epsilonMeters = 22, maxPoints = 400) {
  if (shape.length <= 2) return shape.slice();
  const projected = project(shape, shape[0]);
  let epsilon = epsilonMeters;
  let result = rdp(projected, epsilon);
  // Increase epsilon until within the point budget
  let guard = 0;
  while (result.length > maxPoints && guard++ < 8) {
    epsilon *= 1.6;
    result = rdp(projected, epsilon);
  }
  const cosLat = Math.cos(toRad(shape[0][1]));
  return result.map(([x, y]) => [
    +(shape[0][0] + (x / (R * cosLat)) * (180 / Math.PI)).toFixed(6),
    +(shape[0][1] + (y / R) * (180 / Math.PI)).toFixed(6)
  ]);
}
