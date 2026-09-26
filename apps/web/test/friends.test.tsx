import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FriendErrorCode, FriendsOverview, RoomView } from '@rmc/shared-types';
import { FriendsPanel } from '../src/components/FriendsPanel';
import { InviteToasts } from '../src/components/InviteToasts';
import { Lobby } from '../src/components/Lobby';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { en, hi } from '../src/i18n/messages';
import { clientReducer, initialClientState } from '../src/net/clientState';

const noop = () => undefined;
const render = (ui: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{ui}</I18nProvider>);

const friend = (id: string, name: string, online: boolean) => ({
  accountId: id,
  username: name.toLowerCase(),
  displayName: name,
  online,
});

const overview: FriendsOverview = {
  friends: [friend('b', 'Bina', true), friend('c', 'Charu', false)],
  incoming: [friend('d', 'Dev', false)],
  outgoing: [friend('e', 'Esha', false)],
};

const panel = (over: Partial<Parameters<typeof FriendsPanel>[0]> = {}) =>
  render(
    <FriendsPanel
      overview={overview}
      error={null}
      onAdd={async () => true}
      onAccept={noop}
      onDecline={noop}
      onUnfriend={noop}
      {...over}
    />,
  );

describe('FriendsPanel', () => {
  it('dost (online/offline), aayi aur bheji hui requests dikhti hain', () => {
    const html = panel();
    expect(html).toContain('Bina');
    expect(html).toContain('@bina');
    expect(html).toContain('title="online"');
    expect(html).toContain('title="offline"');
    expect(html).toContain('Friend requests');
    expect(html).toContain('Dev');
    expect(html).toContain('Accept');
    expect(html).toContain('Decline');
    expect(html).toContain('Sent requests');
    expect(html).toContain('Esha');
    expect(html).toContain('Cancel');
    expect(html).toContain('Remove');
  });

  it('khaali list par hint', () => {
    expect(panel({ overview: { friends: [], incoming: [], outgoing: [] } })).toContain('No friends yet');
  });

  it('error code ka translated text', () => {
    expect(panel({ error: 'ALREADY_FRIENDS' })).toContain('You are already friends.');
    expect(panel({ error: 'FRIEND_NOT_FOUND' })).toContain('No such user or request.');
  });
});

describe('InviteToasts', () => {
  it('invite me dost ka naam, room code aur Join / Not now', () => {
    const html = render(
      <InviteToasts invites={[{ key: 1, fromName: 'Asha', roomCode: 'ABCD' }]} onJoin={noop} onDismiss={noop} />,
    );
    expect(html).toContain('Asha invited you to a room');
    expect(html).toContain('ABCD');
    expect(html).toContain('Join');
    expect(html).toContain('Not now');
  });

  it('koi invite nahi to kuch render nahi', () => {
    expect(render(<InviteToasts invites={[]} onJoin={noop} onDismiss={noop} />)).toBe('');
  });
});

describe('Lobby invite section', () => {
  const room: RoomView = {
    code: 'ABCD',
    hostId: 'a',
    players: [{ id: 'a', name: 'Asha', isHost: true, connected: true }],
    vote: null,
    status: 'LOBBY',
  };
  const lobby = (friends?: Parameters<typeof Lobby>[0]['friends']) =>
    render(<Lobby room={room} myId="a" onStart={noop} onLeave={noop} onReact={noop} onAddBot={noop} onRemoveBot={noop} friends={friends} onInvite={noop} />);

  it('sirf online dost invite list me', () => {
    const html = lobby(overview.friends);
    expect(html).toContain('Invite a friend');
    expect(html).toContain('Bina');
    expect(html).not.toContain('Charu');
    expect(html).toContain('>Invite<');
  });

  it('koi dost online nahi', () => {
    expect(lobby([friend('c', 'Charu', false)])).toContain('No friends online right now.');
  });

  it('guest (friends undefined) ko invite section nahi', () => {
    expect(lobby(undefined)).not.toContain('Invite a friend');
  });
});

describe('reducer: invites + friends', () => {
  const invite = (fromName: string, roomCode: string) =>
    ({ type: 'SERVER', message: { event: 'INVITE', data: { fromName, roomCode } } }) as const;

  it('FRIENDS_CHANGED version badhata hai', () => {
    let s = clientReducer(initialClientState, { type: 'SERVER', message: { event: 'FRIENDS_CHANGED' } });
    s = clientReducer(s, { type: 'SERVER', message: { event: 'FRIENDS_CHANGED' } });
    expect(s.friendsVersion).toBe(2);
  });

  it('invite judta hai, wahi invite dobara aaye to duplicate nahi, max 3, dismiss se hatta hai', () => {
    let s = clientReducer(initialClientState, invite('Asha', 'AAAA'));
    s = clientReducer(s, invite('Asha', 'AAAA'));
    expect(s.invites).toHaveLength(1);
    s = clientReducer(s, invite('Bina', 'BBBB'));
    s = clientReducer(s, invite('Charu', 'CCCC'));
    s = clientReducer(s, invite('Dev', 'DDDD'));
    expect(s.invites.map((i) => i.fromName)).toEqual(['Bina', 'Charu', 'Dev']);
    const key = s.invites[0]?.key as number;
    s = clientReducer(s, { type: 'DISMISS_INVITE', key });
    expect(s.invites.map((i) => i.fromName)).toEqual(['Charu', 'Dev']);
  });

  it('room me aate hi invites saaf; room null par nahi', () => {
    let s = clientReducer(initialClientState, invite('Asha', 'AAAA'));
    s = clientReducer(s, { type: 'SERVER', message: { event: 'ROOM_STATE', data: null } });
    expect(s.invites).toHaveLength(1);
    s = clientReducer(s, {
      type: 'SERVER',
      message: {
        event: 'ROOM_STATE',
        data: { code: 'AAAA', hostId: 'x', players: [], vote: null, status: 'LOBBY' },
      },
    });
    expect(s.invites).toEqual([]);
  });

  it('connection band hone par invites saaf', () => {
    let s = clientReducer(initialClientState, invite('Asha', 'AAAA'));
    s = clientReducer(s, { type: 'SOCKET_CLOSED' });
    expect(s.invites).toEqual([]);
  });
});

describe('friend translations', () => {
  it('har friend error code ka text dono languages me', () => {
    const codes: Record<FriendErrorCode | 'NETWORK', true> = {
      FRIEND_NOT_FOUND: true,
      FRIEND_SELF: true,
      ALREADY_FRIENDS: true,
      ALREADY_REQUESTED: true,
      REQUEST_LIMIT: true,
      UNAUTHORIZED: true,
      NETWORK: true,
    };
    for (const code of Object.keys(codes) as (keyof typeof codes)[]) {
      expect(en[`frerr.${code}`], code).toBeTruthy();
      expect(hi[`frerr.${code}`], code).toBeTruthy();
    }
  });
});
