import type {
  BombTagServerMessage,
  FreezeTagServerMessage,
  DrawGuessServerMessage,
  GameReward,
  PlayerGameView,
  PlayerId,
  Reaction,
  RoomErrorCode,
  RoomView,
  ServerMessage,
} from '@rmc/shared-types';

/** Dost ka room invite. Join karne par normal JOIN_ROOM chalta hai; server sab dobara check karta hai. */
export interface InviteItem {
  key: number;
  fromName: string;
  roomCode: string;
}

const MAX_INVITES = 3;

export interface ReactionItem {
  key: number;
  playerId: PlayerId;
  emoji: Reaction;
}

/**
 * Browser ki state = server ne jo bheja uska aaina.
 * Yahan koi game logic ya score nahi; sirf server ke messages store hote hain.
 */
export interface ClientState {
  /** reconnecting: connection toota, room/game screen waisi hi rehti hai jab tak wapas na mile. */
  connection: 'connecting' | 'open' | 'reconnecting' | 'closed';
  playerId: PlayerId | null;
  room: RoomView | null;
  game: PlayerGameView | null;
  /** Quick match queue me hain to abhi kaun-kaun wait kar raha hai. */
  queue: { size: number; names: string[] } | null;
  /** Socket kis account se juda hai (server ne bataya); null = guest. */
  account: { displayName: string } | null;
  /** Abhi khatam hue game ka reward (server ne diya). */
  reward: GameReward | null;
  /** Error ka code; text UI apni language me dikhata hai. */
  error: RoomErrorCode | null;
  /** Haal ki reactions (chhote animation ke liye). */
  reactions: ReactionItem[];
  /** Dosto ke invites (room me jaate hi saaf). */
  invites: InviteItem[];
  /** Har FRIENDS_CHANGED par badhta hai: friends list dobara fetch karne ka signal. */
  friendsVersion: number;
  nextKey: number;
}

export const initialClientState: ClientState = {
  connection: 'connecting',
  playerId: null,
  room: null,
  game: null,
  queue: null,
  account: null,
  reward: null,
  error: null,
  reactions: [],
  invites: [],
  friendsVersion: 0,
  nextKey: 0,
};

const MAX_VISIBLE_REACTIONS = 6;

export type ClientEvent =
  | { type: 'SOCKET_CONNECTING' }
  | { type: 'SOCKET_OPEN' }
  | { type: 'SOCKET_RECONNECTING' }
  | { type: 'SOCKET_CLOSED' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'EXPIRE_REACTION'; key: number }
  | { type: 'DISMISS_INVITE'; key: number }
  | { type: 'SERVER'; message: ServerMessage | DrawGuessServerMessage | BombTagServerMessage | FreezeTagServerMessage };

export function clientReducer(state: ClientState, event: ClientEvent): ClientState {
  switch (event.type) {
    case 'SOCKET_CONNECTING':
      return { ...initialClientState, connection: 'connecting' };
    case 'SOCKET_OPEN':
      return { ...state, connection: 'open' };
    case 'SOCKET_RECONNECTING':
      return { ...state, connection: 'reconnecting' };
    case 'SOCKET_CLOSED':
      // Retry khatam / dusre tab ne le liya: purani room/game state valid nahi rehti.
      return {
        ...state,
        connection: 'closed',
        playerId: null,
        room: null,
        game: null,
        queue: null,
        account: null,
        reward: null,
        reactions: [],
        invites: [],
      };
    case 'DISMISS_ERROR':
      return { ...state, error: null };
    case 'EXPIRE_REACTION':
      return { ...state, reactions: state.reactions.filter((r) => r.key !== event.key) };
    case 'DISMISS_INVITE':
      return { ...state, invites: state.invites.filter((i) => i.key !== event.key) };
    case 'SERVER': {
      const msg = event.message;
      switch (msg.event) {
        case 'CONNECTED': {
          // Reconnect me server ne naya player diya (session expire) => purani state galat hai.
          const identityChanged = state.playerId !== null && state.playerId !== msg.data.playerId;
          return {
            ...state,
            playerId: msg.data.playerId,
            room: identityChanged ? null : state.room,
            game: identityChanged ? null : state.game,
            queue: identityChanged ? null : state.queue,
            error: null,
          };
        }
        case 'ROOM_STATE':
          // Room me aa gaye: purane invites bekaar.
          return { ...state, room: msg.data, error: null, invites: msg.data ? [] : state.invites };
        case 'FRIENDS_CHANGED':
          return { ...state, friendsVersion: state.friendsVersion + 1 };
        case 'INVITE': {
          // Wahi dost wahi room dobara bulaye to purana hata kar naya (upar) rakho.
          const { fromName, roomCode } = msg.data;
          const others = state.invites.filter((i) => !(i.fromName === fromName && i.roomCode === roomCode));
          return {
            ...state,
            nextKey: state.nextKey + 1,
            invites: [...others, { key: state.nextKey, fromName, roomCode }].slice(-MAX_INVITES),
          };
        }
        case 'GAME_VIEW':
          // Reward sirf final result screen tak relevant hai.
          return {
            ...state,
            game: msg.data,
            reward: msg.data?.phase === 'GAME_RESULT' ? state.reward : null,
          };
        case 'AUTH_STATE':
          return { ...state, account: msg.data };
        case 'GAME_REWARD':
          return { ...state, reward: msg.data };
        case 'QUEUE_STATE':
          return { ...state, queue: msg.data };
        case 'REACTION':
          return {
            ...state,
            nextKey: state.nextKey + 1,
            reactions: [
              ...state.reactions,
              { key: state.nextKey, playerId: msg.data.playerId, emoji: msg.data.emoji },
            ].slice(-MAX_VISIBLE_REACTIONS),
          };
        case 'ERROR':
          return { ...state, error: msg.data.code };
        default:
          return state;
      }
    }
  }
}

/**
 * Raw text ko safely ServerMessage me badalta hai; kharab data par null.
 * Ek hi socket teeno game modes serve karta hai, isliye DG_ aur BT_ prefix wale messages bhi
 * yahin se guzarte hain (clientReducer unhe chhoo tak nahi, `default` case me ignore ho jaate
 * hain — dgReducer/btReducer alag se inhe sunte hain `onRawMessage` ke zariye).
 */
export function parseServerMessage(raw: string): ServerMessage | DrawGuessServerMessage | BombTagServerMessage | FreezeTagServerMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { event?: unknown }).event === 'string'
    ) {
      return parsed as ServerMessage | DrawGuessServerMessage | BombTagServerMessage | FreezeTagServerMessage;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Reconnect retry ka wait (ms): 1s, 2s, 4s, ... max 8s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

export const MAX_RECONNECT_ATTEMPTS = 8;
/** Server is code se batata hai ki naye connection ne is player ko le liya; retry mat karo. */
export const REPLACED_CLOSE_CODE = 4000;
