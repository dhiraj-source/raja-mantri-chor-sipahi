import { describe, expect, it } from 'vitest';
import { stepPosition } from '../src/movement';

describe('stepPosition', () => {
  it('speed aur dt ke hisaab se seedhi disha me aage badhata hai', () => {
    // speed 100 units/sec, dt 500ms => 50 units aage
    const next = stepPosition({ x: 100, y: 100 }, { x: 1, y: 0 }, 100, 500, 18, 800, 600);
    expect(next.x).toBeCloseTo(150);
    expect(next.y).toBeCloseTo(100);
  });

  it('diagonal movement seedhi se tez nahi hoti (normalize hoti hai)', () => {
    const straight = stepPosition({ x: 400, y: 300 }, { x: 1, y: 0 }, 100, 1000, 18, 800, 600);
    const diagonal = stepPosition({ x: 400, y: 300 }, { x: 1, y: 1 }, 100, 1000, 18, 800, 600);
    const straightDist = Math.hypot(straight.x - 400, straight.y - 300);
    const diagonalDist = Math.hypot(diagonal.x - 400, diagonal.y - 300);
    expect(diagonalDist).toBeCloseTo(straightDist, 5);
  });

  it('arena ki deewar se aage nahi jaata', () => {
    const next = stepPosition({ x: 795, y: 300 }, { x: 1, y: 0 }, 500, 1000, 18, 800, 600);
    expect(next.x).toBe(782); // 800 - radius(18)
  });

  it('koi input na ho to jagah nahi badalti', () => {
    const next = stepPosition({ x: 400, y: 300 }, { x: 0, y: 0 }, 200, 1000, 18, 800, 600);
    expect(next).toEqual({ x: 400, y: 300 });
  });
});
