<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from '#lib/map';
  import type { Map as MlMap } from 'maplibre-gl';
  import { CITIES } from '#lib/cities';
  import { theme, basemapStyle } from '#lib/theme.svelte';
  import type { City } from '#lib/types';

  let {
    onPickCity,
    onPlannedCity
  }: {
    onPickCity: (city: City) => void;
    onPlannedCity: (city: City) => void;
  } = $props();

  let container: HTMLDivElement;
  let map: MlMap | undefined;

  const reducedMotion =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function pinElement(city: City): HTMLButtonElement {
    const el = document.createElement('button');
    el.className = `globe-pin ${city.status === 'live' ? 'globe-pin--pulse' : 'globe-pin--planned'}`;
    el.style.setProperty('--pin', city.status === 'live' ? '#d6492b' : '#7d7b70');
    el.title = city.status === 'live' ? `Open ${city.name} (live map)` : `${city.name} — map in pipeline`;
    el.setAttribute('aria-label', el.title);
    el.addEventListener('click', () => {
      if (city.status === 'live') {
        onPickCity(city);
      } else {
        onPlannedCity(city);
      }
    });
    return el;
  }

  /** Animate the camera to a city (used before switching to the flat map). */
  export function flyTo(city: City): Promise<void> {
    return new Promise((resolve) => {
      if (!map) return resolve();
      const done = () => resolve();
      map.once('moveend', done);
      map.flyTo({ center: [city.lon, city.lat], zoom: 5.2, duration: 2400, essential: true });
      // Safety net in case moveend never fires
      setTimeout(done, 3000);
    });
  }

  onMount(() => {
    const style = basemapStyle(theme.resolved);
    map = new maplibregl.Map({
      container,
      style,
      center: [15, 32],
      zoom: 1.45,
      attributionControl: { compact: true },
      maxPitch: 0
    });

    const applyGlobe = () => {
      if (!map) return;
      map.setProjection({ type: 'globe' });
      map.setSky({
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1],
        'sky-color': theme.resolved === 'dark' ? '#05070a' : '#bcd6e8',
        'horizon-color': theme.resolved === 'dark' ? '#1b2733' : '#dfeaf2',
        'fog-color': theme.resolved === 'dark' ? '#121517' : '#f3eee3'
      });
    };
    map.on('style.load', applyGlobe);
    map.on('load', applyGlobe);

    for (const city of CITIES) {
      new maplibregl.Marker({ element: pinElement(city), anchor: 'bottom' })
        .setLngLat([city.lon, city.lat])
        .addTo(map);
    }

    // Slow ambient rotation (paused by interaction / reduced motion)
    let interacting = false;
    let raf = 0;
    const pauseFor = 6000;
    let pausedUntil = 0;
    const onInteract = () => {
      interacting = true;
      pausedUntil = Date.now() + pauseFor;
    };
    map.on('mousedown', onInteract);
    map.on('touchstart', onInteract);
    map.on('wheel', onInteract);
    map.on('mouseup', () => (interacting = false));
    window.addEventListener('pointerup', () => (interacting = false));

    const spin = () => {
      raf = requestAnimationFrame(spin);
      if (!map || interacting || document.hidden) return;
      if (Date.now() < pausedUntil) return;
      if (reducedMotion?.matches) return;
      map.setBearing(map.getBearing() + 0.018);
    };
    spin();

    const ro = new ResizeObserver(() => map?.resize());
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map?.remove();
      map = undefined;
    };
  });

  // Re-skin basemap when the theme flips
  $effect(() => {
    const resolved = theme.resolved;
    if (map) map.setStyle(basemapStyle(resolved));
  });
</script>

<div class="map-canvas" bind:this={container} role="application" aria-label="Interactive 3D globe of supported cities"></div>
