export type BombTagErrorCode =
  | 'INVALID_PLAYERS'
  | 'INVALID_PHASE'
  | 'NOT_ALIVE'
  | 'UNKNOWN_PLAYER';

export class BombTagError extends Error {
  constructor(
    public readonly code: BombTagErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BombTagError';
  }
}
