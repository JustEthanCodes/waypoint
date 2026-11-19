import { describe, it, expect } from 'vitest';
import { haversineMeters, polylineLength, pointAtDistance, bearingBetween, routePhase } from '../src/lib/geo';

describe('geo utils', () => {
  it('haversineMeters measures ~111 km per degree of latitude', () => {
    const d = haversineMeters([-73.99, 40.0], [-73.99, 41.0]);
    expect(d).toBeGreaterThan(109_000);
    expect(d).toBeLessThan(113_000);
  });

  it('polylineLength sums segments', () => {
    const shape: [number, number][] = [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01]
    ];
    expect(polylineLength(shape)).toBeGreaterThan(1_000);
  });

  it('pointAtDistance interpolates the midpoint', () => {
    const shape: [number, number][] = [
      [0, 0],
      [0.01, 0]
    ];
    const len = polylineLength(shape);
    const mid = pointAtDistance(shape, len / 2);
    expect(mid.lat).toBeCloseTo(0, 6);
    expect(mid.lon).toBeCloseTo(0.005, 4);
  });

  it('bearingBetween is 90° due east', () => {
    expect(bearingBetween([-74, 40], [-73.9, 40])).toBeCloseTo(90, 0);
  });

  it('routePhase is deterministic and within [0,1]', () => {
    expect(routePhase('A')).toBe(routePhase('A'));
    expect(routePhase('A')).toBeGreaterThanOrEqual(0);
    expect(routePhase('A')).toBeLessThanOrEqual(1);
    expect(routePhase('A')).not.toBe(routePhase('B'));
  });
});
