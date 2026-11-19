/**
 * MapLibre must not try to resolve its web worker relative to `import.meta.url`
 * (its package does not ship next to the bundle). scripts/copy-worker.mjs emits
 * the worker as a static asset at /maplibre-gl-worker.mjs — point MapLibre at it
 * exactly once, before any map is created.
 */
import * as maplibregl from 'maplibre-gl';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

export default maplibregl;
