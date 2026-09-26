import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StrokeBatcher,
  denormalizePoint,
  normalizePoint,
} from '../src/draw-guess/strokeBatching';

describe('StrokeBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turant nahi bhejta, interval ke baad ek hi batch me flush hota hai', () => {
    const flush = vi.fn();
    const batcher = new StrokeBatcher(50, flush);
    batcher.add({ x: 0.1, y: 0.1 });
    batcher.add({ x: 0.2, y: 0.2 });
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ]);
  });

  it('flushNow turant bhej deta hai aur timer cancel karta hai', () => {
    const flush = vi.fn();
    const batcher = new StrokeBatcher(1000, flush);
    batcher.add({ x: 0.5, y: 0.5 });
    batcher.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(flush).toHaveBeenCalledTimes(1); // dobara nahi chalta
  });

  it('khaali batch flush nahi karta (koi point hi nahi aaya)', () => {
    const flush = vi.fn();
    new StrokeBatcher(50, flush).flushNow();
    expect(flush).not.toHaveBeenCalled();
  });

  it('cancel pending points bina bheje discard kar deta hai', () => {
    const flush = vi.fn();
    const batcher = new StrokeBatcher(50, flush);
    batcher.add({ x: 0.1, y: 0.1 });
    batcher.cancel();
    vi.advanceTimersByTime(100);
    expect(flush).not.toHaveBeenCalled();
  });

  it('ek batch flush hone ke baad naye points ek naya batch banate hain', () => {
    const flush = vi.fn();
    const batcher = new StrokeBatcher(50, flush);
    batcher.add({ x: 0, y: 0 });
    vi.advanceTimersByTime(50);
    batcher.add({ x: 1, y: 1 });
    vi.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenNthCalledWith(2, [{ x: 1, y: 1 }]);
  });
});

describe('normalizePoint / denormalizePoint', () => {
  it('pixel -> 0..1 -> pixel round-trip', () => {
    const n = normalizePoint(50, 25, 100, 100);
    expect(n).toEqual({ x: 0.5, y: 0.25 });
    expect(denormalizePoint(n, 200, 200)).toEqual({ x: 100, y: 50 });
  });

  it('canvas ke bahar ke points 0..1 tak clamp hote hain', () => {
    expect(normalizePoint(-10, 500, 100, 100)).toEqual({ x: 0, y: 1 });
  });

  it('width/height 0 ho to crash nahi hota', () => {
    expect(normalizePoint(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});
