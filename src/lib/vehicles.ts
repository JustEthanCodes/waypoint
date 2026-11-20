/**
 * Vehicle rendering + simulation for the Mini Metro map.
 * Positions are *estimated from scheduled service* (shape + headway),
 * not live GPS — labelled as such in the UI.
 *
 * Glyphs are simple geometric shapes so each mode is instantly distinct
 * at small sizes: metro = rounded square, rail = circle, tram = diamond,
 * bus = rectangle, ferry = oval, cable = small circle.
 */
import type { Map as MlMap } from 'maplibre-gl';
import { MODE_SPEED, pointAtDistance, polylineLength, routePhase } from './geo';
import type { RouteGeometry } from './types';

const ICON_SIZE = 64;

type IconPainter = (ctx: CanvasRenderingContext2D) => void;

function paintMetro(ctx: CanvasRenderingContext2D) {
  // Rounded square — distinct from bus's sharp rectangle
  ctx.fillStyle = '#fff';
  roundRect(ctx, 12, 12, 40, 40, 8); ctx.fill();
}

function paintRail(ctx: CanvasRenderingContext2D) {
  // Circle — filled with the line colour, black outline via halo
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fill();
}

function paintTram(ctx: CanvasRenderingContext2D) {
  // 45° rotated square (diamond)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(32, 4); ctx.lineTo(60, 32); ctx.lineTo(32, 60); ctx.lineTo(4, 32);
  ctx.closePath(); ctx.fill();
}

function paintBus(ctx: CanvasRenderingContext2D) {
  // Sharp rectangle
  ctx.fillStyle = '#fff';
  ctx.fillRect(10, 14, 44, 36);
}

function paintFerry(ctx: CanvasRenderingContext2D) {
  // Oval
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(32, 32, 28, 16, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintCable(ctx: CanvasRenderingContext2D) {
  // Small circle
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(32, 32, 14, 0, Math.PI * 2);
  ctx.fill();
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

function cut(ctx: CanvasRenderingContext2D, draw: () => void) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  draw();
  ctx.restore();
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
