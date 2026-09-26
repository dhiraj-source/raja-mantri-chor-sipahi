import type { DrawGuessConfig } from './config';

/**
 * Guess normalize karta hai: lowercase, trim, diacritics/punctuation hata kar, extra spaces
 * ek single space me. "  Elephant! " aur "elephant" dono isi shape par aate hain.
 */
export function normalizeGuess(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics (é -> e)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // punctuation hata do, letters/numbers/space rehne do
    .replace(/\s+/g, ' ');
}

/** Server-authoritative match: sirf yahi decide karta hai ki guess sahi hai ya nahi. */
export function isCorrectGuess(
  guess: string,
  answer: string,
  tolerance: DrawGuessConfig['guessTolerance'] = 'NORMALIZED',
): boolean {
  if (tolerance === 'EXACT') return guess === answer;
  return normalizeGuess(guess) === normalizeGuess(answer);
}
