import { describe, expect, it } from 'vitest';
import { SessionsService } from '../src/rooms/sessions.service';

describe('SessionsService', () => {
  it('token se wahi player milta hai', () => {
    const s = new SessionsService();
    const { playerId, token } = s.create();
    expect(s.resolve(token)).toBe(playerId);
    expect(s.tokenOf(playerId)).toBe(token);
  });

  it('token aur playerId alag-alag secret hain, har session unique', () => {
    const s = new SessionsService();
    const a = s.create();
    const b = s.create();
    expect(a.token).not.toBe(a.playerId);
    expect(a.token).not.toBe(b.token);
    expect(a.playerId).not.toBe(b.playerId);
  });

  it('playerId ko token ki tarah use nahi kiya ja sakta', () => {
    const s = new SessionsService();
    const { playerId } = s.create();
    expect(s.resolve(playerId)).toBeNull();
  });

  it('galat token / galat type par null', () => {
    const s = new SessionsService();
    expect(s.resolve('nope')).toBeNull();
    expect(s.resolve(undefined)).toBeNull();
    expect(s.resolve(42)).toBeNull();
  });

  it('account se jude players (kai tabs) aur unbind', () => {
    const s = new SessionsService();
    const a = s.create();
    const b = s.create();
    s.bindAccount(a.playerId, 'acc1');
    s.bindAccount(b.playerId, 'acc1');
    expect(s.accountOf(a.playerId)).toBe('acc1');
    expect(s.playersOf('acc1').sort()).toEqual([a.playerId, b.playerId].sort());
    s.bindAccount(a.playerId, 'acc2'); // account badla
    expect(s.playersOf('acc1')).toEqual([b.playerId]);
    expect(s.playersOf('acc2')).toEqual([a.playerId]);
    s.bindAccount(a.playerId, null); // logout
    expect(s.accountOf(a.playerId)).toBeNull();
    expect(s.playersOf('acc2')).toEqual([]);
    s.remove(b.playerId); // session hatne par binding bhi
    expect(s.playersOf('acc1')).toEqual([]);
    expect(s.playersOf('unknown')).toEqual([]);
  });

  it('remove ke baad token kaam nahi karta', () => {
    const s = new SessionsService();
    const { playerId, token } = s.create();
    s.remove(playerId);
    expect(s.resolve(token)).toBeNull();
    expect(s.tokenOf(playerId)).toBeNull();
  });
});
