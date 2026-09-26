import { describe, expect, it } from 'vitest';
import type { RoundResult } from '@rmc/shared-types';
import {
  calculateRewards,
  evaluateAchievements,
  levelForXp,
  summarizeGameForPlayer,
  xpForLevel,
  type PlayerGameSummary,
} from '../src';

const round = (
  n: number,
  roles: RoundResult['roles'],
  guessCorrect: boolean,
): RoundResult => ({
  round: n,
  roles,
  guessedChorId: 'x',
  guessCorrect,
  points: {},
});

const summary = (over: Partial<PlayerGameSummary> = {}): PlayerGameSummary => ({
  points: 0,
  isWinner: false,
  rounds: 4,
  mantriCatches: 0,
  chorEscapes: 0,
  ...over,
});

describe('summarizeGameForPlayer', () => {
  const history = [
    round(1, { a: 'MANTRI', b: 'CHOR', c: 'RAJA', d: 'SIPAHI' }, true),
    round(2, { a: 'MANTRI', b: 'CHOR', c: 'RAJA', d: 'SIPAHI' }, false),
    round(3, { a: 'CHOR', b: 'MANTRI', c: 'RAJA', d: 'SIPAHI' }, false),
    round(4, { a: 'MANTRI', b: 'SIPAHI', c: 'RAJA', d: 'CHOR' }, true),
  ];

  it('Mantri ke sahi catches aur Chor ke bach nikalne gine jaate hain', () => {
    expect(summarizeGameForPlayer(history, 'a', ['c'], 1234)).toEqual({
      points: 1234,
      isWinner: false,
      rounds: 4,
      mantriCatches: 2,
      chorEscapes: 1,
    });
    expect(summarizeGameForPlayer(history, 'b', ['b'], 0).chorEscapes).toBe(1);
    expect(summarizeGameForPlayer(history, 'b', ['b'], 0).isWinner).toBe(true);
    expect(summarizeGameForPlayer(history, 'd', [], 0).mantriCatches).toBe(0);
  });
});

describe('calculateRewards', () => {
  it('participation + points/100 (+ win bonus)', () => {
    expect(calculateRewards(summary({ points: 0 }))).toEqual({ xp: 50, coins: 10 });
    expect(calculateRewards(summary({ points: 2350 }))).toEqual({ xp: 73, coins: 10 });
    expect(calculateRewards(summary({ points: 2350, isWinner: true }))).toEqual({ xp: 123, coins: 30 });
  });

  it('negative points par bhi XP kam nahi hota', () => {
    expect(calculateRewards(summary({ points: -500 })).xp).toBe(50);
  });
});

describe('levels', () => {
  it('level thresholds', () => {
    expect([0, 99, 100, 399, 400, 900, 1600].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 4, 5]);
  });

  it('xpForLevel levelForXp ka ulta hai', () => {
    for (let level = 1; level <= 10; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });
});

describe('evaluateAchievements', () => {
  const stats = { gamesPlayed: 1, wins: 0, xp: 50 };

  it('pehla game', () => {
    expect(evaluateAchievements(stats, summary(), [])).toEqual(['FIRST_GAME']);
  });

  it('pehle se mile hue dobara nahi milte', () => {
    expect(evaluateAchievements(stats, summary(), ['FIRST_GAME'])).toEqual([]);
  });

  it('jeet, 5 jeet, level 5', () => {
    const big = { gamesPlayed: 9, wins: 5, xp: 1600 };
    expect(evaluateAchievements(big, summary({ isWinner: true }), ['FIRST_GAME'])).toEqual([
      'FIRST_WIN',
      'WIN_5',
      'LEVEL_5',
    ]);
  });

  it('Mantri aur Chor wale achievements game ke hisaab se', () => {
    expect(
      evaluateAchievements(stats, summary({ mantriCatches: 2, chorEscapes: 1 }), ['FIRST_GAME']),
    ).toEqual(['SHARP_MANTRI', 'SLIPPERY_CHOR']);
    expect(evaluateAchievements(stats, summary({ mantriCatches: 1 }), ['FIRST_GAME'])).toEqual([]);
  });
});
