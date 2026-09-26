import type {
  DrawGuessChatEntry,
  DrawGuessErrorCode,
  DrawGuessGameView,
  DrawGuessRoomView,
  DrawGuessServerMessage,
  DrawGuessStroke,
  PlayerId,
} from '@rmc/shared-types';

const MAX_CHAT = 300;
const MAX_STROKES = 5000;

export interface StrokeItem {
  key: number;
  playerId: PlayerId;
  stroke: DrawGuessStroke;
}

/** Browser ki Draw & Guess state = server ne jo bheja uska aaina (RMCS ke clientState jaisa hi). */
export interface DgClientState {
  room: DrawGuessRoomView | null;
  game: DrawGuessGameView | null;
  chat: DrawGuessChatEntry[];
  /** Is turn ke ab tak ke strokes — naya turn shuru hote hi `RESET_CANVAS` se saaf hote hain. */
  strokes: StrokeItem[];
  error: DrawGuessErrorCode | null;
  nextKey: number;
}

export const initialDgState: DgClientState = {
  room: null,
  game: null,
  chat: [],
  strokes: [],
  error: null,
  nextKey: 0,
};

export type DgEvent =
  | { type: 'RESET' }
  | { type: 'DISMISS_ERROR' }
  /** Naya turn shuru hua: purane strokes ab kaam ke nahi (canvas bhi locally clear hota hai). */
  | { type: 'RESET_CANVAS' }
  | { type: 'SERVER'; message: DrawGuessServerMessage };

export function dgReducer(state: DgClientState, event: DgEvent): DgClientState {
  switch (event.type) {
    case 'RESET':
      return initialDgState;
    case 'DISMISS_ERROR':
      return { ...state, error: null };
    case 'RESET_CANVAS':
      return { ...state, strokes: [] };
    case 'SERVER': {
      const msg = event.message;
      switch (msg.event) {
        case 'DG_ROOM_STATE':
          // Naye room me aaye (ya room chhoda): purana chat bekaar.
          return { ...state, room: msg.data, error: null, chat: msg.data ? state.chat : [] };
        case 'DG_GAME_VIEW':
          return { ...state, game: msg.data };
        case 'DG_CHAT_MESSAGE':
          return { ...state, chat: [...state.chat, msg.data].slice(-MAX_CHAT) };
        case 'DG_STROKE':
          return {
            ...state,
            nextKey: state.nextKey + 1,
            strokes: [
              ...state.strokes,
              { key: state.nextKey, playerId: msg.data.playerId, stroke: msg.data.stroke },
            ].slice(-MAX_STROKES),
          };
        case 'DG_ERROR':
          return { ...state, error: msg.data.code };
        default:
          return state;
      }
    }
  }
}

/** Kisi bhi server message ka `event` DG_ se shuru hota hai to Draw & Guess ka hai. */
export function isDgMessage(
  message: { event: string },
): message is DrawGuessServerMessage {
  return message.event.startsWith('DG_');
}
