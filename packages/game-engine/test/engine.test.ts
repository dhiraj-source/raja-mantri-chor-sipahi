import { describe, expect, it } from 'vitest';
import { ROLES, type PlayerId, type Role } from '@rmc/shared-types';
import {
  DEFAULT_CONFIG,
  GameEngineError,
  assignRoles,
  calculateRoundScore,
  createGame,
  getPlayerView,
  getStandings,
  getWinnerIds,
  nextRound,
  shuffle,
  startGame,
  submitGuess,
  type GameState,
  type RandomSource,
} from '../src';

/** Fixed-seed random taaki tests hamesha same chalein. */
function seeded(seed: number): RandomSource {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const players = [
  { id: 'p1', name: 'Asha' },
  { id: 'p2', name: 'Bina' },
  { id: 'p3', name: 'Charu' },
  { id: 'p4', name: 'Dev' },
];
const ids = players.map((p) => p.id);

function idWithRole(state: GameState, role: Role): PlayerId {
  return Object.keys(state.roles ?? {}).find((id) => state.roles?.[id] === role) as PlayerId;
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameEngineError);
    expect((e as GameEngineError).code).toBe(code);
    return;
  }
  throw new Error(`Expected error ${code}`);
}

describe('shuffle', () => {
  it('same items return karta hai aur original nahi badalta', () => {
    const input = [1, 2, 3, 4];
    const out = shuffle(input, seeded(1));
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
    expect(input).toEqual([1, 2, 3, 4]);
  });
});

describe('assignRoles', () => {
  it('har player ko alag role deta hai', () => {
    for (let seed = 0; seed < 50; seed++) {
      const roles = assignRoles(ids, seeded(seed));
      expect(Object.values(roles).sort()).toEqual([...ROLES].sort());
      expect(Object.keys(roles).sort()).toEqual(ids);
    }
  });

  it('same seed = same result', () => {
    expect(assignRoles(ids, seeded(7))).toEqual(assignRoles(ids, seeded(7)));
  });

  it('galat players par error deta hai', () => {
    expectCode(() => assignRoles(['a', 'b', 'c']), 'INVALID_PLAYERS');
    expectCode(() => assignRoles(['a', 'a', 'b', 'c']), 'INVALID_PLAYERS');
  });
});

describe('calculateRoundScore', () => {
  const roles: Record<PlayerId, Role> = {
    p1: 'RAJA',
    p2: 'MANTRI',
    p3: 'SIPAHI',
    p4: 'CHOR',
  };

  it('sahi guess: sabko role ke points', () => {
    const s = calculateRoundScore(roles, 'p4', DEFAULT_CONFIG);
    expect(s.guessCorrect).toBe(true);
    expect(s.points).toEqual({ p1: 1000, p2: 800, p3: 500, p4: 0 });
  });

  it('galat guess: Mantri 0, Chor ko Mantri ke points', () => {
    const s = calculateRoundScore(roles, 'p3', DEFAULT_CONFIG);
    expect(s.guessCorrect).toBe(false);
    expect(s.points).toEqual({ p1: 1000, p2: 0, p3: 500, p4: 800 });
  });
});

describe('createGame', () => {
  it('LOBBY state banata hai, sab ke 0 points', () => {
    const g = createGame(players);
    expect(g.phase).toBe('LOBBY');
    expect(g.totals).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(g.roles).toBeNull();
  });

  it('galat players ya config reject karta hai', () => {
    expectCode(() => createGame(players.slice(0, 3)), 'INVALID_PLAYERS');
    expectCode(() => createGame([...players.slice(0, 3), { id: 'p1', name: 'X' }]), 'INVALID_PLAYERS');
    expectCode(() => createGame(players, { ...DEFAULT_CONFIG, totalRounds: 0 }), 'INVALID_CONFIG');
  });
});

describe('game flow', () => {
  it('LOBBY -> ROUND_ACTIVE -> ROUND_RESULT -> ... -> GAME_RESULT', () => {
    const random = seeded(42);
    let g = createGame(players);
    g = startGame(g, random);
    expect(g.phase).toBe('ROUND_ACTIVE');
    expect(g.roundNumber).toBe(1);

    for (let round = 1; round <= DEFAULT_CONFIG.totalRounds; round++) {
      expect(g.phase).toBe('ROUND_ACTIVE');
      g = submitGuess(g, idWithRole(g, 'MANTRI'), idWithRole(g, 'CHOR'));
      expect(g.phase).toBe('ROUND_RESULT');
      expect(g.history).toHaveLength(round);
      g = nextRound(g, random);
    }
    expect(g.phase).toBe('GAME_RESULT');
    expect(g.roles).toBeNull();
    // Har round sahi guess = 2300 points per round.
    const sum = Object.values(g.totals).reduce((a, b) => a + b, 0);
    expect(sum).toBe(2300 * DEFAULT_CONFIG.totalRounds);
  });

  it('state immutable rehti hai', () => {
    const lobby = createGame(players);
    startGame(lobby, seeded(1));
    expect(lobby.phase).toBe('LOBBY');
    expect(lobby.roundNumber).toBe(0);
  });

  it('galat phase me action reject hota hai', () => {
    const lobby = createGame(players);
    expectCode(() => submitGuess(lobby, 'p1', 'p2'), 'INVALID_PHASE');
    expectCode(() => nextRound(lobby), 'INVALID_PHASE');
    const active = startGame(lobby, seeded(1));
    expectCode(() => startGame(active), 'INVALID_PHASE');
    expectCode(() => nextRound(active), 'INVALID_PHASE');
  });

  it('sirf Mantri guess kar sakta hai', () => {
    const g = startGame(createGame(players), seeded(3));
    expectCode(() => submitGuess(g, idWithRole(g, 'RAJA'), idWithRole(g, 'CHOR')), 'NOT_MANTRI');
    expectCode(() => submitGuess(g, idWithRole(g, 'CHOR'), idWithRole(g, 'SIPAHI')), 'NOT_MANTRI');
  });

  it('Mantri khud ko ya Raja ko guess nahi kar sakta', () => {
    const g = startGame(createGame(players), seeded(3));
    const mantri = idWithRole(g, 'MANTRI');
    expectCode(() => submitGuess(g, mantri, mantri), 'INVALID_GUESS');
    expectCode(() => submitGuess(g, mantri, idWithRole(g, 'RAJA')), 'INVALID_GUESS');
    expectCode(() => submitGuess(g, mantri, 'unknown'), 'INVALID_GUESS');
  });

  it('galat guess se Chor ko points milte hain', () => {
    let g = startGame(createGame(players), seeded(5));
    const mantri = idWithRole(g, 'MANTRI');
    const chor = idWithRole(g, 'CHOR');
    g = submitGuess(g, mantri, idWithRole(g, 'SIPAHI'));
    expect(g.totals[mantri]).toBe(0);
    expect(g.totals[chor]).toBe(800);
    expect(g.history[0]?.guessCorrect).toBe(false);
  });
});

describe('standings / winners', () => {
  it('sorted standings aur winners', () => {
    let g = startGame(createGame(players), seeded(9));
    g = submitGuess(g, idWithRole(g, 'MANTRI'), idWithRole(g, 'CHOR'));
    const standings = getStandings(g);
    expect(standings[0]?.total).toBe(1000);
    expect(getWinnerIds(g)).toEqual([idWithRole(g, 'RAJA')]);
  });

  it('tie me sabhi winners', () => {
    expect(getWinnerIds(createGame(players))).toEqual(ids);
  });
});

describe('getPlayerView (secrets hide hote hain)', () => {
  it('ROUND_ACTIVE: Sipahi/Chor doosron ko nahi dikhte', () => {
    const g = startGame(createGame(players), seeded(11));
    const raja = idWithRole(g, 'RAJA');
    const mantri = idWithRole(g, 'MANTRI');
    const sipahi = idWithRole(g, 'SIPAHI');
    const chor = idWithRole(g, 'CHOR');

    const rajaView = getPlayerView(g, raja);
    expect(rajaView.visibleRoles).toEqual({ [raja]: 'RAJA', [mantri]: 'MANTRI' });
    expect(rajaView.canGuess).toBe(false);

    const chorView = getPlayerView(g, chor);
    expect(chorView.myRole).toBe('CHOR');
    expect(chorView.visibleRoles[sipahi]).toBeUndefined();
    expect(chorView.visibleRoles[chor]).toBe('CHOR');

    expect(getPlayerView(g, mantri).canGuess).toBe(true);
  });

  it('ROUND_RESULT: sab roles khul jaate hain', () => {
    let g = startGame(createGame(players), seeded(11));
    g = submitGuess(g, idWithRole(g, 'MANTRI'), idWithRole(g, 'CHOR'));
    const view = getPlayerView(g, idWithRole(g, 'RAJA'));
    expect(Object.keys(view.visibleRoles)).toHaveLength(4);
    expect(view.canGuess).toBe(false);
  });

  it('winnerIds sirf GAME_RESULT me bharta hai', () => {
    const random = seeded(21);
    let g = startGame(createGame(players), random);
    expect(getPlayerView(g, 'p1').winnerIds).toEqual([]);
    for (let r = 0; r < DEFAULT_CONFIG.totalRounds; r++) {
      g = submitGuess(g, idWithRole(g, 'MANTRI'), idWithRole(g, 'CHOR'));
      expect(getPlayerView(g, 'p1').winnerIds).toEqual([]);
      g = nextRound(g, random);
    }
    expect(g.phase).toBe('GAME_RESULT');
    expect(getPlayerView(g, 'p1').winnerIds).toEqual(getWinnerIds(g));
    expect(getPlayerView(g, 'p1').winnerIds.length).toBeGreaterThan(0);
  });

  it('LOBBY me koi role nahi', () => {
    const view = getPlayerView(createGame(players), 'p1');
    expect(view.visibleRoles).toEqual({});
    expect(view.myRole).toBeNull();
  });
});
