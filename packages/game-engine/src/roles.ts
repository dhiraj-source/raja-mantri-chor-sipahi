import { ROLES, type PlayerId, type Role } from '@rmc/shared-types';
import { PLAYERS_PER_GAME } from './config';
import { GameEngineError } from './errors';
import { shuffle, type RandomSource } from './random';

/** 4 players ko 4 alag roles randomly baant deta hai. */
export function assignRoles(
  playerIds: readonly PlayerId[],
  random: RandomSource = Math.random,
): Record<PlayerId, Role> {
  if (playerIds.length !== PLAYERS_PER_GAME || new Set(playerIds).size !== playerIds.length) {
    throw new GameEngineError(
      'INVALID_PLAYERS',
      `Exactly ${PLAYERS_PER_GAME} unique players chahiye.`,
    );
  }
  const shuffled = shuffle(ROLES, random);
  const roles: Record<PlayerId, Role> = {};
  playerIds.forEach((id, index) => {
    roles[id] = shuffled[index] as Role;
  });
  return roles;
}

export function findPlayerByRole(roles: Record<PlayerId, Role>, role: Role): PlayerId {
  const id = Object.keys(roles).find((playerId) => roles[playerId] === role);
  if (id === undefined) {
    throw new GameEngineError('INVALID_PLAYERS', `Role ${role} kisi player ko nahi mila.`);
  }
  return id;
}
