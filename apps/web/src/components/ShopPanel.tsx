import { CHARACTERS, type Profile } from '@rmc/shared-types';
import type { ShopUiError } from '../auth/authApi';
import { useI18n } from '../i18n/I18nProvider';
import { Card } from './ui';

interface Props {
  profile: Profile;
  error: ShopUiError | null;
  onBuy: (characterId: string) => void;
  onEquip: (characterId: string) => void;
}

const btn = 'rounded-lg px-3 py-1 text-xs font-semibold transition active:scale-95 disabled:opacity-40';

/** Characters ki dukaan. Daam, level aur coins ka faisla server ka hai; yahan buttons sirf sahi options dikhate hain. */
export function ShopPanel({ profile, error, onBuy, onEquip }: Props) {
  const { t } = useI18n();
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-stone-400">{t('shop.title')}</h2>
        <span className="text-sm">🪙 {t('account.coins', { n: profile.coins })}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {t(`shoperr.${error}`)}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2">
        {CHARACTERS.map((c) => {
          const owned = profile.ownedCharacters.includes(c.id);
          const equipped = profile.equippedCharacter === c.id;
          const levelOk = profile.level >= c.minLevel;
          const affordable = profile.coins >= c.price;
          return (
            <li
              key={c.id}
              className={`space-y-1 rounded-xl p-3 text-center ${equipped ? 'bg-amber-400/20 ring-1 ring-amber-400' : 'bg-black/20'}`}
            >
              <div className="text-4xl">{c.emoji}</div>
              <div className="text-sm font-semibold">{t(`char.${c.id}`)}</div>
              {owned ? (
                equipped ? (
                  <div className="text-xs text-amber-300">✓ {t('shop.equipped')}</div>
                ) : (
                  <button className={`${btn} bg-white/10`} onClick={() => onEquip(c.id)}>
                    {t('shop.equip')}
                  </button>
                )
              ) : (
                <>
                  <div className="text-xs text-stone-300">
                    {c.price === 0 ? t('shop.free') : t('shop.price', { n: c.price })}
                    {c.minLevel > 1 && <span className={levelOk ? '' : 'text-red-300'}> • {t('shop.level', { n: c.minLevel })}</span>}
                  </div>
                  <button
                    className={`${btn} bg-amber-400 text-stone-900`}
                    disabled={!levelOk || !affordable}
                    onClick={() => onBuy(c.id)}
                  >
                    {t('shop.buy')}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
