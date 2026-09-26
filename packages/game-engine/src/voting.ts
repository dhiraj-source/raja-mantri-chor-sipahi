import type { PlayerId, VoteChoice } from '@rmc/shared-types';
import { GameEngineError } from './errors';

/**
 * Disconnect vote ke pure rules. Timers/sockets yahan nahi; wo server ka kaam hai.
 * Sawal: "gayab player(s) ka intezaar karein (WAIT) ya game cancel karein (CANCEL)?"
 */
export interface VoteState {
  /** Jo vote de sakte hain (vote khulte waqt connected players). Baad me nahi badalte. */
  readonly eligible: readonly PlayerId[];
  readonly votes: Readonly<Record<PlayerId, VoteChoice>>;
}

/** OPEN = abhi faisla nahi hua. */
export type VoteOutcome = 'OPEN' | VoteChoice;

export function createVote(eligible: readonly PlayerId[]): VoteState {
  if (eligible.length === 0 || new Set(eligible).size !== eligible.length) {
    throw new GameEngineError('INVALID_VOTE', 'Vote ke liye kam se kam 1 unique voter chahiye.');
  }
  return { eligible: [...eligible], votes: {} };
}

/** Vote dena (ya badalna). Sirf eligible voter, sirf WAIT/CANCEL. Nayi state return karta hai. */
export function castVote(vote: VoteState, voterId: PlayerId, choice: VoteChoice): VoteState {
  if (!vote.eligible.includes(voterId)) {
    throw new GameEngineError('INVALID_VOTE', 'Aap is vote me vote nahi de sakte.');
  }
  if (choice !== 'WAIT' && choice !== 'CANCEL') {
    throw new GameEngineError('INVALID_VOTE', 'Choice WAIT ya CANCEL honi chahiye.');
  }
  return { ...vote, votes: { ...vote.votes, [voterId]: choice } };
}

export function countVotes(vote: VoteState): { wait: number; cancel: number } {
  const values = Object.values(vote.votes);
  return {
    wait: values.filter((v) => v === 'WAIT').length,
    cancel: values.filter((v) => v === 'CANCEL').length,
  };
}

/**
 * CANCEL tabhi jab eligible voters ke aadhe se zyada CANCEL bolein.
 * WAIT jab CANCEL ka majority ab mumkin hi na ho (barabari me WAIT jeetta hai).
 */
export function tallyVote(vote: VoteState): VoteOutcome {
  const n = vote.eligible.length;
  const { wait, cancel } = countVotes(vote);
  if (cancel * 2 > n) return 'CANCEL';
  if (wait * 2 >= n) return 'WAIT';
  return 'OPEN';
}
