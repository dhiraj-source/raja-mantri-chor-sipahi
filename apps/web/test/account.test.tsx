import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACHIEVEMENTS, type GameReward, type PlayerGameView, type Profile } from '@rmc/shared-types';
import { AccountPanel } from '../src/components/AccountPanel';
import { GameScreen } from '../src/components/GameScreen';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { en, hi } from '../src/i18n/messages';
import { clientReducer, initialClientState } from '../src/net/clientState';

const noop = () => undefined;
const render = (ui: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{ui}</I18nProvider>);

const profile: Profile = {
  accountId: 'acc',
  username: 'asha',
  displayName: 'Asha',
  xp: 250,
  level: 2,
  levelStartXp: 100,
  nextLevelXp: 400,
  coins: 60,
  gamesPlayed: 3,
  wins: 1,
  achievements: ['FIRST_GAME', 'FIRST_WIN'],
  history: [
    { id: 'h1', playedAt: '2026-01-01', roomCode: 'ABCD', points: 2300, isWinner: true, xpGained: 123, coinsGained: 30 },
  ],
};

const panel = (over: Partial<Parameters<typeof AccountPanel>[0]> = {}) =>
  render(
    <AccountPanel
      profile={null}
      loggedIn={false}
      error={null}
      busy={false}
      onLogin={noop}
      onRegister={noop}
      onLogout={noop}
      {...over}
    />,
  );

describe('AccountPanel', () => {
  it('guest ko login/register form dikhta hai, password field masked', () => {
    const html = panel();
    expect(html).toContain('Log in');
    expect(html).toContain('Create account');
    expect(html).toContain('type="password"');
    expect(html).toContain('current-password');
  });

  it('error code ka translated text dikhta hai', () => {
    expect(panel({ error: 'BAD_CREDENTIALS' })).toContain('Wrong username or password.');
    expect(panel({ error: 'NETWORK' })).toContain('Could not reach the server.');
  });

  it('logged-in profile: level, coins, XP bar, achievements, history', () => {
    const html = panel({ profile, loggedIn: true });
    expect(html).toContain('Asha');
    expect(html).toContain('Level 2');
    expect(html).toContain('60 coins');
    expect(html).toContain('250 / 400 XP');
    expect(html).toContain('Games: 3 • Wins: 1');
    expect(html).toContain('First win');
    expect(html).toContain('123 XP');
    // (250-100)/(400-100) = 50%
    expect(html).toContain('width:50%');
    expect(html).toContain('Log out');
  });

  it('token hai par profile load ho rahi hai: kuch nahi dikhta (form flash nahi)', () => {
    expect(panel({ loggedIn: true, profile: null })).toBe('');
  });
});

describe('reward display', () => {
  const players = [
    { id: 'a', name: 'Asha' },
    { id: 'b', name: 'Bina' },
    { id: 'c', name: 'Charu' },
    { id: 'd', name: 'Dev' },
  ];
  const room = {
    code: 'ABCD',
    hostId: 'a',
    players: players.map((p, i) => ({ ...p, isHost: i === 0, connected: true })),
    status: 'IN_GAME' as const,
  };
  const game: PlayerGameView = {
    phase: 'GAME_RESULT',
    players,
    totalRounds: 4,
    currentRound: 4,
    totals: { a: 0, b: 0, c: 0, d: 0 },
    visibleRoles: {},
    myRole: null,
    canGuess: false,
    winnerIds: ['a'],
    history: [],
  };
  const props = { room, game, myId: 'a', onGuess: noop, onNextRound: noop, onRematch: noop, onLeave: noop, onReact: noop };

  it('reward ke saath XP, coins, level up, achievement dikhte hain', () => {
    const reward: GameReward = {
      xpGained: 123,
      coinsGained: 30,
      level: 2,
      leveledUp: true,
      newAchievements: ['FIRST_GAME', 'FIRST_WIN'],
    };
    const html = render(<GameScreen {...props} reward={reward} />);
    expect(html).toContain('+123 XP');
    expect(html).toContain('+30 coins');
    expect(html).toContain('Level up! You are now level 2');
    expect(html).toContain('Achievement unlocked: First win');
  });

  it('guest (reward null) ko reward box nahi', () => {
    expect(render(<GameScreen {...props} reward={null} />)).not.toContain('Your rewards');
  });
});

describe('reducer: account + reward', () => {
  it('AUTH_STATE aur GAME_REWARD store hote hain', () => {
    let s = clientReducer(initialClientState, {
      type: 'SERVER',
      message: { event: 'AUTH_STATE', data: { displayName: 'Asha' } },
    });
    expect(s.account).toEqual({ displayName: 'Asha' });
    const reward: GameReward = { xpGained: 1, coinsGained: 1, level: 1, leveledUp: false, newAchievements: [] };
    s = clientReducer(s, { type: 'SERVER', message: { event: 'GAME_REWARD', data: reward } });
    expect(s.reward).toEqual(reward);
  });

  it('reward final result tak rehta hai, naya game/room chhodne par saaf', () => {
    const reward: GameReward = { xpGained: 1, coinsGained: 1, level: 1, leveledUp: false, newAchievements: [] };
    let s = clientReducer(initialClientState, { type: 'SERVER', message: { event: 'GAME_REWARD', data: reward } });
    const finalView = { phase: 'GAME_RESULT' } as PlayerGameView;
    s = clientReducer(s, { type: 'SERVER', message: { event: 'GAME_VIEW', data: finalView } });
    expect(s.reward).toEqual(reward);
    s = clientReducer(s, { type: 'SERVER', message: { event: 'GAME_VIEW', data: null } });
    expect(s.reward).toBeNull();
  });

  it('connection band hone par account/reward saaf', () => {
    let s = clientReducer(initialClientState, {
      type: 'SERVER',
      message: { event: 'AUTH_STATE', data: { displayName: 'Asha' } },
    });
    s = clientReducer(s, { type: 'SOCKET_CLOSED' });
    expect(s.account).toBeNull();
    expect(s.reward).toBeNull();
  });
});

describe('translations for accounts', () => {
  it('har achievement aur auth error ka text dono languages me', () => {
    for (const a of ACHIEVEMENTS) {
      expect(en[`ach.${a}`]).toBeTruthy();
      expect(hi[`ach.${a}`]).toBeTruthy();
    }
    for (const code of [
      'INVALID_USERNAME',
      'INVALID_PASSWORD',
      'USERNAME_TAKEN',
      'BAD_CREDENTIALS',
      'UNAUTHORIZED',
      'RATE_LIMITED',
      'NETWORK',
    ] as const) {
      expect(en[`autherr.${code}`], code).toBeTruthy();
      expect(hi[`autherr.${code}`], code).toBeTruthy();
    }
  });
});
