import type {
  FreezeTagErrorCode,
  FreezeTagGameView,
  FreezeTagRoomView,
  FreezeTagServerMessage,
  PlayerId,
} from '@rmc/shared-types';

const MAX_EVENTS = 20;

/**
 * Server sirf continuous snapshots bhejta hai (discrete events wire par nahi jaate) — audio aur
 * animations trigger karne ke liye UI khud do lagataar snapshots compare karke ye events nikaalta
 * hai. Bomb Tag me bhi bilkul yahi pattern hai.
 */
export type FtUiEventType = 'FROZEN' | 'UNFROZEN' | 'IT_CHANGED' | 'ROUND_OVER';
export interface FtUiEvent {
  key: number;
  type: FtUiEventType;
  /** FROZEN/UNFROZEN: kiske saath hua. IT_CHANGED: naya IT. ROUND_OVER: null. */
  playerId: PlayerId | null;
}

export interface FtClientState {
  room: FreezeTagRoomView | null;
  game: FreezeTagGameView | null;
  error: FreezeTagErrorCode | null;
  recentEvents: FtUiEvent[];
  nextKey: number;
}

export const initialFtState: FtClientState = {
  room: null,
  game: null,
  error: null,
  recentEvents: [],
  nextKey: 0,
};

export type FtEvent =
  | { type: 'RESET' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'SERVER'; message: FreezeTagServerMessage };

/** Do lagataar game-view snapshots compare karke UI events nikaalta hai. */
function diffGameEvents(
  prev: FreezeTagGameView | null,
  next: FreezeTagGameView,
  startKey: number,
): FtUiEvent[] {
  if (!prev) return [];
  const events: FtUiEvent[] = [];
  let key = startKey;

  for (const p of next.players) {
    const before = prev.players.find((pp) => pp.id === p.id);
    if (!before) continue;
    if (before.status !== 'FROZEN' && p.status === 'FROZEN') {
      events.push({ key: key++, type: 'FROZEN', playerId: p.id });
    } else if (before.status === 'FROZEN' && p.status === 'ACTIVE') {
      events.push({ key: key++, type: 'UNFROZEN', playerId: p.id });
    }
  }
  if (next.itId && prev.itId && next.itId !== prev.itId) {
    events.push({ key: key++, type: 'IT_CHANGED', playerId: next.itId });
  }
  if (next.phase === 'ROUND_OVER' && prev.phase !== 'ROUND_OVER') {
    events.push({ key: key++, type: 'ROUND_OVER', playerId: null });
  }
  return events;
}

export function ftReducer(state: FtClientState, event: FtEvent): FtClientState {
  switch (event.type) {
    case 'RESET':
      return initialFtState;
    case 'DISMISS_ERROR':
      return { ...state, error: null };
    case 'SERVER': {
      const msg = event.message;
      switch (msg.event) {
        case 'FT_ROOM_STATE':
          return { ...state, room: msg.data, error: null };
        case 'FT_GAME_VIEW': {
          if (!msg.data) return { ...state, game: null };
          const events = diffGameEvents(state.game, msg.data, state.nextKey);
          if (events.length === 0) return { ...state, game: msg.data };
          return {
            ...state,
            game: msg.data,
            nextKey: state.nextKey + events.length,
            recentEvents: [...state.recentEvents, ...events].slice(-MAX_EVENTS),
          };
        }
        case 'FT_ERROR':
          return { ...state, error: msg.data.code };
        default:
          return state;
      }
    }
  }
}

/** Kisi bhi server message ka `event` FT_ se shuru hota hai to Freeze Tag ka hai. */
export function isFtMessage(message: { event: string }): message is FreezeTagServerMessage {
  return message.event.startsWith('FT_');
}
