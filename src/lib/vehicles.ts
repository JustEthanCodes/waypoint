/**
 * Vehicle rendering + simulation for the Mini Metro map.
 * Positions are *estimated from scheduled service* (shape + headway),
 * not live GPS — labelled as such in the UI.
 */
import type { Map as MlMap } from 'maplibre-gl';
import { MODE_SPEED, pointAtDistance, polylineLength, routePhase } from './geo';
import type { RouteGeometry } from './types';

const ICON_SIZE = 64;

type IconPainter = (ctx: CanvasRenderingContext2D) => void;

function paintBus(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fff';
  roundRect(ctx, 17, 5, 30, 54, 12); ctx.fill();
  cut(ctx, () => {
    roundRect(ctx, 21, 12, 22, 8, 3); ctx.fill();   // windshield
    roundRect(ctx, 21, 46, 22, 5, 2); ctx.fill();   // rear window
  });
}

function paintMetro(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fff';
  roundRect(ctx, 15, 3, 34, 58, 15); ctx.fill();
  cut(ctx, () => {
    roundRect(ctx, 20, 9, 24, 9, 4); ctx.fill();    // nose window band
    roundRect(ctx, 20, 48, 24, 4, 2); ctx.fill();   // cab door slit
    roundRect(ctx, 13, 22, 4, 12, 2); ctx.fill();   // left door notch
    roundRect(ctx, 47, 22, 4, 12, 2); ctx.fill();   // right door notch
  });
}

function paintRail(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fff';
  // sloped nose both ends
  ctx.beginPath();
  ctx.moveTo(17, 6); ctx.lineTo(47, 6); ctx.lineTo(51, 54); ctx.lineTo(47, 60);
  ctx.lineTo(17, 60); ctx.lineTo(13, 54); ctx.closePath(); ctx.fill();
  cut(ctx, () => {
    roundRect(ctx, 21, 10, 22, 5, 2); ctx.fill();
    roundRect(ctx, 21, 50, 22, 5, 2); ctx.fill();
    roundRect(ctx, 28, 26, 8, 14, 2); ctx.fill();   // roof blister
  });
}

function paintTram(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fff';
  roundRect(ctx, 18, 5, 28, 54, 10); ctx.fill();
  cut(ctx, () => {
    roundRect(ctx, 23, 11, 18, 6, 3); ctx.fill();   // windshield
    ctx.beginPath();                                 // pantograph diamond
    ctx.moveTo(32, 26); ctx.lineTo(40, 33); ctx.lineTo(32, 40); ctx.lineTo(24, 33);
    ctx.closePath(); ctx.fill();
  });
}

function paintFerry(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();                                   // pointed bow up, flat stern
  ctx.moveTo(32, 2); ctx.lineTo(48, 20); ctx.lineTo(46, 58); ctx.lineTo(18, 58); ctx.lineTo(16, 20);
  ctx.closePath(); ctx.fill();
  cut(ctx, () => {
    roundRect(ctx, 24, 26, 16, 26, 2); ctx.fill();   // deck house
  });
}

function paintCable(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(32, 4); ctx.lineTo(50, 22); ctx.lineTo(50, 42); ctx.lineTo(32, 60); ctx.lineTo(14, 42); ctx.lineTo(14, 22);
  ctx.closePath(); ctx.fill();
  cut(ctx, () => { ctx.beginPath(); ctx.moveTo(32, 22); ctx.lineTo(40, 30); ctx.lineTo(32, 38); ctx.lineTo(24, 30); ctx.closePath(); ctx.fill(); });
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
  properties: { id: string; mode: string; color: string; bearing: number; icon: string; route: string };
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
          route: route.shortName
        }
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
