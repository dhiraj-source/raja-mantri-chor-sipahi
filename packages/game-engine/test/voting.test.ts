import { describe, expect, it } from 'vitest';
import { GameEngineError, castVote, countVotes, createVote, tallyVote, type VoteState } from '../src';

const vote = (n: number): VoteState => createVote(['a', 'b', 'c', 'd'].slice(0, n));

const cast = (v: VoteState, ...ballots: [string, 'WAIT' | 'CANCEL'][]): VoteState =>
  ballots.reduce((acc, [who, choice]) => castVote(acc, who, choice), v);

describe('createVote / castVote', () => {
  it('khaali ya duplicate voters reject', () => {
    expect(() => createVote([])).toThrow(GameEngineError);
    expect(() => createVote(['a', 'a'])).toThrow(GameEngineError);
  });

  it('sirf eligible voter, sirf WAIT/CANCEL', () => {
    const v = vote(3);
    expect(() => castVote(v, 'stranger', 'WAIT')).toThrow(GameEngineError);
    expect(() => castVote(v, 'a', 'MAYBE' as never)).toThrow(GameEngineError);
  });

  it('state immutable rehti hai aur vote badla ja sakta hai', () => {
    const v = vote(3);
    const v1 = castVote(v, 'a', 'CANCEL');
    expect(v.votes).toEqual({});
    expect(castVote(v1, 'a', 'WAIT').votes).toEqual({ a: 'WAIT' });
    expect(countVotes(castVote(v1, 'a', 'WAIT'))).toEqual({ wait: 1, cancel: 0 });
  });
});

describe('tallyVote', () => {
  it('3 voters: 2 CANCEL = CANCEL, 2 WAIT = WAIT, 1-1 abhi OPEN', () => {
    expect(tallyVote(cast(vote(3), ['a', 'CANCEL'], ['b', 'CANCEL']))).toBe('CANCEL');
    expect(tallyVote(cast(vote(3), ['a', 'WAIT'], ['b', 'WAIT']))).toBe('WAIT');
    expect(tallyVote(cast(vote(3), ['a', 'CANCEL'], ['b', 'WAIT']))).toBe('OPEN');
    expect(tallyVote(vote(3))).toBe('OPEN');
    expect(tallyVote(cast(vote(3), ['a', 'CANCEL']))).toBe('OPEN');
  });

  it('1 voter: uska vote hi faisla hai', () => {
    expect(tallyVote(cast(vote(1), ['a', 'CANCEL']))).toBe('CANCEL');
    expect(tallyVote(cast(vote(1), ['a', 'WAIT']))).toBe('WAIT');
  });

  it('2 voters: barabari me WAIT jeetta hai, dono CANCEL par hi cancel', () => {
    expect(tallyVote(cast(vote(2), ['a', 'CANCEL']))).toBe('OPEN');
    expect(tallyVote(cast(vote(2), ['a', 'CANCEL'], ['b', 'WAIT']))).toBe('WAIT');
    expect(tallyVote(cast(vote(2), ['a', 'CANCEL'], ['b', 'CANCEL']))).toBe('CANCEL');
  });

  it('WAIT tabhi jab CANCEL ka majority mumkin hi na ho (jaldi faisla)', () => {
    // 3 voters, 2 WAIT: baaki 1 vote se CANCEL 2 nahi ban sakta... 1 < 2 => WAIT.
    expect(tallyVote(cast(vote(3), ['a', 'WAIT'], ['b', 'WAIT']))).toBe('WAIT');
    // 3 voters, 1 WAIT + 1 CANCEL: teesra CANCEL de to 2 CANCEL, isliye abhi OPEN.
    expect(tallyVote(cast(vote(3), ['a', 'WAIT'], ['b', 'CANCEL']))).toBe('OPEN');
  });

  it('vote badalne se result badalta hai', () => {
    let v = cast(vote(3), ['a', 'CANCEL'], ['b', 'CANCEL']);
    expect(tallyVote(v)).toBe('CANCEL');
    v = castVote(v, 'b', 'WAIT');
    expect(tallyVote(v)).toBe('OPEN');
  });
});
