import type { DrawGuessGameView, PlayerId } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { dgAvatarEmoji } from './dgAvatar';

interface Props {
  game: DrawGuessGameView;
  myId: PlayerId | null;
  nameOf: (id: PlayerId) => string;
}

export function DgScoreboard({ game, myId, nameOf }: Props) {
  const { t } = useI18n();
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  return (
    <ul className="space-y-1 text-sm">
      {sorted.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center justify-between rounded-lg px-3 py-2 ${
            p.id === game.drawerId ? 'bg-amber-400/20' : 'bg-black/25'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="w-4 text-xs text-stone-400">#{i + 1}</span>
            <span aria-hidden="true">{dgAvatarEmoji(p.id)}</span>
            <span className={p.id === myId ? 'font-semibold text-amber-300' : ''}>{nameOf(p.id)}</span>
            {p.id === game.drawerId && (
              <span title={t('dg.scoreboard.drawing')} aria-label={t('dg.scoreboard.drawing')}>✏️</span>
            )}
            {p.hasGuessedCorrectly && (
              <span title={t('dg.scoreboard.guessedCorrectly')} aria-label={t('dg.scoreboard.guessedCorrectly')}>✅</span>
            )}
            {!p.connected && <span className="text-xs text-red-300">{t('dg.scoreboard.disconnected')}</span>}
          </span>
          <span className="font-mono">{p.score}</span>
        </li>
      ))}
    </ul>
  );
}
