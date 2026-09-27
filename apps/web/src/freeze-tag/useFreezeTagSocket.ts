import { useCallback, useEffect, useReducer } from 'react';
import type {
  BombTagServerMessage,
  DrawGuessServerMessage,
  FreezeTagClientMessage,
  FreezeTagServerMessage,
  ServerMessage,
} from '@rmc/shared-types';
import { ftReducer, initialFtState, isFtMessage } from './ftClientState';

/**
 * Freeze Tag apna alag state rakhta hai, par socket wahi ek hi hai — `onRawMessage` se sirf
 * FT_* messages sunta hai (baaki modes ke messages chup-chaap ignore).
 */
export function useFreezeTagSocket(
  onRawMessage: (
    listener: (
      message: ServerMessage | DrawGuessServerMessage | BombTagServerMessage | FreezeTagServerMessage,
    ) => void,
  ) => () => void,
  rawSend: (message: FreezeTagClientMessage) => void,
) {
  const [state, dispatch] = useReducer(ftReducer, initialFtState);

  useEffect(
    () =>
      onRawMessage((message) => {
        if (isFtMessage(message)) dispatch({ type: 'SERVER', message });
      }),
    [onRawMessage],
  );

  const send = useCallback((message: FreezeTagClientMessage) => rawSend(message), [rawSend]);
  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);

  return { state, send, dismissError };
}
