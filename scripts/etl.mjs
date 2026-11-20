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
 *
 * National feeds: set feed.bbox {minLat,maxLat,minLng,maxLng} to keep only
 * stops and routes serving that region (e.g. Oslo from Norway's national GTFS).
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { parse as csvParseSync } from 'csv-parse/sync';
import { parse as csvParseStream } from 'csv-parse';
import { FEEDS, DEFAULT_HEADWAY_MIN } from './feeds.config.mjs';
import { simplifyShape } from './simplify.mjs';
import { readZipText, extractZipEntry, entryExists } from './zipstream.mjs';
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
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(900_000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function readTxt(zipPath, name) {
  return readZipText(zipPath, name);
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

/** Extract a zip entry to the cache dir without buffering the whole file; returns its path. */
function extractEntry(zip, name) {
  const entry = zip.getEntry(name) ?? zip.getEntry(`./${name}`);
  if (!entry) return null;
  const dest = path.join(CACHE_DIR, `${process.pid}-${entry.name.replace(/^\.\//, '')}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, entry.getData());
  return dest;
}

/** Streaming pass over stop_times.txt: routes served per stop + routes touching the bbox region. */
async function countRoutesPerStop(zipPath, tripToRoute, bboxStopIds) {
  const counts = new Map(); // stop_id -> Set<route_id>
  const regionalRoutes = new Set();
  const tmpFile = path.join(CACHE_DIR, `${process.pid}-stop_times.csv`);
  if (!(await extractZipEntry(zipPath, 'stop_times.txt', tmpFile))) {
    return { counts, regionalRoutes };
  }
  const extracted = tmpFile;
  const parser = createReadStream(extracted).pipe(
    csvParseStream({ columns: true, skip_empty_lines: true, bom: true, relax_quotes: true, relax_column_count: true })
  );
  let rows = 0;
  for await (const row of parser) {
    if ((++rows & 0x7fffff) === 0) console.log(`    …${(rows / 1e6).toFixed(1)}M stop_times rows`);
    if (!row.stop_id) continue;
    if (bboxStopIds && !bboxStopIds.has(row.stop_id)) continue;
    const route = tripToRoute.get(row.trip_id);
    if (!route) continue;
    regionalRoutes.add(route);
    let set = counts.get(row.stop_id);
    if (!set) counts.set(row.stop_id, (set = new Set()));
    if (set.size < 64) set.add(route);
  }
  try { unlinkSync(extracted); } catch { /* best effort */ }
  return { counts, regionalRoutes };
}

/** Feed has no shapes.txt — derive per-route geometry from stop sequences (stop_times.txt). */
async function shapesFromStopSequences(zipPath, tripToRoute, regionalRoutes, stopCoords, routeShapes) {
  const tmp = path.join(CACHE_DIR, `${process.pid}-seq-stop_times.csv`);
  if (!(await extractZipEntry(zipPath, 'stop_times.txt', tmp))) return new Map();
  const stream = createReadStream(tmp).pipe(
    csvParseStream({ columns: true, skip_empty_lines: true, bom: true, relax_quotes: true, relax_column_count: true })
  );
  const best = new Map(); // route_id -> polyline [[lng,lat],...] (longest representative trip)
  let curTrip = null;
  let curRoute = null;
  let curStops = [];
  const flush = () => {
    if (curRoute && curStops.length >= 2) {
      curStops.sort((a, b) => a.seq - b.seq);
      const line = [];
      for (const s of curStops) {
        const c = stopCoords.get(s.stopId);
        if (c) line.push(c);
      }
      if (line.length >= 2) {
        const prev = best.get(curRoute);
        if (!prev || line.length > prev.length) best.set(curRoute, line);
      }
    }
    curStops = [];
  };
  for await (const row of stream) {
    if (row.trip_id !== curTrip) {
      flush();
      curTrip = row.trip_id;
      curRoute = tripToRoute.get(row.trip_id) ?? null;
      curStops = [];
    }
    if (!curRoute || !regionalRoutes.has(curRoute)) continue;
    const seq = Number(row.stop_sequence);
    if (!Number.isFinite(seq)) continue;
    curStops.push({ stopId: row.stop_id, seq });
  }
  flush();
  try { unlinkSync(tmp); } catch { /* best effort */ }
  const shapePts = new Map();
  for (const [routeId, line] of best) {
    const shapeId = `seq-${routeId}`;
    shapePts.set(shapeId, line.map(([lon, lat], seq) => [lon, lat, seq]));
    routeShapes.set(routeId, new Set([shapeId]));
  }
  return shapePts;
}

const inBBox = (bbox, lat, lon) =>
  !bbox || (lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLng && lon <= bbox.maxLng);

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

  const bbox = feed.bbox ?? null;

  // ── routes ───────────────────────────────────────────────────────────────
  const routesCsv = await readTxt(zipPath, 'routes.txt');
  if (!routesCsv) throw new Error('routes.txt missing');
  const routeRows = parseCsv(routesCsv);
  const routes = new Map();
  for (const r of routeRows) {
    const mode = routeTypeToMode(r.route_type);
    const explicit = feed.routeColors?.[String(r.route_short_name ?? '').trim()];
    const color = explicit
      ? explicit
      : /^[0-9a-fA-F]{6}$/.test(r.route_color ?? '')
        ? `#${r.route_color}`
        : hashColor(r.route_id);
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
  const tripsCsv = await readTxt(zipPath, 'trips.txt');
  if (!tripsCsv) throw new Error('trips.txt missing');
  console.log('  parsing trips.txt…');
  const tripRows = parseCsv(tripsCsv);
  const tripToRoute = new Map();
  const routeShapes = new Map(); // route_id -> Set<shape_id>
  for (const t of tripRows) {
    if (!t.route_id || !routes.has(t.route_id)) continue;
    tripToRoute.set(t.trip_id, t.route_id);
    if (t.shape_id) {
      if (!routeShapes.has(t.route_id)) routeShapes.set(t.route_id, new Set());
      routeShapes.get(t.route_id).add(t.shape_id);
    }
  }

  const freqCsv = await readTxt(zipPath, 'frequencies.txt');
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

  // ── stops: bbox filter first (region feeds) ───────────────────────────────
  const stopsCsv = await readTxt(zipPath, 'stops.txt');
  if (!stopsCsv) throw new Error('stops.txt missing');
  const stopRows = parseCsv(stopsCsv);
  const regionalStopIds = new Set();
  const stopCoords = new Map(); // stop_id -> [lng, lat] (all stops, for geometry fallback)
  const candidateStops = [];
  for (const s of stopRows) {
    const lat = Number(s.stop_lat);
    const lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue; // parent stations without coords
    const locationType = Number(s.location_type ?? 0);
    if (locationType > 1) continue; // entrances/nodes/boarding areas not drawn
    stopCoords.set(s.stop_id, [lon, lat]);
    if (bbox && !inBBox(bbox, lat, lon)) continue;
    regionalStopIds.add(s.stop_id);
    candidateStops.push({
      id: s.stop_id,
      name: s.stop_name,
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6)
    });
  }

  // ── streaming stop_times: routes serving the region + per-stop served routes ─
  console.log('  streaming stop_times.txt…');
  const { counts: served, regionalRoutes } = await countRoutesPerStop(zipPath, tripToRoute, bbox ? regionalStopIds : null);
  console.log(`  ${bbox ? regionalRoutes.size : tripToRoute.size} routes serve the region`);

  // ── shapes: prefer shapes.txt; fall back to stop-sequence geometry ──────
  const hasShapes = !!(await entryExists(zipPath, 'shapes.txt'));
  let shapePts = new Map(); // shape_id -> [[lng,lat,seq],...]
  if (hasShapes) {
    console.log('  streaming shapes.txt…');
    const shapeToRoute = new Map(); // shape_id -> route_id (from trips)
    for (const t of tripRows) {
      if (t.shape_id && t.route_id && !shapeToRoute.has(t.shape_id)) {
        shapeToRoute.set(t.shape_id, t.route_id);
      }
    }
    const shapeTmp = path.join(CACHE_DIR, `${process.pid}-shapes.csv`);
    if (!(await extractZipEntry(zipPath, 'shapes.txt', shapeTmp))) throw new Error('shapes.txt missing');
    const shapesStream = createReadStream(shapeTmp).pipe(
      csvParseStream({ columns: true, skip_empty_lines: true, bom: true, relax_quotes: true, relax_column_count: true })
    );
    let shapeRowCount = 0;
    for await (const s of shapesStream) {
      if ((++shapeRowCount & 0x7fffff) === 0) {
        console.log(`    …${(shapeRowCount / 1e6).toFixed(1)}M shape points, ${shapePts.size} shapes kept`);
      }
      const shapeId = s.shape_id;
      if (!shapeId) continue;
      const routeId = shapeToRoute.get(shapeId);
      if (bbox) {
        // keep only shapes for region-serving routes
        if (!routeId || !regionalRoutes.has(routeId)) continue;
      }
      const lat = Number(s.shape_pt_lat);
      const lon = Number(s.shape_pt_lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      let arr = shapePts.get(shapeId);
      if (!arr) shapePts.set(shapeId, (arr = []));
      arr.push([lon, lat, Number(s.shape_pt_sequence) || arr.length]);
    }
    try { unlinkSync(shapeTmp); } catch { /* best effort */ }
    for (const arr of shapePts.values()) arr.sort((a, b) => a[2] - b[2]);
  } else {
    console.log('  no shapes.txt — deriving route geometry from stop sequences…');
    shapePts = await shapesFromStopSequences(zipPath, tripToRoute, regionalRoutes, stopCoords, routeShapes);
  }

  const outRoutes = [];
  for (const [routeId, route] of routes) {
    if (bbox && !regionalRoutes.has(routeId)) continue;
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

  // ── emit stops ───────────────────────────────────────────────────────────
  const outStops = [];
  for (const s of candidateStops) {
    const routeSet = served.get(s.id);
    // Cross-mode connection (metro+bus, rail+tram…) — NOT just two bus lines
    const modesAt = routeSet
      ? new Set([...routeSet].map((rid) => routes.get(rid)?.mode).filter(Boolean))
      : new Set();
    // Major = interchange or serves at least one non-bus route (kept visible at all zooms)
    const major = modesAt.size > 1 || [...modesAt].some((m) => m !== 'bus');
    outStops.push({ ...s, modes: [...modesAt], interchange: modesAt.size >= 2, major });
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
