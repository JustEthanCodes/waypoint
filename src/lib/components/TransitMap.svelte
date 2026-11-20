<script lang="ts">
  import { onMount } from 'svelte';
  import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
  import { LoaderCircle, TriangleExclamationPoint } from '@lucide/svelte';
  import { theme, basemapStyle } from '#lib/theme.svelte';
  import { computeVehicles, registerVehicleIcons } from '#lib/vehicles';
  import type { CityBundle, ModeGroup, StopPoint, City } from '#lib/types';
  import type { ModeFilter } from './ModePicker.svelte';

  let {
    city,
    modeFilter,
    selectedStop = null,
    onSelectStop
  }: {
    city: City;
    modeFilter: ModeFilter;
    selectedStop?: StopPoint | null;
    onSelectStop: (stop: StopPoint | null) => void;
  } = $props();

  let container: HTMLDivElement;
  let map: MlMap | undefined;
  let bundle = $state<CityBundle | null>(null);
  let loadError = $state<string | null>(null);
  let styleReady = $state(false);
  let vehicleRaf = 0;
  let lastVehicleUpdate = 0;

  function tickVehicles() {
    if (!map || !bundle || document.hidden) {
      vehicleRaf = requestAnimationFrame(tickVehicles);
      return;
    }
    const now = performance.now();
    if (now - lastVehicleUpdate >= 80) { // ~12fps — smooth without excessive CPU
      lastVehicleUpdate = now;
      const src = map.getSource('wp-vehicles') as GeoJSONSource | undefined;
      if (src) {
        src.setData(computeVehicles(bundle.routes, now / 1000) as any);
      }
    }
    vehicleRaf = requestAnimationFrame(tickVehicles);
  }

  function startVehicleLoop() {
    cancelAnimationFrame(vehicleRaf);
    lastVehicleUpdate = 0;
    vehicleRaf = requestAnimationFrame(tickVehicles);
  }
  const MODES_ALL: ModeGroup[] = ['metro', 'rail', 'tram', 'bus', 'ferry', 'cable'];
  const selectedModes = $derived(modeFilter === 'all' ? MODES_ALL : [modeFilter as ModeGroup]);

  /** Solo filter (line legend) — when set, only this route's geometry is fully visible. */
  let soloRoute = $state<string | null>(null);

  const LEGEND_GROUPS: { mode: ModeGroup; label: string }[] = [
    { mode: 'metro', label: 'Metro' },
    { mode: 'rail', label: 'Rail' },
    { mode: 'tram', label: 'Tram' },
    { mode: 'bus', label: 'Bus' },
    { mode: 'ferry', label: 'Ferry' },
    { mode: 'cable', label: 'Cable' }
  ];
  const legendGroups = $derived.by(() => {
    const b = bundle;
    if (!b) return [];
    const groups: { label: string; routes: typeof b.routes }[] = [];
    for (const g of LEGEND_GROUPS) {
      const routes = b.routes
        .filter((r) => r.mode === g.mode)
        .sort((a, b2) => a.shortName.localeCompare(b2.shortName, undefined, { numeric: true }));
      if (routes.length) groups.push({ label: g.label, routes });
    }
    return groups;
  });

  const palette = $derived.by(() => {
    const dark = theme.resolved === 'dark';
    return {
      casing: dark ? '#0b0e10' : '#ffffff',
      stopFill: dark ? '#ece9df' : '#1a1c1e',
      stopRing: dark ? '#121517' : '#ffffff',
      interchangeFill: dark ? '#121517' : '#fbf9f1',
      interchangeStroke: dark ? '#ece9df' : '#1a1c1e',
      label: dark ? '#d8d5c9' : '#33352f',
      labelHalo: dark ? '#121517' : '#f7f5ec',
      vehicleHalo: dark ? '#ffffff' : '#000000'
    };
  });

  async function loadBundle() {
    loadError = null;
    bundle = null;
    try {
      const res = await fetch(`/data/${city.id}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bundle = (await res.json()) as CityBundle;
    } catch (err) {
      console.error('[bundle]', err);
      loadError = 'Map data could not be loaded. Check your connection and retry.';
    }
  }

  function routesGeoJSON(b: CityBundle) {
    return {
      type: 'FeatureCollection' as const,
      features: b.routes.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: r.shape },
        properties: { id: r.id, mode: r.mode, color: r.color, name: r.shortName }
      }))
    };
  }

  function stopsGeoJSON(b: CityBundle) {
    return {
      type: 'FeatureCollection' as const,
      features: b.stops.map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id,
          name: s.name,
          interchange: s.interchange ? 1 : 0,
          major: s.major || s.interchange ? 1 : 0
        }
      }))
    };
  }

  function addWaypointLayers() {
    if (!map) return;
    const b = bundle;
    if (!b) return;

    registerVehicleIcons(map);

    // Sources
    if (map.getSource('wp-routes')) (map.getSource('wp-routes') as GeoJSONSource).setData(routesGeoJSON(b) as any);
    else map.addSource('wp-routes', { type: 'geojson', data: routesGeoJSON(b) as any });

    if (map.getSource('wp-stops')) (map.getSource('wp-stops') as GeoJSONSource).setData(stopsGeoJSON(b) as any);
    else map.addSource('wp-stops', { type: 'geojson', data: stopsGeoJSON(b) as any });

    if (!map.getSource('wp-vehicles')) {
      map.addSource('wp-vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }

    // Routes — outer shadow (depth + separation for overlapping lines), then casing, then colored core
    if (!map.getLayer('wp-routes-shadow')) {
      map.addLayer({
        id: 'wp-routes-shadow',
        type: 'line',
        source: 'wp-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': palette.casing === '#ffffff' ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.45)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6.0, 13, 9.0, 16, 12.0],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 16, 4.0],
          'line-opacity': lineOpacity(0.5)
        }
      }, 'wp-routes-casing');
    }
    if (!map.getLayer('wp-routes-casing')) {
      map.addLayer({
        id: 'wp-routes-casing',
        type: 'line',
        source: 'wp-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': palette.casing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3.6, 13, 5.6, 16, 7.6],
          'line-opacity': lineOpacity(0.95)
        }
      });
    }
    if (!map.getLayer('wp-routes-core')) {
      map.addLayer({
        id: 'wp-routes-core',
        type: 'line',
        source: 'wp-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 13, 2.6, 16, 3.6],
          'line-opacity': lineOpacity(0.98)
        }
      });
    }

    // Stops — major (all zooms), minor bus-only (high zoom only), then interchange rings
    if (!map.getLayer('wp-stops-minor')) {
      map.addLayer({
        id: 'wp-stops-minor',
        type: 'circle',
        source: 'wp-stops',
        filter: ['all', ['==', ['get', 'interchange'], 0], ['==', ['get', 'major'], 0]],
        minzoom: 13.5,
        paint: {
          'circle-color': palette.stopFill,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.1, 16, 2.4],
          'circle-stroke-width': 0.7,
          'circle-stroke-color': palette.stopRing,
          'circle-opacity': 0.75,
          'circle-stroke-opacity': 0.75
        }
      });
    }
    if (!map.getLayer('wp-stops')) {
      map.addLayer({
        id: 'wp-stops',
        type: 'circle',
        source: 'wp-stops',
        filter: ['all', ['==', ['get', 'interchange'], 0], ['==', ['get', 'major'], 1]],
        paint: {
          'circle-color': palette.stopFill,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 13, 2.6, 16, 4.2],
          'circle-stroke-width': 1.1,
          'circle-stroke-color': palette.stopRing
        }
      });
    }
    if (!map.getLayer('wp-stops-interchange')) {
      map.addLayer({
        id: 'wp-stops-interchange',
        type: 'circle',
        source: 'wp-stops',
        filter: ['==', ['get', 'interchange'], 1],
        paint: {
          'circle-color': palette.interchangeFill,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.6, 13, 4.2, 16, 6.4],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 16, 2.6],
          'circle-stroke-color': palette.interchangeStroke
        }
      });
    }

    // Labels — interchanges early, rest later (keeps the Mini Metro calm)
    if (!map.getLayer('wp-stops-labels')) {
      map.addLayer({
        id: 'wp-stops-labels',
        type: 'symbol',
        source: 'wp-stops',
        filter: ['all', ['==', ['get', 'interchange'], 0], ['==', ['get', 'major'], 1]],
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9.5, 15, 12.5],
          'text-anchor': 'left',
          'text-offset': [0.9, 0],
          'text-max-width': 9,
          'text-optional': true
        },
        paint: {
          'text-color': palette.label,
          'text-halo-color': palette.labelHalo,
          'text-halo-width': 1.4
        }
      });
    }
    if (!map.getLayer('wp-stops-labels-major')) {
      map.addLayer({
        id: 'wp-stops-labels-major',
        type: 'symbol',
        source: 'wp-stops',
        filter: ['==', ['get', 'interchange'], 1],
        minzoom: 10,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 13.5],
          'text-anchor': 'left',
          'text-offset': [0.9, 0],
          'text-max-width': 9,
          'text-optional': true
        },
        paint: {
          'text-color': palette.label,
          'text-halo-color': palette.labelHalo,
          'text-halo-width': 1.6
        }
      });
    }

    // Click affordance — generous transparent hit targets over every stop (dense maps are hard to click)
    if (!map.getLayer('wp-stops-hit')) {
      map.addLayer({
        id: 'wp-stops-hit',
        type: 'circle',
        source: 'wp-stops',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 16, 16, 22],
          'circle-opacity': 0,
          'circle-stroke-opacity': 0
        }
      });
    }

    // Vehicles — mode-accurate SDF glyphs
    if (!map.getLayer('wp-vehicles')) {
      map.addLayer({
        id: 'wp-vehicles',
        type: 'symbol',
        source: 'wp-vehicles',
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.1, 12, 0.15, 16, 0.2125],
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        paint: {
          'icon-color': ['get', 'color'],
          'icon-halo-color': palette.vehicleHalo,
          'icon-halo-width': 2.5,
          'icon-opacity': 0.97
        }
      });
    }

    styleReady = true;
    applyModeVisibility();
  }

  function lineOpacity(full: number, dim = 0) {
    if (soloRoute) return ['case', ['==', ['get', 'id'], soloRoute], full, dim] as any;
    return ['case', ['in', ['get', 'mode'], ['literal', selectedModes]], full, dim] as any;
  }

  function applyModeVisibility() {
    if (!map || !styleReady) return;
    map.setPaintProperty('wp-routes-shadow', 'line-opacity', lineOpacity(0.5));
    map.setPaintProperty('wp-routes-casing', 'line-opacity', lineOpacity(0.92, 0));
    map.setPaintProperty('wp-routes-core', 'line-opacity', lineOpacity(0.96, 0));
    if (map.getLayer('wp-vehicles')) {
      map.setFilter(
        'wp-vehicles',
        soloRoute
          ? ['==', ['get', 'routeId'], soloRoute]
          : ['in', ['get', 'mode'], ['literal', selectedModes]]
      );
    }
  }

  onMount(() => {
    let disposed = false;
    (async () => {
      await loadBundle();
      if (disposed || !container) return;
      const maplibregl = (await import('#lib/map')).default;
      if (disposed || !container) return;
      map = new maplibregl.Map({
        container,
        style: basemapStyle(theme.resolved),
        center: [city.lon, city.lat],
        zoom: 11,
        attributionControl: { compact: true }
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.on('style.load', () => {
        addWaypointLayers();
        startVehicleLoop();
      });
      map.on('load', () => {
        if (bundle) {
          const lngs = bundle.stops.map((s) => s.lon);
          const lats = bundle.stops.map((s) => s.lat);
          map?.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            ],
            { padding: 70, duration: 0, maxZoom: 12.5 }
          );
        }
      });

      const onMapClick = (e: any) => {
        const hits = map?.queryRenderedFeatures(e.point, { layers: ['wp-stops-hit'] }) ?? [];
        if (hits.length === 0) {
          onSelectStop(null);
          return;
        }
        const props = hits[0]!.properties as any;
        const stop = bundle?.stops.find((s) => s.id === props.id) ?? null;
        onSelectStop(stop);
      };
      map.on('click', onMapClick);
      map.on('mousemove', (e) => {
        if (!map) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: ['wp-stops-hit'] });
        map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
      });
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(vehicleRaf);
      map?.remove();
      map = undefined;
    };
  });

  // Mode filter or solo selection changed → re-tint lines / re-filter vehicles
  $effect(() => {
    void modeFilter;
    void soloRoute;
    applyModeVisibility();
  });

  // Fly to the selected stop
  $effect(() => {
    if (selectedStop && map) {
      map.easeTo({ center: [selectedStop.lon, selectedStop.lat], zoom: Math.max(map.getZoom(), 12.4), duration: 700 });
    }
  });

  // Theme flip → swap basemap (never on mount — map already chose), layers re-added on style.load
  let lastStyle = theme.resolved;
  $effect(() => {
    const resolved = theme.resolved;
    if (resolved === lastStyle) return;
    lastStyle = resolved;
    if (map) {
      styleReady = false;
      map.setStyle(basemapStyle(resolved));
    }
  });
</script>

<div class="map-canvas" bind:this={container} role="application" aria-label="Transit map of {city.name}"></div>

{#if bundle && bundle.routes.length > 3}
  <nav class="line-legend nice-scroll" aria-label="Lines">
    <div class="line-legend-head">
      <h3>Lines · {bundle.routes.length}</h3>
      {#if soloRoute}
        <button class="solo-reset" onclick={() => (soloRoute = null)}>Reset ×</button>
      {/if}
    </div>
    {#each legendGroups as group (group.label)}
      <section class="legend-group">
        <div class="legend-group-label">{group.label} · {group.routes.length}</div>
        <div class="legend-chips">
          {#each group.routes as r (r.id)}
            <button
              class="legend-chip"
              style="--dot:{r.color}"
              aria-pressed={soloRoute === r.id}
              title="{r.longName || r.shortName} — solo this line"
              onclick={() => (soloRoute = soloRoute === r.id ? null : r.id)}
            >
              <span class="dot"></span><span class="name">{r.shortName}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </nav>
{/if}

{#if loadError}
  <div class="overlay overlay-bottom-left glass flex items-center gap-3 p-3">
    <TriangleExclamationPoint size={18} class="shrink-0 text-[var(--warn)]" aria-hidden="true" />
    <div class="text-xs leading-snug">
      <p class="font-semibold">Couldn't load the {city.name} network</p>
      <button class="mt-1 underline underline-offset-2 hover:text-[var(--accent)]" onclick={loadBundle}>Retry</button>
    </div>
  </div>
{:else if !bundle}
  <div class="overlay overlay-bottom-left glass flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted)]">
    <LoaderCircle size={15} class="animate-spin" aria-hidden="true" /> Building the {city.name} map…
  </div>
{:else}
  <div class="overlay overlay-bottom-left glass px-3 py-2 text-[0.62rem] leading-relaxed text-[var(--muted)]">
    <span class="font-bold uppercase tracking-wide text-[var(--ink)]">{bundle.source.name}</span><br />
    {bundle.source.attribution} · <a href={bundle.source.url} target="_blank" rel="noreferrer" class="underline hover:text-[var(--ink)]">source</a><br />
    Vehicle motion is a scheduled-service estimate · <a href="/about" class="underline hover:text-[var(--ink)]">credits</a>
  </div>
{/if}
