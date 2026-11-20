# Waypoint

**Every bus, train, metro, tram and ferry on Earth — drawn as a minimalist,
Mini Metro-style map.**

Waypoint is an open-source web app that renders public transport systems across
the globe with a radically simple design language: one 3D globe to pick your
city, then a flat, beautiful network map with live vehicles and live
departures.

- **Globe mode** — drag to spin the Earth, pick any of the curated cities with
  bundled network maps (New York, Boston today — more join the nightly ETL
  pipeline), or search **any stop on Earth** through Transitous and get live
  departures immediately.
- **City map mode** — Mini Metro visuals: official line colors, rounded casings,
  ring-marked interchanges, and mode-accurate vehicle glyphs moving along
  routes (scheduled-service estimates, honestly labelled).
- **Live station panel** — click any stop for realtime-blended next departures:
  route pill, headsign, agency, countdown, `live` badges when GTFS-Realtime is
  available, cancellations flagged, times in the stop's own timezone.
- **Mode picker** — All · Metro · Rail · Tram · Bus · Ferry.

## Stack

SvelteKit 3 · Svelte 5 (runes) · TypeScript · Tailwind CSS v4 · MapLibre GL 6
(globe + flat projections) · Vitest · Cloudflare Workers (via `@sveltejs/adapter-cloudflare`)

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Useful commands:

| Command | What it does |
|---|---|
| `npm run check` | svelte-check (0 errors policy) |
| `npm test` | Vitest — simplifier, geo math, data contract |
| `npm run build` | production build for Cloudflare Workers |
| `npm run etl` | download GTFS feeds, rebuild `static/data/*.json` |
| `npm run etl -- --city=nyc-subway` | rebuild one city |
| `npx wrangler deploy` | deploy to Cloudflare Workers (after `npm run build`) |

## Data architecture

```
                 ┌─────────────────────────────┐
                 │        Transitous           │  primary runtime
                 │  (MOTIS 2, no API key)      │  geocode · stoptimes · alerts
                 └───────┬───────────▲─────────┘
        /api/geocode     │           │  /api/departures (server proxy + cache + backoff)
        + /api/departures┼───────────┘
                 ┌───────▼───────────────────────────────────────────┐
                 │  Waypoint (SvelteKit + Cloudflare Workers)        │
                 │  · static JSON bundles (routes/stops/shapes)      │
                 └───────┬───────────────────────────────────────────┘
                         │ nightly
                 ┌───────▼──────────┐        ┌───────────────────────┐
                 │  ETL (Node)      │◀───────│  Mobility Database    │
                 │  scripts/etl.mjs │  feeds │  (catalog, counts,    │
                 │  GTFS → simplified│        │   license metadata)   │
                 │  JSON bundles    │        └───────────────────────┘
                 └──────────────────┘        ┌───────────────────────┐
                  fallback if Transitous ──▶ │  Transitland (key     │
                  is unreachable              │  optional, 60s cache) │
                                              └───────────────────────┘
```

**Vehicle motion** is derived from each route's shape + headway (speed varies by
mode) — it is an *estimate*, labelled as such in the UI. Live "arrived/departed"
truth comes from Transitous's realtime-blended departures. Cities where agencies
publish open GTFS-RT vehicle positions (Stockholm, Oslo, London, …) can get a
hard-GPS layer later; the architecture allows it.

### Why these sources

- **[Transitous](https://transitous.org)** — free, no key, global, community-run.
  Their [usage policy](https://transitous.org/api/) requires open source,
  attribution links, and respectful request rates. Waypoint complies: MIT
  licensed, attribution in the footer + `/about`, server-side cache + backoff,
  and a Transitland fallback so we degrade instead of hammering them.
- **[Mobility Database](https://mobilitydatabase.org)** — the global GTFS feed
  catalogue used by the nightly ETL for feed discovery and license metadata.
- **[Transitland](https://transit.land)** — optional fallback departures
  (set `TRANSITLAND_API_KEY`); link their terms page if you enable it.

## Deploying to Cloudflare Workers

```bash
npm install
npm run build          # emits .svelte-kit/cloudflare (worker + static assets)
npx wrangler deploy    # uses wrangler.jsonc → redirects to the generated config
```

For the GitHub flow: push to the default branch and connect the repo in the
Cloudflare dashboard (Workers Builds), or use `wrangler deploy` locally.
No secrets are required; set `TRANSITLAND_API_KEY` / `MOBILITY_DATABASE_REFRESH_TOKEN`
only if you want the fallback / ETL authenticated paths.

`npx wrangler deploy --dry-run` works offline and validates the worker bundle
(27 modules, ~1.4 MB) and assets without deploying.

## Environment variables

See `.env.example`. Everything is optional:

| Var | Purpose |
|---|---|
| `PUBLIC_CONTACT_URL` | Public project URL (defaults to the GitHub repo) |
| `TRANSITLAND_API_KEY` | Fallback departures if Transitous is down |
| `MOBILITY_DATABASE_REFRESH_TOKEN` | CI-only, ETL feed discovery |

## Bundled cities (map geometry in repo)

New York City (MTA Subway) · Boston (MBTA) · Berlin (VBB, region-filtered) ·
Oslo (Entur national, region-filtered) · Stockholm (Trafiklab national,
region-filtered, geometry derived from stop sequences) · Copenhagen (DOT
national, region-filtered) · London (National Rail + TfL, region-filtered).

More cities are added by enabling their GTFS feed in
`scripts/feeds.config.mjs` and running the nightly ETL — London, Paris and
Sydney are scaffolded but need free API keys from their operators' open-data
portals. Norway-class national feeds are automatically narrowed to the
region's stops/routes via an optional `bbox` in the feed config.

## Honest limitations / roadmap

- Vehicle positions are **scheduled-service estimates**, not GPS.
- Live departures coverage depends on what agencies feed Transitous; some
  stops show timetable-only (`realTime: false`).
- Paris/Milan/London-style feeds need registration; the roster is deliberately
  curated and expands as feeds pass validation (a failed feed never replaces a
  good bundle).
- [ ] True GPS layer for SL/Entur/TfL (keys documented in `feeds.config.mjs`)
- [ ] A→B journey planning via Transitous `/plan` (rate-limit aware)
- [ ] GBFS bike-share layer
- [ ] PWA offline caching of visited cities
- [ ] İstanbul, Tokyo, São Paulo, Hong Kong, Mexico City on the roster

## Contributing

Issues and PRs welcome. Run `npm run check` and `npm test` before opening a PR.
Adding a city = adding a feed entry to `scripts/feeds.config.mjs`, then
`npm run etl -- --city=<id>` and a commit of the regenerated bundle.

## License

MIT for Waypoint's code. Data remains the property of its publishers — see
`/about` for per-feed attribution and licenses (OSM © OpenStreetMap
contributors; basemaps © CARTO; Transitous transit data under each source's
license; MTA/MBTA open data).
