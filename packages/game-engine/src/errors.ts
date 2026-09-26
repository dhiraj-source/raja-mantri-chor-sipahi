export type GameEngineErrorCode =
  | 'INVALID_PLAYERS'
  | 'INVALID_CONFIG'
  | 'INVALID_PHASE'
  | 'INVALID_GUESS'
  | 'INVALID_VOTE'
  | 'NOT_MANTRI';

export class GameEngineError extends Error {
  constructor(
    public readonly code: GameEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameEngineError';
  }
}
