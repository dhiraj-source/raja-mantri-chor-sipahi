export type DrawGuessErrorCode =
  | 'INVALID_PLAYERS'
  | 'INVALID_CONFIG'
  | 'INVALID_PHASE'
  | 'NOT_DRAWER'
  | 'INVALID_WORD_CHOICE'
  | 'DRAWER_CANNOT_GUESS'
  | 'ALREADY_GUESSED'
  | 'UNKNOWN_PLAYER';

export class DrawGuessError extends Error {
  constructor(
    public readonly code: DrawGuessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DrawGuessError';
  }
}
