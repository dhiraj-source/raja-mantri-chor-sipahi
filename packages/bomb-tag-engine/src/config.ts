/**
 * Sab tuning-numbers ek hi jagah — UI ya server me kahin bhi hard-code nahi hote.
 * Internal arena resolution Draw & Guess ke Canvas jaisi hi hai (800x600) — consistency ke liye,
 * asli display size CSS se scale hoti hai.
 */
export interface BombTagConfig {
  minPlayers: number;
  maxPlayers: number;
  /** Bomb kitni der me phatta hai (ms). */
  bombDurationMs: number;
  /** Match jeetne ke liye kitne round-wins chahiye. */
  roundsToWin: number;
  /** Round shuru hone se pehle "3, 2, 1, GO" ka waqt. */
  countdownMs: number;
  /** Ek transfer ke baad naye bomb-holder ko itni der tak dobara transfer nahi ho sakta. */
  transferCooldownMs: number;
  /** Player ki speed (arena units/second). */
  playerSpeed: number;
  /** Player ka collision radius (arena units). */
  playerRadius: number;
  arenaWidth: number;
  arenaHeight: number;
  /** Round-result screen kitni der dikhta hai, phir agla round apne aap. */
  roundResultMs: number;
}

export const DEFAULT_BOMB_TAG_CONFIG: BombTagConfig = {
  minPlayers: 2,
  maxPlayers: 10,
  bombDurationMs: 15_000,
  roundsToWin: 3,
  countdownMs: 3_000,
  transferCooldownMs: 400,
  playerSpeed: 220,
  playerRadius: 18,
  arenaWidth: 800,
  arenaHeight: 600,
  roundResultMs: 5_000,
};

/** Server ka tick loop isi rate se chalta hai (20Hz = har 50ms). Engine khud isse depend nahi karta. */
export const TICK_MS = 50;

export const MAX_ROOM_NAME_LENGTH = 30;
export const ROOM_CODE_LENGTH = 5;
