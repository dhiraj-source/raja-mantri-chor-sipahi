import type { BombTagErrorCode, BombTagGameView, BombTagRoomView, BombTagServerMessage, PlayerId } from '@rmc/shared-types';

const MAX_EVENTS = 20;

/**
 * Server engine ke andar events (BOMB_TRANSFERRED, EXPLODED, ...) hote hain par wire par kabhi
 * nahi bheje jaate (sirf continuous `BombTagGameView` snapshots) — is UI ko audio/animation
 * trigger karne ke liye khud consecutive snapshots compare karke inhe nikaalna padta hai.
 */
export type BtUiEventType = 'TAG' | 'EXPLODE' | 'ROUND_WIN' | 'MATCH_WIN';
export interface BtUiEvent {
  key: number;
  type: BtUiEventType;
  /** TAG/EXPLODE: kiske saath hua. ROUND_WIN/MATCH_WIN: winner (null ho sakta hai draw-jaisi situation me). */
  playerId: PlayerId | null;
}

/** Browser ki Bomb Tag state = server ne jo bheja uska aaina (RMCS/DG ke clientState jaisa hi). */
export interface BtClientState {
  room: BombTagRoomView | null;
  game: BombTagGameView | null;
  error: BombTagErrorCode | null;
  /** Diff se nikale gaye UI events — consumers (audio, banner) apna khud ka "last seen key" track karte hain. */
  recentEvents: BtUiEvent[];
  nextKey: number;
}

export const initialBtState: BtClientState = {
  room: null,
  game: null,
  error: null,
  recentEvents: [],
  nextKey: 0,
};

/** Do consecutive game-view snapshots compare karke UI events nikaalta hai. */
function diffGameEvents(prev: BombTagGameView | null, next: BombTagGameView, startKey: number): BtUiEvent[] {
  if (!prev) return [];
  const events: BtUiEvent[] = [];
  let key = startKey;
  // Bomb kisi naye player ke paas gayi — pehli round-start assignment (prev null tha) count nahi hoti.
  if (next.bombHolderId && next.bombHolderId !== prev.bombHolderId && prev.bombHolderId !== null) {
    events.push({ key: key++, type: 'TAG', playerId: next.bombHolderId });
  }
  for (const p of next.players) {
    const before = prev.players.find((pp) => pp.id === p.id);
    if (before?.alive && !p.alive) events.push({ key: key++, type: 'EXPLODE', playerId: p.id });
  }
  if (next.phase === 'ROUND_OVER' && prev.phase !== 'ROUND_OVER') {
    events.push({ key: key++, type: 'ROUND_WIN', playerId: next.roundWinnerId });
  }
  if (next.phase === 'GAME_OVER' && prev.phase !== 'GAME_OVER') {
    events.push({ key: key++, type: 'MATCH_WIN', playerId: next.matchWinnerId });
  }
  return events;
}

export type BtEvent =
  | { type: 'RESET' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'SERVER'; message: BombTagServerMessage };

export function btReducer(state: BtClientState, event: BtEvent): BtClientState {
  switch (event.type) {
    case 'RESET':
      return initialBtState;
    case 'DISMISS_ERROR':
      return { ...state, error: null };
    case 'SERVER': {
      const msg = event.message;
      switch (msg.event) {
        case 'BT_ROOM_STATE':
          return { ...state, room: msg.data, error: null };
        case 'BT_GAME_VIEW': {
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
        case 'BT_ERROR':
          return { ...state, error: msg.data.code };
        default:
          return state;
      }
    }
  }
}

/** Kisi bhi server message ka `event` BT_ se shuru hota hai to Bomb Tag ka hai. */
export function isBtMessage(message: { event: string }): message is BombTagServerMessage {
  return message.event.startsWith('BT_');
}
