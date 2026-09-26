import type { PlayerGameView, PlayerId } from '@rmc/shared-types';
import { avatarEmoji } from '../avatar';
import { useI18n } from '../i18n/I18nProvider';

/** Points server se aate hain; yahan sirf dikhane ke liye sort hota hai. */
export function Scoreboard({
  game,
  myId,
  characterOf,
}: {
  game: PlayerGameView;
  myId: PlayerId | null;
  /** Player id -> character id (room state se). */
  characterOf?: (id: PlayerId) => string | undefined;
}) {
  const { t } = useI18n();
  const rows = [...game.players].sort((a, b) => (game.totals[b.id] ?? 0) - (game.totals[a.id] ?? 0));
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((p) => (
        <li key={p.id} className="flex justify-between rounded-lg bg-black/20 px-3 py-2">
          <span>
            <span aria-hidden="true">{avatarEmoji(characterOf?.(p.id))}</span> {p.name}
            {p.id === myId && <span className="text-stone-400"> {t('lobby.you')}</span>}
          </span>
          <span className="font-mono">{game.totals[p.id] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}
