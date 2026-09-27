/**
 * "Freeze Tag" — ek player IT hota hai jo baaki ko chhoo kar freeze karta hai; frozen player hil
 * nahi sakta par koi doosra active player use chhoo kar wapas zinda kar sakta hai. Round timer
 * khatam hone tak koi bacha rahe to players jeete, warna IT jeeta.
 *
 * Bomb Tag ki tarah is game me bhi koi chhupi jaankari nahi hai (sab sabko dikhta hai), isliye
 * ek hi shared view sabko jaata hai — per-player masking ki zaroorat nahi.
 */
import type { PlayerId } from './index';

export const FREEZE_TAG_PHASES = ['COUNTDOWN', 'PLAYING', 'ROUND_OVER'] as const;
export type FreezeTagPhase = (typeof FREEZE_TAG_PHASES)[number];

/** Har player match bhar ek hi rang rakhta hai (max 10 players = 10 rang). */
export const FREEZE_TAG_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7',
  '#f97316', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e',
] as const;

export const FT_MIN_PLAYERS = 2;
export const FT_MAX_PLAYERS = 10;
export const FT_ROOM_CODE_LENGTH = 5;
export const FT_MAX_ROOM_NAME_LENGTH = 30;

/** Player ki abhi ki haalat. Sirf ek player `IT` ho sakta hai. */
export const FREEZE_TAG_STATUSES = ['ACTIVE', 'IT', 'FROZEN'] as const;
export type FreezeTagStatus = (typeof FREEZE_TAG_STATUSES)[number];

/** Round kaun jeeta. */
export type FreezeTagWinner = 'IT' | 'PLAYERS';

export interface FreezeTagSettings {
  roomName: string;
  maxPlayers: number;
  /** Ek round kitna lamba (ms). */
  roundDurationMs: number;
}

export const DEFAULT_FT_SETTINGS: FreezeTagSettings = {
  roomName: '',
  maxPlayers: 8,
  roundDurationMs: 120_000,
};

export interface FreezeTagRoomPlayerView {
  id: PlayerId;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
}

export interface FreezeTagRoomView {
  code: string;
  hostId: PlayerId;
  settings: FreezeTagSettings;
  players: FreezeTagRoomPlayerView[];
  status: 'LOBBY' | 'IN_GAME';
}

/** Ek round ke stats — result screen ke liye. */
export interface FreezeTagPlayerStats {
  id: PlayerId;
  /** IT ne kitne players freeze kiye. */
  freezes: number;
  /** Is player ne kitne saathiyon ko unfreeze kiya. */
  unfreezes: number;
  /** Ye player kitni baar frozen hua. */
  timesFrozen: number;
  /** Round khatam hone par ye player frozen tha ya nahi. */
  frozenAtEnd: boolean;
}

/** Per-tick dynamic data — jitna chhota utna behtar (ye baar-baar jaata hai). */
export interface FreezeTagPlayerTick {
  id: PlayerId;
  x: number;
  y: number;
  status: FreezeTagStatus;
}

export interface FreezeTagGameView {
  phase: FreezeTagPhase;
  arenaWidth: number;
  arenaHeight: number;
  playerRadius: number;
  players: FreezeTagPlayerTick[];
  itId: PlayerId | null;
  /** Server epoch ms — client inhi se apna display-timer chalata hai, khud faisla kabhi nahi karta. */
  roundEndsAt: number | null;
  countdownEndsAt: number | null;
  /** Round khatam hone par hi bharta hai. */
  winner: FreezeTagWinner | null;
  stats: FreezeTagPlayerStats[];
}

export type FreezeTagErrorCode =
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
export type FreezeTagClientMessage =
  | { event: 'FT_CREATE_ROOM'; data: { name: string; settings?: Partial<FreezeTagSettings> } }
  | { event: 'FT_JOIN_ROOM'; data: { code: string; name: string } }
  | { event: 'FT_LEAVE_ROOM'; data?: undefined }
  | { event: 'FT_READY'; data: { ready: boolean } }
  | { event: 'FT_UPDATE_SETTINGS'; data: { settings: Partial<FreezeTagSettings> } }
  | { event: 'FT_KICK_PLAYER'; data: { playerId: PlayerId } }
  | { event: 'FT_START_GAME'; data?: undefined }
  /** Movement direction, -1..1 dono axes (server khud bhi clamp karta hai). */
  | { event: 'FT_INPUT'; data: { x: number; y: number } }
  | { event: 'FT_END_GAME'; data?: undefined }
  | { event: 'FT_RETURN_TO_LOBBY'; data?: undefined };

/** Server -> Browser. */
export type FreezeTagServerMessage =
  | { event: 'FT_ROOM_STATE'; data: FreezeTagRoomView | null }
  | { event: 'FT_GAME_VIEW'; data: FreezeTagGameView | null }
  | { event: 'FT_ERROR'; data: { code: FreezeTagErrorCode; message: string } };
