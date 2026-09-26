import type { PlayerId, Role } from '@rmc/shared-types';
import type { GameConfig } from './config';
import { findPlayerByRole } from './roles';

export interface RoundScore {
  guessCorrect: boolean;
  points: Record<PlayerId, number>;
}

/**
 * Round ke points.
 * - Mantri ne Chor sahi pakda: sabko apne role ke points.
 * - Mantri galat pakda: Mantri ko 0, Chor ko Mantri ke points. Baaki normal.
 */
export function calculateRoundScore(
  roles: Record<PlayerId, Role>,
  guessedChorId: PlayerId,
  config: GameConfig,
): RoundScore {
  const chorId = findPlayerByRole(roles, 'CHOR');
  const mantriId = findPlayerByRole(roles, 'MANTRI');
  const guessCorrect = guessedChorId === chorId;

  const points: Record<PlayerId, number> = {};
  for (const [playerId, role] of Object.entries(roles)) {
    points[playerId] = config.rolePoints[role];
  }
  if (!guessCorrect) {
    points[chorId] = config.rolePoints.MANTRI;
    points[mantriId] = 0;
  }
  return { guessCorrect, points };
}
