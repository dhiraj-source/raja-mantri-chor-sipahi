import { useI18n } from '../i18n/I18nProvider';
import { Card } from '../components/ui';

interface Props {
  onChooseRmcs: () => void;
  onChooseDrawGuess: () => void;
  onChooseBombTag: () => void;
  onChooseFreezeTag: () => void;
}

/** Chaaron game modes ke beech pehla choice — koi bhi room me na ho tabhi dikhta hai. */
export function ModeSelect({ onChooseRmcs, onChooseDrawGuess, onChooseBombTag, onChooseFreezeTag }: Props) {
  const { t } = useI18n();
  return (
    <Card className="space-y-4 text-center">
      <p className="text-sm text-stone-300">{t('dg.mode.choose')}</p>
      <div className="grid grid-cols-1 gap-3">
        <button
          className="rounded-2xl bg-white/10 p-5 text-left transition active:scale-95 hover:bg-white/20"
          onClick={onChooseRmcs}
        >
          <div className="text-3xl">👑</div>
          <div className="mt-1 font-bold">{t('dg.mode.rmcsTitle')}</div>
          <p className="text-xs text-stone-400">{t('dg.mode.rmcsDesc')}</p>
        </button>
        <button
          className="rounded-2xl bg-white/10 p-5 text-left transition active:scale-95 hover:bg-white/20"
          onClick={onChooseDrawGuess}
        >
          <div className="text-3xl">🎨</div>
          <div className="mt-1 font-bold">{t('dg.mode.title')}</div>
          <p className="text-xs text-stone-400">{t('dg.mode.desc')}</p>
        </button>
        <button
          className="rounded-2xl bg-white/10 p-5 text-left transition active:scale-95 hover:bg-white/20"
          onClick={onChooseBombTag}
        >
          <div className="text-3xl">💣</div>
          <div className="mt-1 font-bold">{t('bt.mode.title')}</div>
          <p className="text-xs text-stone-400">{t('bt.mode.desc')}</p>
        </button>
        <button
          className="rounded-2xl bg-white/10 p-5 text-left transition active:scale-95 hover:bg-white/20"
          onClick={onChooseFreezeTag}
        >
          <div className="text-3xl">🧊</div>
          <div className="mt-1 font-bold">{t('ft.mode.title')}</div>
          <p className="text-xs text-stone-400">{t('ft.mode.desc')}</p>
        </button>
      </div>
    </Card>
  );
}
