import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  GameEngineError,
  castVote,
  createGame,
  createVote,
  getPlayerView,
  getWinnerIds,
  nextRound,
  startGame,
  submitGuess,
  tallyVote,
  type GameState,
  type RandomSource,
  type VoteState,
} from '@rmc/game-engine';
import {
  DEFAULT_CHARACTER_ID,
  MAX_NAME_LENGTH,
  MAX_ROOM_PLAYERS,
  REACTIONS,
  REACTION_COOLDOWN_MS,
  ROOM_CODE_LENGTH,
  type PlayerGameView,
  type PlayerId,
  type PlayerInfo,
  type Reaction,
  type Role,
  type RoomErrorCode,
  type RoundResult,
  type RoomView,
  type VoteChoice,
} from '@rmc/shared-types';

/** Bots ke liye friendly naam. Room me takraav ho to aage number lag jata hai. */
const BOT_NAMES = [
  'Aryan', 'Meera', 'Rohan', 'Diya', 'Kabir', 'Isha', 'Vikram', 'Neha', 'Arjun', 'Priya',
];
/** Bot ka avatar (dukaan se khareedne ki zaroorat nahi, sirf dikhawe ke liye). */
const BOT_CHARACTER_ID = 'ROBOT';

/** Game poora khatam hone par (GAME_RESULT) ek baar bheja jata hai. */
export interface FinishedGame {
  roomCode: string;
  players: PlayerInfo[];
  history: readonly RoundResult[];
  totals: Readonly<Record<PlayerId, number>>;
  winnerIds: PlayerId[];
}

export class RoomError extends Error {
  constructor(
    public readonly code: RoomErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

interface Room {
  code: string;
  hostId: PlayerId;
  players: PlayerInfo[];
  game: GameState | null;
  /** Disconnect vote (game ke beech gayab player ke baare me). Timer gateway sambhalta hai. */
  vote: { state: VoteState; missing: PlayerId[]; endsAt: number } | null;
}

/** Vote ka nateeja. CANCEL me removed = jo gayab players room se hataye gaye. */
export interface VoteResolution {
  choice: VoteChoice;
  removed: PlayerId[];
}

// 0/O aur 1/I jaise confusing characters nahi.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * In-memory rooms. Server hi source of truth hai; GameState (secret roles) yahin rehti hai.
 * Restart par rooms chali jaati hain (Redis/DB baad ke phase me).
 */
@Injectable()
export class RoomsService {
  /** Tests me fixed random dene ke liye. */
  random: RandomSource = Math.random;
  /** Tests me fixed time dene ke liye. */
  now: () => number = Date.now;
  /** Game khatam hone par call hota hai (rewards/history ke liye). Rooms ko accounts ka pata nahi. */
  onGameFinished: ((game: FinishedGame) => void) | null = null;
  private readonly lastReactionAt = new Map<PlayerId, number>();

  private readonly rooms = new Map<string, Room>();
  private readonly roomOfPlayer = new Map<PlayerId, string>();
  /** Room me hain par abhi connected nahi (reconnect grace time). */
  private readonly disconnected = new Set<PlayerId>();
  /** Login kiye players ka pehna hua character (guest ka nahi: unka DEFAULT). Gateway bharta hai. */
  private readonly characterOf = new Map<PlayerId, string>();
  /** Kaun se PlayerIds bots hain (globally unique ids, isliye ek hi set kaafi hai). */
  private readonly bots = new Set<PlayerId>();
  /** Round ROUND_ACTIVE ho gaya: gateway ko bataata hai (bot Mantri ka auto-guess schedule karne ke liye). */
  onRoundStarted: ((code: string) => void) | null = null;

  /** Player ka avatar set/hatao (null = DEFAULT). Room ka naya view gateway broadcast karta hai. */
  setCharacter(playerId: PlayerId, characterId: string | null): void {
    if (characterId && characterId !== DEFAULT_CHARACTER_ID) this.characterOf.set(playerId, characterId);
    else this.characterOf.delete(playerId);
  }

  createRoom(playerId: PlayerId, rawName: string): string {
    const name = this.cleanName(rawName);
    this.assertNotInRoom(playerId);
    const code = this.generateCode();
    this.rooms.set(code, {
      code,
      hostId: playerId,
      players: [{ id: playerId, name }],
      game: null,
      vote: null,
    });
    this.roomOfPlayer.set(playerId, code);
    return code;
  }

  joinRoom(playerId: PlayerId, rawCode: string, rawName: string): string {
    const name = this.cleanName(rawName);
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH) {
      throw new RoomError('INVALID_CODE', 'Room code galat hai.');
    }
    this.assertNotInRoom(playerId);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ye room nahi mila.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
    if (room.players.length >= MAX_ROOM_PLAYERS) throw new RoomError('ROOM_FULL', 'Room full hai.');
    room.players.push({ id: playerId, name });
    this.roomOfPlayer.set(playerId, code);
    return code;
  }

  /**
   * Player room chhodta hai. Room ka code return hota hai (room bachi ho to), warna null.
   * Game ke beech koi jaye to game cancel, room lobby me wapas (aur koi vote chal raha ho to wo khatam).
   */
  leaveRoom(playerId: PlayerId): string | null {
    const code = this.roomOfPlayer.get(playerId);
    if (!code) return null;
    this.roomOfPlayer.delete(playerId);
    this.disconnected.delete(playerId);
    this.lastReactionAt.delete(playerId);
    const room = this.rooms.get(code);
    // (avatar yahan nahi hatate: player login se juda hai, room se nahi)
    if (!room) return null;

    room.players = room.players.filter((p) => p.id !== playerId);
    room.game = null;
    room.vote = null;
    // Koi insaan na bacha (sirf bots, ya bilkul khaali): room bekaar hai, saaf kar do.
    if (room.players.every((p) => this.bots.has(p.id))) {
      for (const p of room.players) this.forgetBot(p.id);
      this.rooms.delete(code);
      return null;
    }
    if (room.hostId === playerId) {
      // Host hamesha insaan hona chahiye (bot host game aage nahi badha sakta).
      const nextHost = room.players.find((p) => !this.bots.has(p.id));
      room.hostId = (nextHost ?? (room.players[0] as PlayerInfo)).id;
    }
    return code;
  }

  startGame(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host game shuru kar sakta hai.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game pehle se chal raha hai.');
    if (room.players.length !== MAX_ROOM_PLAYERS) {
      throw new RoomError('NEED_FULL_ROOM', `Game ke liye ${MAX_ROOM_PLAYERS} players chahiye.`);
    }
    room.game = this.runEngine(() => startGame(createGame(room.players), this.random));
    this.onRoundStarted?.(room.code); // ROUND_ACTIVE ho gaya: bot Mantri ho to auto-guess schedule ho
    return room.code;
  }

  submitGuess(playerId: PlayerId, guessedChorId: PlayerId): string {
    const room = this.requireRoom(playerId);
    const game = this.requireGame(room);
    room.game = this.runEngine(() => submitGuess(game, playerId, String(guessedChorId)));
    return room.code;
  }

  nextRound(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    const game = this.requireGame(room);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host agla round shuru kar sakta hai.');
    room.game = this.runEngine(() => nextRound(game, this.random));
    if (room.game.phase === 'GAME_RESULT') {
      room.vote = null; // game khatam, gayab player ka vote ab bekaar
      this.onGameFinished?.({
        roomCode: room.code,
        players: room.players.map((p) => ({ ...p })),
        history: room.game.history,
        totals: room.game.totals,
        winnerIds: getWinnerIds(room.game),
      });
    } else {
      this.onRoundStarted?.(room.code); // naya round ROUND_ACTIVE
    }
    return room.code;
  }

  // ---------------------------------------------------------------------------
  // Bots. Engine ko bot ka pata hi nahi chalta — ye sirf ek normal PlayerId hai.
  // ---------------------------------------------------------------------------

  isBot(playerId: PlayerId): boolean {
    return this.bots.has(playerId);
  }

  /**
   * Host khaali seat me bot daalta hai. Sirf LOBBY me, sirf host, room full na ho.
   * Naya bot id aur uska naam wapas milta hai (gateway broadcast karega).
   */
  addBot(hostId: PlayerId): { code: string; bot: PlayerInfo } {
    const room = this.requireRoom(hostId);
    if (room.hostId !== hostId) throw new RoomError('NOT_HOST', 'Sirf host bot add kar sakta hai.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
    if (room.players.length >= MAX_ROOM_PLAYERS) throw new RoomError('ROOM_FULL', 'Room full hai.');
    const bot = this.makeBot(room.players.map((p) => p.name));
    room.players.push(bot);
    this.bots.add(bot.id);
    this.characterOf.set(bot.id, BOT_CHARACTER_ID);
    this.roomOfPlayer.set(bot.id, room.code);
    return { code: room.code, bot };
  }

  /** Host bot ko room se hatata hai (sirf LOBBY). */
  removeBot(hostId: PlayerId, botId: PlayerId): string {
    const room = this.requireRoom(hostId);
    if (room.hostId !== hostId) throw new RoomError('NOT_HOST', 'Sirf host bot hata sakta hai.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
    if (!this.bots.has(botId) || !room.players.some((p) => p.id === botId)) {
      throw new RoomError('BOT_NOT_FOUND', 'Ye bot is room me nahi hai.');
    }
    room.players = room.players.filter((p) => p.id !== botId);
    this.forgetBot(botId);
    return room.code;
  }

  /**
   * Solo (ya kam) player: naya room banao, baaki seats bots se turant bharo, game shuru.
   * Room code return hota hai.
   */
  playWithBots(hostId: PlayerId, rawName: string): string {
    const code = this.createRoom(hostId, rawName);
    while ((this.rooms.get(code) as Room).players.length < MAX_ROOM_PLAYERS) {
      this.addBot(hostId);
    }
    return this.startGame(hostId);
  }

  /**
   * Abhi ROUND_ACTIVE ho to, aur Mantri bot ho, to uska guess options ke saath deta hai.
   * Gateway isse auto-guess schedule karne ke liye use karta hai. Warna null.
   */
  getBotMantriTask(code: string): { mantriId: PlayerId; options: PlayerId[] } | null {
    const room = this.rooms.get(code);
    const roles = room?.game?.roles;
    if (!room || room.game?.phase !== 'ROUND_ACTIVE' || !roles) return null;
    const mantriId = this.findByRole(roles, 'MANTRI');
    if (!mantriId || !this.bots.has(mantriId)) return null;
    const options = Object.keys(roles).filter((id) => roles[id] === 'SIPAHI' || roles[id] === 'CHOR');
    return { mantriId, options };
  }

  private findByRole(roles: Record<PlayerId, Role>, role: Role): PlayerId | null {
    return Object.keys(roles).find((id) => roles[id] === role) ?? null;
  }

  private makeBot(existingNames: readonly string[]): PlayerInfo {
    const free = BOT_NAMES.filter((n) => !existingNames.includes(`Bot ${n}`));
    const pool = free.length > 0 ? free : BOT_NAMES;
    const picked = pool[Math.floor(this.random() * pool.length)] as string;
    return { id: `bot-${randomUUID()}`, name: `Bot ${picked}` };
  }

  private forgetBot(botId: PlayerId): void {
    this.bots.delete(botId);
    this.characterOf.delete(botId);
    this.roomOfPlayer.delete(botId);
  }

  /** Game khatam (GAME_RESULT) ke baad host same players ke saath room ko lobby me wapas laata hai. */
  rematch(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    const game = this.requireGame(room);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host rematch shuru kar sakta hai.');
    if (game.phase !== 'GAME_RESULT') {
      throw new RoomError('GAME_NOT_FINISHED', 'Game abhi khatam nahi hua.');
    }
    room.game = null;
    room.vote = null;
    return room.code;
  }

  // ---------------------------------------------------------------------------
  // Disconnect vote. Rules engine me hain (voting.ts); yahan room ka state aur nateeja lagu hota hai.
  // ---------------------------------------------------------------------------

  /** Vote tab khul sakta hai jab game chal raha ho, koi vote na ho, aur kam se kam 1 connected + 1 gayab player ho. */
  canOpenVote(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room || !room.game || room.game.phase === 'GAME_RESULT' || room.vote) return false;
    const away = room.players.filter((p) => this.disconnected.has(p.id)).length;
    return away >= 1 && room.players.length - away >= 1;
  }

  /** Vote kholo: voters = abhi connected players, missing = abhi gayab players. */
  openVote(code: string, durationMs: number): boolean {
    if (!this.canOpenVote(code)) return false;
    const room = this.rooms.get(code) as Room;
    const eligible = room.players.filter((p) => !this.disconnected.has(p.id)).map((p) => p.id);
    const missing = room.players.filter((p) => this.disconnected.has(p.id)).map((p) => p.id);
    room.vote = { state: createVote(eligible), missing, endsAt: this.now() + durationMs };
    return true;
  }

  hasVote(code: string): boolean {
    return this.rooms.get(code)?.vote != null;
  }

  /** Room ke abhi gayab players. */
  getDisconnectedIds(code: string): PlayerId[] {
    return (this.rooms.get(code)?.players ?? []).filter((p) => this.disconnected.has(p.id)).map((p) => p.id);
  }

  /**
   * Vote do. Faisla ho gaya (majority) to turant lagu; warna null (vote abhi khula hai).
   */
  castVote(playerId: PlayerId, choice: VoteChoice): { code: string; resolution: VoteResolution | null } {
    const room = this.requireRoom(playerId);
    if (!room.vote) throw new RoomError('NO_VOTE', 'Abhi koi vote nahi chal raha.');
    if (!room.vote.state.eligible.includes(playerId)) {
      throw new RoomError('NOT_VOTER', 'Aap is vote me vote nahi de sakte.');
    }
    const state = this.runEngine(() => castVote((room.vote as NonNullable<Room['vote']>).state, playerId, choice));
    room.vote.state = state;
    const outcome = tallyVote(state);
    return { code: room.code, resolution: outcome === 'OPEN' ? null : this.resolveVote(room.code, outcome) };
  }

  /**
   * Vote khatam. CANCEL: gayab players room se hatte hain aur game cancel (room lobby me).
   * WAIT: kuch nahi hatta. Vote nahi khula tha to null.
   */
  resolveVote(code: string, choice: VoteChoice): VoteResolution | null {
    const room = this.rooms.get(code);
    if (!room?.vote) return null;
    const missing = room.vote.missing;
    room.vote = null;
    const removed: PlayerId[] = [];
    if (choice === 'CANCEL') {
      for (const id of missing) {
        if (this.disconnected.has(id) && this.roomOfPlayer.get(id) === code) {
          this.leaveRoom(id);
          removed.push(id);
        }
      }
    }
    return { choice, removed };
  }

  /**
   * Room ke saathiyon me reaction. Validate + rate limit. Room code return hota hai.
   * Reactions ek hi room tak jaati hain; game state par koi asar nahi.
   */
  reaction(playerId: PlayerId, emoji: unknown): { code: string; emoji: Reaction } {
    const room = this.requireRoom(playerId);
    if (!REACTIONS.includes(emoji as Reaction)) {
      throw new RoomError('BAD_REACTION', 'Ye reaction allowed nahi hai.');
    }
    const now = this.now();
    const last = this.lastReactionAt.get(playerId);
    if (last !== undefined && now - last < REACTION_COOLDOWN_MS) {
      throw new RoomError('RATE_LIMITED', 'Thoda ruko, bahut jaldi reactions.');
    }
    this.lastReactionAt.set(playerId, now);
    return { code: room.code, emoji: emoji as Reaction };
  }

  /** Connection toot-ne / wapas aane par presence update. Room me na ho to kuch nahi. */
  setConnected(playerId: PlayerId, connected: boolean): void {
    const code = this.roomOfPlayer.get(playerId);
    if (!code) return;
    if (!connected) {
      this.disconnected.add(playerId);
      return;
    }
    this.disconnected.delete(playerId);
    // Gayab player wapas aa gaya: vote se hata do; koi gayab nahi bacha to vote bekaar.
    const vote = this.rooms.get(code)?.vote;
    if (vote) {
      vote.missing = vote.missing.filter((id) => id !== playerId);
      if (vote.missing.length === 0) (this.rooms.get(code) as Room).vote = null;
    }
  }

  getRoomView(code: string): RoomView | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    return {
      code: room.code,
      hostId: room.hostId,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        connected: !this.disconnected.has(p.id),
        character: this.characterOf.get(p.id) ?? DEFAULT_CHARACTER_ID,
        isBot: this.bots.has(p.id),
      })),
      vote: room.vote
        ? {
            missingIds: [...room.vote.missing],
            eligibleIds: [...room.vote.state.eligible],
            votes: { ...room.vote.state.votes },
            expiresInMs: Math.max(0, room.vote.endsAt - this.now()),
          }
        : null,
      status: room.game ? 'IN_GAME' : 'LOBBY',
    };
  }

  getPlayerIds(code: string): PlayerId[] {
    return this.rooms.get(code)?.players.map((p) => p.id) ?? [];
  }

  /** Is player ke liye safe game view (secret roles hidden). */
  getGameViewFor(playerId: PlayerId): PlayerGameView | null {
    const code = this.roomOfPlayer.get(playerId);
    const game = code ? this.rooms.get(code)?.game : null;
    return game ? getPlayerView(game, playerId) : null;
  }

  getRoomCodeOf(playerId: PlayerId): string | null {
    return this.roomOfPlayer.get(playerId) ?? null;
  }

  private requireRoom(playerId: PlayerId): Room {
    const code = this.roomOfPlayer.get(playerId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) throw new RoomError('NOT_IN_ROOM', 'Aap kisi room me nahi ho.');
    return room;
  }

  private requireGame(room: Room): GameState {
    if (!room.game) throw new RoomError('NO_GAME', 'Abhi koi game nahi chal raha.');
    return room.game;
  }

  private assertNotInRoom(playerId: PlayerId): void {
    if (this.roomOfPlayer.has(playerId)) {
      throw new RoomError('ALREADY_IN_ROOM', 'Aap pehle se ek room me ho.');
    }
  }

  /** Naam trim karke wapas deta hai, galat ho to INVALID_NAME. */
  validateName(raw: string): string {
    return this.cleanName(raw);
  }

  private cleanName(raw: string): string {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
      throw new RoomError('INVALID_NAME', `Naam 1 se ${MAX_NAME_LENGTH} characters ka hona chahiye.`);
    }
    return name;
  }

  private generateCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Engine ke errors ko RoomError me badalta hai. */
  private runEngine<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof GameEngineError) throw new RoomError('GAME_RULE', e.message);
      throw e;
    }
  }
}
