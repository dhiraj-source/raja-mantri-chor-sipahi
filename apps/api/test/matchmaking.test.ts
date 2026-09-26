import { describe, expect, it } from 'vitest';
import type { PlayerGameView } from '@rmc/shared-types';
import { MatchmakingService } from '../src/rooms/matchmaking.service';
import { RoomError, RoomsService } from '../src/rooms/rooms.service';

function setup() {
  const rooms = new RoomsService();
  return { rooms, mm: new MatchmakingService(rooms) };
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

describe('MatchmakingService', () => {
  it('4 players milte hi room banta hai aur game shuru hota hai', () => {
    const { rooms, mm } = setup();
    expect(mm.join('a', 'Asha')).toEqual({ code: null, waiting: ['a'] });
    expect(mm.join('b', 'Bina').waiting).toEqual(['a', 'b']);
    expect(mm.join('c', 'Charu').waiting).toEqual(['a', 'b', 'c']);
    const result = mm.join('d', 'Dev');

    expect(result.code).toHaveLength(4);
    expect(result.waiting).toEqual([]);
    expect(mm.waiting()).toEqual([]);
    const room = rooms.getRoomView(result.code as string);
    expect(room?.status).toBe('IN_GAME');
    expect(room?.hostId).toBe('a');
    expect(room?.players.map((p) => p.name)).toEqual(['Asha', 'Bina', 'Charu', 'Dev']);
    const view = rooms.getGameViewFor('d') as PlayerGameView;
    expect(view.phase).toBe('ROUND_ACTIVE');
    expect(view.myRole).not.toBeNull();
  });

  it('do alag matches alag rooms me', () => {
    const { mm } = setup();
    const codes = new Set<string>();
    for (const round of ['1', '2']) {
      let code: string | null = null;
      for (const p of ['a', 'b', 'c', 'd']) code = mm.join(p + round, p).code;
      codes.add(code as string);
    }
    expect(codes.size).toBe(2);
  });

  it('dobara queue me ya room me hote hue join reject', () => {
    const { rooms, mm } = setup();
    mm.join('a', 'Asha');
    expectCode(() => mm.join('a', 'Asha'), 'ALREADY_QUEUED');
    rooms.createRoom('r', 'Ravi');
    expectCode(() => mm.join('r', 'Ravi'), 'ALREADY_IN_ROOM');
  });

  it('galat naam par queue me nahi jaata', () => {
    const { mm } = setup();
    expectCode(() => mm.join('a', '   '), 'INVALID_NAME');
    expect(mm.waiting()).toEqual([]);
  });

  it('leave se queue se hatata hai', () => {
    const { mm } = setup();
    mm.join('a', 'Asha');
    mm.join('b', 'Bina');
    expect(mm.leave('a')).toBe(true);
    expect(mm.leave('a')).toBe(false);
    expect(mm.waiting()).toEqual(['b']);
    // Queue me ab b hai; c, d ke baad bhi 3 hi, e aane par 4 => match.
    expect(mm.join('c', 'Charu').code).toBeNull();
    expect(mm.join('d', 'Dev').code).toBeNull();
    expect(mm.join('e', 'Esha').code).not.toBeNull();
    expect(mm.waiting()).toEqual([]);
  });
});
