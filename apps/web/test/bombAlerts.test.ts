import { describe, expect, it } from 'vitest';
import type { BombTagGameView } from '@rmc/shared-types';
import {
  BEEP_START_MS,
  beepIntervalMs,
  beepSoundFor,
  dangerDistance,
  isNearBombHolder,
} from '../src/bomb-tag/bombAlerts';

const game = (over: Partial<BombTagGameView> = {}): BombTagGameView => ({
  phase: 'PLAYING',
  round: 1,
  roundsToWin: 3,
  arenaWidth: 800,
  arenaHeight: 600,
  playerRadius: 18,
  players: [
    { id: 'a', x: 100, y: 100, alive: true },
    { id: 'b', x: 400, y: 400, alive: true },
  ],
  bombHolderId: 'b',
  bombEndsAt: 15000,
  countdownEndsAt: null,
  roundWinnerId: null,
  matchWinnerId: null,
  ...over,
});

describe('beepIntervalMs — jitna kam time, utni tez beep', () => {
  it('5 second se zyada time bacha ho to koi beep nahi', () => {
    expect(beepIntervalMs(BEEP_START_MS + 1)).toBeNull();
    expect(beepIntervalMs(15_000)).toBeNull();
  });

  it('waqt khatam / galat value par beep nahi', () => {
    expect(beepIntervalMs(0)).toBeNull();
    expect(beepIntervalMs(-500)).toBeNull();
    expect(beepIntervalMs(Number.NaN)).toBeNull();
  });

  it('jaise-jaise time kam hota hai, gap chhota hota jaata hai (beep tez)', () => {
    const at5s = beepIntervalMs(5_000) as number;
    const at3s = beepIntervalMs(3_000) as number;
    const at1s = beepIntervalMs(1_000) as number;
    const at200ms = beepIntervalMs(200) as number;
    expect(at5s).toBeGreaterThan(at3s);
    expect(at3s).toBeGreaterThan(at1s);
    expect(at1s).toBeGreaterThan(at200ms);
  });

  it('gap hamesha sensible range me rehta hai (na rukta hua, na machine-gun)', () => {
    for (let ms = 1; ms <= BEEP_START_MS; ms += 50) {
      const gap = beepIntervalMs(ms) as number;
      expect(gap).toBeGreaterThanOrEqual(100);
      expect(gap).toBeLessThanOrEqual(600);
    }
  });
});

describe('beepSoundFor', () => {
  it('aakhri ~1.5 second me pitch badal kar urgent beep bajti hai', () => {
    expect(beepSoundFor(4_000)).toBe('BT_BEEP');
    expect(beepSoundFor(1_500)).toBe('BT_BEEP_URGENT');
    expect(beepSoundFor(300)).toBe('BT_BEEP_URGENT');
  });
});

describe('isNearBombHolder — bomb-wale ke paas jaate hi warning', () => {
  it('door ho to koi warning nahi', () => {
    expect(isNearBombHolder(game(), 'a')).toBe(false);
  });

  it('bomb holder paas aa jaye to warning', () => {
    const near = game({
      players: [
        { id: 'a', x: 400, y: 440, alive: true }, // 40px door, danger range (90px) ke andar
        { id: 'b', x: 400, y: 400, alive: true },
      ],
    });
    expect(isNearBombHolder(near, 'a')).toBe(true);
  });

  it('bomb khud mere paas ho to ye warning nahi (uske liye alag warning hai)', () => {
    const near = game({
      bombHolderId: 'a',
      players: [
        { id: 'a', x: 400, y: 440, alive: true },
        { id: 'b', x: 400, y: 400, alive: true },
      ],
    });
    expect(isNearBombHolder(near, 'a')).toBe(false);
  });

  it('mar chuke player ko (ya PLAYING ke bahar) warning nahi', () => {
    const dead = game({
      players: [
        { id: 'a', x: 400, y: 440, alive: false },
        { id: 'b', x: 400, y: 400, alive: true },
      ],
    });
    expect(isNearBombHolder(dead, 'a')).toBe(false);
    expect(isNearBombHolder(game({ phase: 'ROUND_OVER' }), 'a')).toBe(false);
    expect(isNearBombHolder(game(), null)).toBe(false);
  });

  it('danger range touch-range se badi hai (bhaagne ka waqt milta hai)', () => {
    expect(dangerDistance(18)).toBeGreaterThan(18 * 2);
  });
});
