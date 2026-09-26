/**
 * Sab tuning-numbers ek hi jagah — UI ya server me kahin bhi scoring/timing hard-code nahi hai.
 */
export interface DrawGuessConfig {
  minPlayers: number;
  maxPlayers: number;
  totalRounds: number;
  /** Drawer ko kitne word options milte hain chunne ke liye. */
  wordsToChoose: number;
  drawTimeMs: number;
  /** Lobby me "Start" ke baad drawing shuru hone se pehle countdown. */
  countdownMs: number;
  /** Drawer ke paas word choose karne ke liye itna time (na choose kare to auto-pick). */
  wordSelectMs: number;
  /** Round-result screen kitni der dikhta hai, phir apne aap agla turn. */
  roundResultMs: number;
  /** Itne ms me ek extra letter hint reveal hota hai. 0 = hints band. */
  hintIntervalMs: number;
  /** Hints se word ka itna hissa (0..1) se zyada kabhi reveal nahi hota. */
  maxHintFraction: number;
  /** Guess match kaise ho: EXACT (case-sensitive as-is) ya NORMALIZED (case/space/punctuation-insensitive). */
  guessTolerance: 'EXACT' | 'NORMALIZED';
}

export interface ScoringConfig {
  /** Pehle sahi guess ko itne points. */
  guesserBasePoints: number;
  /** Har agle sahi guesser ko pichle se itne kam points. */
  guesserPointsStep: number;
  /** Kabhi bhi isse kam points nahi milte (0 tak na gir jaye). */
  guesserMinPoints: number;
  /** Drawer ko base points (kam se kam ek sahi guess ho to). */
  drawerBasePoints: number;
  /** Har sahi guesser ke liye drawer ko extra itne points. */
  drawerPointsPerCorrectGuesser: number;
}

export const DEFAULT_DRAW_GUESS_CONFIG: DrawGuessConfig = {
  minPlayers: 2,
  maxPlayers: 12,
  totalRounds: 3,
  wordsToChoose: 3,
  drawTimeMs: 60_000,
  countdownMs: 3_000,
  wordSelectMs: 15_000,
  roundResultMs: 4_000,
  hintIntervalMs: 10_000,
  maxHintFraction: 0.5,
  guessTolerance: 'NORMALIZED',
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  guesserBasePoints: 300,
  guesserPointsStep: 50,
  guesserMinPoints: 50,
  drawerBasePoints: 50,
  drawerPointsPerCorrectGuesser: 50,
};

export const MAX_CUSTOM_WORDS = 50;
export const MAX_CUSTOM_WORD_LENGTH = 30;
export const MIN_WORD_LENGTH = 3;

export const ROOM_CODE_LENGTH = 5;
export const MAX_ROOM_NAME_LENGTH = 30;
export const MAX_CHAT_MESSAGE_LENGTH = 200;
