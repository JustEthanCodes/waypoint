#!/usr/bin/env node
/**
 * Waypoint ETL — downloads GTFS feeds, simplifies geometry and stop data,
 * and writes per-city bundles into static/data/{cityId}.json.
 *
 * Usage:
 *   node scripts/etl.mjs --all              Build every enabled feed
 *   node scripts/etl.mjs --city=nyc-subway  Build one city
 *   node scripts/etl.mjs --refresh          Re-download even if cached
 *
 * A feed that fails validation never overwrites the last good bundle —
 * the failure is reported and the process continues with the others.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parse as csvParseSync } from 'csv-parse/sync';
import { parse as csvParseStream } from 'csv-parse';
import { FEEDS, DEFAULT_HEADWAY_MIN } from './feeds.config.mjs';
import { simplifyShape } from './simplify.mjs';

import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CACHE_DIR = path.join(ROOT, 'etl-cache');
const OUT_DIR = path.join(ROOT, 'static', 'data');

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const cityArg = args.find((a) => a.startsWith('--city='))?.split('=')[1];
const all = args.includes('--all');

const routeTypeToMode = (rt) => {
  const t = Number(rt);
  if ([0, 5, 7, 900, 901, 902, 903, 904, 905, 906, 907].includes(t)) return 'tram';
  if (t === 1 || t === 12 || (t >= 400 && t <= 405) || t === 401) return 'metro';
  if (t === 2 || (t >= 100 && t < 200) || (t >= 400 && t <= 415) || t === 406 || t === 407) return 'rail';
  if (t === 3 || t === 11 || (t >= 700 && t < 800)) return 'bus';
  if (t === 4 || t === 1000 || t === 1099) return 'ferry';
  if (t === 6 || t === 1300 || t === 1400) return 'cable';
  return 'bus';
};

const hashColor = (key) => {
  const PALETTE = ['#e4572e', '#2e7de4', '#25a05c', '#c9a227', '#8e44ad', '#17a589', '#d64580', '#e67e22'];
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return PALETTE[(h >>> 0) % PALETTE.length];
};

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(600_000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function readTxt(zip, name) {
  const entry = zip.getEntry(name) ?? zip.getEntry(`./${name}`);
  if (!entry) return null;
  return entry.getData().toString('utf8');
}

function parseCsv(text) {
  return csvParseSync(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true
  });
}

async function countRoutesPerStop(zip, tripToRoute) {
  const entry = zip.getEntry('stop_times.txt') ?? zip.getEntry('./stop_times.txt');
  if (!entry) return new Map();
  const counts = new Map(); // stop_id -> Set<route_id>
  const parser = Readable.from(entry.getData()).pipe(
    csvParseStream({ columns: true, skip_empty_lines: true, bom: true, relax_quotes: true, relax_column_count: true })
  );
  for await (const row of parser) {
    if (!row.stop_id) continue;
    const route = tripToRoute.get(row.trip_id);
    if (!route) continue;
    let set = counts.get(row.stop_id);
    if (!set) counts.set(row.stop_id, (set = new Set()));
    if (set.size < 64) set.add(route);
  }
  return counts;
}

async function buildFeed(feed) {
  console.log(`\n▸ ${feed.name} (${feed.cityId})`);
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const zipPath = path.join(CACHE_DIR, `${feed.cityId}.zip`);
  if (refresh || !existsSync(zipPath)) {
    process.stdout.write('  downloading… ');
    await download(feed.gtfsUrl, zipPath);
    console.log(`ok (${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('  using cached', path.basename(zipPath));
  }

  const zip = new AdmZip(zipPath);

  // ── routes ───────────────────────────────────────────────────────────────
  const routesCsv = readTxt(zip, 'routes.txt');
  if (!routesCsv) throw new Error('routes.txt missing');
  const routeRows = parseCsv(routesCsv);
  const routes = new Map();
  for (const r of routeRows) {
    const mode = routeTypeToMode(r.route_type);
    const color = /^[0-9a-fA-F]{6}$/.test(r.route_color ?? '') ? `#${r.route_color}` : hashColor(r.route_id);
    routes.set(r.route_id, {
      id: r.route_id,
      shortName: (r.route_short_name || r.route_long_name || r.route_id).trim(),
      longName: (r.route_long_name || '').trim(),
      mode,
      color,
      headwayMin: DEFAULT_HEADWAY_MIN[mode]
    });
  }

  // ── trips → route_id, shape_id ; frequencies → headway ───────────────────
  const tripsCsv = readTxt(zip, 'trips.txt');
  if (!tripsCsv) throw new Error('trips.txt missing');
  const tripRows = parseCsv(tripsCsv);
  const tripToRoute = new Map();
  const routeShapes = new Map(); // route_id -> Map(shape_id -> points count placeholder)
  for (const t of tripRows) {
    if (!t.route_id || !routes.has(t.route_id)) continue;
    tripToRoute.set(t.trip_id, t.route_id);
    if (t.shape_id) {
      if (!routeShapes.has(t.route_id)) routeShapes.set(t.route_id, new Set());
      routeShapes.get(t.route_id).add(t.shape_id);
    }
  }

  const freqCsv = readTxt(zip, 'frequencies.txt');
  if (freqCsv) {
    const freqRows = parseCsv(freqCsv);
    const tripHeadway = new Map();
    for (const f of freqRows) {
      const secs = Number(f.headway_secs);
      if (!Number.isFinite(secs) || secs <= 0) continue;
      const cur = tripHeadway.get(f.trip_id);
      if (cur === undefined || secs < cur) tripHeadway.set(f.trip_id, secs);
    }
    const routeHeadway = new Map();
    for (const [tripId, secs] of tripHeadway) {
      const route = tripToRoute.get(tripId);
      if (!route) continue;
      const cur = routeHeadway.get(route);
      if (cur === undefined || secs < cur) routeHeadway.set(route, secs);
    }
    for (const [routeId, secs] of routeHeadway) {
      if (routes.has(routeId)) routes.get(routeId).headwayMin = Math.max(1, Math.round(secs / 60));
    }
  }

  // ── shapes: group, pick representative per route, simplify ───────────────
  const shapesCsv = readTxt(zip, 'shapes.txt');
  if (!shapesCsv) throw new Error('shapes.txt missing');
  const shapeRows = parseCsv(shapesCsv);
  const shapePts = new Map(); // shape_id -> [[lng,lat,seq],...]
  for (const s of shapeRows) {
    const lat = Number(s.shape_pt_lat);
    const lon = Number(s.shape_pt_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    let arr = shapePts.get(s.shape_id);
    if (!arr) shapePts.set(s.shape_id, (arr = []));
    arr.push([lon, lat, Number(s.shape_pt_sequence) || arr.length]);
  }
  for (const arr of shapePts.values()) arr.sort((a, b) => a[2] - b[2]);

  const outRoutes = [];
  for (const [routeId, route] of routes) {
    const shapeIds = routeShapes.get(routeId);
    if (!shapeIds?.size) continue;
    // Representative shape = one with the most points
    let best = null;
    for (const sid of shapeIds) {
      const pts = shapePts.get(sid);
      if (pts && (!best || pts.length > best.length)) best = pts;
    }
    if (!best || best.length < 2) continue;
    const simplified = simplifyShape(best.map(([lng, lat]) => [lng, lat]), 22, 400);
    if (simplified.length < 2) continue;
    outRoutes.push({ ...route, shape: simplified });
  }
  outRoutes.sort((a, b) => modeRank(a.mode) - modeRank(b.mode) || a.shortName.localeCompare(b.shortName));

  // ── stops (+ interchange detection via streaming stop_times count) ───────
  const stopsCsv = readTxt(zip, 'stops.txt');
  if (!stopsCsv) throw new Error('stops.txt missing');
  const stopRows = parseCsv(stopsCsv);
  console.log('  counting served routes per stop (streaming stop_times.txt)…');
  const served = await countRoutesPerStop(zip, tripToRoute);

  const outStops = [];
  for (const s of stopRows) {
    const lat = Number(s.stop_lat);
    const lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue; // e.g. parent stations without coords
    const locationType = Number(s.location_type ?? 0);
    if (locationType > 1) continue; // entrances/nodes/boarding areas not drawn
    const routeSet = served.get(s.stop_id);
    outStops.push({
      id: s.stop_id,
      name: s.stop_name,
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6),
      modes: [],
      interchange: (routeSet?.size ?? 0) >= 2
    });
  }

  const bundle = {
    cityId: feed.cityId,
    generatedAt: new Date().toISOString(),
    source: {
      name: feed.name,
      url: feed.sourceUrl,
      license: feed.license,
      attribution: feed.attribution
    },
    routes: outRoutes,
    stops: dedupeStops(outStops)
  };

  const json = JSON.stringify(bundle);
  writeFileSync(path.join(OUT_DIR, `${feed.cityId}.json`), json);
  console.log(
    `  ✓ ${outRoutes.length} routes · ${bundle.stops.length} stops · ${(json.length / 1024).toFixed(0)} kB`
  );
  return { cityId: feed.cityId, routes: outRoutes.length, stops: bundle.stops.length, bytes: json.length };
}

const modeRank = (m) => ({ metro: 0, rail: 1, tram: 2, bus: 3, ferry: 4, cable: 5 }[m] ?? 9);

/** Merge platforms/children onto same coordinates to declutter the map. */
function dedupeStops(stops) {
  const seen = new Map();
  for (const s of stops) {
    const key = `${s.name.toLowerCase().trim()}|${s.lat.toFixed(4)}|${s.lon.toFixed(4)}`;
    const cur = seen.get(key);
    if (cur) {
      cur.interchange = cur.interchange || s.interchange;
    } else {
      seen.set(key, { ...s });
    }
  }
  return [...seen.values()];
}

const run = async () => {
  const enabled = FEEDS.filter((f) => f.enabled !== false && f.gtfsUrl);
  const targets = all ? enabled : cityArg ? enabled.filter((f) => f.cityId === cityArg) : enabled;
  if (targets.length === 0) {
    console.error('No matching enabled feeds. Use --all or --city=<id>. See scripts/feeds.config.mjs');
    process.exit(1);
  }
  const results = [];
  const failures = [];
  for (const feed of targets) {
    try {
      results.push(await buildFeed(feed));
    } catch (err) {
      console.error(`  ✗ FAILED ${feed.cityId}: ${err instanceof Error ? err.message : err}`);
      failures.push(feed.cityId);
    }
  }
  // Keep the deployed roster honest: only successfully built cities go into the index.
  const indexPath = path.join(OUT_DIR, 'index.json');
  const prev = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { cities: {} };
  for (const r of results) prev.cities[r.cityId] = { ...r, generatedAt: new Date().toISOString() };
  writeFileSync(indexPath, JSON.stringify({ generatedAt: new Date().toISOString(), cities: prev.cities }, null, 2));
  console.log(`\nDone. ${results.length} built, ${failures.length} failed.`);
  if (failures.length) process.exitCode = 2; // CI badge signal; last-good bundles untouched
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
