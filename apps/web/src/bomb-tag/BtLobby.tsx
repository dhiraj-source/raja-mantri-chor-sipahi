import { useState } from 'react';
import type { BombTagRoomView, BombTagSettings, PlayerId } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from '../components/ui';

interface Props {
  room: BombTagRoomView;
  myId: PlayerId | null;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onKick: (playerId: PlayerId) => void;
  onUpdateSettings: (settings: Partial<BombTagSettings>) => void;
}

export function BtLobby({ room, myId, onReady, onStart, onLeave, onKick, onUpdateSettings }: Props) {
  const { t } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === myId;
  const me = room.players.find((p) => p.id === myId);
  const notReady = room.players.filter((p) => p.id !== room.hostId && !p.ready);
  const canStart = room.players.length >= 2 && notReady.length === 0;

  const shareUrl = `${window.location.origin}${window.location.pathname}?btJoin=${room.code}`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked ho to bhi koi crash nahi, bas copy nahi hoga
    }
  };

  const shareLink = async () => {
    try {
      if (navigator.share) await navigator.share({ title: t('bt.mode.title'), text: `${t('bt.lobby.roomCode')}: ${room.code}`, url: shareUrl });
      else await navigator.clipboard.writeText(shareUrl);
    } catch {
      // user ne share cancel kiya waghera — theek hai
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        <div className="text-center">
          <p className="text-sm text-stone-300">{t('bt.lobby.roomCode')}</p>
          <p className="text-5xl font-black tracking-[0.3em] text-amber-300" data-testid="bt-room-code">
            {room.code}
          </p>
          <div className="mt-2 flex justify-center gap-2">
            <button className="rounded-lg bg-white/10 px-3 py-1 text-xs active:scale-95" onClick={() => void copyCode()}>
              {copied ? `✓ ${t('bt.lobby.copied')}` : `📋 ${t('bt.lobby.copyCode')}`}
            </button>
            <button className="rounded-lg bg-white/10 px-3 py-1 text-xs active:scale-95" onClick={() => void shareLink()}>
              🔗 {t('bt.lobby.share')}
            </button>
          </div>
        </div>

        <ul className="space-y-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl bg-black/25 px-4 py-3">
              <span className="flex items-center gap-2">
                <span className={p.connected ? 'text-green-400' : 'text-red-400'}>●</span>
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
                {p.id === myId && <span className="text-stone-400"> {t('bt.lobby.you')}</span>}
                {!p.connected && <span className="text-xs text-red-300"> {t('bt.lobby.disconnected')}</span>}
              </span>
              <span className="flex items-center gap-2">
                {p.isHost ? (
                  <span className="text-xs text-amber-300">{t('bt.lobby.host')}</span>
                ) : (
                  <span className={`text-xs ${p.ready ? 'text-green-400' : 'text-stone-400'}`}>
                    {p.ready ? `✓ ${t('bt.lobby.ready')}` : t('bt.lobby.notReady')}
                  </span>
                )}
                {isHost && p.id !== myId && (
                  <button className="rounded-lg bg-white/10 px-2 py-1 text-xs active:scale-95" onClick={() => onKick(p.id)}>
                    {t('bt.lobby.kick')}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-center text-xs text-stone-400">
          {t('bt.lobby.playerCount', { n: room.players.length, max: room.settings.maxPlayers })}
        </p>

        {isHost ? (
          <>
            <button
              className="w-full text-center text-xs uppercase tracking-wider text-stone-400 underline"
              onClick={() => setShowSettings((s) => !s)}
            >
              {showSettings ? t('bt.lobby.hideSettings') : t('bt.lobby.settings')}
            </button>
            {showSettings && (
              <div className="space-y-2 rounded-xl bg-black/20 p-3 text-sm">
                <SettingsRow label={t('bt.home.maxPlayers')} value={room.settings.maxPlayers}
                  onChange={(n) => onUpdateSettings({ maxPlayers: n })} min={2} max={10} />
                <SettingsRow label={t('bt.home.roundsToWin')} value={room.settings.roundsToWin}
                  onChange={(n) => onUpdateSettings({ roundsToWin: n })} min={1} max={10} />
                <SettingsRow label={t('bt.home.bombDuration')} value={room.settings.bombDurationMs / 1000}
                  onChange={(n) => onUpdateSettings({ bombDurationMs: n * 1000 })} min={5} max={60} />
              </div>
            )}
            <Button className="w-full" disabled={!canStart} onClick={onStart}>
              {notReady.length > 0
                ? t('bt.lobby.waitingFor', { names: notReady.map((p) => p.name).join(', ') })
                : t('bt.lobby.startGame')}
            </Button>
          </>
        ) : (
          <Button className="w-full" variant={me?.ready ? 'ghost' : 'primary'} onClick={() => onReady(!me?.ready)}>
            {me?.ready ? `✓ ${t('bt.lobby.cancelReady')}` : t('bt.lobby.imReady')}
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onLeave}>
          {t('bt.lobby.leave')}
        </Button>
      </Card>
    </div>
  );
}

function SettingsRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="w-20 rounded-lg bg-black/30 px-2 py-1 text-center outline-none focus:ring-2 focus:ring-amber-400"
      />
    </label>
  );
}
