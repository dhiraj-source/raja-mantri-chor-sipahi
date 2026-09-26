import { describe, expect, it } from 'vitest';
import { MAX_CUSTOM_WORDS, MAX_CUSTOM_WORD_LENGTH } from '../src/config';
import { pickWordChoices, validateCustomWords, WORD_BANK, WORD_CATEGORIES } from '../src/words';

describe('WORD_BANK', () => {
  it('har category me kam se kam kuch words hain', () => {
    for (const category of WORD_CATEGORIES) {
      const count = WORD_BANK.filter((e) => e.category === category).length;
      expect(count, category).toBeGreaterThan(0);
    }
  });

  it('koi khaali/duplicate-within-itself word nahi', () => {
    const words = WORD_BANK.map((e) => e.word.toLowerCase());
    expect(new Set(words).size).toBe(words.length);
    for (const w of WORD_BANK) expect(w.word.trim().length).toBeGreaterThan(0);
  });
});

describe('pickWordChoices', () => {
  it('sahi count return karta hai', () => {
    const choices = pickWordChoices(3, new Set(), () => 0.5);
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3); // teeno alag
  });

  it('usedWords wapas offer nahi hote (jab tak pool khatam na ho jaye)', () => {
    const used = new Set(WORD_BANK.slice(0, WORD_BANK.length - 2).map((e) => e.word));
    const choices = pickWordChoices(2, used, () => 0.1);
    for (const c of choices) expect(used.has(c)).toBe(false);
  });

  it('custom words diye ho to unhi me se milte hain', () => {
    const custom = ['Hyderabad', 'Charminar', 'Cricket stadium'];
    const choices = pickWordChoices(2, new Set(), () => 0.2, { customWords: custom });
    for (const c of choices) expect(custom).toContain(c);
  });

  it('category filter respect hota hai', () => {
    const choices = pickWordChoices(2, new Set(), () => 0.4, { filter: { categories: ['Cricket'] } });
    const cricketWords = new Set(WORD_BANK.filter((e) => e.category === 'Cricket').map((e) => e.word));
    for (const c of choices) expect(cricketWords.has(c)).toBe(true);
  });

  it('pool bahut chhota pad jaye to bhi kabhi crash/khaali nahi hota', () => {
    const used = new Set(WORD_BANK.map((e) => e.word)); // sab use ho chuke
    const choices = pickWordChoices(3, used, () => 0.5);
    expect(choices.length).toBeGreaterThan(0);
  });
});

describe('validateCustomWords', () => {
  it('theek words valid me aate hain', () => {
    const { valid, rejected } = validateCustomWords(['Cat', 'Dog', 'Elephant']);
    expect(valid).toEqual(['Cat', 'Dog', 'Elephant']);
    expect(rejected).toHaveLength(0);
  });

  it('bahut chhota reject hota hai', () => {
    const { rejected } = validateCustomWords(['ab']);
    expect(rejected[0]).toMatchObject({ reason: 'TOO_SHORT' });
  });

  it('bahut bada reject hota hai', () => {
    const { rejected } = validateCustomWords(['a'.repeat(MAX_CUSTOM_WORD_LENGTH + 1)]);
    expect(rejected[0]).toMatchObject({ reason: 'TOO_LONG' });
  });

  it('duplicate (case-insensitive) reject hota hai', () => {
    const { valid, rejected } = validateCustomWords(['Cat', 'cat', 'CAT']);
    expect(valid).toEqual(['Cat']);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.reason === 'DUPLICATE')).toBe(true);
  });

  it('MAX_CUSTOM_WORDS se zyada reject hote hain', () => {
    const words = Array.from({ length: MAX_CUSTOM_WORDS + 5 }, (_, i) => `word${i}`);
    const { valid, rejected } = validateCustomWords(words);
    expect(valid.length).toBeLessThanOrEqual(MAX_CUSTOM_WORDS);
    expect(rejected.some((r) => r.reason === 'TOO_MANY')).toBe(true);
  });
});
