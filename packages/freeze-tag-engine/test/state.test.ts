import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@rmc/shared-types';
import { DEFAULT_FREEZE_TAG_CONFIG, type FreezeTagConfig } from '../src/config';
import { FreezeTagError } from '../src/errors';
import {
  createGame,
  getGameView,
  removePlayer,
  setInput,
  tick,
  type FreezeTagState,
} from '../src/state';

const NOW = 1_000_000;
const config: FreezeTagConfig = { ...DEFAULT_FREEZE_TAG_CONFIG, countdownMs: 1_000, roundDurationMs: 10_000 };

/** Fixed random: hamesha pehla element chunta hai, shuffle kuch nahi badalta. */
const firstAlways = () => 0;

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` as PlayerId, name: `P${i + 1}` }));
}

function start(n = 3, cfg: FreezeTagConfig = config): FreezeTagState {
  const state = createGame(players(n), NOW, firstAlways, { config: cfg });
  // COUNTDOWN paar karke PLAYING me le jao.
  return tick(state, NOW + cfg.countdownMs, 50).state;
}

/** Test helper: kisi player ko seedha kahin rakh do (collision scenarios banane ke liye). */
function place(state: FreezeTagState, id: PlayerId, x: number, y: number): FreezeTagState {
  const p = state.players[id];
  if (!p) throw new Error(`unknown player ${id}`);
  return { ...state, players: { ...state.players, [id]: { ...p, pos: { x, y } } } };
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(FreezeTagError);
    expect((e as FreezeTagError).code).toBe(code);
    return;
  }
  throw new Error(`Expected error ${code}`);
}

describe('createGame', () => {
  it('ek player IT banta hai, baaki ACTIVE — aur IT server hi chunta hai', () => {
    const state = createGame(players(4), NOW, firstAlways, { config });
    const statuses = state.playerOrder.map((id) => state.players[id]?.status);
    expect(statuses.filter((s) => s === 'IT')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'ACTIVE')).toHaveLength(3);
    expect(state.itId).not.toBeNull();
    expect(state.phase).toBe('COUNTDOWN');
  });

  it('players spawn alag-alag jagah hote hain (ek doosre ke upar nahi)', () => {
    const state = createGame(players(4), NOW, firstAlways, { config });
    const seen = new Set(state.playerOrder.map((id) => `${state.players[id]?.pos.x},${state.players[id]?.pos.y}`));
    expect(seen.size).toBe(4);
  });

  it('bahut kam / bahut zyada players ya duplicate ids reject hote hain', () => {
    expectCode(() => createGame(players(1), NOW, firstAlways, { config }), 'INVALID_PLAYERS');
    expectCode(() => createGame(players(11), NOW, firstAlways, { config }), 'INVALID_PLAYERS');
    expectCode(
      () => createGame([{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }], NOW, firstAlways, { config }),
      'INVALID_PLAYERS',
    );
  });
});

describe('COUNTDOWN -> PLAYING', () => {
  it('countdown khatam hone par hi PLAYING shuru hota hai aur round timer set hota hai', () => {
    const state = createGame(players(3), NOW, firstAlways, { config });
    const early = tick(state, NOW + 500, 50);
    expect(early.state.phase).toBe('COUNTDOWN');
    expect(early.state.roundEndsAt).toBeNull();

    const started = tick(state, NOW + 1_000, 50);
    expect(started.state.phase).toBe('PLAYING');
    expect(started.state.roundEndsAt).toBe(NOW + 1_000 + config.roundDurationMs);
    expect(started.events).toContainEqual({ type: 'PLAYING_STARTED', itId: started.state.itId });
  });
});

describe('movement', () => {
  it('ACTIVE player input ke hisaab se chalta hai', () => {
    let state = start(3);
    const mover = state.playerOrder.find((id) => state.players[id]?.status === 'ACTIVE') as PlayerId;
    state = place(state, mover, 400, 300);
    state = setInput(state, mover, { x: 1, y: 0 });
    const after = tick(state, NOW + 2_000, 100).state;
    expect(after.players[mover]?.pos.x).toBeGreaterThan(400);
  });

  it('FROZEN player kabhi nahi hilta, chahe input bhejta rahe (server hi rokta hai)', () => {
    let state = start(3);
    const it = state.itId as PlayerId;
    const victim = state.playerOrder.find((id) => id !== it) as PlayerId;
    // Victim ko IT ke paas rakh kar freeze karwa do.
    state = place(state, it, 400, 300);
    state = place(state, victim, 410, 300);
    state = tick(state, NOW + 2_000, 50).state;
    expect(state.players[victim]?.status).toBe('FROZEN');

    const frozenAt = { ...(state.players[victim] as { pos: { x: number; y: number } }).pos };
    state = setInput(state, victim, { x: 1, y: 1 });
    state = tick(state, NOW + 2_100, 100).state;
    expect(state.players[victim]?.pos).toEqual(frozenAt);
  });
});

describe('freeze (IT ka tag)', () => {
  it('IT paas aaye to ACTIVE player FROZEN ho jaata hai, aur stats badhte hain', () => {
    let state = start(3);
    const it = state.itId as PlayerId;
    const victim = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 400, 300);
    state = place(state, victim, 420, 300);

    const result = tick(state, NOW + 2_000, 50);
    expect(result.state.players[victim]?.status).toBe('FROZEN');
    expect(result.state.players[victim]?.timesFrozen).toBe(1);
    expect(result.state.players[it]?.freezes).toBe(1);
    expect(result.events).toContainEqual({ type: 'PLAYER_FROZEN', playerId: victim, byId: it });
  });

  it('door ka player freeze nahi hota', () => {
    let state = start(3);
    const it = state.itId as PlayerId;
    const other = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 100, 100);
    state = place(state, other, 700, 500);
    const result = tick(state, NOW + 2_000, 50);
    expect(result.state.players[other]?.status).toBe('ACTIVE');
  });

  it('pehle se FROZEN player dobara freeze nahi hota (duplicate event nahi)', () => {
    let state = start(3);
    const it = state.itId as PlayerId;
    const victim = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 400, 300);
    state = place(state, victim, 410, 300);
    state = tick(state, NOW + 2_000, 50).state;
    expect(state.players[victim]?.timesFrozen).toBe(1);

    const again = tick(state, NOW + 2_050, 50);
    expect(again.state.players[victim]?.timesFrozen).toBe(1);
    expect(again.events.filter((e) => e.type === 'PLAYER_FROZEN')).toHaveLength(0);
  });

  it('IT khud ko freeze nahi kar sakta', () => {
    const state = start(3);
    const it = state.itId as PlayerId;
    const after = tick(state, NOW + 2_000, 50).state;
    expect(after.players[it]?.status).toBe('IT');
  });
});

describe('unfreeze (saathi ka rescue)', () => {
  it('ACTIVE player paas jaakar FROZEN saathi ko wapas zinda karta hai', () => {
    let state = start(4);
    const it = state.itId as PlayerId;
    const [victim, rescuer] = state.playerOrder.filter((id) => id !== it) as PlayerId[];

    // Pehle victim ko freeze karwao, phir IT ko door bhej do.
    state = place(state, it, 400, 300);
    state = place(state, victim as PlayerId, 410, 300);
    state = tick(state, NOW + 2_000, 50).state;
    expect(state.players[victim as PlayerId]?.status).toBe('FROZEN');

    state = place(state, it, 50, 50);
    state = place(state, rescuer as PlayerId, 415, 300);
    const result = tick(state, NOW + 2_100, 50);

    expect(result.state.players[victim as PlayerId]?.status).toBe('ACTIVE');
    expect(result.state.players[rescuer as PlayerId]?.unfreezes).toBe(1);
    expect(result.events).toContainEqual({ type: 'PLAYER_UNFROZEN', playerId: victim, byId: rescuer });
  });

  it('IT kisi ko unfreeze nahi kar sakta', () => {
    let state = start(3);
    const it = state.itId as PlayerId;
    const victim = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 400, 300);
    state = place(state, victim, 410, 300);
    state = tick(state, NOW + 2_000, 50).state;
    expect(state.players[victim]?.status).toBe('FROZEN');

    // IT wahin khada hai — agle tick me bhi victim frozen hi rehna chahiye.
    const after = tick(state, NOW + 4_000, 50).state;
    expect(after.players[victim]?.status).toBe('FROZEN');
  });

  it('thaw ke turant baad IT dobara freeze nahi kar sakta (immunity)', () => {
    let state = start(4);
    const it = state.itId as PlayerId;
    const [victim, rescuer] = state.playerOrder.filter((id) => id !== it) as PlayerId[];
    state = place(state, it, 400, 300);
    state = place(state, victim as PlayerId, 410, 300);
    state = tick(state, NOW + 2_000, 50).state;

    // Rescuer thaw karta hai jabki IT abhi bhi paas hi khada hai.
    state = place(state, rescuer as PlayerId, 415, 300);
    state = tick(state, NOW + 2_100, 50).state;
    expect(state.players[victim as PlayerId]?.status).toBe('ACTIVE');

    // Immunity ke andar: IT paas hone ke baawajood dobara freeze nahi kar sakta.
    state = tick(state, NOW + 2_200, 50).state;
    expect(state.players[victim as PlayerId]?.status).toBe('ACTIVE');

    // Immunity khatam hone ke baad freeze ho jaata hai.
    state = tick(state, NOW + 2_100 + config.thawImmunityMs + 10, 50).state;
    expect(state.players[victim as PlayerId]?.status).toBe('FROZEN');
  });
});

describe('win conditions', () => {
  it('sab non-IT players frozen ho jaayen to IT jeetta hai', () => {
    let state = start(2);
    const it = state.itId as PlayerId;
    const other = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 400, 300);
    state = place(state, other, 410, 300);

    const result = tick(state, NOW + 2_000, 50);
    expect(result.state.phase).toBe('ROUND_OVER');
    expect(result.state.winner).toBe('IT');
    expect(result.events).toContainEqual({ type: 'ROUND_OVER', winner: 'IT' });
  });

  it('timer khatam ho jaye aur koi bacha ho to players jeette hain', () => {
    const state = start(3);
    const result = tick(state, NOW + config.countdownMs + config.roundDurationMs + 1, 50);
    expect(result.state.phase).toBe('ROUND_OVER');
    expect(result.state.winner).toBe('PLAYERS');
  });

  it('aakhri freeze aur timer-end ek hi tick me hon to IT jeetta hai (order fix hai)', () => {
    let state = start(2);
    const it = state.itId as PlayerId;
    const other = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 400, 300);
    state = place(state, other, 410, 300);
    // Bilkul us waqt tick karo jab round ka time bhi khatam ho raha ho.
    const result = tick(state, state.roundEndsAt as number, 50);
    expect(result.state.winner).toBe('IT');
  });

  it('round khatam hone ke baad aage ke ticks kuch nahi badalte', () => {
    let state = start(2);
    const it = state.itId as PlayerId;
    const other = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 400, 300);
    state = place(state, other, 410, 300);
    state = tick(state, NOW + 2_000, 50).state;
    const after = tick(state, NOW + 5_000, 50);
    expect(after.state).toEqual(state);
    expect(after.events).toEqual([]);
  });
});

describe('removePlayer (disconnect / leave)', () => {
  it('player sach me hat jaata hai — koi "bhoot" nahi bachta', () => {
    const state = start(4);
    const victim = state.playerOrder.find((id) => id !== state.itId) as PlayerId;
    const after = removePlayer(state, victim, NOW + 2_000, firstAlways).state;
    expect(after.playerOrder).not.toContain(victim);
    expect(after.players[victim]).toBeUndefined();
    expect(getGameView(after).players.map((p) => p.id)).not.toContain(victim);
  });

  it('IT chala jaye to naya IT turant chun liya jaata hai', () => {
    const state = start(4);
    const oldIt = state.itId as PlayerId;
    const result = removePlayer(state, oldIt, NOW + 2_000, firstAlways);
    expect(result.state.itId).not.toBeNull();
    expect(result.state.itId).not.toBe(oldIt);
    expect(result.state.players[result.state.itId as PlayerId]?.status).toBe('IT');
    expect(result.events.some((e) => e.type === 'IT_CHANGED')).toBe(true);
  });

  it('itne kam players bachein ki khel na sake to round khatam (players jeette hain)', () => {
    const state = start(2);
    const other = state.playerOrder.find((id) => id !== state.itId) as PlayerId;
    const result = removePlayer(state, other, NOW + 2_000, firstAlways);
    expect(result.state.phase).toBe('ROUND_OVER');
    expect(result.state.winner).toBe('PLAYERS');
  });

  it('anjaan player hatane par kuch nahi hota (crash nahi)', () => {
    const state = start(3);
    const result = removePlayer(state, 'nobody' as PlayerId, NOW + 2_000, firstAlways);
    expect(result.state).toEqual(state);
    expect(result.events).toEqual([]);
  });
});

describe('getGameView / stats', () => {
  it('view me har player ka status aur round ke stats aate hain', () => {
    let state = start(3);
    const it = state.itId as PlayerId;
    const victim = state.playerOrder.find((id) => id !== it) as PlayerId;
    state = place(state, it, 400, 300);
    state = place(state, victim, 410, 300);
    state = tick(state, NOW + 2_000, 50).state;

    const view = getGameView(state);
    expect(view.itId).toBe(it);
    expect(view.players.find((p) => p.id === victim)?.status).toBe('FROZEN');
    expect(view.stats.find((s) => s.id === it)?.freezes).toBe(1);
    expect(view.stats.find((s) => s.id === victim)?.timesFrozen).toBe(1);
    expect(view.stats.find((s) => s.id === victim)?.frozenAtEnd).toBe(true);
  });
});
