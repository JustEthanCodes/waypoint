<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from '#lib/map';
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
  let vehicleTimer: ReturnType<typeof setInterval> | undefined;
  let styleReady = $state(false);

  const MODES_ALL: ModeGroup[] = ['metro', 'rail', 'tram', 'bus', 'ferry', 'cable'];
  const selectedModes = $derived(modeFilter === 'all' ? MODES_ALL : [modeFilter as ModeGroup]);

  const palette = $derived.by(() => {
    const dark = theme.resolved === 'dark';
    return {
      casing: dark ? '#0b0e10' : '#ffffff',
      stopFill: dark ? '#ece9df' : '#1a1c1e',
      stopRing: dark ? '#121517' : '#ffffff',
      interchangeFill: dark ? '#121517' : '#fbf9f1',
      interchangeStroke: dark ? '#ece9df' : '#1a1c1e',
      label: dark ? '#d8d5c9' : '#33352f',
      labelHalo: dark ? '#121517' : '#f7f5ec'
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
          interchange: s.interchange ? 1 : 0
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

    // Routes — casing then colored core
    if (!map.getLayer('wp-routes-casing')) {
      map.addLayer({
        id: 'wp-routes-casing',
        type: 'line',
        source: 'wp-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': palette.casing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4.4, 13, 6.4, 16, 8.6],
          'line-opacity': routeOpacityExpression(0.92)
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.9, 13, 3.4, 16, 4.6],
          'line-opacity': routeOpacityExpression(0.96)
        }
      });
    }

    // Stops — regular then interchanges (rings)
    if (!map.getLayer('wp-stops')) {
      map.addLayer({
        id: 'wp-stops',
        type: 'circle',
        source: 'wp-stops',
        filter: ['==', ['get', 'interchange'], 0],
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
        filter: ['==', ['get', 'interchange'], 0],
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

    // Vehicles — mode-accurate SDF glyphs
    if (!map.getLayer('wp-vehicles')) {
      map.addLayer({
        id: 'wp-vehicles',
        type: 'symbol',
        source: 'wp-vehicles',
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.32, 12, 0.5, 16, 0.72],
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        paint: {
          'icon-color': ['get', 'color'],
          'icon-halo-color': palette.casing,
          'icon-halo-width': 1.5,
          'icon-opacity': 0.97
        }
      });
    }

    map.setFilter('wp-vehicles', ['in', ['get', 'mode'], ['literal', selectedModes]]);
    styleReady = true;
  }

  function routeOpacityExpression(full: number) {
    return ['case', ['in', ['get', 'mode'], ['literal', selectedModes]], full, 0.06] as any;
  }

  function applyModeVisibility() {
    if (!map || !styleReady) return;
    const modes = selectedModes;
    map.setPaintProperty('wp-routes-casing', 'line-opacity', ['case', ['in', ['get', 'mode'], ['literal', modes]], 0.92, 0.07]);
    map.setPaintProperty('wp-routes-core', 'line-opacity', ['case', ['in', ['get', 'mode'], ['literal', modes]], 0.96, 0.07]);
    if (map.getLayer('wp-vehicles')) {
      map.setFilter('wp-vehicles', ['in', ['get', 'mode'], ['literal', modes]]);
    }
  }

  function tickVehicles() {
    if (!map || !bundle || document.hidden) return;
    const src = map.getSource('wp-vehicles') as GeoJSONSource | undefined;
    if (!src) return;
    const nowSec = Date.now() / 1000;
    src.setData(computeVehicles(bundle.routes, nowSec) as any);
  }

  function startVehicleLoop() {
    clearInterval(vehicleTimer);
    tickVehicles();
    vehicleTimer = setInterval(tickVehicles, 450);
  }

  onMount(() => {
    let disposed = false;
    (async () => {
      await loadBundle();
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
        const hits = map?.queryRenderedFeatures(e.point, { layers: ['wp-stops', 'wp-stops-interchange'] }) ?? [];
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
        const hits = map.queryRenderedFeatures(e.point, { layers: ['wp-stops', 'wp-stops-interchange'] });
        map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
      });
    })();

    return () => {
      disposed = true;
      clearInterval(vehicleTimer);
      map?.remove();
      map = undefined;
    };
  });

  // Mode filter changed → re-tint lines / re-filter vehicles
  $effect(() => {
    void modeFilter;
    applyModeVisibility();
  });

  // Fly to the selected stop
  $effect(() => {
    if (selectedStop && map) {
      map.easeTo({ center: [selectedStop.lon, selectedStop.lat], zoom: Math.max(map.getZoom(), 12.4), duration: 700 });
    }
  });

  // Theme flip → swap basemap, layers re-added on style.load
  $effect(() => {
    const resolved = theme.resolved;
    if (map) {
      styleReady = false;
      map.setStyle(basemapStyle(resolved));
    }
  });
</script>

<div class="map-canvas" bind:this={container} role="application" aria-label="Transit map of {city.name}"></div>

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
