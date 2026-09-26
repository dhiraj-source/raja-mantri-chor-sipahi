import { describe, expect, it } from 'vitest';
import { buildHintOrder, hintRevealCount, maskWord, revealedIndices } from '../src/mask';

describe('maskWord', () => {
  it('revealed letters dikhte hain, baaki underscore', () => {
    expect(maskWord('cat', new Set([0]))).toBe('c _ _');
    expect(maskWord('cat', new Set())).toBe('_ _ _');
    expect(maskWord('cat', new Set([0, 1, 2]))).toBe('c a t');
  });

  it('space word-boundary hint ki tarah dikhta hai, kabhi hide nahi hota', () => {
    expect(maskWord('big dog', new Set())).toBe('_ _ _   _ _ _');
  });
});

describe('hintRevealCount', () => {
  it('hintIntervalMs 0 (band) => hamesha 0', () => {
    expect(hintRevealCount(10, 999999, 0, 1)).toBe(0);
  });

  it('time ke saath badhta hai', () => {
    expect(hintRevealCount(10, 0, 1000, 1)).toBe(0);
    expect(hintRevealCount(10, 1000, 1000, 1)).toBe(1);
    expect(hintRevealCount(10, 3500, 1000, 1)).toBe(3);
  });

  it('maxHintFraction se zyada kabhi reveal nahi hota', () => {
    expect(hintRevealCount(10, 100_000, 1000, 0.5)).toBe(5);
  });

  it('negative/elapsed 0 => 0', () => {
    expect(hintRevealCount(10, -100, 1000, 1)).toBe(0);
  });
});

describe('buildHintOrder + revealedIndices', () => {
  it('sirf letter-indices (space nahi) shuffle hote hain', () => {
    const order = buildHintOrder('a b', () => 0.5);
    expect(order.sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it('revealedIndices hintOrder ke first N return karta hai', () => {
    const order = [2, 0, 1];
    const revealed = revealedIndices(order, 3, 1000, 1000, 1);
    expect(revealed).toEqual(new Set([2]));
  });

  it('deterministic: same random function => same order', () => {
    const a = buildHintOrder('elephant', () => 0.3);
    const b = buildHintOrder('elephant', () => 0.3);
    expect(a).toEqual(b);
  });
});
