import type { Achievement, PlayerId, RoundResult } from '@rmc/shared-types';

/** XP/coins ke numbers ek jagah; badalna ho to yahin. */
export const PROGRESSION = {
  participationXp: 50,
  winXp: 50,
  /** Har itne game-points par 1 XP. */
  pointsPerXp: 100,
  participationCoins: 10,
  winCoins: 20,
  /** Level = 1 + floor(sqrt(xp / xpScale)). */
  xpScale: 100,
} as const;

export interface PlayerGameSummary {
  points: number;
  isWinner: boolean;
  rounds: number;
  /** Mantri ban kar Chor sahi pakde: kitne rounds. */
  mantriCatches: number;
  /** Chor ban kar bach nikle (Mantri ka guess galat): kitne rounds. */
  chorEscapes: number;
}

/** Ek player ke nazariye se poore game ka saar. Sirf history se nikalta hai. */
export function summarizeGameForPlayer(
  history: readonly RoundResult[],
  playerId: PlayerId,
  winnerIds: readonly PlayerId[],
  totalPoints: number,
): PlayerGameSummary {
  let mantriCatches = 0;
  let chorEscapes = 0;
  for (const round of history) {
    const role = round.roles[playerId];
    if (role === 'MANTRI' && round.guessCorrect) mantriCatches++;
    if (role === 'CHOR' && !round.guessCorrect) chorEscapes++;
  }
  return {
    points: totalPoints,
    isWinner: winnerIds.includes(playerId),
    rounds: history.length,
    mantriCatches,
    chorEscapes,
  };
}

export function calculateRewards(summary: PlayerGameSummary): { xp: number; coins: number } {
  const xp =
    PROGRESSION.participationXp +
    Math.floor(Math.max(0, summary.points) / PROGRESSION.pointsPerXp) +
    (summary.isWinner ? PROGRESSION.winXp : 0);
  const coins = PROGRESSION.participationCoins + (summary.isWinner ? PROGRESSION.winCoins : 0);
  return { xp, coins };
}

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / PROGRESSION.xpScale));
}

/** Kisi level ke shuru hone ke liye kitna XP chahiye. */
export function xpForLevel(level: number): number {
  return (Math.max(1, level) - 1) ** 2 * PROGRESSION.xpScale;
}

/** Lifetime stats: is game ke baad ke. */
export interface LifetimeStats {
  gamesPlayed: number;
  wins: number;
  xp: number;
}

/** Sirf NAYE unlock hue achievements return karta hai (jo pehle se hain unhe nahi). */
export function evaluateAchievements(
  stats: LifetimeStats,
  summary: PlayerGameSummary,
  alreadyUnlocked: readonly Achievement[],
): Achievement[] {
  const earned: Record<Achievement, boolean> = {
    FIRST_GAME: stats.gamesPlayed >= 1,
    FIRST_WIN: stats.wins >= 1,
    WIN_5: stats.wins >= 5,
    SHARP_MANTRI: summary.mantriCatches >= 2,
    SLIPPERY_CHOR: summary.chorEscapes >= 1,
    LEVEL_5: levelForXp(stats.xp) >= 5,
  };
  return (Object.keys(earned) as Achievement[]).filter(
    (a) => earned[a] && !alreadyUnlocked.includes(a),
  );
}
