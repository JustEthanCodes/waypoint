/**
 * MapLibre must not try to resolve its web worker relative to `import.meta.url`
 * (`node_modules/maplibre-gl/dist/maplibre-gl.mjs` does not ship next to the bundle).
 * Bundle the worker script as a static asset and point MapLibre at it once,
 * before any map is created.
 */
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);

export default maplibregl;
