import { describe, expect, it } from 'vitest';
import { DEFAULT_BOMB_TAG_CONFIG } from '../src/config';
import { BombTagError } from '../src/errors';
import {
  createGame,
  forfeit,
  getGameView,
  getScores,
  setInput,
  startNextRound,
  tick,
  type BombTagState,
} from '../src/state';

const config = { ...DEFAULT_BOMB_TAG_CONFIG, countdownMs: 1000, bombDurationMs: 2000, transferCooldownMs: 300 };

function infos(ids: readonly string[]): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: id }));
}

const random = () => 0.1; // deterministic shuffle/pick

function newGame(ids: string[] = ['a', 'b', 'c']): BombTagState {
  return createGame(infos(ids), 0, random, { config });
}

/** Test helper: ek player ko seedha kisi position par teleport karta hai (collision test karne ke liye). */
function teleport(state: BombTagState, id: string, pos: { x: number; y: number }): BombTagState {
  const player = state.players[id];
  if (!player) return state;
  return { ...state, players: { ...state.players, [id]: { ...player, pos } } };
}

/** BombTagError ka `.code` check karta hai (message text par depend karna fragile hota). */
function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`Expected to throw BombTagError(${code})`);
  } catch (e) {
    expect(e).toBeInstanceOf(BombTagError);
    expect((e as BombTagError).code).toBe(code);
  }
}

describe('createGame', () => {
  it('kam players reject hota hai', () => {
    expect(() => createGame(infos(['a']), 0, random, { config })).toThrow(BombTagError);
  });

  it('zyada players reject hota hai', () => {
    const tooMany = Array.from({ length: config.maxPlayers + 1 }, (_, i) => `p${i}`);
    expect(() => createGame(infos(tooMany), 0, random, { config })).toThrow(BombTagError);
  });

  it('duplicate ids reject hote hain', () => {
    expect(() => createGame(infos(['a', 'a']), 0, random, { config })).toThrow(BombTagError);
  });

  it('COUNTDOWN me shuru hota hai, ek random bomb-holder already chuna hua', () => {
    const state = newGame();
    expect(state.phase).toBe('COUNTDOWN');
    expect(state.round).toBe(1);
    expect(state.bombHolderId).not.toBeNull();
    expect(state.playerOrder).toContain(state.bombHolderId);
    for (const id of state.playerOrder) expect(state.players[id]?.alive).toBe(true);
  });

  it('koi do players ek jagah spawn nahi hote', () => {
    const state = newGame(['a', 'b', 'c', 'd']);
    const positions = state.playerOrder.map((id) => `${state.players[id]?.pos.x},${state.players[id]?.pos.y}`);
    expect(new Set(positions).size).toBe(4);
  });
});

describe('tick — COUNTDOWN -> PLAYING', () => {
  it('countdown khatam hone se pehle players move nahi hote, bomb timer shuru nahi hota', () => {
    let state = newGame();
    state = setInput(state, state.bombHolderId as string, { x: 1, y: 0 });
    const before = state.players[state.bombHolderId as string]?.pos;
    const result = tick(state, 500, 500); // countdown abhi khatam nahi hua (1000ms)
    expect(result.state.phase).toBe('COUNTDOWN');
    expect(result.state.players[state.bombHolderId as string]?.pos).toEqual(before);
    expect(result.events).toHaveLength(0);
  });

  it('countdown khatam hote hi PLAYING shuru hota hai, bomb timer set hota hai', () => {
    const state = newGame();
    const result = tick(state, 1000, 500);
    expect(result.state.phase).toBe('PLAYING');
    expect(result.state.bombEndsAt).toBe(1000 + config.bombDurationMs);
    expect(result.events).toEqual([{ type: 'PLAYING_STARTED' }]);
  });
});

describe('tick — movement + bomb transfer + explosion', () => {
  function playing(): BombTagState {
    return tick(newGame(['a', 'b', 'c']), 1000, 0).state;
  }

  it('alive player apne input ki disha me move karta hai', () => {
    let state = playing();
    const other = state.playerOrder.find((id) => id !== state.bombHolderId) as string;
    const before = state.players[other]?.pos as { x: number; y: number };
    state = setInput(state, other, { x: 1, y: 0 });
    const after = tick(state, 1100, 100).state;
    const moved = after.players[other]?.pos as { x: number; y: number };
    expect(moved.x).toBeGreaterThan(before.x);
  });

  it('bomb-holder doosre player ko chhuye to bomb transfer hoti hai, timer reset hota hai', () => {
    let state = playing();
    const holderId = state.bombHolderId as string;
    const otherId = state.playerOrder.find((id) => id !== holderId) as string;
    // otherId ko seedha holder ke upar teleport karo (input se, bahut tez speed farz karke ek hi jagah)
    // 1400 tak wait karo taaki round-start ka initial cooldown (bombHolderSince=1000, 300ms) khatam ho chuka ho.
    state = teleport(state, otherId, state.players[holderId]?.pos as { x: number; y: number });
    const result = tick(state, 1400, 100);
    expect(result.state.bombHolderId).toBe(otherId);
    expect(result.state.bombEndsAt).toBe(1400 + config.bombDurationMs);
    expect(result.events).toEqual([{ type: 'BOMB_TRANSFERRED', from: holderId, to: otherId }]);
  });

  it('transfer cooldown ke andar dobara transfer nahi hoti (same do players baar-baar pass nahi karte)', () => {
    let state = playing();
    const holderId = state.bombHolderId as string;
    const otherId = state.playerOrder.find((id) => id !== holderId) as string;
    state = teleport(state, otherId, state.players[holderId]?.pos as { x: number; y: number });
    // 1400: round-start cooldown khatam ho chuka, ab pehla transfer ho sakta hai.
    let result = tick(state, 1400, 100);
    expect(result.state.bombHolderId).toBe(otherId); // pehla transfer

    // dono ab bhi touch kar rahe hain, par is transfer ka apna cooldown (300ms) abhi khatam nahi hua
    result = tick(result.state, 1450, 50);
    expect(result.state.bombHolderId).toBe(otherId); // dobara transfer NAHI hua
    expect(result.events).toHaveLength(0);
  });

  it('bomb timer khatam ho to holder explode hokar eliminate hota hai', () => {
    const state = playing();
    const holderId = state.bombHolderId as string;
    const result = tick(state, 1000 + config.bombDurationMs, 100);
    expect(result.state.players[holderId]?.alive).toBe(false);
    expect(result.state.bombHolderId).toBeNull();
    expect(result.events.some((e) => e.type === 'EXPLODED' && e.playerId === holderId)).toBe(true);
  });
});

describe('round-over aur match-win', () => {
  it('sirf ek alive bache to round khatam, winner ko +1 score', () => {
    let state = newGame(['a', 'b']); // 2-player edge case (spec explicit example)
    state = tick(state, 1000, 0).state; // PLAYING
    const holderId = state.bombHolderId as string;
    const result = tick(state, 1000 + config.bombDurationMs, 100);
    const survivor = state.playerOrder.find((id) => id !== holderId) as string;
    expect(result.state.phase).toBe('ROUND_OVER');
    expect(result.state.roundWinnerId).toBe(survivor);
    expect(getScores(result.state)[survivor]).toBe(1);
    expect(result.events.some((e) => e.type === 'ROUND_OVER' && e.winnerId === survivor)).toBe(true);
  });

  it('roundsToWin tak pahunchte hi GAME_OVER', () => {
    const shortConfig = { ...config, roundsToWin: 2 };
    let state = createGame(infos(['a', 'b']), 0, random, { config: shortConfig });
    let matchOver = false;
    for (let round = 0; round < 5 && !matchOver; round++) {
      state = tick(state, state.countdownEndsAt as number, 0).state; // PLAYING
      const result = tick(state, state.bombEndsAt as number, 100);
      state = result.state;
      if (state.phase === 'GAME_OVER') {
        matchOver = true;
        expect(state.matchWinnerId).not.toBeNull();
        expect(getScores(state)[state.matchWinnerId as string]).toBe(shortConfig.roundsToWin);
      } else {
        expect(state.phase).toBe('ROUND_OVER');
        state = startNextRound(state, state.countdownEndsAt ?? 0, random);
      }
    }
    expect(matchOver).toBe(true);
  });

  it('startNextRound sirf ROUND_OVER se hi chalta hai', () => {
    const state = newGame();
    expectCode(() => startNextRound(state, 0, random), 'INVALID_PHASE');
  });

  it('agla round shuru hone par sab wapas alive, positions/bomb reset, score wahi rehta hai', () => {
    let state = newGame(['a', 'b']);
    state = tick(state, 1000, 0).state;
    state = tick(state, 1000 + config.bombDurationMs, 100).state; // ROUND_OVER
    const scoreBefore = getScores(state);
    state = startNextRound(state, 5000, random);
    expect(state.phase).toBe('COUNTDOWN');
    expect(state.round).toBe(2);
    for (const id of state.playerOrder) expect(state.players[id]?.alive).toBe(true);
    expect(getScores(state)).toEqual(scoreBefore);
  });
});

describe('forfeit (disconnect mid-game)', () => {
  it('bomb-holder disconnect ho to bomb kisi doosre alive player ko turant mil jaati hai', () => {
    const state = tick(newGame(['a', 'b', 'c']), 1000, 0).state;
    const holderId = state.bombHolderId as string;
    const result = forfeit(state, holderId, 1100, random);
    expect(result.state.players[holderId]?.alive).toBe(false);
    expect(result.state.bombHolderId).not.toBeNull();
    expect(result.state.bombHolderId).not.toBe(holderId);
    expect(result.events.some((e) => e.type === 'BOMB_TRANSFERRED')).toBe(true);
  });

  it('non-holder disconnect ho to bomb wahi rehti hai', () => {
    const state = tick(newGame(['a', 'b', 'c']), 1000, 0).state;
    const holderId = state.bombHolderId as string;
    const otherId = state.playerOrder.find((id) => id !== holderId) as string;
    const result = forfeit(state, otherId, 1100, random);
    expect(result.state.bombHolderId).toBe(holderId);
    expect(result.state.players[otherId]?.alive).toBe(false);
  });

  it('2 players me ek forfeit kare to doosra turant round jeet jaata hai', () => {
    const state = tick(newGame(['a', 'b']), 1000, 0).state;
    const holderId = state.bombHolderId as string;
    const result = forfeit(state, holderId, 1100, random);
    const survivor = state.playerOrder.find((id) => id !== holderId) as string;
    expect(result.state.phase).toBe('ROUND_OVER');
    expect(result.state.roundWinnerId).toBe(survivor);
  });

  it('pehle se dead player ko dobara forfeit karne se kuch nahi badalta', () => {
    let state = tick(newGame(['a', 'b', 'c']), 1000, 0).state;
    const holderId = state.bombHolderId as string;
    state = forfeit(state, holderId, 1100, random).state;
    const result = forfeit(state, holderId, 1200, random);
    expect(result.events).toHaveLength(0);
  });
});

describe('getGameView', () => {
  it('sabko ek jaisa data dikhta hai (koi hidden field nahi), arena dimensions shamil hain', () => {
    const state = newGame();
    const view = getGameView(state);
    expect(view.arenaWidth).toBe(config.arenaWidth);
    expect(view.arenaHeight).toBe(config.arenaHeight);
    expect(view.playerRadius).toBe(config.playerRadius);
    expect(view.players).toHaveLength(3);
    for (const p of view.players) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(typeof p.alive).toBe('boolean');
    }
  });
});
