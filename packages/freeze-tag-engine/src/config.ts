/**
 * Sab tuning-numbers ek hi jagah — UI ya server me kahin bhi hard-code nahi hote.
 * Arena resolution baaki modes jaisi hi (800x600); asli display size CSS se scale hoti hai.
 */
export interface FreezeTagConfig {
  minPlayers: number;
  maxPlayers: number;
  /** Ek round kitna lamba (ms). Timer khatam = players jeete. */
  roundDurationMs: number;
  /** Round shuru hone se pehle "3, 2, 1, GO" ka waqt. */
  countdownMs: number;
  /** Player ki speed (arena units/second). */
  playerSpeed: number;
  /** Player ka apna radius (arena units) — render aur collision dono isi se. */
  playerRadius: number;
  /** IT itne paas aa jaye to player freeze ho jaata hai. */
  tagRadius: number;
  /** Active player itne paas aa jaye to frozen saathi thaw ho jaata hai (tag se thoda bada — rescue aasan ho). */
  unfreezeRadius: number;
  /**
   * Abhi-abhi thaw hue player ko itni der IT freeze nahi kar sakta. Iske bina IT frozen player
   * ke upar "camp" karke har rescue ko bekaar kar deta.
   */
  thawImmunityMs: number;
  /** Ek hi rescuer ko lagataar spam se rokne ke liye do unfreeze ke beech ka gap. */
  unfreezeCooldownMs: number;
  arenaWidth: number;
  arenaHeight: number;
  /** Result screen kitni der dikhta hai (server isi ke baad lobby me wapas bhejne deta hai). */
  resultMs: number;
}

export const DEFAULT_FREEZE_TAG_CONFIG: FreezeTagConfig = {
  minPlayers: 2,
  maxPlayers: 10,
  roundDurationMs: 120_000,
  countdownMs: 3_000,
  playerSpeed: 220,
  playerRadius: 18,
  tagRadius: 36, // playerRadius * 2 — do circle chhoo rahe hain
  unfreezeRadius: 44, // thoda bada, taaki rescue thoda aasan ho
  thawImmunityMs: 1_500,
  unfreezeCooldownMs: 500,
  arenaWidth: 800,
  arenaHeight: 600,
  resultMs: 8_000,
};

/** Server ka tick loop isi rate se chalta hai (20Hz). Engine khud isse depend nahi karta. */
export const TICK_MS = 50;

export const MAX_ROOM_NAME_LENGTH = 30;
export const ROOM_CODE_LENGTH = 5;
