import {
  MAX_ROOM_PLAYERS,
  type FriendInfo,
  type PlayerId,
  type Reaction,
  type RoomView,
} from '@rmc/shared-types';
import { avatarEmoji } from '../avatar';
import { useI18n } from '../i18n/I18nProvider';
import { ReactionBar } from './Reactions';
import { Button, Card } from './ui';

interface Props {
  room: RoomView;
  myId: PlayerId | null;
  onStart: () => void;
  onLeave: () => void;
  onReact: (emoji: Reaction) => void;
  /** Logged-in player ke dost (guest ke liye undefined => invite section nahi). */
  friends?: FriendInfo[];
  onInvite?: (accountId: string) => void;
}

export function Lobby({ room, myId, onStart, onLeave, onReact, friends, onInvite }: Props) {
  const { t } = useI18n();
  const isHost = room.hostId === myId;
  const full = room.players.length === MAX_ROOM_PLAYERS;

  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        <div className="text-center">
          <p className="text-sm text-stone-300">{t('lobby.codeHint')}</p>
          <p className="text-5xl font-black tracking-[0.3em] text-amber-300" data-testid="room-code">
            {room.code}
          </p>
        </div>

        <ul className="space-y-2">
          {Array.from({ length: MAX_ROOM_PLAYERS }, (_, i) => {
            const p = room.players[i];
            return (
              <li
                key={p?.id ?? `empty-${i}`}
                className="flex items-center justify-between rounded-xl bg-black/25 px-4 py-3"
              >
                {p ? (
                  <>
                    <span>
                      <span className={p.connected ? 'text-green-400' : 'text-red-400'}>●</span>{' '}
                      <span aria-hidden="true">{avatarEmoji(p.character)}</span> {p.name}
                      {p.id === myId && <span className="text-stone-400"> {t('lobby.you')}</span>}
                      {!p.connected && (
                        <span className="text-xs text-red-300"> {t('lobby.disconnected')}</span>
                      )}
                    </span>
                    {p.isHost && <span className="text-xs text-amber-300">{t('lobby.host')}</span>}
                  </>
                ) : (
                  <span className="text-stone-500">{t('lobby.empty')}</span>
                )}
              </li>
            );
          })}
        </ul>

        {friends && onInvite && !full && (
          <div>
            <h3 className="mb-1 text-xs uppercase tracking-wider text-stone-400">{t('friends.inviteTitle')}</h3>
            {friends.filter((f) => f.online).length === 0 ? (
              <p className="text-sm text-stone-300">{t('friends.noOnline')}</p>
            ) : (
              <ul className="space-y-1">
                {friends
                  .filter((f) => f.online)
                  .map((f) => (
                    <li key={f.accountId} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
                      <span>
                        <span className="text-green-400">●</span> {f.displayName}
                      </span>
                      <button
                        className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-stone-900 active:scale-95"
                        onClick={() => onInvite(f.accountId)}
                      >
                        {t('friends.invite')}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {isHost ? (
          <Button className="w-full" disabled={!full} onClick={onStart}>
            {full ? t('lobby.start') : t('lobby.need', { n: MAX_ROOM_PLAYERS })}
          </Button>
        ) : (
          <p className="text-center text-sm text-stone-300">{t('lobby.waitHost')}</p>
        )}
        <Button variant="ghost" className="w-full" onClick={onLeave}>
          {t('lobby.leave')}
        </Button>
      </Card>
      <ReactionBar onReact={onReact} />
    </div>
  );
}
