import { describe, expect, it } from 'vitest';
import type { PlayerGameView } from '@rmc/shared-types';
import { RoomError, RoomsService, type FinishedGame } from '../src/rooms/rooms.service';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newService(): RoomsService {
  const s = new RoomsService();
  s.random = seeded(1);
  return s;
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

/** Full room: host = a, baaki b, c, d. */
function fullRoom(s: RoomsService): string {
  const code = s.createRoom('a', 'Asha');
  s.joinRoom('b', code, 'Bina');
  s.joinRoom('c', code.toLowerCase(), 'Charu');
  s.joinRoom('d', ` ${code} `, 'Dev');
  return code;
}

function viewOf(s: RoomsService, id: string): PlayerGameView {
  return s.getGameViewFor(id) as PlayerGameView;
}

describe('create / join', () => {
  it('room banta hai aur creator host hota hai', () => {
    const s = newService();
    const code = s.createRoom('a', '  Asha ');
    expect(code).toHaveLength(4);
    const room = s.getRoomView(code);
    expect(room?.hostId).toBe('a');
    expect(room?.players).toEqual([
      { id: 'a', name: 'Asha', isHost: true, connected: true, character: 'DEFAULT', isBot: false },
    ]);
    expect(room?.status).toBe('LOBBY');
  });

  it('code case/space ignore karke join hota hai', () => {
    const s = newService();
    fullRoom(s);
    expect(s.getPlayerIds(s.getRoomCodeOf('a') as string)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('galat input reject hota hai', () => {
    const s = newService();
    expectCode(() => s.createRoom('a', '   '), 'INVALID_NAME');
    expectCode(() => s.createRoom('a', 'x'.repeat(21)), 'INVALID_NAME');
    expectCode(() => s.createRoom('a', undefined as unknown as string), 'INVALID_NAME');
    expectCode(() => s.joinRoom('a', 'AB', 'Asha'), 'INVALID_CODE');
    expectCode(() => s.joinRoom('a', 'ZZZZ', 'Asha'), 'ROOM_NOT_FOUND');
  });

  it('ek player ek hi room me', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    expectCode(() => s.createRoom('a', 'Asha'), 'ALREADY_IN_ROOM');
    expectCode(() => s.joinRoom('a', code, 'Asha'), 'ALREADY_IN_ROOM');
  });

  it('5th player ko ROOM_FULL', () => {
    const s = newService();
    const code = fullRoom(s);
    expectCode(() => s.joinRoom('e', code, 'Esha'), 'ROOM_FULL');
  });
});

describe('leave', () => {
  it('host jaye to agla player host', () => {
    const s = newService();
    const code = fullRoom(s);
    expect(s.leaveRoom('a')).toBe(code);
    expect(s.getRoomView(code)?.hostId).toBe('b');
    expect(s.getRoomCodeOf('a')).toBeNull();
  });

  it('aakhri player jaye to room delete', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    expect(s.leaveRoom('a')).toBeNull();
    expect(s.getRoomView(code)).toBeNull();
  });

  it('room me na ho to null', () => {
    expect(newService().leaveRoom('ghost')).toBeNull();
  });

  it('game ke beech leave = game cancel, room lobby me', () => {
    const s = newService();
    const code = fullRoom(s);
    s.startGame('a');
    expect(s.getRoomView(code)?.status).toBe('IN_GAME');
    s.leaveRoom('c');
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
    expect(s.getGameViewFor('a')).toBeNull();
  });
});

describe('start game', () => {
  it('sirf host, sirf 4 players ke saath', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.startGame('a'), 'NEED_FULL_ROOM');
    s.joinRoom('c', code, 'Charu');
    s.joinRoom('d', code, 'Dev');
    expectCode(() => s.startGame('b'), 'NOT_HOST');
    expectCode(() => s.startGame('ghost'), 'NOT_IN_ROOM');
    s.startGame('a');
    expectCode(() => s.startGame('a'), 'GAME_IN_PROGRESS');
    expectCode(() => s.joinRoom('e', code, 'Esha'), 'GAME_IN_PROGRESS');
  });

  it('action bina game ke reject', () => {
    const s = newService();
    s.createRoom('a', 'Asha');
    expectCode(() => s.submitGuess('a', 'b'), 'NO_GAME');
    expectCode(() => s.nextRound('a'), 'NO_GAME');
  });
});

/** Poora game khelo (sab guesses Sipahi/Chor me se) aur GAME_RESULT tak pahucho. */
function playToEnd(s: RoomsService): void {
  const ids = ['a', 'b', 'c', 'd'];
  for (let round = 1; round <= 4; round++) {
    const views = ids.map((id) => ({ id, v: viewOf(s, id) }));
    const mantri = views.find((x) => x.v.myRole === 'MANTRI') as { id: string };
    const target = views.find((x) => x.v.myRole !== 'RAJA' && x.id !== mantri.id) as { id: string };
    s.submitGuess(mantri.id, target.id);
    s.nextRound('a');
  }
}

describe('rematch', () => {
  it('game khatam hone par host room ko lobby me wapas laata hai', () => {
    const s = newService();
    const code = fullRoom(s);
    s.startGame('a');
    expectCode(() => s.rematch('a'), 'GAME_NOT_FINISHED');
    playToEnd(s);
    expect(viewOf(s, 'a').phase).toBe('GAME_RESULT');
    expectCode(() => s.rematch('b'), 'NOT_HOST');
    s.rematch('a');
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
    expect(s.getGameViewFor('a')).toBeNull();
    // Naya game fresh points ke saath.
    s.startGame('a');
    expect(viewOf(s, 'a').totals).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(viewOf(s, 'a').history).toHaveLength(0);
  });

  it('bina game ke rematch reject', () => {
    const s = newService();
    s.createRoom('a', 'Asha');
    expectCode(() => s.rematch('a'), 'NO_GAME');
  });
});

describe('presence (connected)', () => {
  it('disconnect mark hota hai, game state waisi hi rehti hai', () => {
    const s = newService();
    const code = fullRoom(s);
    s.startGame('a');
    const before = viewOf(s, 'c');
    s.setConnected('c', false);
    const players = s.getRoomView(code)?.players ?? [];
    expect(players.find((p) => p.id === 'c')?.connected).toBe(false);
    expect(players.filter((p) => p.connected)).toHaveLength(3);
    // Wapas aane par same role/view.
    s.setConnected('c', true);
    expect(s.getRoomView(code)?.players.every((p) => p.connected)).toBe(true);
    expect(viewOf(s, 'c')).toEqual(before);
  });

  it('leave par presence flag saaf, room me na ho to ignore', () => {
    const s = newService();
    const code = fullRoom(s);
    s.setConnected('b', false);
    s.leaveRoom('b');
    s.joinRoom('e', code, 'Esha');
    expect(s.getRoomView(code)?.players.every((p) => p.connected)).toBe(true);
    s.setConnected('ghost', false); // crash nahi hona chahiye
  });
});

describe('avatars (characters)', () => {
  it('guest ka DEFAULT, login wale ka pehna hua character sabko dikhta hai', () => {
    const s = newService();
    const code = fullRoom(s);
    const characters = () => s.getRoomView(code)?.players.map((p) => p.character);
    expect(characters()).toEqual(['DEFAULT', 'DEFAULT', 'DEFAULT', 'DEFAULT']);
    s.setCharacter('b', 'LION');
    s.setCharacter('c', 'FOX');
    expect(characters()).toEqual(['DEFAULT', 'LION', 'FOX', 'DEFAULT']);
    s.setCharacter('c', null); // logout
    s.setCharacter('b', 'DEFAULT');
    expect(characters()).toEqual(['DEFAULT', 'DEFAULT', 'DEFAULT', 'DEFAULT']);
  });

  it('room chhodkar wapas aane par avatar bana rehta hai (login se juda hai, room se nahi)', () => {
    const s = newService();
    const code = fullRoom(s);
    s.setCharacter('d', 'OWL');
    s.leaveRoom('d');
    s.joinRoom('d', code, 'Dev');
    expect(s.getRoomView(code)?.players.find((p) => p.id === 'd')?.character).toBe('OWL');
  });
});

describe('bots', () => {
  it('addBot: khaali seat bhar deta hai, naam+avatar milta hai, isBot true dikhta hai', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    const { bot } = s.addBot('a');
    expect(bot.name).toMatch(/^Bot /);
    const view = s.getRoomView(code);
    expect(view?.players).toHaveLength(2);
    const botView = view?.players.find((p) => p.id === bot.id);
    expect(botView).toMatchObject({ isBot: true, character: 'ROBOT', isHost: false });
    expect(s.isBot(bot.id)).toBe(true);
    expect(s.isBot('a')).toBe(false);
  });

  it('sirf host bot add/remove kar sakta hai, sirf LOBBY me, room full na ho', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    expectCode(() => s.addBot('b'), 'NOT_HOST');
    const { bot: bot1 } = s.addBot('a');
    s.addBot('a');
    expectCode(() => s.addBot('a'), 'ROOM_FULL'); // ab 4/4
    expectCode(() => s.removeBot('b', bot1.id), 'NOT_HOST');
    expectCode(() => s.removeBot('a', 'not-a-bot'), 'BOT_NOT_FOUND');
    s.removeBot('a', bot1.id);
    expect(s.getRoomView(code)?.players).toHaveLength(3);
    expect(s.isBot(bot1.id)).toBe(false); // bhula diya gaya
  });

  it('do bots ka naam takrata nahi', () => {
    const s = newService();
    s.createRoom('a', 'Asha');
    const one = s.addBot('a').bot.name;
    const two = s.addBot('a').bot.name;
    const three = s.addBot('a').bot.name;
    expect(new Set([one, two, three]).size).toBe(3);
  });

  it('game shuru hone ke baad bot add/remove nahi', () => {
    const s = newService();
    const code = fullRoom(s);
    s.startGame('a');
    expectCode(() => s.addBot('a'), 'GAME_IN_PROGRESS');
    void code;
  });

  it('playWithBots: solo player, poora room bots se bharta hai, game turant shuru', () => {
    const s = newService();
    const code = s.playWithBots('a', 'Asha');
    const view = s.getRoomView(code);
    expect(view?.status).toBe('IN_GAME');
    expect(view?.players).toHaveLength(4);
    expect(view?.players.filter((p) => p.isBot)).toHaveLength(3);
    expect(view?.players.find((p) => p.id === 'a')?.isHost).toBe(true);
    expect(s.getGameViewFor('a')?.phase).toBe('ROUND_ACTIVE');
  });

  it('getBotMantriTask: bot Mantri ho to mantriId + 2 options deta hai, warna null', () => {
    const s = newService();
    const code = s.playWithBots('a', 'Asha');
    for (let round = 1; round <= 4; round++) {
      const view = s.getGameViewFor('a') as PlayerGameView;
      const task = s.getBotMantriTask(code);
      if (view.myRole === 'MANTRI') {
        expect(task).toBeNull(); // insaan khud Mantri hai
        // Khatam karo taaki loop aage badh sake.
        const raja = Object.entries(view.visibleRoles).find(([, r]) => r === 'RAJA')?.[0];
        const target = view.players.find((p) => p.id !== raja && p.id !== 'a') as { id: string };
        s.submitGuess('a', target.id);
      } else {
        expect(task?.mantriId).not.toBe('a');
        expect(task?.options).toHaveLength(2);
        expect(s.isBot(task?.mantriId as string)).toBe(true);
        s.submitGuess(task?.mantriId as string, task?.options[0] as string);
      }
      expect(s.getGameViewFor('a')?.phase).toBe('ROUND_RESULT');
      if (round < 4) s.nextRound('a');
    }
  });

  it('bina game ke ya round result me getBotMantriTask null', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    expect(s.getBotMantriTask(code)).toBeNull();
    expect(s.getBotMantriTask('ZZZZ')).toBeNull();
  });

  it('insaan chala jaye aur sirf bots bachein: room khud saaf ho jata hai', () => {
    const s = newService();
    const code = s.playWithBots('a', 'Asha');
    const botIds = s.getRoomView(code)?.players.filter((p) => p.isBot).map((p) => p.id) as string[];
    s.leaveRoom('a');
    expect(s.getRoomView(code)).toBeNull();
    for (const id of botIds) expect(s.isBot(id)).toBe(false); // saare bots bhula diye gaye
  });

  it('host chala jaye (baaki insaan bache) to naya host bot nahi banta', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    const { bot } = s.addBot('a');
    void bot;
    s.leaveRoom('a'); // host chala gaya; bachi hui: b (insaan), bot
    expect(s.getRoomView(code)?.hostId).toBe('b');
  });
});

describe('quick match queue names', () => {
  it('MatchmakingService.waitingNames join order me naam deta hai', async () => {
    const { MatchmakingService } = await import('../src/rooms/matchmaking.service');
    const s = newService();
    const mm = new MatchmakingService(s);
    mm.join('a', 'Asha');
    mm.join('b', 'Bina');
    expect(mm.waitingNames()).toEqual(['Asha', 'Bina']);
    mm.leave('a');
    expect(mm.waitingNames()).toEqual(['Bina']);
  });
});

describe('disconnect vote', () => {
  /** 4 players ka chalta game; ids a(host), b, c, d. */
  function inGame() {
    const s = newService();
    let t = 1_000_000;
    s.now = () => t;
    const code = fullRoom(s);
    s.startGame('a');
    return { s, code, advance: (ms: number) => (t += ms) };
  }

  it('vote sirf tab khulta hai jab game chal raha ho aur koi gayab ho (aur koi connected bacha ho)', () => {
    const s = newService();
    const code = fullRoom(s);
    s.setConnected('d', false);
    expect(s.canOpenVote(code)).toBe(false); // game shuru hi nahi hua
    s.startGame('a');
    s.setConnected('d', true);
    expect(s.canOpenVote(code)).toBe(false); // koi gayab nahi
    s.setConnected('d', false);
    expect(s.canOpenVote(code)).toBe(true);
    for (const id of ['a', 'b', 'c']) s.setConnected(id, false);
    expect(s.canOpenVote(code)).toBe(false); // sab gayab: vote dene wala koi nahi
  });

  it('openVote: voters connected, missing gayab, countdown dikhta hai', () => {
    const { s, code, advance } = inGame();
    s.setConnected('d', false);
    expect(s.openVote(code, 30_000)).toBe(true);
    expect(s.openVote(code, 30_000)).toBe(false); // pehle se khula hai
    advance(10_000);
    const vote = s.getRoomView(code)?.vote;
    expect(vote).toEqual({ missingIds: ['d'], eligibleIds: ['a', 'b', 'c'], votes: {}, expiresInMs: 20_000 });
    expect(s.hasVote(code)).toBe(true);
  });

  it('majority CANCEL: gayab player hata, game cancel, room lobby me', () => {
    const { s, code } = inGame();
    s.setConnected('d', false);
    s.openVote(code, 30_000);

    const first = s.castVote('a', 'CANCEL');
    expect(first.resolution).toBeNull();
    expect(s.getRoomView(code)?.vote?.votes).toEqual({ a: 'CANCEL' });

    const second = s.castVote('b', 'CANCEL');
    expect(second.resolution).toEqual({ choice: 'CANCEL', removed: ['d'] });
    const room = s.getRoomView(code);
    expect(room?.vote).toBeNull();
    expect(room?.status).toBe('LOBBY');
    expect(room?.players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(s.getGameViewFor('a')).toBeNull();
    expect(s.getRoomCodeOf('d')).toBeNull();
  });

  it('majority WAIT: kuch nahi hatta, game chalta hai, baad me phir vote khul sakta hai', () => {
    const { s, code } = inGame();
    s.setConnected('d', false);
    s.openVote(code, 30_000);
    s.castVote('a', 'WAIT');
    const res = s.castVote('b', 'WAIT').resolution;
    expect(res).toEqual({ choice: 'WAIT', removed: [] });
    expect(s.getRoomView(code)?.players).toHaveLength(4);
    expect(s.getGameViewFor('a')?.phase).toBe('ROUND_ACTIVE');
    expect(s.canOpenVote(code)).toBe(true);
  });

  it('time khatam (resolveVote WAIT): kuch nahi hatta; vote na ho to null', () => {
    const { s, code } = inGame();
    expect(s.resolveVote(code, 'WAIT')).toBeNull();
    s.setConnected('c', false);
    s.openVote(code, 30_000);
    s.castVote('a', 'CANCEL'); // 1 of 3: majority nahi
    expect(s.resolveVote(code, 'WAIT')).toEqual({ choice: 'WAIT', removed: [] });
    expect(s.getRoomView(code)?.players).toHaveLength(4);
  });

  it('do gayab players: CANCEL par dono hatte hain', () => {
    const { s, code } = inGame();
    s.setConnected('c', false);
    s.setConnected('d', false);
    s.openVote(code, 30_000);
    // Voters a, b: dono CANCEL bole to majority.
    s.castVote('a', 'CANCEL');
    const res = s.castVote('b', 'CANCEL').resolution;
    expect(res?.removed.sort()).toEqual(['c', 'd']);
    expect(s.getRoomView(code)?.players.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('gayab player wapas aaye to vote se hat jata hai; koi gayab na bache to vote khatam', () => {
    const { s, code } = inGame();
    s.setConnected('c', false);
    s.setConnected('d', false);
    s.openVote(code, 30_000);
    s.setConnected('c', true);
    expect(s.getRoomView(code)?.vote?.missingIds).toEqual(['d']);
    s.setConnected('d', true);
    expect(s.getRoomView(code)?.vote).toBeNull();
    expect(s.hasVote(code)).toBe(false);
  });

  it('CANCEL par sirf wahi hatte hain jo abhi bhi gayab hain', () => {
    const { s, code } = inGame();
    s.setConnected('c', false);
    s.setConnected('d', false);
    s.openVote(code, 30_000);
    s.setConnected('c', true); // c wapas
    s.castVote('a', 'CANCEL');
    const res = s.castVote('b', 'CANCEL').resolution;
    expect(res?.removed).toEqual(['d']);
    expect(s.getRoomView(code)?.players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('galat vote reject: NO_VOTE, NOT_VOTER (gayab player), bad choice', () => {
    const { s, code } = inGame();
    expectCode(() => s.castVote('a', 'WAIT'), 'NO_VOTE');
    s.setConnected('d', false);
    s.openVote(code, 30_000);
    expectCode(() => s.castVote('d', 'WAIT'), 'NOT_VOTER');
    expectCode(() => s.castVote('ghost', 'WAIT'), 'NOT_IN_ROOM');
    expectCode(() => s.castVote('a', 'MAYBE' as never), 'GAME_RULE');
  });

  it('vote badla ja sakta hai', () => {
    const { s, code } = inGame();
    s.setConnected('d', false);
    s.openVote(code, 30_000);
    s.castVote('a', 'CANCEL');
    s.castVote('a', 'WAIT');
    expect(s.getRoomView(code)?.vote?.votes).toEqual({ a: 'WAIT' });
  });

  it('koi player khud room chhode to vote khatam (game cancel ho jata hai)', () => {
    const { s, code } = inGame();
    s.setConnected('d', false);
    s.openVote(code, 30_000);
    s.leaveRoom('b');
    expect(s.hasVote(code)).toBe(false);
    expect(s.getRoomView(code)?.status).toBe('LOBBY');
  });
});

describe('onGameFinished', () => {
  it('poora game khatam hone par ek baar sahi data ke saath call hota hai', () => {
    const s = newService();
    const finished: FinishedGame[] = [];
    s.onGameFinished = (g) => finished.push(g);
    const code = fullRoom(s);
    s.startGame('a');
    // Round 4 tak, har nextRound ke baad check.
    const ids = ['a', 'b', 'c', 'd'];
    for (let round = 1; round <= 4; round++) {
      const views = ids.map((id) => ({ id, v: viewOf(s, id) }));
      const mantri = views.find((x) => x.v.myRole === 'MANTRI') as { id: string };
      const target = views.find((x) => x.v.myRole !== 'RAJA' && x.id !== mantri.id) as { id: string };
      s.submitGuess(mantri.id, target.id);
      expect(finished).toHaveLength(0);
      s.nextRound('a');
    }
    expect(finished).toHaveLength(1);
    const game = finished[0] as FinishedGame;
    expect(game.roomCode).toBe(code);
    expect(game.history).toHaveLength(4);
    expect(game.players.map((p) => p.id)).toEqual(ids);
    expect(game.winnerIds).toEqual(viewOf(s, 'a').winnerIds);
    expect(Object.values(game.totals).reduce((x, y) => x + y, 0)).toBe(9200);
  });
});

describe('reactions', () => {
  it('room ke bahar wale ko reaction nahi', () => {
    expectCode(() => newService().reaction('ghost', '😂'), 'NOT_IN_ROOM');
  });

  it('sirf allowed emoji', () => {
    const s = newService();
    s.createRoom('a', 'Asha');
    expectCode(() => s.reaction('a', 'hello'), 'BAD_REACTION');
    expectCode(() => s.reaction('a', undefined), 'BAD_REACTION');
    expect(s.reaction('a', '👏').emoji).toBe('👏');
  });

  it('cooldown ke andar dobara reject, baad me theek', () => {
    const s = newService();
    let t = 1_000_000;
    s.now = () => t;
    const code = s.createRoom('a', 'Asha');
    expect(s.reaction('a', '😂').code).toBe(code);
    t += 999;
    expectCode(() => s.reaction('a', '😂'), 'RATE_LIMITED');
    t += 1;
    expect(s.reaction('a', '😂').emoji).toBe('😂');
  });

  it('cooldown har player ka alag', () => {
    const s = newService();
    const code = s.createRoom('a', 'Asha');
    s.joinRoom('b', code, 'Bina');
    s.reaction('a', '😂');
    expect(s.reaction('b', '😂').emoji).toBe('😂');
  });
});

describe('game view (secrets)', () => {
  it('har player ko sirf apna safe view milta hai', () => {
    const s = newService();
    fullRoom(s);
    s.startGame('a');
    const views = ['a', 'b', 'c', 'd'].map((id) => viewOf(s, id));
    for (const v of views) {
      expect(v.phase).toBe('ROUND_ACTIVE');
      expect(v.myRole).not.toBeNull();
      // Sirf Raja + Mantri public, aur apna role: max 3 roles dikh sakte hain.
      expect(Object.keys(v.visibleRoles).length).toBeLessThanOrEqual(3);
    }
    const chorView = views.find((v) => v.myRole === 'CHOR') as PlayerGameView;
    expect(Object.values(chorView.visibleRoles).filter((r) => r === 'SIPAHI')).toHaveLength(0);
  });

  it('poora game guess + next round se chalta hai', () => {
    const s = newService();
    fullRoom(s);
    s.startGame('a');
    const ids = ['a', 'b', 'c', 'd'];

    for (let round = 1; round <= 4; round++) {
      const views = ids.map((id) => ({ id, v: viewOf(s, id) }));
      const mantri = views.find((x) => x.v.myRole === 'MANTRI') as { id: string; v: PlayerGameView };
      expect(mantri.v.canGuess).toBe(true);
      // Chor ka id: sirf test ke liye alag-alag guess (Mantri ke alawa, Raja ke alawa) try karke.
      const notRaja = views.filter((x) => x.v.myRole !== 'RAJA' && x.id !== mantri.id);
      expectCode(() => s.submitGuess('a' === mantri.id ? 'b' : 'a', notRaja[0]?.id as string), 'GAME_RULE');
      s.submitGuess(mantri.id, notRaja[0]?.id as string);
      expect(viewOf(s, 'a').phase).toBe('ROUND_RESULT');
      expectCode(() => s.nextRound('b'), 'NOT_HOST');
      s.nextRound('a');
    }
    expect(viewOf(s, 'a').phase).toBe('GAME_RESULT');
    expect(viewOf(s, 'a').history).toHaveLength(4);
  });
});
