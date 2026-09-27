export type FreezeTagErrorCode = 'INVALID_PLAYERS' | 'INVALID_PHASE' | 'UNKNOWN_PLAYER';

/** Engine ki apni error — service isse apne RoomError me badal deti hai. */
export class FreezeTagError extends Error {
  constructor(
    public readonly code: FreezeTagErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FreezeTagError';
  }
}
