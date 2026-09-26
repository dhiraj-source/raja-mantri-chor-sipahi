/**
 * Basic profanity filter — chhoti English blocklist, word-boundary match. Ye exhaustive nahi hai
 * (na hi multi-language) — sirf sabse aam gaaliyan block/censor karta hai. Zaroorat pade to list
 * badhai ja sakti hai, poora system yahi ek jagah hai.
 */
const BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'slut', 'whore', 'dick', 'cunt', 'faggot',
  'nigger', 'chutiya', 'madarchod', 'behenchod', 'randi', 'gaandu', 'harami',
];

const PATTERN = new RegExp(`\\b(${BLOCKLIST.join('|')})\\b`, 'gi');

export function isProfane(text: string): boolean {
  PATTERN.lastIndex = 0;
  return PATTERN.test(text);
}

export function censor(text: string): string {
  return text.replace(PATTERN, (match) => match[0] + '*'.repeat(match.length - 1));
}
