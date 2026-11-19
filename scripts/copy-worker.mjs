/**
 * Copies maplibre-gl's web worker into static/maplibre-gl-worker.mjs,
 * stripping the trailing sourceMappingURL comment (the .map file is not
 * shipped and Cloudflare rejects bundles referencing missing maps).
 *
 * Runs via `predev` / `prebuild` so the file is always present when
 * Vite builds or devs — it is gitignored.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = path.join(ROOT, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs');
const DEST_DIR = path.join(ROOT, 'static');
const DEST = path.join(DEST_DIR, 'maplibre-gl-worker.mjs');

const source = readFileSync(SRC, 'utf8');
const stripped = source.replace(/^\s*\/\/# sourceMappingURL=.*$/m, '');
if (stripped === source) {
  console.log('worker sourcemap comment not found (already clean?) — wrote as-is');
}
mkdirSync(DEST_DIR, { recursive: true });
writeFileSync(DEST, stripped);
console.log(`worker copied: ${path.relative(ROOT, DEST)} (${(stripped.length / 1024).toFixed(0)} kB)`);
