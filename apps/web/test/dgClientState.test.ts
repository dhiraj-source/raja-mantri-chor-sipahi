import { describe, expect, it } from 'vitest';
import type { DrawGuessGameView, DrawGuessRoomView } from '@rmc/shared-types';
import { dgReducer, initialDgState, isDgMessage } from '../src/draw-guess/dgClientState';

const room: DrawGuessRoomView = {
  code: 'ABCDE',
  hostId: 'a',
  settings: { roomName: '', maxPlayers: 8, totalRounds: 3, wordsToChoose: 3, drawTimeMs: 60000, customWords: [] },
  players: [{ id: 'a', name: 'Asha', isHost: true, connected: true, ready: true }],
  status: 'LOBBY',
};

const game: DrawGuessGameView = {
  phase: 'DRAWING',
  players: [],
  totalRounds: 3,
  round: 1,
  turn: 0,
  totalTurns: 3,
  drawerId: 'a',
  isDrawer: false,
  wordChoices: null,
  word: null,
  maskedWord: '_ _ _',
  wordLength: 3,
  turnStartedAt: 0,
  turnEndsAt: 60000,
  correctGuesserIds: [],
  myGuessedCorrectly: false,
  history: [],
  winnerIds: [],
};

describe('isDgMessage', () => {
  it('DG_ se shuru hone wale events pehchanta hai', () => {
    expect(isDgMessage({ event: 'DG_ROOM_STATE' })).toBe(true);
    expect(isDgMessage({ event: 'ROOM_STATE' })).toBe(false);
    expect(isDgMessage({ event: 'CONNECTED' })).toBe(false);
  });
});

describe('dgReducer', () => {
  it('DG_ROOM_STATE room set karta hai, null aane par chat bhi saaf hoti hai', () => {
    let state = dgReducer(initialDgState, { type: 'SERVER', message: { event: 'DG_ROOM_STATE', data: room } });
    expect(state.room).toEqual(room);
    state = { ...state, chat: [{ kind: 'SYSTEM', key: 1, text: 'hi', at: 0 }] };
    state = dgReducer(state, { type: 'SERVER', message: { event: 'DG_ROOM_STATE', data: null } });
    expect(state.room).toBeNull();
    expect(state.chat).toEqual([]);
  });

  it('DG_GAME_VIEW game set karta hai', () => {
    const state = dgReducer(initialDgState, { type: 'SERVER', message: { event: 'DG_GAME_VIEW', data: game } });
    expect(state.game).toEqual(game);
  });

  it('DG_CHAT_MESSAGE entries append hoti hain', () => {
    let state = initialDgState;
    state = dgReducer(state, {
      type: 'SERVER',
      message: { event: 'DG_CHAT_MESSAGE', data: { kind: 'SYSTEM', key: 1, text: 'joined', at: 0 } },
    });
    state = dgReducer(state, {
      type: 'SERVER',
      message: { event: 'DG_CHAT_MESSAGE', data: { kind: 'CHAT', key: 2, playerId: 'a', name: 'Asha', text: 'hi', at: 1 } },
    });
    expect(state.chat).toHaveLength(2);
    expect(state.chat[1]).toMatchObject({ kind: 'CHAT', text: 'hi' });
  });

  it('DG_ERROR error set karta hai, DISMISS_ERROR saaf karta hai', () => {
    let state = dgReducer(initialDgState, {
      type: 'SERVER',
      message: { event: 'DG_ERROR', data: { code: 'ROOM_FULL', message: 'full' } },
    });
    expect(state.error).toBe('ROOM_FULL');
    state = dgReducer(state, { type: 'DISMISS_ERROR' });
    expect(state.error).toBeNull();
  });

  it('RESET poori state initial par le jaata hai', () => {
    let state = dgReducer(initialDgState, { type: 'SERVER', message: { event: 'DG_ROOM_STATE', data: room } });
    state = dgReducer(state, { type: 'RESET' });
    expect(state).toEqual(initialDgState);
  });

  it('anjaan/RMCS events chup-chaap ignore hote hain', () => {
    // @ts-expect-error jaan-boojh kar galat event pass kiya (runtime safety check)
    const state = dgReducer(initialDgState, { type: 'SERVER', message: { event: 'ROOM_STATE', data: null } });
    expect(state).toEqual(initialDgState);
  });
});
