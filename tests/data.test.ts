/**
 * Contract test: every bundled city JSON must match the shape the app expects.
 * Fails loudly in CI if the ETL ever emits something the renderer can't draw.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '../static/data');
const MODES = new Set(['metro', 'rail', 'tram', 'bus', 'ferry', 'cable']);
const HEX = /^#[0-9a-fA-F]{6}$/;

const bundles = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json')
  : [];

describe('bundled city data', () => {
  it('finds at least one bundled city', () => {
    expect(bundles.length).toBeGreaterThan(0);
  });

  for (const file of bundles) {
    describe(file, () => {
      const bundle = JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf8'));

      it('has source attribution', () => {
        expect(bundle.source?.name).toBeTruthy();
        expect(bundle.source?.attribution).toBeTruthy();
        expect(bundle.source?.license).toBeTruthy();
      });

      it('has routes with valid geometry and colors', () => {
        expect(bundle.routes.length).toBeGreaterThan(0);
        for (const r of bundle.routes) {
          expect(r.id).toBeTruthy();
          expect(r.shortName).toBeTruthy();
          expect(MODES.has(r.mode)).toBe(true);
          expect(r.color).toMatch(HEX);
          expect(Array.isArray(r.shape)).toBe(true);
          expect(r.shape.length).toBeGreaterThanOrEqual(2);
          for (const [lng, lat] of r.shape) {
            expect(Number.isFinite(lng)).toBe(true);
            expect(Number.isFinite(lat)).toBe(true);
            expect(Math.abs(lat!)).toBeLessThanOrEqual(90);
            expect(Math.abs(lng!)).toBeLessThanOrEqual(180);
          }
        }
      });

      it('has stops with coordinates and interchange flags', () => {
        expect(bundle.stops.length).toBeGreaterThan(0);
        for (const s of bundle.stops) {
          expect(s.name).toBeTruthy();
          expect(Number.isFinite(s.lat)).toBe(true);
          expect(Number.isFinite(s.lon)).toBe(true);
          expect(typeof s.interchange).toBe('boolean');
        }
      });
    });
  }
});
