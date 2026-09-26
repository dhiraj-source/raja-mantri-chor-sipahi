import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHARACTERS, type PlayerGameView, type Profile, type RoomView, type ShopErrorCode } from '@rmc/shared-types';
import { avatarEmoji } from '../src/avatar';
import { AccountPanel } from '../src/components/AccountPanel';
import { Lobby } from '../src/components/Lobby';
import { Scoreboard } from '../src/components/Scoreboard';
import { ShopPanel } from '../src/components/ShopPanel';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { en, hi } from '../src/i18n/messages';

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
  coins: 120,
  gamesPlayed: 3,
  wins: 1,
  achievements: [],
  ownedCharacters: ['DEFAULT', 'CAT'],
  equippedCharacter: 'DEFAULT',
  history: [],
};

const shop = (over: Partial<Profile> = {}, error: Parameters<typeof ShopPanel>[0]['error'] = null) =>
  render(<ShopPanel profile={{ ...profile, ...over }} error={error} onBuy={noop} onEquip={noop} />);

/** Ek character ke card ka HTML. */
const card = (html: string, id: string): string => {
  const name = en[`char.${id as 'DEFAULT'}`];
  const start = html.lastIndexOf('<li', html.indexOf(`>${name}<`));
  return html.slice(start, html.indexOf('</li>', start));
};

describe('ShopPanel', () => {
  it('saare characters, coins aur daam dikhte hain', () => {
    const html = shop();
    for (const c of CHARACTERS) expect(html).toContain(en[`char.${c.id}`]);
    expect(html).toContain('120 coins');
    expect(html).toContain('150 coins'); // FOX
  });

  it('pehna hua: "Wearing"; owned par "Wear" button; baaki par "Buy"', () => {
    const html = shop();
    expect(card(html, 'DEFAULT')).toContain('Wearing');
    expect(card(html, 'CAT')).toContain('>Wear<');
    expect(card(html, 'LION')).toContain('>Buy<');
  });

  it('Buy button disabled: coins kam ya level kam', () => {
    const html = shop({ coins: 120 });
    // LION 100 coins, level 1: khareed sakte hain.
    expect(card(html, 'LION')).not.toContain('disabled=""');
    // FOX 150 coins > 120: disabled.
    expect(card(html, 'FOX')).toContain('disabled=""');
    // DRAGON level 5 chahiye, level 2: disabled aur level laal.
    expect(card(html, 'DRAGON')).toContain('disabled=""');
    expect(card(html, 'DRAGON')).toContain('text-red-300');
    // Zyada coins par bhi level ki wajah se disabled.
    expect(card(shop({ coins: 9999 }), 'DRAGON')).toContain('disabled=""');
    expect(card(shop({ coins: 9999 }), 'FOX')).not.toContain('disabled=""');
  });

  it('khareeda hua aur pehna hua alag dikhte hain', () => {
    const html = shop({ equippedCharacter: 'CAT' });
    expect(card(html, 'CAT')).toContain('Wearing');
    expect(card(html, 'DEFAULT')).toContain('>Wear<');
  });

  it('error ka translated text', () => {
    expect(shop({}, 'NOT_ENOUGH_COINS')).toContain('Not enough coins.');
    expect(shop({}, 'LEVEL_TOO_LOW')).toContain('Your level is too low');
  });
});

describe('avatars', () => {
  it('avatarEmoji: sahi, anjaan aur khaali id', () => {
    expect(avatarEmoji('LION')).toBe('🦁');
    expect(avatarEmoji('DEFAULT')).toBe('🙂');
    expect(avatarEmoji('NOPE')).toBe('🙂');
    expect(avatarEmoji(undefined)).toBe('🙂');
  });

  it('profile card me pehna hua avatar', () => {
    const html = render(
      <AccountPanel
        profile={{ ...profile, equippedCharacter: 'FOX' }}
        loggedIn
        error={null}
        busy={false}
        onLogin={noop}
        onRegister={noop}
        onLogout={noop}
      />,
    );
    expect(html).toContain('🦊');
  });

  it('lobby me har player ka avatar', () => {
    const room: RoomView = {
      code: 'ABCD',
      hostId: 'a',
      players: [
        { id: 'a', name: 'Asha', isHost: true, connected: true, character: 'LION' },
        { id: 'b', name: 'Bina', isHost: false, connected: true, character: 'DEFAULT' },
      ],
      vote: null,
      status: 'LOBBY',
    };
    const html = render(<Lobby room={room} myId="a" onStart={noop} onLeave={noop} onReact={noop} />);
    expect(html).toContain('🦁');
    expect(html).toContain('🙂');
  });

  it('scoreboard me avatar', () => {
    const game = {
      players: [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Bina' }],
      totals: { a: 10, b: 5 },
    } as unknown as PlayerGameView;
    const html = render(<Scoreboard game={game} myId="a" characterOf={(id) => (id === 'a' ? 'NINJA' : undefined)} />);
    expect(html).toContain('🥷');
    expect(html).toContain('🙂');
  });
});

describe('shop translations', () => {
  it('har character aur shop error ka text dono languages me', () => {
    for (const c of CHARACTERS) {
      expect(en[`char.${c.id}`], c.id).toBeTruthy();
      expect(hi[`char.${c.id}`], c.id).toBeTruthy();
    }
    const codes: Record<ShopErrorCode | 'NETWORK', true> = {
      UNKNOWN_ITEM: true,
      ALREADY_OWNED: true,
      NOT_OWNED: true,
      NOT_ENOUGH_COINS: true,
      LEVEL_TOO_LOW: true,
      UNAUTHORIZED: true,
      NETWORK: true,
    };
    for (const code of Object.keys(codes) as (keyof typeof codes)[]) {
      expect(en[`shoperr.${code}`], code).toBeTruthy();
      expect(hi[`shoperr.${code}`], code).toBeTruthy();
    }
  });

  it('catalog: DEFAULT free, daam/level sahi, ids unique', () => {
    expect(CHARACTERS[0]).toMatchObject({ id: 'DEFAULT', price: 0, minLevel: 1 });
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
    expect(new Set(CHARACTERS.map((c) => c.emoji)).size).toBe(CHARACTERS.length);
    expect(CHARACTERS.every((c) => c.price >= 0 && c.minLevel >= 1)).toBe(true);
    // Sabse sasta paid character kisi bhi game ke baad (10 coins) kharida ja sakta hai.
    expect(Math.min(...CHARACTERS.filter((c) => c.price > 0).map((c) => c.price))).toBe(10);
  });
});
