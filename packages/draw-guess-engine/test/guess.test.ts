import { describe, expect, it } from 'vitest';
import { isCorrectGuess, normalizeGuess } from '../src/guess';

describe('normalizeGuess', () => {
  it('lowercase, trim, extra spaces collapse', () => {
    expect(normalizeGuess('  Elephant  ')).toBe('elephant');
    expect(normalizeGuess('ELEPHANT')).toBe('elephant');
    expect(normalizeGuess('big   dog')).toBe('big dog');
  });

  it('punctuation hata deta hai', () => {
    expect(normalizeGuess('elephant!')).toBe('elephant');
    expect(normalizeGuess("it's a dog")).toBe('its a dog');
  });

  it('diacritics normalize karta hai', () => {
    expect(normalizeGuess('café')).toBe('cafe');
  });
});

describe('isCorrectGuess', () => {
  it('NORMALIZED (default): case/space/punctuation-insensitive', () => {
    expect(isCorrectGuess('Elephant', 'elephant')).toBe(true);
    expect(isCorrectGuess('  ELEPHANT!  ', 'elephant')).toBe(true);
    expect(isCorrectGuess('elephant', 'elephant', 'NORMALIZED')).toBe(true);
    expect(isCorrectGuess('elephants', 'elephant')).toBe(false);
    expect(isCorrectGuess('dog', 'elephant')).toBe(false);
  });

  it('EXACT: bilkul waisa hi', () => {
    expect(isCorrectGuess('elephant', 'elephant', 'EXACT')).toBe(true);
    expect(isCorrectGuess('Elephant', 'elephant', 'EXACT')).toBe(false);
  });

  it('answer khud kabhi return/expose nahi karta (sirf boolean)', () => {
    const result = isCorrectGuess('wrong guess', 'elephant');
    expect(typeof result).toBe('boolean');
  });
});
