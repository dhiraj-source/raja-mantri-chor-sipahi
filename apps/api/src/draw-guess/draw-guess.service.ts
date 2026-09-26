import { Injectable } from '@nestjs/common';
import {
  DrawGuessError,
  autoSelectWord as engineAutoSelectWord,
  beginNextTurn as engineBeginNextTurn,
  createGame,
  endTurn as engineEndTurn,
  getPlayerView,
  selectWord as engineSelectWord,
  setConnected as engineSetConnected,
  startGame as engineStartGame,
  submitGuess as engineSubmitGuess,
  validateCustomWords,
  type DrawGuessState,
  type RandomSource,
} from '@rmc/draw-guess-engine';
import {
  DEFAULT_DG_SETTINGS,
  DG_MAX_CHAT_LENGTH,
  DG_MAX_CUSTOM_WORDS,
  DG_MAX_PLAYERS,
  DG_MAX_ROOM_NAME_LENGTH,
  DG_MIN_PLAYERS,
  DG_ROOM_CODE_LENGTH,
  MAX_NAME_LENGTH,
  type DrawGuessChatEntry,
  type DrawGuessErrorCode,
  type DrawGuessGameView,
  type DrawGuessRoomView,
  type DrawGuessSettings,
  type PlayerId,
} from '@rmc/shared-types';
import { censor, isProfane } from './profanity';

/** Plain Omit union par distribute nahi karta (keyof union = intersection) — isliye ye alag type. */
type NewChatEntry = DrawGuessChatEntry extends infer E
  ? E extends DrawGuessChatEntry
    ? Omit<E, 'key' | 'at'>
    : never
  : never;

export class RoomError extends Error {
  constructor(
    public readonly code: DrawGuessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DrawGuessRoomError';
  }
}

interface RoomPlayer {
  id: PlayerId;
  name: string;
  ready: boolean;
}

interface Room {
  code: string;
  hostId: PlayerId;
  settings: DrawGuessSettings;
  players: RoomPlayer[];
  game: DrawGuessState | null;
  chat: DrawGuessChatEntry[];
  nextChatKey: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I jaise confusing characters nahi
const MAX_CHAT_HISTORY = 200;

/**
 * In-memory Draw & Guess rooms. RMCS ke `RoomsService` se bilkul alag map/state — is se koi
 * dependency nahi, RMCS ko chhoo tak nahi sakta. Wahi server-authoritative pattern: browser
 * sirf action bhejta hai, engine (@rmc/draw-guess-engine) result nikalta hai.
 */
@Injectable()
export class DrawGuessService {
  random: RandomSource = Math.random;
  now: () => number = Date.now;

  /** Turn khatam hua (result ke saath) — gateway isse turn ka agla timer schedule karta hai. */
  onTurnEnded: ((code: string) => void) | null = null;
  /** Ek turn shuru hua (word chun liya gaya) — gateway isse drawing timer schedule karta hai. */
  onTurnStarted: ((code: string) => void) | null = null;
  /** Naya turn (CHOOSING_WORD) shuru hua — gateway isse word-select timeout schedule karta hai. */
  onChoosingWord: ((code: string) => void) | null = null;
  /** Poora game khatam (GAME_RESULTS) — gateway ko batana taaki apna cleanup kar sake. */
  onGameFinished: ((code: string) => void) | null = null;
  /** Host ne start kiya (COUNTDOWN shuru) — gateway isse countdown timer schedule karta hai. */
  onGameStarted: ((code: string) => void) | null = null;

  private readonly rooms = new Map<string, Room>();
  private readonly roomOfPlayer = new Map<PlayerId, string>();
  private readonly disconnected = new Set<PlayerId>();

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------

  createRoom(playerId: PlayerId, rawName: string, rawSettings?: Partial<DrawGuessSettings>): string {
    const name = this.cleanName(rawName);
    this.assertNotInRoom(playerId);
    const settings = this.mergeSettings(DEFAULT_DG_SETTINGS, rawSettings);
    const code = this.generateCode();
    this.rooms.set(code, {
      code,
      hostId: playerId,
      settings,
      players: [{ id: playerId, name, ready: true }], // host apne aap ready
      game: null,
      chat: [],
      nextChatKey: 0,
    });
    this.roomOfPlayer.set(playerId, code);
    return code;
  }

  joinRoom(playerId: PlayerId, rawCode: string, rawName: string): string {
    const name = this.cleanName(rawName);
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (code.length !== DG_ROOM_CODE_LENGTH) throw new RoomError('INVALID_CODE', 'Room code galat hai.');
    this.assertNotInRoom(playerId);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ye room nahi mila.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
    if (room.players.length >= room.settings.maxPlayers) throw new RoomError('ROOM_FULL', 'Room full hai.');
    room.players.push({ id: playerId, name, ready: false });
    this.roomOfPlayer.set(playerId, code);
    this.pushSystem(room, `${name} joined the game`);
    return code;
  }

  /** Player room chhodta hai. Room ka code return hota hai (room bachi ho to), warna null. */
  leaveRoom(playerId: PlayerId): string | null {
    const code = this.roomOfPlayer.get(playerId);
    if (!code) return null;
    this.roomOfPlayer.delete(playerId);
    this.disconnected.delete(playerId);
    const room = this.rooms.get(code);
    if (!room) return null;

    const leaving = room.players.find((p) => p.id === playerId);
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return null;
    }
    if (room.hostId === playerId) {
      room.hostId = (room.players[0] as RoomPlayer).id; // host transfer
    }
    if (leaving) this.pushSystem(room, `${leaving.name} left the game`);

    // Game beech me chal raha ho aur drawer chala jaaye: turn safely khatam karo, game atakni nahi chahiye.
    if (room.game && room.game.phase !== 'FINISHED' && room.game.phase !== 'GAME_RESULTS') {
      room.game = engineSetConnected(room.game, playerId, false);
      if (room.game.drawerId === playerId && room.game.phase === 'DRAWING') {
        this.endTurn(code);
      }
    }
    return code;
  }

  setReady(playerId: PlayerId, ready: boolean): string {
    const room = this.requireRoom(playerId);
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.ready = ready;
    return room.code;
  }

  updateSettings(playerId: PlayerId, rawSettings: Partial<DrawGuessSettings>): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host settings badal sakta hai.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
    room.settings = this.mergeSettings(room.settings, rawSettings);
    return room.code;
  }

  kickPlayer(hostId: PlayerId, targetId: PlayerId): { code: string; kickedId: PlayerId } {
    const room = this.requireRoom(hostId);
    if (room.hostId !== hostId) throw new RoomError('NOT_HOST', 'Sirf host kick kar sakta hai.');
    if (targetId === hostId) throw new RoomError('PLAYER_NOT_FOUND', 'Khud ko kick nahi kar sakte.');
    if (!room.players.some((p) => p.id === targetId)) {
      throw new RoomError('PLAYER_NOT_FOUND', 'Ye player is room me nahi hai.');
    }
    this.roomOfPlayer.delete(targetId);
    this.disconnected.delete(targetId);
    const kicked = room.players.find((p) => p.id === targetId);
    room.players = room.players.filter((p) => p.id !== targetId);
    if (kicked) this.pushSystem(room, `${kicked.name} was removed by the host`);
    return { code: room.code, kickedId: targetId };
  }

  // ---------------------------------------------------------------------------
  // Game lifecycle. Timers (kab agla step chalega) gateway ke paas hain — service sirf
  // pure-ish state transitions karta hai aur gateway ko hooks se batata hai.
  // ---------------------------------------------------------------------------

  startGame(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host game shuru kar sakta hai.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game pehle se chal raha hai.');
    if (room.players.length < DG_MIN_PLAYERS) {
      throw new RoomError('NEED_MORE_PLAYERS', `Kam se kam ${DG_MIN_PLAYERS} players chahiye.`);
    }
    const notReady = room.players.some((p) => p.id !== room.hostId && !p.ready);
    if (notReady) throw new RoomError('NEED_MORE_PLAYERS', 'Sab players ready nahi hain.');

    const customValidation = validateCustomWords(room.settings.customWords);
    room.game = this.runEngine(() =>
      engineStartGame(
        createGame(room.players.map((p) => ({ id: p.id, name: p.name })), {
          config: {
            minPlayers: DG_MIN_PLAYERS,
            maxPlayers: DG_MAX_PLAYERS,
            totalRounds: room.settings.totalRounds,
            wordsToChoose: room.settings.wordsToChoose,
            drawTimeMs: room.settings.drawTimeMs,
            countdownMs: 3_000,
            wordSelectMs: 15_000,
            roundResultMs: 5_000,
            hintIntervalMs: 10_000,
            maxHintFraction: 0.5,
            guessTolerance: 'NORMALIZED',
          },
          customWords: customValidation.valid,
        }),
        this.now(),
      ),
    );
    this.pushSystem(room, 'Game started');
    this.onGameStarted?.(room.code);
    return room.code;
  }

  /** Countdown/round-result ke baad agla turn — gateway timer isse call karta hai. */
  beginNextTurn(code: string): void {
    const room = this.rooms.get(code);
    if (!room?.game) return;
    room.game = this.runEngine(() => engineBeginNextTurn(room.game as DrawGuessState, this.now(), this.random));
    if (room.game.phase === 'CHOOSING_WORD') {
      this.pushSystem(room, `Round ${room.game.round}: it's someone's turn to draw`);
      this.onChoosingWord?.(code);
    } else if (room.game.phase === 'GAME_RESULTS') {
      this.pushSystem(room, 'Game over!');
      this.onGameFinished?.(code);
    }
  }

  selectWord(playerId: PlayerId, rawWord: string): string {
    const room = this.requireRoom(playerId);
    const game = this.requireGame(room);
    const word = String(rawWord ?? '');
    room.game = this.runEngine(() => engineSelectWord(game, playerId, word, this.now(), this.random));
    this.onTurnStarted?.(room.code);
    return room.code;
  }

  /** Drawer time par nahi chunta — gateway (deadline par) ye call karta hai. */
  autoSelectWord(code: string): void {
    const room = this.rooms.get(code);
    if (!room?.game || room.game.phase !== 'CHOOSING_WORD') return;
    room.game = this.runEngine(() => engineAutoSelectWord(room.game as DrawGuessState, this.now(), this.random));
    this.onTurnStarted?.(code);
  }

  /**
   * Ek text box: pehle guess ki tarah try hota hai (agar player abhi guess kar sakta hai),
   * warna seedha chat message ban jaata hai. Kabhi bhi galat guess ka text asli word nahi ho
   * sakta (sahi hone par CORRECT_GUESS path se jaata hai, jisme text kabhi nahi bheja jaata).
   */
  chat(playerId: PlayerId, rawText: string): { code: string; correct: boolean; allGuessed: boolean } {
    const room = this.requireRoom(playerId);
    const text = String(rawText ?? '').trim().slice(0, DG_MAX_CHAT_LENGTH);
    if (!text) throw new RoomError('BAD_MESSAGE', 'Khaali message nahi bhej sakte.');
    const player = room.players.find((p) => p.id === playerId);
    const name = player?.name ?? '?';
    const game = room.game;

    const canGuess =
      game &&
      game.phase === 'DRAWING' &&
      game.drawerId !== playerId &&
      !game.correctGuessers.some((c) => c.playerId === playerId);

    if (canGuess) {
      const outcome = this.runEngine(() => engineSubmitGuess(game, playerId, text, this.now()));
      room.game = outcome.state;
      if (outcome.correct) {
        this.pushEntry(room, { kind: 'CORRECT_GUESS', playerId, name });
        if (outcome.allGuessed) this.endTurn(room.code);
        return { code: room.code, correct: true, allGuessed: outcome.allGuessed };
      }
    }

    // Guess nahi tha (ya guess ho hi nahi sakta tha abhi) — normal chat, profanity censor karke.
    const clean = isProfane(text) ? censor(text) : text;
    this.pushEntry(room, { kind: 'CHAT', playerId, name, text: clean });
    return { code: room.code, correct: false, allGuessed: false };
  }

  /** Timer khatam ho, sab guess kar chuke ho, ya drawer chala jaaye — turn safely khatam. */
  endTurn(code: string): void {
    const room = this.rooms.get(code);
    if (!room?.game || room.game.phase !== 'DRAWING') return;
    const { state, result } = engineEndTurn(room.game, this.now());
    room.game = state;
    this.pushSystem(room, `The word was: ${result.word}`);
    this.onTurnEnded?.(code);
  }

  /** Host game beech me hi khatam kar sakta hai. */
  forceEndGame(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host game khatam kar sakta hai.');
    if (!room.game) throw new RoomError('NO_GAME', 'Abhi koi game nahi chal raha.');
    if (room.game.phase === 'DRAWING') this.endTurn(room.code);
    room.game = null; // seedha lobby me wapas
    this.pushSystem(room, 'Host ended the game');
    return room.code;
  }

  /** Game khatam hone ke baad (ya host chahe to) room lobby me wapas, same players. */
  returnToLobby(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host lobby me wapas le ja sakta hai.');
    room.game = null;
    for (const p of room.players) p.ready = p.id === room.hostId;
    return room.code;
  }

  // ---------------------------------------------------------------------------
  // Presence
  // ---------------------------------------------------------------------------

  /**
   * Connection badli. Host khud disconnect ho jaaye to turant kisi aur connected player ko host
   * bana do (RMCS jaisa hi — host kabhi bhi gayab/gair-zimmedaar nahi rehna chahiye).
   */
  setConnected(playerId: PlayerId, connected: boolean): { code: string; hostChanged: boolean } | null {
    const code = this.roomOfPlayer.get(playerId);
    if (!code) return null;
    if (connected) this.disconnected.delete(playerId);
    else this.disconnected.add(playerId);
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.game) room.game = engineSetConnected(room.game, playerId, connected);

    let hostChanged = false;
    if (!connected && room.hostId === playerId) {
      const nextHost = room.players.find((p) => p.id !== playerId && !this.disconnected.has(p.id));
      if (nextHost) {
        room.hostId = nextHost.id;
        hostChanged = true;
        this.pushSystem(room, `${nextHost.name} is now the host`);
      }
    }
    return { code, hostChanged };
  }

  /** Drawer disconnect ho jaaye to turn turant khatam karo (game kabhi atakni nahi chahiye). */
  handleDrawerDisconnect(code: string, playerId: PlayerId): void {
    const room = this.rooms.get(code);
    if (room?.game?.phase === 'DRAWING' && room.game.drawerId === playerId) this.endTurn(code);
  }

  // ---------------------------------------------------------------------------
  // Views (client-facing) + lookups
  // ---------------------------------------------------------------------------

  getRoomView(code: string): DrawGuessRoomView | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    return {
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        connected: !this.disconnected.has(p.id),
        ready: p.ready,
      })),
      status: room.game ? 'IN_GAME' : 'LOBBY',
    };
  }

  getGameViewFor(playerId: PlayerId): DrawGuessGameView | null {
    const code = this.roomOfPlayer.get(playerId);
    const game = code ? this.rooms.get(code)?.game : null;
    return game ? getPlayerView(game, playerId, this.now()) : null;
  }

  getChatOf(code: string): DrawGuessChatEntry[] {
    return this.rooms.get(code)?.chat ?? [];
  }

  getPlayerIds(code: string): PlayerId[] {
    return this.rooms.get(code)?.players.map((p) => p.id) ?? [];
  }

  getRoomCodeOf(playerId: PlayerId): string | null {
    return this.roomOfPlayer.get(playerId) ?? null;
  }

  isDrawer(playerId: PlayerId): boolean {
    const code = this.roomOfPlayer.get(playerId);
    const room = code ? this.rooms.get(code) : null;
    return room?.game?.drawerId === playerId;
  }

  /** Abhi ka phase-deadline (COUNTDOWN/CHOOSING_WORD/DRAWING/ROUND_RESULTS ka turnEndsAt). Gateway isse timer schedule karta hai. */
  getTurnEndsAt(code: string): number | null {
    return this.rooms.get(code)?.game?.turnEndsAt ?? null;
  }

  getPhase(code: string): DrawGuessState['phase'] | null {
    return this.rooms.get(code)?.game?.phase ?? null;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private pushSystem(room: Room, text: string): void {
    this.pushEntry(room, { kind: 'SYSTEM', text });
  }

  private pushEntry(room: Room, entry: NewChatEntry): void {
    const full = { ...entry, key: room.nextChatKey++, at: this.now() } as DrawGuessChatEntry;
    room.chat.push(full);
    if (room.chat.length > MAX_CHAT_HISTORY) room.chat.shift();
  }

  private mergeSettings(base: DrawGuessSettings, raw?: Partial<DrawGuessSettings>): DrawGuessSettings {
    if (!raw) return { ...base };
    const roomName =
      typeof raw.roomName === 'string' ? raw.roomName.trim().slice(0, DG_MAX_ROOM_NAME_LENGTH) : base.roomName;
    const maxPlayers = this.clampInt(raw.maxPlayers, base.maxPlayers, DG_MIN_PLAYERS, DG_MAX_PLAYERS);
    const totalRounds = this.clampInt(raw.totalRounds, base.totalRounds, 1, 20);
    const wordsToChoose = this.clampInt(raw.wordsToChoose, base.wordsToChoose, 1, 5);
    const drawTimeMs = this.clampInt(raw.drawTimeMs, base.drawTimeMs, 15_000, 240_000);
    let customWords = base.customWords;
    if (Array.isArray(raw.customWords)) {
      const { valid } = validateCustomWords(raw.customWords.filter((w): w is string => typeof w === 'string'));
      customWords = valid
        .filter((w) => !isProfane(w))
        .slice(0, DG_MAX_CUSTOM_WORDS);
    }
    return { roomName, maxPlayers, totalRounds, wordsToChoose, drawTimeMs, customWords };
  }

  private clampInt(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.min(max, Math.max(min, n));
  }

  private requireRoom(playerId: PlayerId): Room {
    const code = this.roomOfPlayer.get(playerId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) throw new RoomError('NOT_IN_ROOM', 'Aap kisi room me nahi ho.');
    return room;
  }

  private requireGame(room: Room): DrawGuessState {
    if (!room.game) throw new RoomError('NO_GAME', 'Abhi koi game nahi chal raha.');
    return room.game;
  }

  private assertNotInRoom(playerId: PlayerId): void {
    if (this.roomOfPlayer.has(playerId)) throw new RoomError('ALREADY_IN_ROOM', 'Aap pehle se ek room me ho.');
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
      for (let i = 0; i < DG_ROOM_CODE_LENGTH; i++) {
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
      if (e instanceof DrawGuessError) throw new RoomError('GAME_RULE', e.message);
      throw e;
    }
  }
}
