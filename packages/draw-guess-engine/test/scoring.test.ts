import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_CONFIG } from '../src/config';
import { drawerPoints, guesserPoints } from '../src/scoring';

describe('guesserPoints', () => {
  it('pehla sabse zyada, phir kam hota jaata hai', () => {
    const p1 = guesserPoints(1, DEFAULT_SCORING_CONFIG);
    const p2 = guesserPoints(2, DEFAULT_SCORING_CONFIG);
    const p3 = guesserPoints(3, DEFAULT_SCORING_CONFIG);
    expect(p1).toBe(300);
    expect(p2).toBe(250);
    expect(p3).toBe(200);
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });

  it('kabhi guesserMinPoints se kam nahi hota', () => {
    const late = guesserPoints(50, DEFAULT_SCORING_CONFIG);
    expect(late).toBe(DEFAULT_SCORING_CONFIG.guesserMinPoints);
  });
});

describe('drawerPoints', () => {
  it('koi sahi guess na ho to 0', () => {
    expect(drawerPoints(0, DEFAULT_SCORING_CONFIG)).toBe(0);
  });

  it('jitne zyada log sahi guess karein utne zyada points', () => {
    const one = drawerPoints(1, DEFAULT_SCORING_CONFIG);
    const three = drawerPoints(3, DEFAULT_SCORING_CONFIG);
    expect(three).toBeGreaterThan(one);
    expect(one).toBe(DEFAULT_SCORING_CONFIG.drawerBasePoints + DEFAULT_SCORING_CONFIG.drawerPointsPerCorrectGuesser);
  });
});
