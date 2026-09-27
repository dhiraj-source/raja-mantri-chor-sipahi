import { describe, expect, it } from 'vitest';
import { findTagTarget } from '../src/collision';

describe('findTagTarget', () => {
  it('touch-range ke andar wale player ko target banata hai', () => {
    const target = findTagTarget(
      { id: 'a', pos: { x: 100, y: 100 } },
      [{ id: 'b', pos: { x: 110, y: 100 } }],
      40,
    );
    expect(target).toBe('b');
  });

  it('range ke bahar wale ko chhuta nahi', () => {
    const target = findTagTarget(
      { id: 'a', pos: { x: 100, y: 100 } },
      [{ id: 'b', pos: { x: 500, y: 500 } }],
      40,
    );
    expect(target).toBeNull();
  });

  it('khud ko kabhi target nahi banata (list me ho bhi to)', () => {
    const target = findTagTarget(
      { id: 'a', pos: { x: 100, y: 100 } },
      [{ id: 'a', pos: { x: 100, y: 100 } }],
      40,
    );
    expect(target).toBeNull();
  });

  it('ek se zyada range me ho to sabse paas wale ko chunta hai', () => {
    const target = findTagTarget(
      { id: 'a', pos: { x: 0, y: 0 } },
      [
        { id: 'far', pos: { x: 30, y: 0 } },
        { id: 'near', pos: { x: 10, y: 0 } },
      ],
      40,
    );
    expect(target).toBe('near');
  });

  it('barabar door ho to id ke alphabetical order se deterministic faisla (kabhi random nahi)', () => {
    const target = findTagTarget(
      { id: 'a', pos: { x: 0, y: 0 } },
      [
        { id: 'zzz', pos: { x: 10, y: 0 } },
        { id: 'aaa', pos: { x: 0, y: 10 } },
      ],
      40,
    );
    expect(target).toBe('aaa');
  });

  it('koi bhi doosra alive player na ho to null', () => {
    expect(findTagTarget({ id: 'a', pos: { x: 0, y: 0 } }, [], 40)).toBeNull();
  });
});
