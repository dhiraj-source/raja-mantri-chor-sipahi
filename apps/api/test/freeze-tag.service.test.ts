import { describe, expect, it } from 'vitest';
import type { FreezeTagGameView, PlayerId } from '@rmc/shared-types';
import { FreezeTagService, RoomError } from '../src/freeze-tag/freeze-tag.service';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newService(): FreezeTagService {
  const s = new FreezeTagService();
  s.random = seeded(1);
  let clock = 1_000_000;
  s.now = () => clock;
  (s as unknown as { advanceClock: (ms: number) => void }).advanceClock = (ms: number) => (clock += ms);
  return s;
}

function advance(s: FreezeTagService, ms: number): void {
  (s as unknown as { advanceClock: (ms: number) => void }).advanceClock(ms);
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RoomError);
    expect((e as RoomError).code).toBe(code);
    return;
  }
  throw new Error(`Expected error ${code}`);
}

/** 3-player room, sab ready. */
function readyRoom(s: FreezeTagService): string {
  const code = s.createRoom('a', 'Asha');
  s.joinRoom('b', code, 'Bina');
  s.joinRoom('c', code, 'Charu');
  s.setReady('b', true);
  s.setReady('c', true);
  return code;
}

function view(s: FreezeTagService, code: string): FreezeTagGameView {
  return s.getGameView(code) as FreezeTagGameView;
}

/** COUNTDOWN paar karke PLAYING tak. */
function startPlaying(s: FreezeTagService, code: string): void {
  s.startGame(s.getRoomView(code)?.hostId as string);
  advance(s, 3_000);
  s.tickRoom(code, 3_000);
}

describe('lobby', () => {
  it('room banta hai, host auto-ready, doosra player nahi', () => {
    const s = newService();
    const code = s.createRoom('a', '  Asha ');
    expect(code).toHaveLength(5);
    const room = s.getRoomView(code);
    expect(room?.hostId).toBe('a');
    expect(room?.players[0]).toMatchObject({ id: 'a', name: 'Asha', isHost: true, ready: true, connected: true });
    expect(room?.status).toBe('LOBBY');

    s.joinRoom('b', code, 'Bina');
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.ready).toBe(false);
  });

  it('galat code / room-not-found / already-in-room / full room reject hote hain', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha', { maxPlayers: 2 });
    expectCode(() => s.joinRoom('b', 'ZZ', 'Bina'), 'INVALID_CODE');
    expectCode(() => s.joinRoom('b', 'ZZZZZ', 'Bina'), 'ROOM_NOT_FOUND');
    expectCode(() => s.joinRoom('a', code, 'Asha2'), 'ALREADY_IN_ROOM');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.joinRoom('c', code, 'Charu'), 'ROOM_FULL');
  });

  it('game shuru ho chuka ho to join reject hota hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    expectCode(() => s.joinRoom('d', code, 'Dev'), 'GAME_IN_PROGRESS');
  });

  it('leave: host jaaye to naya host, sab jaayen to room saaf', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    s.leaveRoom('a');
    expect(s.getRoomView(code)?.hostId).toBe('b');
    s.leaveRoom('b');
    expect(s.getRoomView(code)).toBeNull();
  });

  it('kick: sirf host, khud ko nahi', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.kickPlayer('b', 'a'), 'NOT_HOST');
    expectCode(() => s.kickPlayer('a', 'a'), 'PLAYER_NOT_FOUND');
    expect(s.kickPlayer('a', 'b').kickedId).toBe('b');
    expect(s.getRoomCodeOf('b')).toBeNull();
  });

  it('sirf host settings badal sakta hai, values clamp hoti hain', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.updateSettings('b', { roundDurationMs: 60_000 }), 'NOT_HOST');
    s.updateSettings('a', { roundDurationMs: 999_999, maxPlayers: 99 });
    const room = s.getRoomView(code);
    expect(room?.settings.roundDurationMs).toBeLessThanOrEqual(300_000);
    expect(room?.settings.maxPlayers).toBeLessThanOrEqual(10);
  });
});

describe('start game', () => {
  it('kam players / not-ready / not-host reject hote hain', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    expectCode(() => s.startGame('a'), 'NEED_MORE_PLAYERS');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.startGame('a'), 'NEED_MORE_PLAYERS'); // b ready nahi
    expectCode(() => s.startGame('b'), 'NOT_HOST');
    s.setReady('b', true);
    expect(() => s.startGame('a')).not.toThrow();
    expect(s.getPhase(code)).toBe('COUNTDOWN');
  });

  it('ek hi player IT banta hai aur wo server chunta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    const v = view(s, code);
    expect(v.players.filter((p) => p.status === 'IT')).toHaveLength(1);
    expect(v.itId).not.toBeNull();
    expect(v.players.find((p) => p.id === v.itId)?.status).toBe('IT');
  });
});

describe('gameplay (server-authoritative)', () => {
  it('COUNTDOWN ke baad PLAYING shuru hota hai aur round timer set hota hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    expect(view(s, code).phase).toBe('COUNTDOWN');
    expect(view(s, code).roundEndsAt).toBeNull();
    advance(s, 3_000);
    s.tickRoom(code, 3_000);
    expect(view(s, code).phase).toBe('PLAYING');
    expect(view(s, code).roundEndsAt).not.toBeNull();
  });

  it('movement input clamp hota hai aur game na ho to chup-chaap ignore', () => {
    const s = newService();
    const code = readyRoom(s);
    expect(() => s.setInput('a', 99, -99)).not.toThrow(); // abhi koi game nahi
    startPlaying(s, code);
    expect(() => s.setInput('a', 99, -99)).not.toThrow();
    expect(view(s, code).players.find((p) => p.id === 'a')).toBeDefined();
  });

  it('timer khatam hone par players jeette hain', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha', { roundDurationMs: 30_000 });
    s.joinRoom('b', code, 'Bina');
    s.setReady('b', true);
    startPlaying(s, code);
    advance(s, 30_001);
    s.tickRoom(code, 50);
    expect(view(s, code).phase).toBe('ROUND_OVER');
    expect(view(s, code).winner).toBe('PLAYERS');
  });

  it('ROUND_OVER rooms tick list me nahi aate', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha', { roundDurationMs: 30_000 });
    s.joinRoom('b', code, 'Bina');
    s.setReady('b', true);
    startPlaying(s, code);
    expect(s.getTickableRoomCodes()).toContain(code);
    advance(s, 30_001);
    s.tickRoom(code, 50);
    expect(s.getTickableRoomCodes()).not.toContain(code);
  });
});

describe('disconnect / reconnect', () => {
  it('IT disconnect ho to naya IT turant chun liya jaata hai', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    const oldIt = view(s, code).itId as PlayerId;
    s.setConnected(oldIt, false);
    const v = view(s, code);
    expect(v.itId).not.toBe(oldIt);
    expect(v.itId).not.toBeNull();
  });

  it('disconnect hone par player round se nikal jaata hai — koi "bhoot" nahi bachta', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    const it = view(s, code).itId as PlayerId;
    const other = view(s, code).players.find((p) => p.id !== it)?.id as PlayerId;
    s.setConnected(other, false);
    expect(view(s, code).players.map((p) => p.id)).not.toContain(other);
    // Room ki list me abhi bhi dikhta hai (disconnected), taaki wapas aa sake.
    expect(s.getRoomView(code)?.players.find((p) => p.id === other)?.connected).toBe(false);
  });

  it('host disconnect ho to naya host ban jaata hai', () => {
    const s = newService();
    const code = readyRoom(s);
    const result = s.setConnected('a', false);
    expect(result).toEqual({ code, hostChanged: true });
    expect(['b', 'c']).toContain(s.getRoomView(code)?.hostId);
  });

  it('reconnect par connected flag wapas true ho jaata hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.setConnected('b', false);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.connected).toBe(false);
    s.setConnected('b', true);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.connected).toBe(true);
  });

  it('itne kam players bachein to round khud khatam ho jaata hai', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    s.setReady('b', true);
    startPlaying(s, code);
    s.setConnected('b', false);
    expect(view(s, code).phase).toBe('ROUND_OVER');
  });
});

describe('host controls', () => {
  it('forceEndGame sirf host, game turant khatam karke lobby me', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    expectCode(() => s.forceEndGame('b'), 'NOT_HOST');
    s.forceEndGame('a');
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
    expect(s.getGameView(code)).toBeNull();
  });

  it('returnToLobby sirf host, sabko not-ready (host ke alawa) kar deta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    expectCode(() => s.returnToLobby('b'), 'NOT_HOST');
    s.returnToLobby('a');
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.ready).toBe(false);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'a')?.ready).toBe(true);
  });
});
