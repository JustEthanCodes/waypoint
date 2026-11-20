/**
 * Vehicle rendering + simulation for the Mini Metro map.
 * Positions are *estimated from scheduled service* (shape + headway),
 * not live GPS — labelled as such in the UI.
 *
 * Glyphs are simple geometric shapes so each mode is instantly distinct
 * at small sizes. Each shape is directional (clear front point) so the
 * icon-rotate bearing visibly shows travel direction:
 *   metro = rounded square with flat front edge
 *   rail  = teardrop (circle with pointed nose)
 *   tram  = diamond with sharpened top point
 *   bus   = trapezoid (wider at front)
 *   ferry = oval with pointed bow
 *   cable = small circle with arrow
 */
import type { Map as MlMap } from 'maplibre-gl';
import { MODE_SPEED, pointAtDistance, polylineLength, routePhase } from './geo';
import type { RouteGeometry } from './types';

const ICON_SIZE = 128;

type IconPainter = (ctx: CanvasRenderingContext2D) => void;

function paintMetro(ctx: CanvasRenderingContext2D) {
  // Rounded square with a flat front edge — reads as "boxy car moving forward"
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(16, 4); ctx.lineTo(48, 4);          // flat front
  ctx.arcTo(52, 4, 52, 8, 4); ctx.lineTo(52, 56);
  ctx.arcTo(52, 60, 48, 60, 4); ctx.lineTo(16, 60);
  ctx.arcTo(12, 60, 12, 56, 4); ctx.lineTo(12, 8);
  ctx.arcTo(12, 4, 16, 4, 4);
  ctx.closePath(); ctx.fill();
}

function paintRail(ctx: CanvasRenderingContext2D) {
  // Teardrop — circle with a pointed nose at the front (direction of travel)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(32, 0);                              // pointed nose (front)
  ctx.lineTo(54, 22); ctx.arc(32, 36, 22, Math.PI / 4, Math.PI * 0.75 + Math.PI / 4, true);
  // simpler: circle body + triangle nose
  ctx.closePath(); ctx.fill();
  // Redraw cleanly as circle + triangle
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(32, 38, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(32, 2); ctx.lineTo(46, 24); ctx.lineTo(18, 24);
  ctx.closePath(); ctx.fill();
}

function paintTram(ctx: CanvasRenderingContext2D) {
  // Diamond with sharpened top point — reads as "tram"
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(32, 0); ctx.lineTo(62, 32); ctx.lineTo(32, 60); ctx.lineTo(2, 32);
  ctx.closePath(); ctx.fill();
}

function paintBus(ctx: CanvasRenderingContext2D) {
  // Trapezoid — wider at front (top), narrower at back — reads as "bus"
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(54, 0);           // wide front
  ctx.lineTo(50, 64); ctx.lineTo(14, 64);         // narrower back
  ctx.closePath(); ctx.fill();
}

function paintFerry(ctx: CanvasRenderingContext2D) {
  // Oval with pointed bow at the front
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(32, 0); ctx.lineTo(44, 18);
  ctx.ellipse(32, 36, 24, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  // pointed bow
  ctx.beginPath();
  ctx.moveTo(32, 0); ctx.lineTo(40, 16); ctx.lineTo(24, 16);
  ctx.closePath(); ctx.fill();
}

function paintCable(ctx: CanvasRenderingContext2D) {
  // Small circle with an arrow on top
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(32, 36, 14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(32, 4); ctx.lineTo(40, 18); ctx.lineTo(24, 18);
  ctx.closePath(); ctx.fill();
}

export const VEHICLE_ICONS: Record<string, IconPainter> = {
  'veh-metro': paintMetro,
  'veh-rail': paintRail,
  'veh-tram': paintTram,
  'veh-bus': paintBus,
  'veh-ferry': paintFerry,
  'veh-cable': paintCable
};

export const MODE_TO_ICON: Record<string, string> = {
  metro: 'veh-metro',
  rail: 'veh-rail',
  tram: 'veh-tram',
  bus: 'veh-bus',
  ferry: 'veh-ferry',
  cable: 'veh-cable'
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Register the SDF glyphs with the map (call once per style load). */
export function registerVehicleIcons(map: MlMap) {
  for (const [name, paint] of Object.entries(VEHICLE_ICONS)) {
    if (map.hasImage(name)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    paint(ctx);
    const imageData = ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
    map.addImage(name, imageData, { sdf: true });
  }
}

export interface VehicleFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; mode: string; color: string; bearing: number; icon: string; route: string; routeId: string };
}

export interface VehicleCollection {
  type: 'FeatureCollection';
  features: VehicleFeature[];
}

const MAX_VEHICLES = 220;

/**
 * Compute the current estimated position of every simulated vehicle.
 * Ping-pong along the shape, evenly spaced by the route's headway.
 */
export function computeVehicles(routes: RouteGeometry[], nowSeconds: number): VehicleCollection {
  const features: VehicleFeature[] = [];
  for (const route of routes) {
    if (features.length >= MAX_VEHICLES) break;
    if (route.shape.length < 2) continue;

    const length = polylineLength(route.shape);
    if (length < 400) continue;

    const speed = MODE_SPEED[route.mode] ?? 9;
    const period = length / speed; // seconds one-way
    const spacing = Math.max(600, speed * (route.headwayMin || 10) * 60); // meters between vehicles
    const count = Math.min(10, Math.max(1, Math.floor(length / spacing) + 1));
    const cycle = period * 2;
    const phase = routePhase(route.id) * cycle;

    for (let i = 0; i < count && features.length < MAX_VEHICLES; i++) {
      const offset = (i * cycle) / count;
      const t = (nowSeconds + phase + offset) % cycle;
      const forward = t <= period;
      const frac = forward ? t / period : 1 - (t - period) / period;
      const d = frac * length;
      const p = pointAtDistance(route.shape, d);
      const bearing = forward ? p.bearing : (p.bearing + 180) % 360;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: `${route.id}-${i}`,
          mode: route.mode,
          color: route.color,
          bearing,
          icon: MODE_TO_ICON[route.mode] ?? 'veh-bus',
          route: route.shortName,
          routeId: route.id
        }
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
