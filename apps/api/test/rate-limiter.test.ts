import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rooms/rate-limiter';

describe('RateLimiter', () => {
  it('limit tak allow, uske baad block, window guzarne par wapas allow', () => {
    let t = 0;
    const rl = new RateLimiter(3, 1000, () => t);
    expect([rl.allow('a'), rl.allow('a'), rl.allow('a')]).toEqual([true, true, true]);
    expect(rl.allow('a')).toBe(false);
    t = 999;
    expect(rl.allow('a')).toBe(false);
    t = 1000;
    expect(rl.allow('a')).toBe(true);
  });

  it('har key ka alag hisaab', () => {
    const rl = new RateLimiter(1, 1000, () => 0);
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(false);
    expect(rl.allow('b')).toBe(true);
  });

  it('forget se counter saaf', () => {
    const rl = new RateLimiter(1, 1000, () => 0);
    rl.allow('a');
    rl.forget('a');
    expect(rl.allow('a')).toBe(true);
  });
});
