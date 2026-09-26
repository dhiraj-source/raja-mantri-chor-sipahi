import type { PlayerId, RoomPlayerView } from '@rmc/shared-types';
import type { PeerConnectionState } from '../voice/webrtc';
import type { MicStatus } from '../voice/useVoiceChat';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from './ui';

interface Props {
  players: readonly RoomPlayerView[];
  myId: PlayerId | null;
  micStatus: MicStatus;
  muted: boolean;
  peerStates: Record<PlayerId, PeerConnectionState>;
  remoteMuted: Record<PlayerId, boolean>;
  onJoin: () => void;
  onToggleMute: () => void;
}

const dotClass: Record<PeerConnectionState, string> = {
  connecting: 'bg-amber-400 animate-pulse',
  connected: 'bg-green-400',
  failed: 'bg-red-400',
  closed: 'bg-stone-500',
};

/** Live voice chat ka control bar: mic on/off, mute/unmute, aur room ke doosre players ka status. */
export function VoiceBar({ players, myId, micStatus, muted, peerStates, remoteMuted, onJoin, onToggleMute }: Props) {
  const { t } = useI18n();
  const others = players.filter((p) => !p.isBot && p.id !== myId && p.connected);

  if (micStatus === 'unsupported') {
    return (
      <Card className="text-center text-sm text-stone-300">{t('voice.unsupported')}</Card>
    );
  }

  if (micStatus === 'off' || micStatus === 'denied') {
    return (
      <Card className="space-y-2 text-center">
        <Button variant="ghost" className="w-full" onClick={onJoin}>
          🎤 {t('voice.join')}
        </Button>
        {micStatus === 'denied' && <p className="text-xs text-red-300">{t('voice.denied')}</p>}
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-stone-400">{t('voice.title')}</h3>
        <Button
          className="px-3 py-1 text-sm"
          variant={muted ? 'ghost' : 'primary'}
          disabled={micStatus === 'requesting'}
          onClick={onToggleMute}
          aria-pressed={!muted}
        >
          {micStatus === 'requesting' ? t('voice.requesting') : muted ? `🔇 ${t('voice.muted')}` : `🎙️ ${t('voice.talking')}`}
        </Button>
      </div>
      {others.length === 0 ? (
        <p className="text-sm text-stone-300">{t('voice.alone')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {others.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1 rounded-full bg-black/25 px-3 py-1 text-xs"
            >
              <span
                className={`h-2 w-2 rounded-full ${dotClass[peerStates[p.id] ?? 'connecting']}`}
                aria-hidden="true"
              />
              {p.name}
              {remoteMuted[p.id] !== false && <span aria-hidden="true"> 🔇</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
