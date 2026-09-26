import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerGameView, RoomView } from '@rmc/shared-types';
import { GameScreen } from '../src/components/GameScreen';
import { VotePanel } from '../src/components/VotePanel';
import { I18nProvider } from '../src/i18n/I18nProvider';

const noop = () => undefined;
const render = (ui: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{ui}</I18nProvider>);
const names: Record<string, string> = { a: 'Asha', b: 'Bina', c: 'Charu', d: 'Dev' };
const nameOf = (id: string) => names[id] ?? '?';

const vote = {
  missingIds: ['d'],
  eligibleIds: ['a', 'b', 'c'],
  votes: { a: 'CANCEL' as const },
  expiresInMs: 20_000,
};

describe('VotePanel', () => {
  it('voter ko dono buttons, tally aur countdown dikhte hain', () => {
    const html = render(<VotePanel vote={vote} myId="b" nameOf={nameOf} onVote={noop} />);
    expect(html).toContain('Dev has left the game');
    expect(html).toContain('Keep waiting');
    expect(html).toContain('Cancel game');
    expect(html).toContain('Wait 0 • Cancel 1 (need 2 to cancel)');
    expect(html).toContain('20s left');
    expect(html).not.toContain('The other players are voting');
  });

  it('apna diya vote highlight (aria-pressed) hota hai', () => {
    const html = render(<VotePanel vote={vote} myId="a" nameOf={nameOf} onVote={noop} />);
    // Cancel button pressed=true, Wait button pressed=false
    expect(html).toMatch(/aria-pressed="false"[^>]*>⏳/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>✖/);
  });

  it('jo vote nahi de sakta use buttons nahi, sirf status', () => {
    const html = render(<VotePanel vote={vote} myId="d" nameOf={nameOf} onVote={noop} />);
    expect(html).not.toContain('Keep waiting');
    expect(html).toContain('The other players are voting');
  });

  it('do gayab players ke naam', () => {
    const html = render(
      <VotePanel vote={{ ...vote, missingIds: ['c', 'd'], eligibleIds: ['a', 'b'] }} myId="a" nameOf={nameOf} onVote={noop} />,
    );
    expect(html).toContain('Charu, Dev');
    expect(html).toContain('need 2 to cancel');
  });

  it('Hindi me bhi dikhta hai', () => {
    localStorage_hi();
    const html = render(<VotePanel vote={vote} myId="b" nameOf={nameOf} onVote={noop} />);
    expect(html).toContain('इंतज़ार करें');
    localStorage_reset();
  });
});

describe('GameScreen with vote', () => {
  const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: nameOf(id) }));
  const room: RoomView = {
    code: 'ABCD',
    hostId: 'a',
    players: players.map((p, i) => ({ ...p, isHost: i === 0, connected: p.id !== 'd' })),
    vote,
    status: 'IN_GAME',
  };
  const game: PlayerGameView = {
    phase: 'ROUND_ACTIVE',
    players,
    totalRounds: 4,
    currentRound: 1,
    totals: { a: 0, b: 0, c: 0, d: 0 },
    visibleRoles: {},
    myRole: 'CHOR',
    canGuess: false,
    winnerIds: [],
    history: [],
  };
  const props = { game, myId: 'b', reward: null, onGuess: noop, onNextRound: noop, onRematch: noop, onLeave: noop, onReact: noop, onVote: noop };

  it('room.vote ho to panel dikhta hai', () => {
    expect(render(<GameScreen {...props} room={room} />)).toContain('Cancel game');
  });

  it('room.vote null ho to panel nahi', () => {
    expect(render(<GameScreen {...props} room={{ ...room, vote: null }} />)).not.toContain('Cancel game');
  });
});

// Language ko test ke liye badalna: I18nProvider localStorage se padhta hai.
const store = new Map<string, string>();
function localStorage_hi() {
  store.set('rmc:lang', 'hi');
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
}
function localStorage_reset() {
  store.clear();
  delete (globalThis as { localStorage?: unknown }).localStorage;
}
