import type { ScoringConfig } from './config';

/**
 * Sahi guess karne wale ko points — `rank` 1-indexed (1 = sabse pehla sahi guess).
 * Jitni jaldi, utne zyada; kabhi bhi `guesserMinPoints` se kam nahi.
 */
export function guesserPoints(rank: number, config: ScoringConfig): number {
  const points = config.guesserBasePoints - (rank - 1) * config.guesserPointsStep;
  return Math.max(config.guesserMinPoints, points);
}

/**
 * Drawer ke points: kitne players ne sahi guess kiya usi par depend karta hai.
 * Koi guess na ho paye to drawer ko 0 (khaali canvas ka koi fayda nahi).
 */
export function drawerPoints(correctGuessers: number, config: ScoringConfig): number {
  if (correctGuessers <= 0) return 0;
  return config.drawerBasePoints + correctGuessers * config.drawerPointsPerCorrectGuesser;
}
