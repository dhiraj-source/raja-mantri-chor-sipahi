import { shuffle, type RandomSource } from './random';

/**
 * Word ka display-safe masked form. Spaces waise hi dikhte hain (word-boundary ka hint), baaki
 * letters `revealed` me na ho to `_`. Har letter ke baad space taaki "_ _ _" jaisa dikhe.
 */
export function maskWord(word: string, revealed: ReadonlySet<number>): string {
  return word
    .split('')
    .map((ch, i) => (ch === ' ' ? ' ' : revealed.has(i) ? ch : '_'))
    .join(' ');
}

/** Word ke letter-indices (spaces chhodkar) ek shuffled order me — turn shuru hote hi ek baar banta hai. */
export function buildHintOrder(word: string, random: RandomSource): number[] {
  const letterIndices: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== ' ') letterIndices.push(i);
  }
  return shuffle(letterIndices, random);
}

/**
 * Ab tak kitne hints reveal ho chuke (time-based), `maxHintFraction` se kabhi zyada nahi.
 * `hintIntervalMs <= 0` => hints band (hamesha 0).
 */
export function hintRevealCount(
  wordLength: number,
  elapsedMs: number,
  hintIntervalMs: number,
  maxHintFraction: number,
): number {
  if (hintIntervalMs <= 0 || elapsedMs <= 0) return 0;
  const maxReveal = Math.floor(wordLength * maxHintFraction);
  const byTime = Math.floor(elapsedMs / hintIntervalMs);
  return Math.max(0, Math.min(maxReveal, byTime));
}

/** `hintOrder` aur elapsed time se abhi ka revealed-indices set. */
export function revealedIndices(
  hintOrder: readonly number[],
  wordLength: number,
  elapsedMs: number,
  hintIntervalMs: number,
  maxHintFraction: number,
): Set<number> {
  const count = hintRevealCount(wordLength, elapsedMs, hintIntervalMs, maxHintFraction);
  return new Set(hintOrder.slice(0, count));
}
