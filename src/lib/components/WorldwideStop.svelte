<script lang="ts">
  import { onMount } from 'svelte';
  import { Map as MlMap, NavigationControl, Marker } from 'maplibre-gl';
  import { theme, basemapStyle } from '#lib/theme.svelte';
  import type { GeocodeResult } from '#lib/types';

  let {
    stop
  }: {
    stop: GeocodeResult;
  } = $props();

  let container: HTMLDivElement;
  let map: MlMap | undefined;
  let marker: Marker | undefined;

  onMount(() => {
    map = new MlMap({
      container,
      style: basemapStyle(theme.resolved),
      center: [stop.lon, stop.lat],
      zoom: 14.5,
      attributionControl: { compact: true }
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    const el = document.createElement('div');
    el.innerHTML = `<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 2C19 2 8 13 8 26c0 18 24 36 24 36s24-18 24-36C56 13 45 2 32 2z" fill="#d6492b" stroke="#fbf9f1" stroke-width="4"/><circle cx="32" cy="25" r="9" fill="#fbf9f1"/></svg>`;
    marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([stop.lon, stop.lat]).addTo(map);
    return () => {
      marker?.remove();
      map?.remove();
      map = undefined;
    };
  });

  // Re-center when a different stop is picked
  $effect(() => {
    void stop.id;
    if (map) {
      map.flyTo({ center: [stop.lon, stop.lat], zoom: 15, duration: 900 });
      marker?.setLngLat([stop.lon, stop.lat]);
    }
  });

  $effect(() => {
    const resolved = theme.resolved;
    if (map) map.setStyle(basemapStyle(resolved));
  });
</script>

<div class="map-canvas" bind:this={container} role="application" aria-label="Map of {stop.name}"></div>
