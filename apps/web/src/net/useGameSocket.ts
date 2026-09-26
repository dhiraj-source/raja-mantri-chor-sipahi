import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  RECONNECT_TOKEN_PARAM,
  type ClientMessage,
  type DrawGuessClientMessage,
  type DrawGuessServerMessage,
  type ServerMessage,
} from '@rmc/shared-types';
import {
  MAX_RECONNECT_ATTEMPTS,
  REPLACED_CLOSE_CODE,
  clientReducer,
  initialClientState,
  parseServerMessage,
  reconnectDelay,
} from './clientState';

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:3000/ws`;
// sessionStorage: har browser tab ka apna player (do tabs = do players, testing ke liye aasan).
const TOKEN_KEY = 'rmc:token';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage band ho to reconnect nahi hoga, baaki sab chalega
  }
}

/**
 * WebSocket + server state + auto-reconnect.
 * Connection tootne par saved token se wahi player wapas milta hai (role/room/game waisi hi).
 */
export function useGameSocket() {
  const [state, dispatch] = useReducer(clientReducer, initialClientState);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kuch messages (voice signaling) reducer/state me nahi jaate, seedha yahan se sunte hain —
  // taaki har ICE candidate par poora app re-render na ho.
  const rawListenersRef = useRef(new Set<(message: ServerMessage | DrawGuessServerMessage) => void>());
  // Purane socket ke late events ko ignore karne ke liye.
  const attemptIdRef = useRef(0);
  const retriesRef = useRef(0);

  const open = useCallback((isRetry: boolean) => {
    const attemptId = ++attemptIdRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    socketRef.current?.close();
    if (!isRetry) dispatch({ type: 'SOCKET_CONNECTING' });

    const token = readToken();
    const url = token ? `${WS_URL}?${RECONNECT_TOKEN_PARAM}=${encodeURIComponent(token)}` : WS_URL;
    const socket = new WebSocket(url);
    socketRef.current = socket;
    const current = () => attemptId === attemptIdRef.current;

    socket.onopen = () => current() && dispatch({ type: 'SOCKET_OPEN' });
    socket.onmessage = (e) => {
      if (!current()) return;
      const message = parseServerMessage(String(e.data));
      if (!message) return;
      if (message.event === 'CONNECTED') {
        saveToken(message.data.token);
        retriesRef.current = 0;
      }
      dispatch({ type: 'SERVER', message });
      for (const listener of rawListenersRef.current) listener(message);
    };
    socket.onclose = (e) => {
      if (!current()) return;
      const canRetry =
        e.code !== REPLACED_CLOSE_CODE && retriesRef.current < MAX_RECONNECT_ATTEMPTS;
      if (!canRetry) {
        dispatch({ type: 'SOCKET_CLOSED' });
        return;
      }
      dispatch({ type: 'SOCKET_RECONNECTING' });
      const delay = reconnectDelay(retriesRef.current++);
      timerRef.current = setTimeout(() => open(true), delay);
    };
  }, []);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    open(false);
  }, [open]);

  useEffect(() => {
    open(false);
    return () => {
      attemptIdRef.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
    };
  }, [open]);

  // Ek hi socket dono game modes serve karta hai (koi doosra connection nahi) — isliye send()
  // dono message-universes accept karta hai; server hi decide karta hai kaunsa event kis mode ka hai.
  const send = useCallback((message: ClientMessage | DrawGuessClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);
  const expireReaction = useCallback((key: number) => dispatch({ type: 'EXPIRE_REACTION', key }), []);

  const dismissInvite = useCallback((key: number) => dispatch({ type: 'DISMISS_INVITE', key }), []);

  /** Listener register karo (VOICE_SIGNAL jaisi cheezein). Cleanup function wapas milta hai. */
  const onRawMessage = useCallback((listener: (message: ServerMessage | DrawGuessServerMessage) => void) => {
    rawListenersRef.current.add(listener);
    return () => rawListenersRef.current.delete(listener);
  }, []);

  return { state, send, reconnect, dismissError, expireReaction, dismissInvite, onRawMessage };
}
