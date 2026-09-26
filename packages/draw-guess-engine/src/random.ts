/** 0 <= value < 1. Production me Math.random, tests me fixed sequence. */
export type RandomSource = () => number;

/** Fisher-Yates shuffle. Original array ko change nahi karta. */
export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    result[i] = result[j] as T;
    result[j] = a;
  }
  return result;
}

/** random() se ek index chunta hai (0..items.length-1). Khaali array par -1. */
export function pickIndex(length: number, random: RandomSource): number {
  if (length <= 0) return -1;
  return Math.floor(random() * length);
}
