import type { BombTagGameView, PlayerId } from '@rmc/shared-types';

/** Itne time bache to beep shuru — uske baad jitna kam time, utni tez beep. */
export const BEEP_START_MS = 5_000;
/** Beep ke beech ka gap: 5s par itna dheela... */
const SLOW_GAP_MS = 550;
/** ...aur 0s ke bilkul paas itna tez. */
const FAST_GAP_MS = 110;
/** Itna time bache to beep ka pitch bhi badal jaata hai (panic mode). */
export const URGENT_MS = 1_500;

/**
 * Bomb ke aakhri seconds me agle beep tak ka gap (ms). `null` = abhi beep nahi bajni chahiye
 * (ya to bahut time bacha hai, ya bomb phat chuka/timer hai hi nahi).
 * Pure function — is se poora "beep tez hoti jaati hai" behavior test kiya ja sakta hai.
 */
export function beepIntervalMs(msRemaining: number): number | null {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0 || msRemaining > BEEP_START_MS) return null;
  const t = msRemaining / BEEP_START_MS; // 1 (5s bacha) -> 0 (waqt khatam)
  return Math.round(FAST_GAP_MS + (SLOW_GAP_MS - FAST_GAP_MS) * t);
}

/** Aakhri kuch second me beep ka pitch badal jaata hai. */
export function beepSoundFor(msRemaining: number): 'BT_BEEP' | 'BT_BEEP_URGENT' {
  return msRemaining <= URGENT_MS ? 'BT_BEEP_URGENT' : 'BT_BEEP';
}

/** Bomb holder ke itne paas aane par "khatra" warning dikhti hai (touch-range se thoda pehle). */
export function dangerDistance(playerRadius: number): number {
  return playerRadius * 2 * 2.5; // touch-range (2r) ka dhai guna — bhaagne ka thoda waqt mile
}

/**
 * Kya main abhi khatre me hoon — yaani bomb kisi aur ke paas hai aur wo mere itne paas hai ki
 * agle kuch pal me mujhe tag kar sakta hai. (Bomb khud mere paas ho to ye `false` — us waqt
 * alag warning dikhti hai.)
 */
export function isNearBombHolder(game: BombTagGameView, myId: PlayerId | null): boolean {
  if (!myId || game.phase !== 'PLAYING' || !game.bombHolderId || game.bombHolderId === myId) return false;
  const me = game.players.find((p) => p.id === myId);
  const holder = game.players.find((p) => p.id === game.bombHolderId);
  if (!me?.alive || !holder?.alive) return false;
  return Math.hypot(me.x - holder.x, me.y - holder.y) <= dangerDistance(game.playerRadius);
}
