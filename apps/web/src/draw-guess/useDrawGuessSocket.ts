import { useCallback, useEffect, useReducer, useRef } from 'react';
import type {
  BombTagServerMessage,
  FreezeTagServerMessage,
  DrawGuessClientMessage,
  DrawGuessServerMessage,
  ServerMessage,
} from '@rmc/shared-types';
import { dgReducer, initialDgState, isDgMessage } from './dgClientState';

/**
 * Draw & Guess apna alag state rakhta hai (RMCS ki clientState se bilkul alag), par socket
 * connection wahi ek hi hai — `onRawMessage` (jo voice chat bhi isi tarah use karta hai) se
 * sirf DG_* messages sunta hai.
 */
export function useDrawGuessSocket(
  onRawMessage: (listener: (message: ServerMessage | DrawGuessServerMessage | BombTagServerMessage | FreezeTagServerMessage) => void) => () => void,
  rawSend: (message: DrawGuessClientMessage) => void,
) {
  const [state, dispatch] = useReducer(dgReducer, initialDgState);

  useEffect(
    () =>
      onRawMessage((message) => {
        if (isDgMessage(message)) dispatch({ type: 'SERVER', message });
      }),
    [onRawMessage],
  );

  // Naya turn shuru hote hi (turn number badle) purane strokes/canvas ab kaam ke nahi.
  const lastTurn = useRef<number | null>(null);
  useEffect(() => {
    const turn = state.game?.turn ?? null;
    if (turn !== null && turn !== lastTurn.current) {
      lastTurn.current = turn;
      if (state.strokes.length > 0) dispatch({ type: 'RESET_CANVAS' });
    }
  }, [state.game?.turn, state.strokes.length]);

  const send = useCallback((message: DrawGuessClientMessage) => rawSend(message), [rawSend]);
  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, send, dismissError, reset };
}
