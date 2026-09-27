/**
 * "Bomb Tag" — fast real-time multiplayer arena game. RMCS/Draw & Guess se bilkul alag wire
 * protocol. Is game me koi chhupi hui jaankari nahi hai (RMCS ke roles ya DG ke secret word jaisa
 * kuch nahi) — isliye ek hi shared view sabko bhejte hain, per-player customize karne ki zaroorat
 * nahi.
 */
import type { PlayerId } from './index';

export const BOMB_TAG_PHASES = ['COUNTDOWN', 'PLAYING', 'ROUND_OVER', 'GAME_OVER'] as const;
export type BombTagPhase = (typeof BOMB_TAG_PHASES)[number];

/** Har player ko match bhar ek consistent rang milta hai (max 10 players = 10 rangon jitne). */
export const BOMB_TAG_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7',
  '#f97316', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e',
] as const;

export const BT_MIN_PLAYERS = 2;
export const BT_MAX_PLAYERS = 10;
export const BT_ROOM_CODE_LENGTH = 5;
export const BT_MAX_ROOM_NAME_LENGTH = 30;

export interface BombTagSettings {
  roomName: string;
  maxPlayers: number;
  bombDurationMs: number;
  roundsToWin: number;
}

export const DEFAULT_BT_SETTINGS: BombTagSettings = {
  roomName: '',
  maxPlayers: 8,
  bombDurationMs: 15_000,
  roundsToWin: 3,
};

export interface BombTagRoomPlayerView {
  id: PlayerId;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
}

export interface BombTagRoomView {
  code: string;
  hostId: PlayerId;
  settings: BombTagSettings;
  players: BombTagRoomPlayerView[];
  status: 'LOBBY' | 'IN_GAME';
}

/** Per-tick dynamic data — jitna chhota utna behtar (ye baar-baar bhejte hain). */
export interface BombTagPlayerTick {
  id: PlayerId;
  x: number;
  y: number;
  alive: boolean;
}

export interface BombTagGameView {
  phase: BombTagPhase;
  round: number;
  roundsToWin: number;
  arenaWidth: number;
  arenaHeight: number;
  playerRadius: number;
  players: BombTagPlayerTick[];
  bombHolderId: PlayerId | null;
  /** Server epoch ms — client isi se apna display-timer chalata hai, kabhi bhi khud faisla nahi karta. */
  bombEndsAt: number | null;
  countdownEndsAt: number | null;
  roundWinnerId: PlayerId | null;
  matchWinnerId: PlayerId | null;
}

export type BombTagErrorCode =
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

/** Browser -> Server. */
export type BombTagClientMessage =
  | { event: 'BT_CREATE_ROOM'; data: { name: string; settings?: Partial<BombTagSettings> } }
  | { event: 'BT_JOIN_ROOM'; data: { code: string; name: string } }
  | { event: 'BT_LEAVE_ROOM'; data?: undefined }
  | { event: 'BT_READY'; data: { ready: boolean } }
  | { event: 'BT_UPDATE_SETTINGS'; data: { settings: Partial<BombTagSettings> } }
  | { event: 'BT_KICK_PLAYER'; data: { playerId: PlayerId } }
  | { event: 'BT_START_GAME'; data?: undefined }
  /** Movement direction, normalized -1..1 dono axes me (server khud bhi clamp karta hai). */
  | { event: 'BT_INPUT'; data: { x: number; y: number } }
  | { event: 'BT_END_GAME'; data?: undefined }
  | { event: 'BT_RETURN_TO_LOBBY'; data?: undefined };

/** Server -> Browser. */
export type BombTagServerMessage =
  | { event: 'BT_ROOM_STATE'; data: BombTagRoomView | null }
  | { event: 'BT_GAME_VIEW'; data: BombTagGameView | null }
  | { event: 'BT_ERROR'; data: { code: BombTagErrorCode; message: string } };
