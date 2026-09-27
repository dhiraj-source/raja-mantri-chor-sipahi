import { describe, expect, it } from 'vitest';
import type { FreezeTagGameView, FreezeTagRoomView } from '@rmc/shared-types';
import { ftReducer, initialFtState, isFtMessage } from '../src/freeze-tag/ftClientState';

const room: FreezeTagRoomView = {
  code: 'ABCDE',
  hostId: 'a',
  settings: { roomName: '', maxPlayers: 8, roundDurationMs: 120000 },
  players: [{ id: 'a', name: 'Asha', color: '#ef4444', isHost: true, connected: true, ready: true }],
  status: 'LOBBY',
};

const game = (over: Partial<FreezeTagGameView> = {}): FreezeTagGameView => ({
  phase: 'PLAYING',
  arenaWidth: 800,
  arenaHeight: 600,
  playerRadius: 18,
  players: [
    { id: 'a', x: 100, y: 100, status: 'IT' },
    { id: 'b', x: 400, y: 400, status: 'ACTIVE' },
  ],
  itId: 'a',
  roundEndsAt: 120000,
  countdownEndsAt: null,
  winner: null,
  stats: [],
  ...over,
});

describe('isFtMessage', () => {
  it('sirf FT_ se shuru hone wale events pehchanta hai', () => {
    expect(isFtMessage({ event: 'FT_ROOM_STATE' })).toBe(true);
    expect(isFtMessage({ event: 'BT_ROOM_STATE' })).toBe(false);
    expect(isFtMessage({ event: 'DG_ROOM_STATE' })).toBe(false);
    expect(isFtMessage({ event: 'ROOM_STATE' })).toBe(false);
  });
});

describe('ftReducer', () => {
  it('FT_ROOM_STATE / FT_GAME_VIEW state me set hote hain', () => {
    let s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_ROOM_STATE', data: room } });
    expect(s.room).toEqual(room);
    s = ftReducer(s, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    expect(s.game?.itId).toBe('a');
  });

  it('FT_ERROR set hota hai, DISMISS_ERROR saaf karta hai', () => {
    let s = ftReducer(initialFtState, {
      type: 'SERVER',
      message: { event: 'FT_ERROR', data: { code: 'ROOM_FULL', message: 'full' } },
    });
    expect(s.error).toBe('ROOM_FULL');
    s = ftReducer(s, { type: 'DISMISS_ERROR' });
    expect(s.error).toBeNull();
  });

  it('RESET sab kuch initial par le aata hai', () => {
    let s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_ROOM_STATE', data: room } });
    s = ftReducer(s, { type: 'RESET' });
    expect(s).toEqual(initialFtState);
  });

  it('doosre modes ke events chup-chaap ignore hote hain', () => {
    // @ts-expect-error jaan-boojh kar galat event (runtime safety check)
    const s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'BT_GAME_VIEW', data: null } });
    expect(s).toEqual(initialFtState);
  });
});

describe('ftReducer — snapshot diffing (audio/animation events)', () => {
  it('pehla snapshot koi event nahi banata', () => {
    const s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    expect(s.recentEvents).toEqual([]);
  });

  it('ACTIVE -> FROZEN par FROZEN event', () => {
    let s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    const frozen = game({
      players: [
        { id: 'a', x: 100, y: 100, status: 'IT' },
        { id: 'b', x: 400, y: 400, status: 'FROZEN' },
      ],
    });
    s = ftReducer(s, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: frozen } });
    expect(s.recentEvents).toEqual([{ key: 0, type: 'FROZEN', playerId: 'b' }]);
  });

  it('FROZEN -> ACTIVE par UNFROZEN event', () => {
    const frozen = game({
      players: [
        { id: 'a', x: 100, y: 100, status: 'IT' },
        { id: 'b', x: 400, y: 400, status: 'FROZEN' },
      ],
    });
    let s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: frozen } });
    s = ftReducer(s, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    expect(s.recentEvents).toEqual([{ key: 0, type: 'UNFROZEN', playerId: 'b' }]);
  });

  it('IT badalne par IT_CHANGED event', () => {
    let s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    s = ftReducer(s, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game({ itId: 'b' }) } });
    expect(s.recentEvents).toContainEqual({ key: 0, type: 'IT_CHANGED', playerId: 'b' });
  });

  it('round khatam hone par ROUND_OVER event', () => {
    let s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    s = ftReducer(s, {
      type: 'SERVER',
      message: { event: 'FT_GAME_VIEW', data: game({ phase: 'ROUND_OVER', winner: 'PLAYERS' }) },
    });
    expect(s.recentEvents).toContainEqual({ key: 0, type: 'ROUND_OVER', playerId: null });
  });

  it('kuch na badle to koi event nahi', () => {
    let s = ftReducer(initialFtState, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    s = ftReducer(s, { type: 'SERVER', message: { event: 'FT_GAME_VIEW', data: game() } });
    expect(s.recentEvents).toEqual([]);
  });
});
