import { DEFAULT_CHARACTER_ID, findCharacter } from '@rmc/shared-types';

/** Character id -> emoji. Anjaan/khaali id par DEFAULT ka emoji. */
export function avatarEmoji(characterId: string | undefined): string {
  return (findCharacter(characterId ?? '') ?? findCharacter(DEFAULT_CHARACTER_ID))?.emoji ?? '🙂';
}
