import { describe, expect, it } from 'vitest';
import type { BombTagGameView, BombTagRoomView } from '@rmc/shared-types';
import { btReducer, initialBtState, isBtMessage } from '../src/bomb-tag/btClientState';

const room: BombTagRoomView = {
  code: 'ABCDE',
  hostId: 'a',
  settings: { roomName: '', maxPlayers: 8, bombDurationMs: 15000, roundsToWin: 3 },
  players: [{ id: 'a', name: 'Asha', color: '#ef4444', isHost: true, connected: true, ready: true, score: 0 }],
  status: 'LOBBY',
};

const game: BombTagGameView = {
  phase: 'PLAYING',
  round: 1,
  roundsToWin: 3,
  arenaWidth: 800,
  arenaHeight: 600,
  playerRadius: 18,
  players: [{ id: 'a', x: 400, y: 300, alive: true }],
  bombHolderId: 'a',
  bombEndsAt: 15000,
  countdownEndsAt: null,
  roundWinnerId: null,
  matchWinnerId: null,
};

describe('isBtMessage', () => {
  it('BT_ se shuru hone wale events pehchanta hai', () => {
    expect(isBtMessage({ event: 'BT_ROOM_STATE' })).toBe(true);
    expect(isBtMessage({ event: 'ROOM_STATE' })).toBe(false);
    expect(isBtMessage({ event: 'DG_ROOM_STATE' })).toBe(false);
    expect(isBtMessage({ event: 'CONNECTED' })).toBe(false);
  });
});

describe('btReducer', () => {
  it('BT_ROOM_STATE room set karta hai', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_ROOM_STATE', data: room } });
    expect(state.room).toEqual(room);
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_ROOM_STATE', data: null } });
    expect(state.room).toBeNull();
  });

  it('BT_GAME_VIEW game set karta hai', () => {
    const state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: game } });
    expect(state.game).toEqual(game);
  });

  it('BT_ERROR error set karta hai, DISMISS_ERROR saaf karta hai', () => {
    let state = btReducer(initialBtState, {
      type: 'SERVER',
      message: { event: 'BT_ERROR', data: { code: 'ROOM_FULL', message: 'full' } },
    });
    expect(state.error).toBe('ROOM_FULL');
    state = btReducer(state, { type: 'DISMISS_ERROR' });
    expect(state.error).toBeNull();
  });

  it('RESET poori state initial par le jaata hai', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_ROOM_STATE', data: room } });
    state = btReducer(state, { type: 'RESET' });
    expect(state).toEqual(initialBtState);
  });

  it('anjaan/RMCS/DG events chup-chaap ignore hote hain', () => {
    // @ts-expect-error jaan-boojh kar galat event pass kiya (runtime safety check)
    const state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'DG_ROOM_STATE', data: null } });
    expect(state).toEqual(initialBtState);
  });
});

describe('btReducer — client-side event diffing (audio/banner ke liye)', () => {
  const twoPlayerGame: BombTagGameView = {
    ...game,
    players: [
      { id: 'a', x: 400, y: 300, alive: true },
      { id: 'b', x: 100, y: 100, alive: true },
    ],
    bombHolderId: 'a',
  };

  it('pehla BT_GAME_VIEW koi event nahi banata (prev null hota hai)', () => {
    const state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: twoPlayerGame } });
    expect(state.recentEvents).toEqual([]);
  });

  it('bomb doosre player ke paas jaaye to TAG event banta hai', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: twoPlayerGame } });
    const tagged = { ...twoPlayerGame, bombHolderId: 'b' };
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: tagged } });
    expect(state.recentEvents).toEqual([{ key: 0, type: 'TAG', playerId: 'b' }]);
  });

  it('round-start bomb assignment (prev bombHolderId null) TAG event nahi banata', () => {
    const roundOver = { ...twoPlayerGame, phase: 'ROUND_OVER' as const, bombHolderId: null };
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: roundOver } });
    const nextRound = { ...twoPlayerGame, phase: 'COUNTDOWN' as const, bombHolderId: 'a', round: 2 };
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: nextRound } });
    expect(state.recentEvents.some((e) => e.type === 'TAG')).toBe(false);
  });

  it('player alive:true se false ho to EXPLODE event banta hai', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: twoPlayerGame } });
    const exploded = { ...twoPlayerGame, players: [twoPlayerGame.players[0] as never, { id: 'b', x: 100, y: 100, alive: false }] };
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: exploded } });
    expect(state.recentEvents).toEqual([{ key: 0, type: 'EXPLODE', playerId: 'b' }]);
  });

  it('phase PLAYING -> ROUND_OVER par ROUND_WIN event banta hai, winner ke saath', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: twoPlayerGame } });
    const roundOver = { ...twoPlayerGame, phase: 'ROUND_OVER' as const, roundWinnerId: 'a' };
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: roundOver } });
    expect(state.recentEvents).toContainEqual({ key: 0, type: 'ROUND_WIN', playerId: 'a' });
  });

  it('phase -> GAME_OVER par MATCH_WIN event banta hai, matchWinnerId ke saath', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: twoPlayerGame } });
    const gameOver = { ...twoPlayerGame, phase: 'GAME_OVER' as const, matchWinnerId: 'a' };
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: gameOver } });
    expect(state.recentEvents).toContainEqual({ key: 0, type: 'MATCH_WIN', playerId: 'a' });
  });

  it('kuch na badle to koi event nahi banta', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: twoPlayerGame } });
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: { ...twoPlayerGame } } });
    expect(state.recentEvents).toEqual([]);
  });

  it('BT_GAME_VIEW null (room chhod diya) par game null hota hai, crash nahi', () => {
    let state = btReducer(initialBtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: twoPlayerGame } });
    state = btReducer(state, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: null } });
    expect(state.game).toBeNull();
  });
});
