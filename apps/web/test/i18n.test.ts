import { describe, expect, it } from 'vitest';
import { RECONNECT_TOKEN_PARAM, ROLES, type RoomErrorCode } from '@rmc/shared-types';
import { en, hi, translate, type MessageKey } from '../src/i18n/messages';

const keys = Object.keys(en) as MessageKey[];
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('i18n', () => {
  it('Hindi me har English key hai aur koi khaali nahi', () => {
    for (const key of keys) {
      expect(hi[key], key).toBeTruthy();
    }
    expect(Object.keys(hi).sort()).toEqual([...keys].sort());
  });

  it('dono languages me same placeholders', () => {
    for (const key of keys) {
      expect(placeholders(hi[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('placeholders bharte hain, adhure wale waise hi rehte hain', () => {
    expect(translate('en', 'game.round', { n: 2, total: 4 })).toBe('Round 2 / 4');
    expect(translate('hi', 'game.round', { n: 2, total: 4 })).toBe('राउंड 2 / 4');
    expect(translate('en', 'game.round', { n: 2 })).toBe('Round 2 / {total}');
  });

  it('har role ke liye label aur hint hai', () => {
    for (const role of ROLES) {
      expect(en[`role.${role}`]).toBeTruthy();
      expect(en[`hint.${role}`]).toBeTruthy();
    }
  });

  it('server ke har error code ka text hai', () => {
    const codes: Record<RoomErrorCode, true> = {
      INVALID_NAME: true,
      INVALID_CODE: true,
      ALREADY_IN_ROOM: true,
      NOT_IN_ROOM: true,
      ROOM_NOT_FOUND: true,
      ROOM_FULL: true,
      GAME_IN_PROGRESS: true,
      NOT_HOST: true,
      NEED_FULL_ROOM: true,
      NO_GAME: true,
      GAME_NOT_FINISHED: true,
      RATE_LIMITED: true,
      BAD_REACTION: true,
      ALREADY_QUEUED: true,
      NO_VOTE: true,
      NOT_VOTER: true,
      NOT_LOGGED_IN: true,
      NOT_FRIENDS: true,
      FRIEND_OFFLINE: true,
      FRIEND_BUSY: true,
      BAD_MESSAGE: true,
      GAME_RULE: true,
    };
    for (const code of Object.keys(codes)) {
      expect(en[`err.${code as RoomErrorCode}`], code).toBeTruthy();
    }
    expect(RECONNECT_TOKEN_PARAM).toBe('token');
  });
});
