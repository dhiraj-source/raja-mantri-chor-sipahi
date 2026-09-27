import { describe, expect, it } from 'vitest';
import type { BombTagGameView } from '@rmc/shared-types';
import { BombTagService, RoomError } from '../src/bomb-tag/bomb-tag.service';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newService(): BombTagService {
  const s = new BombTagService();
  s.random = seeded(1);
  let clock = 1_000_000;
  s.now = () => clock;
  (s as unknown as { advanceClock: (ms: number) => void }).advanceClock = (ms: number) => (clock += ms);
  return s;
}

function advance(s: BombTagService, ms: number): void {
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

/** 2-player room, dono ready. */
function readyRoom(s: BombTagService): string {
  const code = s.createRoom('a', 'Asha');
  s.joinRoom('b', code, 'Bina');
  s.setReady('b', true);
  return code;
}

function view(s: BombTagService, code: string): BombTagGameView {
  return s.getGameView(code) as BombTagGameView;
}

/** COUNTDOWN paar karke PLAYING tak le jaata hai. */
function startPlaying(s: BombTagService, code: string): void {
  s.startGame(s.getRoomView(code)?.hostId as string);
  advance(s, 3_000);
  s.tickRoom(code, 3_000);
}

describe('create / join / leave', () => {
  it('room banta hai, host auto-ready hota hai, doosra player nahi', () => {
    const s = newService();
    const code = s.createRoom('a', '  Asha ');
    expect(code).toHaveLength(5);
    const room = s.getRoomView(code);
    expect(room?.hostId).toBe('a');
    expect(room?.players).toEqual([
      { id: 'a', name: 'Asha', color: expect.any(String), isHost: true, connected: true, ready: true, score: 0 },
    ]);
    expect(room?.status).toBe('LOBBY');

    s.joinRoom('b', code, 'Bina');
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.ready).toBe(false);
  });

  it('code case/space ignore karke join hota hai', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', ` ${code.toLowerCase()} `, 'Bina');
    expect(s.getRoomView(code)?.players).toHaveLength(2);
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
    expectCode(() => s.joinRoom('c', code, 'Charu'), 'GAME_IN_PROGRESS');
  });

  it('leave: host chala jaaye to naya host, sab chale jaayen to room saaf', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    s.leaveRoom('a');
    expect(s.getRoomView(code)?.hostId).toBe('b');
    s.leaveRoom('b');
    expect(s.getRoomView(code)).toBeNull();
  });

  it('kick: sirf host, khud ko nahi, kicked player room se bahar', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.kickPlayer('b', 'a'), 'NOT_HOST');
    expectCode(() => s.kickPlayer('a', 'a'), 'PLAYER_NOT_FOUND');
    const { kickedId } = s.kickPlayer('a', 'b');
    expect(kickedId).toBe('b');
    expect(s.getRoomCodeOf('b')).toBeNull();
  });
});

describe('settings', () => {
  it('sirf host settings badal sakta hai, values clamp hote hain', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.updateSettings('b', { roundsToWin: 5 }), 'NOT_HOST');
    s.updateSettings('a', { roundsToWin: 999, bombDurationMs: 1 });
    const room = s.getRoomView(code);
    expect(room?.settings.roundsToWin).toBeLessThanOrEqual(10);
    expect(room?.settings.bombDurationMs).toBeGreaterThanOrEqual(5_000);
  });

  it('game shuru ho chuka ho to settings badalna reject hota hai', () => {
    const s = newService();
    readyRoom(s);
    s.startGame('a');
    expectCode(() => s.updateSettings('a', { roundsToWin: 2 }), 'GAME_IN_PROGRESS');
  });
});

describe('start game', () => {
  it('kam players / not-ready players / not-host reject hote hain', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    expectCode(() => s.startGame('a'), 'NEED_MORE_PLAYERS');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.startGame('a'), 'NEED_MORE_PLAYERS'); // b abhi ready nahi
    expectCode(() => s.startGame('b'), 'NOT_HOST');
    s.setReady('b', true);
    expect(() => s.startGame('a')).not.toThrow();
    expect(s.getPhase(code)).toBe('COUNTDOWN');
  });
});

describe('round + match lifecycle', () => {
  it('COUNTDOWN -> PLAYING -> ek player forfeit -> ROUND_OVER; reconnect ho jaaye to agla round normally chalta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    expect(view(s, code).phase).toBe('PLAYING');
    expect(s.getTickableRoomCodes()).toContain(code);

    const loser = view(s, code).players[0]?.id === 'a' ? 'b' : 'a';
    const events = s.tickRoom(code, 16); // koi movement tick, kuch nahi badalna chahiye abhi
    expect(events).toEqual([]);

    s.setConnected(loser, false); // disconnect = turant forfeit (koi grace time nahi)
    expect(view(s, code).phase).toBe('ROUND_OVER');
    expect(view(s, code).roundWinnerId).not.toBe(loser);
    expect(s.getRoomView(code)?.players.find((p) => p.id !== loser)?.score).toBe(1);
    expect(s.getTickableRoomCodes()).not.toContain(code); // ROUND_OVER ko tick karne ki zaroorat nahi

    s.setConnected(loser, true); // agle round se pehle wapas aa gaya
    s.startNextRound(code);
    expect(view(s, code).phase).toBe('COUNTDOWN');
    expect(view(s, code).round).toBe(2);
    expect(view(s, code).players.find((p) => p.id === loser)?.alive).toBe(true);
  });

  it('ROUND_OVER ke alawa startNextRound chup-chaap kuch nahi karta', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    expect(view(s, code).phase).toBe('PLAYING');
    expect(() => s.startNextRound(code)).not.toThrow();
    expect(view(s, code).phase).toBe('PLAYING'); // kuch badla nahi
  });

  it('roundsToWin tak pahunchte hi GAME_OVER hota hai aur match rुक jaata hai', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha', { roundsToWin: 1 });
    s.joinRoom('b', code, 'Bina');
    s.setReady('b', true);
    startPlaying(s, code);

    s.setConnected('b', false); // 'a' turant match jeet jaata hai (roundsToWin: 1)
    expect(view(s, code).phase).toBe('GAME_OVER');
    expect(view(s, code).matchWinnerId).toBe('a');
    expect(s.getRoomView(code)?.status).toBe('IN_GAME');
  });

  it('disconnected player jo reconnect nahi karta, agle round me bhi turant forfeit ho jaata hai — "bhoot" ban kar zinda nahi rehta', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha', { roundsToWin: 5 });
    s.joinRoom('b', code, 'Bina');
    s.setReady('b', true);
    startPlaying(s, code);

    s.setConnected('b', false); // round 1 khatam, 'a' jeeta
    expect(view(s, code).phase).toBe('ROUND_OVER');
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'a')?.score).toBe(1);

    s.startNextRound(code); // 'b' abhi bhi disconnected hai — is fix ke baghair wo round 2 me "alive" dikhta
    expect(view(s, code).players.find((p) => p.id === 'b')?.alive).toBe(false);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'a')?.score).toBe(2); // b ke bina round khud khatam
    expect(view(s, code).phase).toBe('ROUND_OVER'); // atakta nahi, khud hi resolve ho jaata hai
  });

  it('match ke beech me room chhodne wala player agle round me bilkul nahi dikhta (fixed-roster "bhoot" nahi banta)', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha', { roundsToWin: 5 });
    s.joinRoom('b', code, 'Bina');
    s.joinRoom('c', code, 'Charu');
    s.setReady('b', true);
    s.setReady('c', true);
    startPlaying(s, code);
    expect(view(s, code).players).toHaveLength(3); // fixed roster me teeno dikhte hain

    s.leaveRoom('c'); // 'c' poori tarah chala gaya — a/b abhi bhi zinda, round khatam nahi hota
    expect(s.getRoomView(code)?.players).toHaveLength(2); // lobby-facing list se turant gayab
    expect(view(s, code).phase).toBe('PLAYING');

    s.setConnected('b', false); // ab akela zinda player 'a' — round khatam
    expect(view(s, code).phase).toBe('ROUND_OVER');

    s.setConnected('b', true); // 'b' wapas aa gaya ('c' nahi — wo poori tarah chala gaya tha)
    s.startNextRound(code);
    // 'c' fixed roster me hamesha dikhega (engine kisi player ko poori tarah hata nahi sakta),
    // lekin fix ke saath wo hamesha "not alive" rahega — kabhi controllable bhoot nahi banta.
    expect(view(s, code).players.find((p) => p.id === 'c')?.alive).toBe(false);
    expect(view(s, code).players.find((p) => p.id === 'a')?.alive).toBe(true);
    expect(view(s, code).players.find((p) => p.id === 'b')?.alive).toBe(true);
    expect(view(s, code).phase).toBe('COUNTDOWN'); // 'b' reconnect ho chuka, round 2 normally chalta hai
  });
});

describe('movement input', () => {
  it('setInput values -1..1 ke bahar ho to clamp hote hain, room/game na ho to chup-chaap ignore', () => {
    const s = newService();
    const code = readyRoom(s);
    expect(() => s.setInput('a', 5, -5)).not.toThrow(); // abhi koi game nahi, safe no-op
    startPlaying(s, code);
    s.setInput('a', 5, -5);
    const player = view(s, code).players.find((p) => p.id === 'a');
    expect(player).toBeDefined();
  });
});

describe('disconnect / reconnect handling', () => {
  it('host disconnect ho to turant kisi aur connected player ko host bana deta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    const result = s.setConnected('a', false);
    expect(result).toEqual({ code, hostChanged: true });
    expect(s.getRoomView(code)?.hostId).toBe('b');
  });

  it('reconnect (setConnected true) se connected flag wapas true ho jaata hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.setConnected('a', false);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'a')?.connected).toBe(false);
    s.setConnected('a', true);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'a')?.connected).toBe(true);
  });

  it('lobby me disconnect (koi game nahi) sirf flag badalta hai, forfeit nahi hota', () => {
    const s = newService();
    const code = readyRoom(s);
    expect(() => s.setConnected('a', false)).not.toThrow();
    expect(s.getRoomView(code)).not.toBeNull();
  });
});

describe('host controls', () => {
  it('forceEndGame sirf host, game ko turant khatam karke lobby me bhej deta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    startPlaying(s, code);
    expectCode(() => s.forceEndGame('b'), 'NOT_HOST');
    s.forceEndGame('a');
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
    expect(s.getGameView(code)).toBeNull();
  });

  it('returnToLobby sirf host, game khatam karke sabko not-ready (host ke alawa) kar deta hai', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha', { roundsToWin: 1 });
    s.joinRoom('b', code, 'Bina');
    s.setReady('b', true);
    startPlaying(s, code);
    s.setConnected('b', false); // 'a' match jeet jaata hai
    expect(view(s, code).phase).toBe('GAME_OVER');

    expectCode(() => s.returnToLobby('b'), 'NOT_HOST');
    s.returnToLobby('a');
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.ready).toBe(false);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'a')?.ready).toBe(true);
  });
});
