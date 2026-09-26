import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RoomPlayerView } from '@rmc/shared-types';
import { VoiceBar } from '../src/components/VoiceBar';
import { I18nProvider } from '../src/i18n/I18nProvider';
import { en, hi } from '../src/i18n/messages';

const noop = () => undefined;
const render = (ui: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{ui}</I18nProvider>);

const player = (id: string, name: string, over: Partial<RoomPlayerView> = {}): RoomPlayerView => ({
  id,
  name,
  isHost: false,
  connected: true,
  character: 'DEFAULT',
  isBot: false,
  ...over,
});

const players = [player('a', 'Asha'), player('b', 'Bina'), player('bot-1', 'Bot Meera', { isBot: true })];

const base = {
  players,
  myId: 'a',
  peerStates: {},
  remoteMuted: {},
  onJoin: noop,
  onToggleMute: noop,
};

describe('VoiceBar', () => {
  it('mic off: sirf "Join voice chat" button dikhta hai', () => {
    const html = render(<VoiceBar {...base} micStatus="off" muted onToggleMute={noop} />);
    expect(html).toContain('Join voice chat');
    expect(html).not.toContain('Talking');
  });

  it('permission denied: error message dikhta hai', () => {
    const html = render(<VoiceBar {...base} micStatus="denied" muted />);
    expect(html).toContain('Join voice chat');
    expect(html).toContain('Microphone permission was denied.');
  });

  it('unsupported browser: alag message, koi button nahi', () => {
    const html = render(<VoiceBar {...base} micStatus="unsupported" muted />);
    expect(html).toContain('not supported');
    expect(html).not.toContain('Join voice chat');
  });

  it('mic on, muted: baaki human players dikhte hain, bot nahi', () => {
    const html = render(<VoiceBar {...base} micStatus="on" muted />);
    expect(html).toContain('Muted');
    expect(html).toContain('Bina');
    expect(html).not.toContain('Bot Meera'); // bot voice me nahi dikhta
    expect(html).not.toContain('Asha'); // khud ka naam list me nahi (myId)
  });

  it('mic on, unmuted: "Talking" dikhta hai', () => {
    const html = render(<VoiceBar {...base} micStatus="on" muted={false} />);
    expect(html).toContain('Talking');
  });

  it('koi aur connected nahi to "akela hun" message', () => {
    const html = render(
      <VoiceBar {...base} players={[player('a', 'Asha')]} micStatus="on" muted />,
    );
    expect(html).toContain('hear them when they join');
  });

  it('peer ka connection status aur mute icon dikhta hai', () => {
    const html = render(
      <VoiceBar
        {...base}
        micStatus="on"
        muted
        peerStates={{ b: 'connected' }}
        remoteMuted={{ b: false }}
      />,
    );
    expect(html).toContain('Bina');
    expect(html).not.toContain('🔇 Bina'); // b unmuted hai, uske paas mute icon nahi
  });

  it('disconnected player voice list me nahi dikhta', () => {
    const html = render(
      <VoiceBar {...base} players={[player('a', 'Asha'), player('b', 'Bina', { connected: false })]} micStatus="on" muted />,
    );
    expect(html).not.toContain('Bina');
  });
});

describe('voice translations', () => {
  it('en aur hi dono me har voice.* key hai', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (key.startsWith('voice.')) {
        expect(en[key], key).toBeTruthy();
        expect(hi[key], key).toBeTruthy();
      }
    }
  });
});
