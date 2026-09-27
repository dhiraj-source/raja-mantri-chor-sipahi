import { Injectable } from '@nestjs/common';
import {
  createGame,
  DEFAULT_FREEZE_TAG_CONFIG,
  FreezeTagError,
  getGameView,
  removePlayer as engineRemovePlayer,
  setInput as engineSetInput,
  tick as engineTick,
  type FreezeTagEvent,
  type FreezeTagState,
  type RandomSource,
} from '@rmc/freeze-tag-engine';
import {
  DEFAULT_FT_SETTINGS,
  FREEZE_TAG_COLORS,
  FT_MAX_PLAYERS,
  FT_MAX_ROOM_NAME_LENGTH,
  FT_MIN_PLAYERS,
  FT_ROOM_CODE_LENGTH,
  MAX_NAME_LENGTH,
  type FreezeTagErrorCode,
  type FreezeTagGameView,
  type FreezeTagPhase,
  type FreezeTagRoomView,
  type FreezeTagSettings,
  type PlayerId,
} from '@rmc/shared-types';

export class RoomError extends Error {
  constructor(
    public readonly code: FreezeTagErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FreezeTagRoomError';
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
  settings: FreezeTagSettings;
  players: RoomPlayer[];
  game: FreezeTagState | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I jaise confusing characters nahi

/**
 * In-memory Freeze Tag rooms. Baaki game modes ke rooms se koi dependency nahi (har mode ka apna
 * map). Server hi source of truth hai — engine positions/IT/frozen-state/timer sab decide karta
 * hai; browser sirf movement input bhejta hai. Client kabhi ye nahi keh sakta ki "maine X ko
 * freeze kiya" — collision server khud check karta hai.
 */
@Injectable()
export class FreezeTagService {
  random: RandomSource = Math.random;
  now: () => number = Date.now;

  /** Round khatam hua — gateway isse result-screen ke baad ka behaviour decide karta hai. */
  onRoundOver: ((code: string) => void) | null = null;

  private readonly rooms = new Map<string, Room>();
  private readonly roomOfPlayer = new Map<PlayerId, string>();
  private readonly disconnected = new Set<PlayerId>();

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------

  createRoom(playerId: PlayerId, rawName: string, rawSettings?: Partial<FreezeTagSettings>): string {
    const name = this.cleanName(rawName);
    this.assertNotInRoom(playerId);
    const settings = this.mergeSettings(DEFAULT_FT_SETTINGS, rawSettings);
    const code = this.generateCode();
    this.rooms.set(code, {
      code,
      hostId: playerId,
      settings,
      players: [{ id: playerId, name, color: FREEZE_TAG_COLORS[0], ready: true }],
      game: null,
    });
    this.roomOfPlayer.set(playerId, code);
    return code;
  }

  joinRoom(playerId: PlayerId, rawCode: string, rawName: string): string {
    const name = this.cleanName(rawName);
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (code.length !== FT_ROOM_CODE_LENGTH) throw new RoomError('INVALID_CODE', 'Room code galat hai.');
    this.assertNotInRoom(playerId);
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Ye room nahi mila.');
    if (room.game) throw new RoomError('GAME_IN_PROGRESS', 'Game shuru ho chuka hai.');
    if (room.players.length >= room.settings.maxPlayers) throw new RoomError('ROOM_FULL', 'Room full hai.');
    const color = FREEZE_TAG_COLORS[room.players.length % FREEZE_TAG_COLORS.length] as string;
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

    if (room.game && room.game.phase !== 'ROUND_OVER') {
      const { state, events } = engineRemovePlayer(room.game, playerId, this.now(), this.random);
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

  updateSettings(playerId: PlayerId, rawSettings: Partial<FreezeTagSettings>): string {
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
    if (room.game && room.game.phase !== 'ROUND_OVER') {
      const { state, events } = engineRemovePlayer(room.game, targetId, this.now(), this.random);
      room.game = state;
      this.notifyEvents(room.code, events);
    }
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
    if (room.players.length < FT_MIN_PLAYERS) {
      throw new RoomError('NEED_MORE_PLAYERS', `Kam se kam ${FT_MIN_PLAYERS} players chahiye.`);
    }
    if (room.players.some((p) => p.id !== room.hostId && !p.ready)) {
      throw new RoomError('NEED_MORE_PLAYERS', 'Sab players ready nahi hain.');
    }

    room.game = this.runEngine(() =>
      createGame(
        room.players.map((p) => ({ id: p.id, name: p.name })),
        this.now(),
        this.random,
        {
          config: {
            ...DEFAULT_FREEZE_TAG_CONFIG,
            minPlayers: FT_MIN_PLAYERS,
            maxPlayers: FT_MAX_PLAYERS,
            roundDurationMs: room.settings.roundDurationMs,
          },
        },
      ),
    );
    return room.code;
  }

  /** Movement input. Game na chal raha ho to chup-chaap ignore (engine frozen players ka input khud ignore karta hai). */
  setInput(playerId: PlayerId, x: number, y: number): void {
    const code = this.roomOfPlayer.get(playerId);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room?.game) return;
    room.game = engineSetInput(room.game, playerId, { x: this.clampAxis(x), y: this.clampAxis(y) });
  }

  /** Ek room ka tick (gateway ka global ticker har active room ke liye call karta hai). */
  tickRoom(code: string, dtMs: number): FreezeTagEvent[] {
    const room = this.rooms.get(code);
    if (!room?.game) return [];
    const result = engineTick(room.game, this.now(), dtMs);
    room.game = result.state;
    this.notifyEvents(code, result.events);
    return result.events;
  }

  /** Host round beech me hi khatam kar sakta hai. */
  forceEndGame(playerId: PlayerId): string {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('NOT_HOST', 'Sirf host game khatam kar sakta hai.');
    if (!room.game) throw new RoomError('NO_GAME', 'Abhi koi game nahi chal raha.');
    room.game = null;
    return room.code;
  }

  /** Result screen ke baad lobby me wapas (same players). */
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
   * Connection badli. Host disconnect ho to turant naya host. Round chal raha ho to player ko
   * round se nikaal diya jaata hai (Bomb Tag jaisa hi — real-time game me lamba grace theek nahi
   * baithta); IT tha to engine khud naya IT chun leta hai.
   */
  setConnected(playerId: PlayerId, connected: boolean): { code: string; hostChanged: boolean } | null {
    const code = this.roomOfPlayer.get(playerId);
    if (!code) return null;
    if (connected) this.disconnected.delete(playerId);
    else this.disconnected.add(playerId);
    const room = this.rooms.get(code);
    if (!room) return null;

    if (!connected && room.game && room.game.phase !== 'ROUND_OVER') {
      const { state, events } = engineRemovePlayer(room.game, playerId, this.now(), this.random);
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

  getRoomView(code: string): FreezeTagRoomView | null {
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
      })),
      status: room.game ? 'IN_GAME' : 'LOBBY',
    };
  }

  /** Koi per-viewer masking nahi (is game me kuch chhupa hi nahi) — sabko ek jaisa view. */
  getGameView(code: string): FreezeTagGameView | null {
    const room = this.rooms.get(code);
    return room?.game ? getGameView(room.game) : null;
  }

  getPlayerIds(code: string): PlayerId[] {
    return this.rooms.get(code)?.players.map((p) => p.id) ?? [];
  }

  getRoomCodeOf(playerId: PlayerId): string | null {
    return this.roomOfPlayer.get(playerId) ?? null;
  }

  getPhase(code: string): FreezeTagPhase | null {
    return this.rooms.get(code)?.game?.phase ?? null;
  }

  /** Global ticker ke liye: kaunse rooms abhi simulate karne hain (ROUND_OVER ko tick karne ki zaroorat nahi). */
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

  private notifyEvents(code: string, events: readonly FreezeTagEvent[]): void {
    for (const event of events) {
      if (event.type === 'ROUND_OVER') this.onRoundOver?.(code);
    }
  }

  private mergeSettings(base: FreezeTagSettings, raw?: Partial<FreezeTagSettings>): FreezeTagSettings {
    if (!raw) return { ...base };
    const roomName =
      typeof raw.roomName === 'string' ? raw.roomName.trim().slice(0, FT_MAX_ROOM_NAME_LENGTH) : base.roomName;
    const maxPlayers = this.clampInt(raw.maxPlayers, base.maxPlayers, FT_MIN_PLAYERS, FT_MAX_PLAYERS);
    const roundDurationMs = this.clampInt(raw.roundDurationMs, base.roundDurationMs, 30_000, 300_000);
    return { roomName, maxPlayers, roundDurationMs };
  }

  private clampInt(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.min(max, Math.max(min, n));
  }

  private clampAxis(n: unknown): number {
    const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
    return Math.min(1, Math.max(-1, v));
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
      for (let i = 0; i < FT_ROOM_CODE_LENGTH; i++) {
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
      if (e instanceof FreezeTagError) throw new RoomError('GAME_RULE', e.message);
      throw e;
    }
  }
}
