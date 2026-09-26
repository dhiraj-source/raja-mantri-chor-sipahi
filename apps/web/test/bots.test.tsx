import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RoomView } from '@rmc/shared-types';
import { Home } from '../src/components/Home';
import { Lobby } from '../src/components/Lobby';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { en, hi } from '../src/i18n/messages';

const noop = () => undefined;
const render = (ui: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{ui}</I18nProvider>);

const humanPlayer = (id: string, name: string, isHost: boolean) => ({
  id,
  name,
  isHost,
  connected: true,
  character: 'DEFAULT',
  isBot: false,
});
const botPlayer = (id: string, name: string) => ({
  id,
  name,
  isHost: false,
  connected: true,
  character: 'ROBOT',
  isBot: true,
});

describe('Home: play with bots', () => {
  it('button dikhta hai aur naam ke saath call hota hai', () => {
    let called: string | null = null;
    const html = render(
      <Home
        onCreate={noop}
        onJoin={noop}
        onQuickMatch={noop}
        onPlayWithBots={(name) => {
          called = name;
        }}
      />,
    );
    expect(html).toContain('🤖');
    expect(html).toContain('Play with bots');
    void called;
  });
});

describe('Lobby: bots', () => {
  const roomWithOneBot: RoomView = {
    code: 'ABCD',
    hostId: 'a',
    players: [humanPlayer('a', 'Asha', true), botPlayer('bot-1', 'Bot Meera')],
    vote: null,
    status: 'LOBBY',
  };
  const fullRoomNoBots: RoomView = {
    code: 'ABCD',
    hostId: 'a',
    players: [
      humanPlayer('a', 'Asha', true),
      humanPlayer('b', 'Bina', false),
      humanPlayer('c', 'Charu', false),
      humanPlayer('d', 'Dev', false),
    ],
    vote: null,
    status: 'LOBBY',
  };

  it('bot ka BOT tag dikhta hai, host ke paas Remove button', () => {
    const html = render(
      <Lobby room={roomWithOneBot} myId="a" onStart={noop} onLeave={noop} onReact={noop} onAddBot={noop} onRemoveBot={noop} />,
    );
    expect(html).toContain('Bot Meera');
    expect(html).toContain('BOT');
    expect(html).toContain('Remove');
  });

  it('khaali seat par host ko "+ Add bot" dikhta hai', () => {
    const html = render(
      <Lobby room={roomWithOneBot} myId="a" onStart={noop} onLeave={noop} onReact={noop} onAddBot={noop} onRemoveBot={noop} />,
    );
    expect(html).toContain('Add bot');
  });

  it('non-host ko Add bot / Remove buttons nahi dikhte', () => {
    const html = render(
      <Lobby room={roomWithOneBot} myId="bot-1" onStart={noop} onLeave={noop} onReact={noop} onAddBot={noop} onRemoveBot={noop} />,
    );
    expect(html).not.toContain('Add bot');
    expect(html).not.toContain('>Remove<');
  });

  it('room full ho to (bots ke bina) koi Add bot button nahi', () => {
    const html = render(
      <Lobby room={fullRoomNoBots} myId="a" onStart={noop} onLeave={noop} onReact={noop} onAddBot={noop} onRemoveBot={noop} />,
    );
    expect(html).not.toContain('Add bot');
  });

  it('insaan players ko BOT tag nahi milta', () => {
    const html = render(
      <Lobby room={fullRoomNoBots} myId="a" onStart={noop} onLeave={noop} onReact={noop} onAddBot={noop} onRemoveBot={noop} />,
    );
    expect(html).not.toContain('BOT');
  });
});

describe('bot-related translations', () => {
  it('en aur hi dono me har naya key hai', () => {
    for (const key of ['home.bots', 'lobby.bot', 'lobby.addBot', 'lobby.removeBot', 'queue.waiting', 'err.BOT_NOT_FOUND'] as const) {
      expect(en[key], key).toBeTruthy();
      expect(hi[key], key).toBeTruthy();
    }
  });
});
