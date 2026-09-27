import { describe, expect, it } from 'vitest';
import { clampMagnitude, clampToArena, distance, generateSpawnPoints } from '../src/geometry';

describe('distance', () => {
  it('sahi Euclidean distance deta hai', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });
});

describe('clampMagnitude', () => {
  it('chhoti length wale vector ko chhuta nahi', () => {
    expect(clampMagnitude({ x: 0.3, y: 0.4 }, 1)).toEqual({ x: 0.3, y: 0.4 });
  });

  it('bade vector ko max tak scale karta hai (diagonal seedhi se tez nahi hona chahiye)', () => {
    const clamped = clampMagnitude({ x: 1, y: 1 }, 1);
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(1);
  });

  it('zero vector ko chhuta nahi (divide-by-zero se bachao)', () => {
    expect(clampMagnitude({ x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe('clampToArena', () => {
  it('arena ke andar point ko waisa hi rehne deta hai', () => {
    expect(clampToArena({ x: 400, y: 300 }, 18, 800, 600)).toEqual({ x: 400, y: 300 });
  });

  it('arena ke bahar jaate hi radius jitni jagah chhodkar rok deta hai', () => {
    expect(clampToArena({ x: -50, y: -50 }, 18, 800, 600)).toEqual({ x: 18, y: 18 });
    expect(clampToArena({ x: 5000, y: 5000 }, 18, 800, 600)).toEqual({ x: 782, y: 582 });
  });
});

describe('generateSpawnPoints', () => {
  it('maange gaye count jitne points deta hai', () => {
    expect(generateSpawnPoints(8, 800, 600, 18)).toHaveLength(8);
  });

  it('sab points arena ke andar hote hain', () => {
    const points = generateSpawnPoints(10, 800, 600, 18);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(800);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(600);
    }
  });

  it('koi do points ek jaise nahi hote (barabar door failte hain)', () => {
    const points = generateSpawnPoints(10, 800, 600, 18);
    const unique = new Set(points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(unique.size).toBe(10);
  });
});
