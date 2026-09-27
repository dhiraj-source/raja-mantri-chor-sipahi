import type { BombTagGameView, BombTagRoomPlayerView, PlayerId } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';

interface Props {
  roster: readonly BombTagRoomPlayerView[];
  myId: PlayerId | null;
  /** Diya ho to alive/dead bhi dikhta hai (round chal raha ho tabhi maayne rakhta hai). */
  game?: BombTagGameView | null;
}

export function BtScoreboard({ roster, myId, game }: Props) {
  const { t } = useI18n();
  const sorted = [...roster].sort((a, b) => b.score - a.score);
  return (
    <ul className="space-y-1 text-sm">
      {sorted.map((p, i) => {
        const alive = game?.players.find((gp) => gp.id === p.id)?.alive;
        const isBombHolder = game?.bombHolderId === p.id;
        return (
          <li
            key={p.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
              isBombHolder ? 'bg-amber-400/20' : 'bg-black/25'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="w-4 text-xs text-stone-400">#{i + 1}</span>
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className={p.id === myId ? 'font-semibold text-amber-300' : ''}>
                {p.name}
                {alive === false && <span className="ml-1 text-stone-500">💀</span>}
              </span>
              {isBombHolder && <span title={t('bt.scoreboard.hasBomb')}>💣</span>}
              {!p.connected && <span className="text-xs text-red-300">{t('bt.scoreboard.disconnected')}</span>}
            </span>
            <span className="font-mono">{p.score}</span>
          </li>
        );
      })}
    </ul>
  );
}
