import { describe, expect, it } from 'vitest';
import type { PlayerGameView, RoomView } from '@rmc/shared-types';
import {
  clientReducer,
  initialClientState,
  parseServerMessage,
  reconnectDelay,
  type ClientState,
} from '../src/net/clientState';

const room: RoomView = {
  code: 'ABCD',
  hostId: 'a',
  players: [{ id: 'a', name: 'Asha', isHost: true }],
  status: 'LOBBY',
};

const game = { phase: 'ROUND_ACTIVE' } as PlayerGameView;

describe('clientReducer', () => {
  it('server messages state me store hote hain', () => {
    let s: ClientState = clientReducer(initialClientState, { type: 'SOCKET_OPEN' });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'CONNECTED', data: { playerId: 'a' } } });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'ROOM_STATE', data: room } });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'GAME_VIEW', data: game } });
    expect(s).toMatchObject({ connection: 'open', playerId: 'a', room, game, error: null });
  });

  it('ERROR dikhta hai aur dismiss se hat jata hai', () => {
    let s = clientReducer(initialClientState, {
      type: 'SERVER',
      message: { event: 'ERROR', data: { code: 'ROOM_FULL', message: 'Room full hai.' } },
    });
    expect(s.error).toBe('ROOM_FULL');
    s = clientReducer(s, { type: 'DISMISS_ERROR' });
    expect(s.error).toBeNull();
  });

  it('leave par ROOM_STATE null se home wapas', () => {
    let s = clientReducer(initialClientState, { type: 'SERVER', message: { event: 'ROOM_STATE', data: room } });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'ROOM_STATE', data: null } });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'GAME_VIEW', data: null } });
    expect(s.room).toBeNull();
    expect(s.game).toBeNull();
  });

  it('connection tootne par room/game/playerId saaf', () => {
    let s = clientReducer(initialClientState, { type: 'SERVER', message: { event: 'ROOM_STATE', data: room } });
    s = clientReducer(s, { type: 'SOCKET_CLOSED' });
    expect(s).toMatchObject({ connection: 'closed', room: null, game: null, playerId: null });
  });
});

describe('queue and reactions', () => {
  it('QUEUE_STATE store hota hai aur null par queue khatam', () => {
    let s = clientReducer(initialClientState, {
      type: 'SERVER',
      message: { event: 'QUEUE_STATE', data: { size: 2 } },
    });
    expect(s.queue).toEqual({ size: 2 });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'QUEUE_STATE', data: null } });
    expect(s.queue).toBeNull();
  });

  it('reactions unique key ke saath judti hain, sirf haal ki 6 rehti hain, expire se hatti hain', () => {
    let s = initialClientState;
    for (let i = 0; i < 8; i++) {
      s = clientReducer(s, {
        type: 'SERVER',
        message: { event: 'REACTION', data: { playerId: 'a', emoji: '😂' } },
      });
    }
    expect(s.reactions).toHaveLength(6);
    expect(new Set(s.reactions.map((r) => r.key)).size).toBe(6);
    const oldest = s.reactions[0]?.key as number;
    s = clientReducer(s, { type: 'EXPIRE_REACTION', key: oldest });
    expect(s.reactions).toHaveLength(5);
    expect(s.reactions.some((r) => r.key === oldest)).toBe(false);
  });

  it('connection close par queue aur reactions saaf', () => {
    let s = clientReducer(initialClientState, {
      type: 'SERVER',
      message: { event: 'QUEUE_STATE', data: { size: 1 } },
    });
    s = clientReducer(s, { type: 'SOCKET_CLOSED' });
    expect(s.queue).toBeNull();
    expect(s.reactions).toEqual([]);
  });
});

describe('reconnect', () => {
  const connected = (playerId: string) =>
    ({ type: 'SERVER', message: { event: 'CONNECTED', data: { playerId, token: 't' } } }) as const;

  it('reconnecting me room/game screen par rehte hain', () => {
    let s = clientReducer(initialClientState, connected('a'));
    s = clientReducer(s, { type: 'SERVER', message: { event: 'ROOM_STATE', data: room } });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'GAME_VIEW', data: game } });
    s = clientReducer(s, { type: 'SOCKET_RECONNECTING' });
    expect(s).toMatchObject({ connection: 'reconnecting', playerId: 'a', room, game });
  });

  it('wahi player wapas mila: room/game safe', () => {
    let s = clientReducer(initialClientState, connected('a'));
    s = clientReducer(s, { type: 'SERVER', message: { event: 'ROOM_STATE', data: room } });
    s = clientReducer(s, { type: 'SOCKET_RECONNECTING' });
    s = clientReducer(s, connected('a'));
    expect(s.room).toEqual(room);
  });

  it('server ne naya player diya (session expire): purani room/game saaf', () => {
    let s = clientReducer(initialClientState, connected('a'));
    s = clientReducer(s, { type: 'SERVER', message: { event: 'ROOM_STATE', data: room } });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'GAME_VIEW', data: game } });
    s = clientReducer(s, { type: 'SOCKET_RECONNECTING' });
    s = clientReducer(s, connected('b'));
    expect(s).toMatchObject({ playerId: 'b', room: null, game: null });
  });

  it('retry delay badhta hai, 8s par ruk jata hai', () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
});

describe('parseServerMessage', () => {
  it('sahi JSON parse hota hai', () => {
    expect(parseServerMessage('{"event":"ERROR","data":{"code":"X","message":"m"}}')?.event).toBe('ERROR');
  });
  it('kharab data par null', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('123')).toBeNull();
    expect(parseServerMessage('{"foo":1}')).toBeNull();
  });
});
