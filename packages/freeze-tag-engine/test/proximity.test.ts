import { describe, expect, it } from 'vitest';
import { withinRadius } from '../src/proximity';

const at = (id: string, x: number, y: number) => ({ id, pos: { x, y } });

describe('withinRadius', () => {
  it('radius ke andar wale sab deta hai, bahar wale nahi', () => {
    const from = at('me', 0, 0);
    const others = [at('near', 10, 0), at('edge', 50, 0), at('far', 51, 0)];
    expect(withinRadius(from, others, 50)).toEqual(['near', 'edge']);
  });

  it('sabse paas wala pehle aata hai', () => {
    const from = at('me', 0, 0);
    const others = [at('far', 40, 0), at('near', 5, 0), at('mid', 20, 0)];
    expect(withinRadius(from, others, 50)).toEqual(['near', 'mid', 'far']);
  });

  it('barabar door hon to id ke order se — hamesha deterministic', () => {
    const from = at('me', 0, 0);
    const forward = withinRadius(from, [at('b', 10, 0), at('a', 0, 10)], 50);
    const reversed = withinRadius(from, [at('a', 0, 10), at('b', 10, 0)], 50);
    expect(forward).toEqual(['a', 'b']);
    expect(reversed).toEqual(forward);
  });

  it('khud ko kabhi nahi ginta', () => {
    expect(withinRadius(at('me', 0, 0), [at('me', 0, 0)], 50)).toEqual([]);
  });

  it('koi paas na ho to khaali list', () => {
    expect(withinRadius(at('me', 0, 0), [at('x', 500, 500)], 50)).toEqual([]);
  });
});
