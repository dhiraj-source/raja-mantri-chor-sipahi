import { describe, expect, it } from 'vitest';
import { clampToRadius } from '../src/bomb-tag/VirtualJoystick';

describe('clampToRadius', () => {
  it('radius ke andar ho to px waisa hi rehta hai, dir normalize hota hai', () => {
    const { px, dir } = clampToRadius(30, 0, 60);
    expect(px).toEqual({ x: 30, y: 0 });
    expect(dir).toEqual({ x: 0.5, y: 0 });
  });

  it('radius ke bahar ho to circle ke andar clamp hota hai (magnitude = radius)', () => {
    const { px, dir } = clampToRadius(100, 0, 60);
    expect(px.x).toBeCloseTo(60);
    expect(px.y).toBeCloseTo(0);
    expect(dir.x).toBeCloseTo(1);
  });

  it('diagonal bhi sahi se circle ke andar clamp hota hai (magnitude 1 se zyada kabhi nahi)', () => {
    const { dir } = clampToRadius(100, 100, 60);
    const magnitude = Math.hypot(dir.x, dir.y);
    expect(magnitude).toBeCloseTo(1);
  });

  it('(0,0) par center par rehta hai', () => {
    const { px, dir } = clampToRadius(0, 0, 60);
    expect(px).toEqual({ x: 0, y: 0 });
    expect(dir).toEqual({ x: 0, y: 0 });
  });
});
