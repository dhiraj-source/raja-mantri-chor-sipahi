/**
 * "Draw & Guess" (Skribbl.io-style) game mode — RMCS se bilkul alag, apna wire protocol.
 * RMCS ke types (upar is file me index.ts) yahan se kabhi import nahi hote — dono mode
 * poori tarah independent hain, sirf PlayerId jaisi basic cheezein saath hain.
 */
import type { PlayerId } from './index';

export const DRAW_GUESS_PHASES = [
  'LOBBY',
  'COUNTDOWN',
  'CHOOSING_WORD',
  'DRAWING',
  'ROUND_RESULTS',
  'GAME_RESULTS',
  'FINISHED',
] as const;
export type DrawGuessPhase = (typeof DRAW_GUESS_PHASES)[number];

export interface DrawGuessCorrectGuesser {
  playerId: PlayerId;
  rank: number;
  points: number;
  atMs: number;
}

/** Ek turn ka final result — sabko dikhta hai turn khatam hone ke baad (word yahan reveal hota hai). */
export interface DrawGuessTurnResult {
  turn: number;
  round: number;
  drawerId: PlayerId;
  word: string;
  correctGuessers: DrawGuessCorrectGuesser[];
  drawerPoints: number;
}

/**
 * Server jo ek player ko dikhata hai. Secret word (aur wordChoices) sirf drawer ko milte hain —
 * baaki sabko hamesha null + maskedWord. Browser sirf isi ko render karta hai.
 */
export interface DrawGuessGameView {
  phase: DrawGuessPhase;
  players: {
    id: PlayerId;
    name: string;
    score: number;
    connected: boolean;
    hasGuessedCorrectly: boolean;
  }[];
  totalRounds: number;
  round: number;
  turn: number;
  totalTurns: number;
  drawerId: PlayerId | null;
  isDrawer: boolean;
  /** Sirf drawer ko (CHOOSING_WORD me); baaki sabko hamesha null. */
  wordChoices: string[] | null;
  /** Sirf drawer ko (DRAWING me); baaki sabko hamesha null — kabhi leak nahi hota. */
  word: string | null;
  maskedWord: string | null;
  wordLength: number | null;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
  correctGuesserIds: PlayerId[];
  myGuessedCorrectly: boolean;
  history: DrawGuessTurnResult[];
  winnerIds: PlayerId[];
}

// ---------------------------------------------------------------------------
// Room + lobby
// ---------------------------------------------------------------------------

export const DG_MIN_PLAYERS = 2;
export const DG_MAX_PLAYERS = 12;
export const DG_ROOM_CODE_LENGTH = 5;
export const DG_MAX_ROOM_NAME_LENGTH = 30;
export const DG_MAX_CHAT_LENGTH = 200;
export const DG_MAX_CUSTOM_WORDS = 50;

export interface DrawGuessSettings {
  roomName: string;
  maxPlayers: number;
  totalRounds: number;
  wordsToChoose: number;
  drawTimeMs: number;
  /** Owner ke apne words (optional) — server-side validate/cap hote hain, kabhi client ko poori list wapas nahi bhejte agar bahut badi ho. */
  customWords: string[];
}

export const DEFAULT_DG_SETTINGS: DrawGuessSettings = {
  roomName: '',
  maxPlayers: 8,
  totalRounds: 3,
  wordsToChoose: 3,
  drawTimeMs: 60_000,
  customWords: [],
};

export interface DrawGuessRoomPlayerView {
  id: PlayerId;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
}

export interface DrawGuessRoomView {
  code: string;
  hostId: PlayerId;
  settings: DrawGuessSettings;
  players: DrawGuessRoomPlayerView[];
  status: 'LOBBY' | 'IN_GAME';
}

// ---------------------------------------------------------------------------
// Chat / guess feed. Ek CORRECT_GUESS entry me kabhi guess ka text nahi hota (word leak na ho
// un players ko jinhone abhi tak sahi guess nahi kiya).
// ---------------------------------------------------------------------------

export type DrawGuessChatEntry =
  | { kind: 'CHAT'; key: number; playerId: PlayerId; name: string; text: string; at: number }
  | { kind: 'SYSTEM'; key: number; text: string; at: number }
  | { kind: 'CORRECT_GUESS'; key: number; playerId: PlayerId; name: string; at: number };

export type DrawGuessErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_CODE'
  | 'INVALID_SETTINGS'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NEED_MORE_PLAYERS'
  | 'NO_GAME'
  | 'RATE_LIMITED'
  | 'BAD_MESSAGE'
  | 'PLAYER_NOT_FOUND'
  | 'GAME_RULE';

// ---------------------------------------------------------------------------
// Drawing. Points normalized (0..1) taaki alag screen sizes ke beech resolution-independent rahe.
// ---------------------------------------------------------------------------

export interface DrawGuessStrokePoint {
  x: number;
  y: number;
}

export type DrawGuessStroke =
  | { tool: 'PEN' | 'ERASER'; color: string; size: number; points: DrawGuessStrokePoint[] }
  | { tool: 'FILL'; color: string; point: DrawGuessStrokePoint }
  | { tool: 'CLEAR' };

/** Browser -> Server. */
export type DrawGuessClientMessage =
  | { event: 'DG_CREATE_ROOM'; data: { name: string; settings?: Partial<DrawGuessSettings> } }
  | { event: 'DG_JOIN_ROOM'; data: { code: string; name: string } }
  | { event: 'DG_LEAVE_ROOM'; data?: undefined }
  | { event: 'DG_READY'; data: { ready: boolean } }
  | { event: 'DG_UPDATE_SETTINGS'; data: { settings: Partial<DrawGuessSettings> } }
  | { event: 'DG_KICK_PLAYER'; data: { playerId: PlayerId } }
  | { event: 'DG_START_GAME'; data?: undefined }
  | { event: 'DG_SELECT_WORD'; data: { word: string } }
  /** Ek hi text box guess + chat dono karta hai (jaisa asli Skribbl-style games me hota hai) —
   * server decide karta hai ye guess ban sakta hai ya seedha chat message hai. */
  | { event: 'DG_CHAT'; data: { text: string } }
  | { event: 'DG_STROKE'; data: DrawGuessStroke }
  | { event: 'DG_END_GAME'; data?: undefined }
  /** Game khatam (GAME_RESULTS) ke baad host same players ke saath lobby me wapas. */
  | { event: 'DG_RETURN_TO_LOBBY'; data?: undefined };

/** Server -> Browser. */
export type DrawGuessServerMessage =
  | { event: 'DG_ROOM_STATE'; data: DrawGuessRoomView | null }
  | { event: 'DG_GAME_VIEW'; data: DrawGuessGameView | null }
  | { event: 'DG_STROKE'; data: { playerId: PlayerId; stroke: DrawGuessStroke } }
  | { event: 'DG_CHAT_MESSAGE'; data: DrawGuessChatEntry }
  | { event: 'DG_ERROR'; data: { code: DrawGuessErrorCode; message: string } };
