import type { Role } from '@rmc/shared-types';

export interface GameConfig {
  totalRounds: number;
  /** Round ke points. Chor ke 0 se shuru hote hain. */
  rolePoints: Record<Role, number>;
}

export const PLAYERS_PER_GAME = 4;

export const DEFAULT_CONFIG: GameConfig = {
  totalRounds: 4,
  rolePoints: {
    RAJA: 1000,
    MANTRI: 800,
    SIPAHI: 500,
    CHOR: 0,
  },
};
