import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerGameView, RoomView } from '@rmc/shared-types';
import { GameScreen } from '../src/components/GameScreen';
import { Home } from '../src/components/Home';
import { Lobby } from '../src/components/Lobby';
import { QueueScreen } from '../src/components/QueueScreen';
import { I18nProvider } from '../src/i18n/I18nProvider';

const noop = () => undefined;
const players = [
  { id: 'a', name: 'Asha' },
  { id: 'b', name: 'Bina' },
  { id: 'c', name: 'Charu' },
  { id: 'd', name: 'Dev' },
];

const room: RoomView = {
  code: 'ABCD',
  hostId: 'a',
  players: players.map((p, i) => ({ ...p, isHost: i === 0, connected: p.id !== 'c' })),
  status: 'IN_GAME',
};

const baseGame: PlayerGameView = {
  phase: 'ROUND_ACTIVE',
  players,
  totalRounds: 4,
  currentRound: 1,
  totals: { a: 0, b: 0, c: 0, d: 0 },
  visibleRoles: { a: 'RAJA', b: 'MANTRI' },
  myRole: 'MANTRI',
  canGuess: true,
  winnerIds: [],
  history: [],
};

const render = (ui: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{ui}</I18nProvider>);

const gameProps = {
  room,
  myId: 'b',
  reward: null,
  onGuess: noop,
  onNextRound: noop,
  onRematch: noop,
  onLeave: noop,
  onReact: noop,
};

describe('screens render without crashing', () => {
  it('Home', () => {
    const html = render(<Home onCreate={noop} onJoin={noop} onQuickMatch={noop} onPlayWithBots={noop} />);
    expect(html).toContain('Quick match');
    expect(html).toContain('Play with bots');
    expect(html).toContain('Create a new room');
  });

  it('Queue', () => {
    const html = render(<QueueScreen size={2} names={['Asha', 'Bina']} onCancel={noop} />);
    expect(html).toContain('2 / 4 players ready');
    expect(html).toContain('Asha, Bina');
  });

  it('Lobby shows code, host and disconnected player', () => {
    const html = render(<Lobby room={room} myId="a" onStart={noop} onLeave={noop} onReact={noop} onAddBot={noop} onRemoveBot={noop} />);
    expect(html).toContain('ABCD');
    expect(html).toContain('HOST');
    expect(html).toContain('disconnected');
    expect(html).toContain('Reaction');
  });

  it('Mantri sees the guess buttons (only the 2 suspects)', () => {
    const html = render(<GameScreen {...gameProps} game={baseGame} />);
    expect(html).toContain('Who is the Chor?');
    expect(html).toContain('Charu');
    expect(html).toContain('Dev');
    expect(html).toContain('Round 1 / 4');
    // Guess buttons: sirf Charu aur Dev (Raja Asha aur khud Mantri Bina nahi).
    const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(buttons).toContain('Charu');
    expect(buttons).toContain('Dev');
    expect(buttons).not.toContain('Asha');
    expect(buttons).not.toContain('Bina');
  });

  it('non-Mantri sees waiting text and no guess buttons', () => {
    const game = { ...baseGame, myRole: 'CHOR' as const, canGuess: false, visibleRoles: { ...baseGame.visibleRoles, c: 'CHOR' as const } };
    const html = render(<GameScreen {...gameProps} myId="c" game={game} />);
    expect(html).toContain('The Mantri is thinking');
    expect(html).not.toContain('Who is the Chor?');
  });

  it('round result and final result', () => {
    const result = {
      round: 1,
      roles: { a: 'RAJA', b: 'MANTRI', c: 'SIPAHI', d: 'CHOR' } as const,
      guessedChorId: 'd',
      guessCorrect: true,
      points: { a: 1000, b: 800, c: 500, d: 0 },
    };
    const roundResult = render(
      <GameScreen {...gameProps} myId="a" game={{ ...baseGame, phase: 'ROUND_RESULT', canGuess: false, history: [result] }} />,
    );
    expect(roundResult).toContain('The Mantri caught the Chor!');
    expect(roundResult).toContain('Next round');

    const final = render(
      <GameScreen {...gameProps} myId="a" game={{ ...baseGame, phase: 'GAME_RESULT', canGuess: false, currentRound: 4, winnerIds: ['a'], history: [result] }} />,
    );
    expect(final).toContain('You won!');
    expect(final).toContain('Play again');
  });
});

