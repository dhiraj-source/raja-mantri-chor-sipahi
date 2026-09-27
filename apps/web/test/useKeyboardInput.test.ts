import { describe, expect, it } from 'vitest';
import { computeDirection } from '../src/bomb-tag/useKeyboardInput';

describe('computeDirection', () => {
  it('koi key na dabi ho to (0,0)', () => {
    expect(computeDirection([])).toEqual({ x: 0, y: 0 });
  });

  it('WASD aur arrow keys dono kaam karte hain', () => {
    expect(computeDirection(['KeyW'])).toEqual({ x: 0, y: -1 });
    expect(computeDirection(['ArrowUp'])).toEqual({ x: 0, y: -1 });
    expect(computeDirection(['KeyS'])).toEqual({ x: 0, y: 1 });
    expect(computeDirection(['KeyA'])).toEqual({ x: -1, y: 0 });
    expect(computeDirection(['KeyD'])).toEqual({ x: 1, y: 0 });
  });

  it('do keys ek saath (diagonal) dono axes jodta hai — normalize client par nahi hota', () => {
    expect(computeDirection(['KeyW', 'KeyD'])).toEqual({ x: 1, y: -1 });
  });

  it('opposite keys ek saath dabein to cancel out ho jaate hain', () => {
    expect(computeDirection(['KeyA', 'KeyD'])).toEqual({ x: 0, y: 0 });
    expect(computeDirection(['KeyW', 'KeyS'])).toEqual({ x: 0, y: 0 });
  });

  it('anjaan keys chup-chaap ignore hoti hain', () => {
    expect(computeDirection(['Space', 'KeyW'])).toEqual({ x: 0, y: -1 });
  });
});
