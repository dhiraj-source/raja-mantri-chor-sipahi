import { useCallback, useEffect, useReducer } from 'react';
import type {
  BombTagClientMessage,
  BombTagServerMessage,
  FreezeTagServerMessage,
  DrawGuessServerMessage,
  ServerMessage,
} from '@rmc/shared-types';
import { btReducer, initialBtState, isBtMessage } from './btClientState';

/**
 * Bomb Tag apna alag state rakhta hai (RMCS/Draw & Guess ki clientState se bilkul alag), par
 * socket connection wahi ek hi hai — `onRawMessage` se sirf BT_* messages sunta hai.
 */
export function useBombTagSocket(
  onRawMessage: (listener: (message: ServerMessage | DrawGuessServerMessage | BombTagServerMessage | FreezeTagServerMessage) => void) => () => void,
  rawSend: (message: BombTagClientMessage) => void,
) {
  const [state, dispatch] = useReducer(btReducer, initialBtState);

  useEffect(
    () =>
      onRawMessage((message) => {
        if (isBtMessage(message)) dispatch({ type: 'SERVER', message });
      }),
    [onRawMessage],
  );

  const send = useCallback((message: BombTagClientMessage) => rawSend(message), [rawSend]);
  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);

  return { state, send, dismissError };
}
