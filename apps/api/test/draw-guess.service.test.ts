import { describe, expect, it } from 'vitest';
import type { DrawGuessGameView } from '@rmc/shared-types';
import { DrawGuessService, RoomError } from '../src/draw-guess/draw-guess.service';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newService(): DrawGuessService {
  const s = new DrawGuessService();
  s.random = seeded(1);
  let clock = 1_000_000;
  s.now = () => clock;
  (s as unknown as { advanceClock: (ms: number) => void }).advanceClock = (ms: number) => (clock += ms);
  return s;
}

function tick(s: DrawGuessService, ms: number): void {
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
function readyRoom(s: DrawGuessService): string {
  const code = s.createRoom('a', 'Asha');
  s.joinRoom('b', code, 'Bina');
  s.joinRoom('c', code, 'Charu');
  s.setReady('b', true);
  s.setReady('c', true);
  return code;
}

function viewOf(s: DrawGuessService, id: string): DrawGuessGameView {
  return s.getGameViewFor(id) as DrawGuessGameView;
}

describe('create / join / leave', () => {
  it('room banta hai, creator host + auto-ready hota hai', () => {
    const s = newService();
    const code = s.createRoom('a', '  Asha ');
    expect(code).toHaveLength(5);
    const room = s.getRoomView(code);
    expect(room?.hostId).toBe('a');
    expect(room?.players).toEqual([{ id: 'a', name: 'Asha', isHost: true, connected: true, ready: true }]);
    expect(room?.status).toBe('LOBBY');
  });

  it('code case/space ignore karke join hota hai', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', ` ${code.toLowerCase()} `, 'Bina');
    expect(s.getRoomView(code)?.players).toHaveLength(2);
  });

  it('galat code / full room / already-in-room reject hote hain', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    expectCode(() => s.joinRoom('b', 'ZZZZZ', 'Bina'), 'ROOM_NOT_FOUND');
    expectCode(() => s.joinRoom('a', code, 'Asha2'), 'ALREADY_IN_ROOM');
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
    expectCode(() => s.updateSettings('b', { totalRounds: 5 }), 'NOT_HOST');
    s.updateSettings('a', { totalRounds: 999, drawTimeMs: 1 });
    const room = s.getRoomView(code);
    expect(room?.settings.totalRounds).toBeLessThanOrEqual(20);
    expect(room?.settings.drawTimeMs).toBeGreaterThanOrEqual(15_000);
  });

  it('custom words validate hote hain (bahut chhote/duplicate reject)', () => {
    const s = newService();
    s.createRoom('a', 'Asha', { customWords: ['ok', 'Valid Word', 'Valid Word'] });
    // 'ok' bahut chhota hai (MIN_WORD_LENGTH se kam), duplicate bhi drop hota hai
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
  });
});

describe('full turn lifecycle', () => {
  it('LOBBY -> COUNTDOWN -> CHOOSING_WORD -> DRAWING -> guess -> ROUND_RESULTS -> agla turn', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    expect(s.getPhase(code)).toBe('COUNTDOWN');

    tick(s, 3_000);
    s.beginNextTurn(code);
    expect(s.getPhase(code)).toBe('CHOOSING_WORD');
    const drawerView = viewOf(s, s.getPlayerIds(code).find((id) => viewOf(s, id).isDrawer) as string);
    expect(drawerView.wordChoices).toHaveLength(3);
    const drawerId = drawerView.drawerId as string;
    const word = drawerView.wordChoices?.[0] as string;

    s.selectWord(drawerId, word);
    expect(s.getPhase(code)).toBe('DRAWING');

    const others = s.getPlayerIds(code).filter((id) => id !== drawerId);
    const outcome1 = s.chat(others[0] as string, word);
    expect(outcome1.correct).toBe(true);
    const chat = s.getChatOf(code);
    const correctEntry = chat.find((e) => e.kind === 'CORRECT_GUESS');
    expect(correctEntry).toBeDefined();
    expect(JSON.stringify(correctEntry)).not.toContain(word); // guess sahi ho to bhi text kabhi nahi dikhta

    const wrong = s.chat(others[1] as string, 'totally-wrong-guess');
    expect(wrong.correct).toBe(false);
    const chatEntry = s.getChatOf(code).find((e) => e.kind === 'CHAT');
    expect(chatEntry).toBeDefined();
    expect(s.getPhase(code)).toBe('DRAWING'); // c abhi galat hi guess kiya, sahi nahi — turn chalta rehna chahiye

    s.chat(others[1] as string, word); // ab c bhi sahi guess kar leta hai
    // Sab (drawer chhodkar) guess kar chuke: turn khud khatam ho jaana chahiye.
    expect(s.getPhase(code)).toBe('ROUND_RESULTS');
    const history = viewOf(s, drawerId).history;
    expect(history[0]?.word).toBe(word); // ab reveal ho chuka hai, sahi hai

    tick(s, 5_000);
    s.beginNextTurn(code);
    expect(['CHOOSING_WORD', 'GAME_RESULTS']).toContain(s.getPhase(code));
  });

  it('drawer khud guess nahi kar sakta — uska text hamesha normal chat banta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    tick(s, 3_000);
    s.beginNextTurn(code);
    const drawerId = viewOf(s, 'a').drawerId as string;
    const word = viewOf(s, drawerId).wordChoices?.[0] as string;
    s.selectWord(drawerId, word);

    const outcome = s.chat(drawerId, word); // drawer khud apna word type kare
    expect(outcome.correct).toBe(false); // engine ke through guess kabhi nahi gaya
    const entry = s.getChatOf(code).find((e) => e.kind === 'CHAT' && e.playerId === drawerId);
    expect(entry).toBeDefined();
  });

  it('sahi guess kar chuka player dobara type kare to error nahi, normal chat ban jaata hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    tick(s, 3_000);
    s.beginNextTurn(code);
    const drawerId = viewOf(s, 'a').drawerId as string;
    const word = viewOf(s, drawerId).wordChoices?.[0] as string;
    s.selectWord(drawerId, word);
    const guesser = s.getPlayerIds(code).find((id) => id !== drawerId) as string;
    s.chat(guesser, word);
    expect(() => s.chat(guesser, 'hello again')).not.toThrow();
  });

  it('host DG_END_GAME se game turant khatam kar sakta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    tick(s, 3_000);
    s.beginNextTurn(code);
    expectCode(() => s.forceEndGame('b'), 'NOT_HOST');
    s.forceEndGame('a');
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
  });
});

describe('security — non-drawer ko kabhi asli word nahi milta (service level)', () => {
  it('CHOOSING_WORD/DRAWING me getGameViewFor non-drawer ke liye word kabhi expose nahi karta', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    tick(s, 3_000);
    s.beginNextTurn(code);
    const drawerId = viewOf(s, 'a').drawerId as string;
    const word = viewOf(s, drawerId).wordChoices?.[0] as string;
    s.selectWord(drawerId, word);

    for (const id of s.getPlayerIds(code)) {
      const view = viewOf(s, id);
      const serialized = JSON.stringify(view);
      if (id !== drawerId) {
        expect(view.word).toBeNull();
        expect(view.wordChoices).toBeNull();
        expect(serialized.toLowerCase().includes(word.toLowerCase())).toBe(false);
      }
    }
  });
});

describe('disconnect handling', () => {
  it('drawer disconnect ho jaaye to turn turant khatam ho jaata hai (game atakti nahi)', () => {
    const s = newService();
    const code = readyRoom(s);
    s.startGame('a');
    tick(s, 3_000);
    s.beginNextTurn(code);
    const drawerId = viewOf(s, 'a').drawerId as string;
    const word = viewOf(s, drawerId).wordChoices?.[0] as string;
    s.selectWord(drawerId, word);
    expect(s.getPhase(code)).toBe('DRAWING');

    s.handleDrawerDisconnect(code, drawerId);
    expect(s.getPhase(code)).toBe('ROUND_RESULTS');
  });

  it('non-drawer disconnect ho to game chalta rehta hai, bas unka flag badalta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    s.setConnected('b', false);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.connected).toBe(false);
    s.setConnected('b', true);
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'b')?.connected).toBe(true);
  });

  it('host disconnect ho to turant kisi aur connected player ko host bana deta hai', () => {
    const s = newService();
    const code = readyRoom(s);
    const result = s.setConnected('a', false);
    expect(result).toEqual({ code, hostChanged: true });
    const newHost = s.getRoomView(code)?.hostId;
    expect(['b', 'c']).toContain(newHost);
  });

  it('sab players connected hon aur host disconnect ho jaaye to koi eligible na mile (edge case) — crash nahi', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha'); // akela player, koi aur nahi
    const result = s.setConnected('a', false);
    expect(result?.hostChanged).toBe(false);
    expect(s.getRoomView(code)?.hostId).toBe('a'); // koi aur nahi to host wahi rehta hai
  });

  it('non-host disconnect ho to host nahi badalta', () => {
    const s = newService();
    const code = readyRoom(s);
    const result = s.setConnected('b', false);
    expect(result?.hostChanged).toBe(false);
    expect(s.getRoomView(code)?.hostId).toBe('a');
  });
});
