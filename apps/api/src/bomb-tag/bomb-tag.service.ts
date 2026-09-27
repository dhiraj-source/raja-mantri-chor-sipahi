import { Injectable } from '@nestjs/common';
import {
  BombTagError,
  createGame,
  DEFAULT_BOMB_TAG_CONFIG,
  forfeit as engineForfeit,
  getGameView,
  setInput as engineSetInput,
  startNextRound as engineStartNextRound,
  tick as engineTick,
  type BombTagEvent,
  type BombTagState,
  type RandomSource,
} from '@rmc/bomb-tag-engine';
import {
  BOMB_TAG_COLORS,
  BT_MAX_PLAYERS,
  BT_MAX_ROOM_NAME_LENGTH,
  BT_MIN_PLAYERS,
  BT_ROOM_CODE_LENGTH,
  DEFAULT_BT_SETTINGS,
  MAX_NAME_LENGTH,
  type BombTagErrorCode,
  type BombTagGameView,
  type BombTagPhase,
  type BombTagRoomView,
  type BombTagSettings,
  type PlayerId,
} from '@rmc/shared-types';

export class RoomError extends Error {
  constructor(
    public readonly code: BombTagErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BombTagRoomError';
  }
}

interface RoomPlayer {
  id: PlayerId;
  name: string;
  color: string;
  ready: boolean;
}

interface Room {
  code: string;
  hostId: PlayerId;
  settings: BombTagSettings;
  players: RoomPlayer[];
  game: BombTagState | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I jaise confusing characters nahi

/**
 * In-memory Bomb Tag rooms. RMCS/Draw & Guess ke rooms se koi dependency nahi. Server hi source
 * of truth hai — engine positions/bomb/timer sab calculate karta hai, browser sirf input bhejta hai.
 */
@Injectable()
export class BombTagService {
  random: RandomSource = Math.random;
  now: () => number = Date.now;

  /** Round/match khatam hua — gateway isse agla timer schedule karta hai. */
  onRoundOver: ((code: string) => void) | null = null;
  onGameOver: ((code: string) => void) | null = null;

  private readonly rooms = new Map<string, Room>();
  private readonly roomOfPlayer = new Map<PlayerId, string>();
  private readonly disconnected = new Set<PlayerId>();

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------

  createRoom(playerId: PlayerId, rawName: string, rawSettings?: Partial<BombTagSettings>): string {
    const name = this.cleanName(rawName);
    this.assertNotInRoom(playerId);
    const settings = this.mergeSettings(DEFAULT_BT_SETTINGS, rawSettings);
    const code = this.generateCode();
    this.rooms.set(code, {
      code,
      hostId: playerId,
      settings,
      players: [{ id: playerId, name, color: BOMB_TAG_COLORS[0], ready: true }],
      game: null,
    });
    this.roomOfPlayer.set(playerId, code);
    return code;
  }

  joinRoom(playerId: PlayerId, rawCode: string, rawName: string): string {
    const name = this.cleanName(rawName);
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (code.length !== BT_ROOM_CODE_LENGTH) throw new RoomError('INVALID_CODE', 'Room code galat hai.');
    this.assertNotInRoom(playerId);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ye room nahi mila.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
    if (room.players.length >= room.settings.maxPlayers) throw new RoomError('ROOM_FULL', 'Room full hai.');
    const color = BOMB_TAG_COLORS[room.players.length % BOMB_TAG_COLORS.length] as string;
    room.players.push({ id: playerId, name, color, ready: false });
    this.roomOfPlayer.set(playerId, code);
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

    if (room.game && room.game.phase !== 'GAME_OVER') {
      const { state, events } = engineForfeit(room.game, playerId, this.now(), this.random);
      room.game = state;
      this.notifyEvents(code, events);
    }
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return null;
    }
    if (room.hostId === playerId) {
      room.hostId = (room.players[0] as RoomPlayer).id;
    }
    return code;
  }

  setReady(playerId: PlayerId, ready: boolean): string {
    const room = this.requireRoom(playerId);
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.ready = ready;
    return room.code;
  }

  updateSettings(playerId: PlayerId, rawSettings: Partial<BombTagSettings>): string {
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
    room.players = room.players.filter((p) => p.id !== targetId);
    return { code: room.code, kickedId: targetId };
  }

  // ---------------------------------------------------------------------------
  // Game lifecycle
  // ---------------------------------------------------------------------------

  startGame(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host game shuru kar sakta hai.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game pehle se chal raha hai.');
    if (room.players.length < BT_MIN_PLAYERS) {
      throw new RoomError('NEED_MORE_PLAYERS', `Kam se kam ${BT_MIN_PLAYERS} players chahiye.`);
    }
    const notReady = room.players.some((p) => p.id !== room.hostId && !p.ready);
    if (notReady) throw new RoomError('NEED_MORE_PLAYERS', 'Sab players ready nahi hain.');

    room.game = this.runEngine(() =>
      createGame(
        room.players.map((p) => ({ id: p.id, name: p.name })),
        this.now(),
        this.random,
        {
          config: {
            ...DEFAULT_BOMB_TAG_CONFIG,
            minPlayers: BT_MIN_PLAYERS,
            maxPlayers: BT_MAX_PLAYERS,
            bombDurationMs: room.settings.bombDurationMs,
            roundsToWin: room.settings.roundsToWin,
          },
        },
      ),
    );
    return room.code;
  }

  /** Player ka movement input. Alive na ho ya game PLAYING me na ho to chup-chaap ignore. */
  setInput(playerId: PlayerId, x: number, y: number): void {
    const code = this.roomOfPlayer.get(playerId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room?.game) return;
    room.game = engineSetInput(room.game, playerId, { x: this.clampAxis(x), y: this.clampAxis(y) });
  }

  private clampAxis(n: unknown): number {
    const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
    return Math.min(1, Math.max(-1, v));
  }

  /**
   * Ek room ka tick chalata hai (gateway ka global ticker isse har room ke liye call karta hai).
   * Naya game-view + events return karta hai (gateway inhi se broadcast/timers decide karta hai).
   */
  tickRoom(code: string, dtMs: number): BombTagEvent[] {
    const room = this.rooms.get(code);
    if (!room?.game) return [];
    const result = engineTick(room.game, this.now(), dtMs);
    room.game = result.state;
    this.notifyEvents(code, result.events);
    return result.events;
  }

  /** Round-result screen ke baad agla round (ROUND_OVER se hi chalta hai). */
  startNextRound(code: string): void {
    const room = this.rooms.get(code);
    if (!room?.game || room.game.phase !== 'ROUND_OVER') return;
    room.game = this.runEngine(() => engineStartNextRound(room.game as BombTagState, this.now(), this.random));

    // Naya round engine ke fixed match-roster ke har player ko wapas "alive" bana deta hai (engine
    // ko "chhod diya" ya "disconnected" jaisi cheezein pata hi nahi hoti) — jo player room chhod
    // chuka hai ya abhi bhi disconnected hai use turant dobara forfeit karo, warna wo agle round
    // me bina control ke "bhoot" ki tarah arena me khada reh jaata.
    const stillHere = new Set(room.players.map((p) => p.id));
    for (const playerId of room.game.playerOrder) {
      if (room.game.phase === 'GAME_OVER') break;
      if (stillHere.has(playerId) && !this.disconnected.has(playerId)) continue;
      const { state, events } = engineForfeit(room.game, playerId, this.now(), this.random);
      room.game = state;
      this.notifyEvents(code, events);
    }
  }

  /** Engine ke events se gateway ko round/match khatam hone ki khabar. */
  private notifyEvents(code: string, events: readonly BombTagEvent[]): void {
    for (const event of events) {
      if (event.type === 'ROUND_OVER') this.onRoundOver?.(code);
      if (event.type === 'GAME_OVER') this.onGameOver?.(code);
    }
  }

  /** Host game beech me hi khatam kar sakta hai. */
  forceEndGame(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host game khatam kar sakta hai.');
    if (!room.game) throw new RoomError('NO_GAME', 'Abhi koi game nahi chal raha.');
    room.game = null;
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
   * Connection badli. Host disconnect ho to turant naya host. Game active ho aur player abhi
   * alive ho to turant "forfeit" (RMCS/DG jaisa grace-time yahan jaan-boojh kar nahi hai — bomb
   * ka timer khud ~15s ka hai, lamba grace is fast-paced game ke liye theek nahi baithta).
   */
  setConnected(playerId: PlayerId, connected: boolean): { code: string; hostChanged: boolean } | null {
    const code = this.roomOfPlayer.get(playerId);
    if (!code) return null;
    if (connected) this.disconnected.delete(playerId);
    else this.disconnected.add(playerId);
    const room = this.rooms.get(code);
    if (!room) return null;

    if (!connected && room.game && room.game.phase !== 'GAME_OVER') {
      const { state, events } = engineForfeit(room.game, playerId, this.now(), this.random);
      room.game = state;
      this.notifyEvents(code, events);
    }

    let hostChanged = false;
    if (!connected && room.hostId === playerId) {
      const nextHost = room.players.find((p) => p.id !== playerId && !this.disconnected.has(p.id));
      if (nextHost) {
        room.hostId = nextHost.id;
        hostChanged = true;
      }
    }
    return { code, hostChanged };
  }

  // ---------------------------------------------------------------------------
  // Views + lookups
  // ---------------------------------------------------------------------------

  getRoomView(code: string): BombTagRoomView | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    return {
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isHost: p.id === room.hostId,
        connected: !this.disconnected.has(p.id),
        ready: p.ready,
        score: room.game?.players[p.id]?.score ?? 0,
      })),
      status: room.game ? 'IN_GAME' : 'LOBBY',
    };
  }

  /** Koi per-viewer masking nahi (is game me kuch chhupa hi nahi hai) — sabko ek jaisa view. */
  getGameView(code: string): BombTagGameView | null {
    const room = this.rooms.get(code);
    return room?.game ? getGameView(room.game) : null;
  }

  getPlayerIds(code: string): PlayerId[] {
    return this.rooms.get(code)?.players.map((p) => p.id) ?? [];
  }

  getRoomCodeOf(playerId: PlayerId): string | null {
    return this.roomOfPlayer.get(playerId) ?? null;
  }

  getPhase(code: string): BombTagPhase | null {
    return this.rooms.get(code)?.game?.phase ?? null;
  }

  /** Global ticker ke liye: kaunse rooms ka simulation abhi chalta hai (ROUND_OVER/GAME_OVER ko tick karne ki zaroorat nahi). */
  getTickableRoomCodes(): string[] {
    const codes: string[] = [];
    for (const [code, room] of this.rooms) {
      if (room.game && (room.game.phase === 'COUNTDOWN' || room.game.phase === 'PLAYING')) codes.push(code);
    }
    return codes;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private mergeSettings(base: BombTagSettings, raw?: Partial<BombTagSettings>): BombTagSettings {
    if (!raw) return { ...base };
    const roomName = typeof raw.roomName === 'string' ? raw.roomName.trim().slice(0, BT_MAX_ROOM_NAME_LENGTH) : base.roomName;
    const maxPlayers = this.clampInt(raw.maxPlayers, base.maxPlayers, BT_MIN_PLAYERS, BT_MAX_PLAYERS);
    const bombDurationMs = this.clampInt(raw.bombDurationMs, base.bombDurationMs, 5_000, 60_000);
    const roundsToWin = this.clampInt(raw.roundsToWin, base.roundsToWin, 1, 10);
    return { roomName, maxPlayers, bombDurationMs, roundsToWin };
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
      for (let i = 0; i < BT_ROOM_CODE_LENGTH; i++) {
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
      if (e instanceof BombTagError) throw new RoomError('GAME_RULE', e.message);
      throw e;
    }
  }
}
