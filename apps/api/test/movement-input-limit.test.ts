import { describe, expect, it } from 'vitest';
import { isMovementInput } from '../src/rooms/rooms.gateway';
import { RateLimiter } from '../src/rooms/rate-limiter';

/**
 * Regression: Bomb Tag me tez khelne par (joystick drag / jaldi-jaldi keys) movement messages
 * gateway ki normal flood-limit paar kar dete the -> socket terminate -> Bomb Tag ka
 * "disconnect = turant forfeit" -> saamne wala player bina kisi elimination ke jeet jaata tha.
 * Movement ab apni alag, generous limit par gina jaata hai.
 */
describe('isMovementInput', () => {
  it('BT_INPUT frame ko pehchanta hai (string aur Buffer dono)', () => {
    const frame = JSON.stringify({ event: 'BT_INPUT', data: { x: 1, y: 0 } });
    expect(isMovementInput(frame)).toBe(true);
    expect(isMovementInput(Buffer.from(frame))).toBe(true);
  });

  it('baaki events ko movement nahi maanta (warna unhe bhi dheeli limit mil jaati)', () => {
    expect(isMovementInput(JSON.stringify({ event: 'DG_CHAT', data: { text: 'hi' } }))).toBe(false);
    expect(isMovementInput(JSON.stringify({ event: 'REACTION', data: { emoji: '😂' } }))).toBe(false);
    expect(isMovementInput(JSON.stringify({ event: 'BT_START_GAME' }))).toBe(false);
  });

  it('chat me "BT_INPUT" likh dene se dheeli limit nahi mil jaati (event field hi dekhta hai)', () => {
    const sneaky = JSON.stringify({ event: 'DG_CHAT', data: { text: 'BT_INPUT' } });
    expect(isMovementInput(sneaky)).toBe(false);
  });

  it('bade frames bina parse kiye hi reject (voice SDP waghera) aur kharab JSON par crash nahi', () => {
    const big = JSON.stringify({ event: 'BT_INPUT', data: { x: 1, y: 0, pad: 'x'.repeat(500) } });
    expect(isMovementInput(big)).toBe(false); // size cap se pehle hi nikal jaata hai
    expect(isMovementInput('not json at all')).toBe(false);
    expect(isMovementInput(null)).toBe(false);
    expect(isMovementInput(12345)).toBe(false);
  });
});

describe('movement apni alag limit par chalta hai', () => {
  it('40/sec wali sakht limit par 100 movement messages socket kaat deti thi (purana behavior)', () => {
    const strict = new RateLimiter(40, 1000, () => 1000); // waqt rok kar, ek hi window
    let terminated = 0;
    for (let i = 0; i < 100; i++) if (!strict.allow('s1')) terminated++;
    expect(terminated).toBeGreaterThan(0); // yahi bug tha
  });

  it('150/sec wali input-limit par utne hi messages safely guzar jaate hain', () => {
    const generous = new RateLimiter(150, 1000, () => 1000);
    let terminated = 0;
    for (let i = 0; i < 100; i++) if (!generous.allow('s1')) terminated++;
    expect(terminated).toBe(0);
  });
});
