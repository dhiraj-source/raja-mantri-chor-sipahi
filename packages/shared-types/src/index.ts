/**
 * Shared types: server aur browser dono yahin se types lete hain.
 * Yahan koi game logic nahi hai, sirf naam aur shapes.
 */

export type PlayerId = string;

export const ROLES = ['RAJA', 'MANTRI', 'SIPAHI', 'CHOR'] as const;
export type Role = (typeof ROLES)[number];

/** Explicit game states (CLAUDE.md ke hisaab se). */
export const GAME_PHASES = [
  'LOBBY',
  'WAITING_FOR_PLAYERS',
  'READY',
  'STARTING',
  'ROUND_ACTIVE',
  'ROUND_RESULT',
  'NEXT_ROUND',
  'GAME_RESULT',
  'REMATCH',
  // Exceptional states
  'PLAYER_DISCONNECTED',
  'PLAYER_RECONNECTING',
  'PLAYER_LEFT',
  'VOTING',
  'GAME_CANCELLED',
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export interface PlayerInfo {
  id: PlayerId;
  name: string;
}

/** Ek round ka final, public result (round khatam hone ke baad sabko dikhta hai). */
export interface RoundResult {
  round: number;
  roles: Record<PlayerId, Role>;
  guessedChorId: PlayerId;
  guessCorrect: boolean;
  points: Record<PlayerId, number>;
}

/**
 * Ek player ko server jo dikhata hai. Secret roles yahan hide hote hain.
 * Browser sirf isi ko render karta hai; khud kuch calculate nahi karta.
 */
export interface PlayerGameView {
  phase: GamePhase;
  players: PlayerInfo[];
  totalRounds: number;
  currentRound: number;
  totals: Record<PlayerId, number>;
  /** Sirf wahi roles jo is player ko abhi dikhne chahiye. */
  visibleRoles: Record<PlayerId, Role>;
  myRole: Role | null;
  /** Mantri ko guess karna hai ya nahi (sirf Mantri ke liye true). */
  canGuess: boolean;
  /** Server decide karta hai; sirf GAME_RESULT me bhara hota hai (tie me ek se zyada). */
  winnerIds: PlayerId[];
  history: RoundResult[];
}

/** Client server ko sirf "action" bhejta hai; result server nikalta hai. */
export type ClientAction = { type: 'SUBMIT_GUESS'; guessedChorId: PlayerId };

// ---------------------------------------------------------------------------
// Accounts, progression
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS = [
  'FIRST_GAME',
  'FIRST_WIN',
  'WIN_5',
  'SHARP_MANTRI',
  'SLIPPERY_CHOR',
  'LEVEL_5',
] as const;
export type Achievement = (typeof ACHIEVEMENTS)[number];

// ---- Characters (avatars) aur shop. Catalog yahin, taaki server aur browser dono ek hi list dekhein. ----

export interface CharacterDef {
  id: string;
  emoji: string;
  /** Coins me daam (0 = free). */
  price: number;
  /** Kharidne ke liye kam se kam level. */
  minLevel: number;
}

export const DEFAULT_CHARACTER_ID = 'DEFAULT';

export const CHARACTERS = [
  { id: 'DEFAULT', emoji: '🙂', price: 0, minLevel: 1 },
  { id: 'CAT', emoji: '🐱', price: 10, minLevel: 1 },
  { id: 'LION', emoji: '🦁', price: 100, minLevel: 1 },
  { id: 'FOX', emoji: '🦊', price: 150, minLevel: 2 },
  { id: 'OWL', emoji: '🦉', price: 150, minLevel: 2 },
  { id: 'ROBOT', emoji: '🤖', price: 250, minLevel: 3 },
  { id: 'NINJA', emoji: '🥷', price: 300, minLevel: 4 },
  { id: 'DRAGON', emoji: '🐉', price: 500, minLevel: 5 },
] as const satisfies readonly CharacterDef[];

export type CharacterId = (typeof CHARACTERS)[number]['id'];

export function findCharacter(id: string): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export type ShopErrorCode =
  | 'UNKNOWN_ITEM'
  | 'ALREADY_OWNED'
  | 'NOT_OWNED'
  | 'NOT_ENOUGH_COINS'
  | 'LEVEL_TOO_LOW'
  | 'UNAUTHORIZED';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export interface GameHistoryEntry {
  id: string;
  playedAt: string;
  roomCode: string;
  points: number;
  isWinner: boolean;
  xpGained: number;
  coinsGained: number;
}

/** Account ka public/private profile (sirf khud user ko milta hai). */
export interface Profile {
  accountId: string;
  username: string;
  displayName: string;
  xp: number;
  level: number;
  /** Current level shuru hone ka XP aur agle level ka XP (progress bar ke liye). */
  levelStartXp: number;
  nextLevelXp: number;
  coins: number;
  gamesPlayed: number;
  wins: number;
  achievements: Achievement[];
  /** Khareede hue characters (DEFAULT hamesha shamil). */
  ownedCharacters: string[];
  equippedCharacter: string;
  history: GameHistoryEntry[];
}

/** Ek game khatam hone par is player ko kya mila (server ne calculate kiya). */
export interface GameReward {
  xpGained: number;
  coinsGained: number;
  level: number;
  leveledUp: boolean;
  newAchievements: Achievement[];
}

export interface FriendInfo {
  accountId: string;
  username: string;
  displayName: string;
  /** Kam se kam ek connected, logged-in socket. */
  online: boolean;
}

export interface FriendsOverview {
  friends: FriendInfo[];
  /** Mujhe aayi requests (accept/decline kar sakta hoon). */
  incoming: FriendInfo[];
  /** Meri bheji requests (cancel kar sakta hoon). */
  outgoing: FriendInfo[];
}

export const MAX_PENDING_OUTGOING_REQUESTS = 20;

export type FriendErrorCode =
  | 'FRIEND_NOT_FOUND'
  | 'FRIEND_SELF'
  | 'ALREADY_FRIENDS'
  | 'ALREADY_REQUESTED'
  | 'REQUEST_LIMIT'
  | 'UNAUTHORIZED';

export type AuthErrorCode =
  | 'INVALID_USERNAME'
  | 'INVALID_PASSWORD'
  | 'USERNAME_TAKEN'
  | 'BAD_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED';

export interface AuthResponse {
  authToken: string;
  profile: Profile;
}

// ---------------------------------------------------------------------------
// Rooms + WebSocket protocol. Message shape: { event, data }.
// ---------------------------------------------------------------------------

export const MAX_ROOM_PLAYERS = 4;
export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 20;

export interface RoomPlayerView {
  id: PlayerId;
  name: string;
  isHost: boolean;
  /** false = connection toota hai, player grace time me wapas aa sakta hai. */
  connected: boolean;
  /** Player ka pehna hua character id (guest ke liye DEFAULT). Server login se pata karta hai. */
  character: string;
  /** true = ye ek bot hai (koi asli insaan connected nahi). */
  isBot: boolean;
}

/** Disconnect vote: gayab player ka intezaar (WAIT) ya game cancel (CANCEL). */
export type VoteChoice = 'WAIT' | 'CANCEL';

export interface RoomVoteView {
  /** Jo players gayab hain (vote inhi ke baare me hai). */
  missingIds: PlayerId[];
  /** Jo vote de sakte hain. */
  eligibleIds: PlayerId[];
  votes: Record<PlayerId, VoteChoice>;
  /** Vote khatam hone me bacha waqt, ye message bhejte waqt ka (browser apni ghadi se ginti karta hai). */
  expiresInMs: number;
}

export interface RoomView {
  code: string;
  hostId: PlayerId;
  players: RoomPlayerView[];
  /** null = koi vote nahi chal raha. */
  vote: RoomVoteView | null;
  /** 'LOBBY' = game shuru nahi hua; 'IN_GAME' = game chal raha hai. */
  status: 'LOBBY' | 'IN_GAME';
}

export type RoomErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_CODE'
  | 'ALREADY_IN_ROOM'
  | 'NOT_IN_ROOM'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NEED_FULL_ROOM'
  | 'NO_GAME'
  | 'GAME_NOT_FINISHED'
  | 'RATE_LIMITED'
  | 'BAD_REACTION'
  | 'ALREADY_QUEUED'
  | 'NO_VOTE'
  | 'NOT_VOTER'
  | 'NOT_LOGGED_IN'
  | 'NOT_FRIENDS'
  | 'FRIEND_OFFLINE'
  | 'FRIEND_BUSY'
  | 'BOT_NOT_FOUND'
  | 'BAD_MESSAGE'
  | 'GAME_RULE';

/** Browser -> Server. */
export type ClientMessage =
  | { event: 'CREATE_ROOM'; data: { name: string } }
  | { event: 'JOIN_ROOM'; data: { code: string; name: string } }
  | { event: 'LEAVE_ROOM'; data?: undefined }
  | { event: 'START_GAME'; data?: undefined }
  | { event: 'SUBMIT_GUESS'; data: { guessedChorId: PlayerId } }
  | { event: 'NEXT_ROUND'; data?: undefined }
  | { event: 'REMATCH'; data?: undefined }
  | { event: 'REACTION'; data: { emoji: string } }
  | { event: 'QUICK_MATCH'; data: { name: string } }
  | { event: 'CANCEL_QUICK_MATCH'; data?: undefined }
  | { event: 'VOTE'; data: { choice: VoteChoice } }
  /** Akela (ya kam) player: room bana kar baaki seats bots se turant bhar kar game shuru. */
  | { event: 'PLAY_WITH_BOTS'; data: { name: string } }
  /** Lobby me khaali seat bot se bharo (sirf host, sirf LOBBY). */
  | { event: 'ADD_BOT'; data?: undefined }
  /** Ek bot ko room se hatao (sirf host, sirf LOBBY). */
  | { event: 'REMOVE_BOT'; data: { botId: PlayerId } }
  /** Dost ko apne room me bulao (login + lobby + dost online). */
  | { event: 'INVITE_FRIEND'; data: { accountId: string } }
  /** Login (HTTP) ke baad socket ko account se jodta hai. null = logout. */
  | { event: 'AUTHENTICATE'; data: { authToken: string | null } }
  /**
   * Voice chat (WebRTC) ka signaling. Server sirf relay karta hai (sirf usi room ke
   * player ko), `signal` ka andar kya hai server ko pata nahi hota (SDP offer/answer/ICE).
   */
  | { event: 'VOICE_SIGNAL'; data: { toPlayerId: PlayerId; signal: unknown } }
  /** Apna mute/unmute room ke baaki players ko batao. */
  | { event: 'VOICE_MUTE'; data: { muted: boolean } };

/** Room me bheji ja sakne wali reactions (server isi list se validate karta hai). */
export const REACTIONS = ['😂', '😡', '👏', '😱', '🤔', '❤️'] as const;
export type Reaction = (typeof REACTIONS)[number];
/** Ek player 1 reaction itne ms me ek hi bhej sakta hai. */
export const REACTION_COOLDOWN_MS = 1000;

/** Reconnect ke liye browser socket URL me ?token=... bhejta hai. */
export const RECONNECT_TOKEN_PARAM = 'token';

/** Server -> Browser. */
export type ServerMessage =
  /** token secret hai: sirf is player ko jata hai, reconnect ke liye. */
  | { event: 'CONNECTED'; data: { playerId: PlayerId; token: string } }
  | { event: 'ROOM_STATE'; data: RoomView | null }
  | { event: 'GAME_VIEW'; data: PlayerGameView | null }
  /** Room ke kisi player ki reaction (sirf usi room ko jati hai). */
  | { event: 'REACTION'; data: { playerId: PlayerId; emoji: Reaction } }
  /** Quick match queue: null = queue me nahi, warna abhi kaun-kaun wait kar raha hai. */
  | { event: 'QUEUE_STATE'; data: { size: number; names: string[] } | null }
  /** Dost ne room me bulaya. Join karne ke liye normal JOIN_ROOM chalta hai (server wahin sab check karta hai). */
  | { event: 'INVITE'; data: { fromName: string; roomCode: string } }
  /** Friends list badli (request, accept, unfriend, ya kisi dost ka online/offline): dobara fetch karo. */
  | { event: 'FRIENDS_CHANGED'; data?: undefined }
  /** Socket kis account se juda hai (null = guest). */
  | { event: 'AUTH_STATE'; data: { displayName: string } | null }
  /** Game khatam hone par server ne is (logged-in) player ko kya diya. */
  | { event: 'GAME_REWARD'; data: GameReward }
  /** Kisi player ne voice signal bheja (sirf usi room ko relay hota hai). */
  | { event: 'VOICE_SIGNAL'; data: { fromPlayerId: PlayerId; signal: unknown } }
  /** Kisi player ka mute/unmute (sirf usi room ko). */
  | { event: 'VOICE_MUTE'; data: { playerId: PlayerId; muted: boolean } }
  | { event: 'ERROR'; data: { code: RoomErrorCode; message: string } };
