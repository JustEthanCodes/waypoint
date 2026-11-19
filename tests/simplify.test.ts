import { describe, it, expect } from 'vitest';
// @ts-expect-error plain-JS module without type declarations
import { simplifyShape } from '../scripts/simplify.mjs';

describe('simplifyShape (RDP)', () => {
  it('keeps endpoints intact', () => {
    const shape: [number, number][] = [
      [-73.99, 40.73],
      [-73.95, 40.73],
      [-73.9, 40.73],
      [-73.85, 40.73],
      [-73.8, 40.73]
    ];
    const out = simplifyShape(shape, 10, 400);
    expect(out[0]).toEqual(shape[0]);
    expect(out[out.length - 1]).toEqual(shape[shape.length - 1]);
  });

  it('collapses a straight line to just its endpoints', () => {
    const shape: [number, number][] = Array.from({ length: 50 }, (_, i) => [-73.99 + i * 0.001, 40.73]);
    const out = simplifyShape(shape, 10, 400);
    expect(out.length).toBe(2);
  });

  it('preserves a genuine bend', () => {
    const shape: [number, number][] = [
      [-73.99, 40.73],
      [-73.95, 40.73],
      [-73.9, 40.78], // big northward jog
      [-73.85, 40.78],
      [-73.8, 40.78]
    ];
    const out = simplifyShape(shape, 10, 400);
    expect(out.length).toBeGreaterThanOrEqual(3);
    // the jog's apex must survive
    expect(out).toContainEqual([-73.9, 40.78]);
  });

  it('respects the max point budget by raising epsilon', () => {
    const shape: [number, number][] = Array.from({ length: 2000 }, (_, i) => [
      -73.99 + i * 0.0005,
      40.73 + Math.sin(i / 20) * 0.001
    ]);
    const out = simplifyShape(shape, 1, 120);
    expect(out.length).toBeLessThanOrEqual(120);
  });
});
