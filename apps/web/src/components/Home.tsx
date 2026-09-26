import { useState } from 'react';
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from './ui';

const NAME_KEY = 'rmc:name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

interface Props {
  /** Logged-in player ka naam; khaali naam field me apne aap bhar jata hai. */
  defaultName?: string;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onQuickMatch: (name: string) => void;
}

export function Home({ defaultName, onCreate, onJoin, onQuickMatch }: Props) {
  const { t } = useI18n();
  const [typedName, setName] = useState(loadName);
  const name = typedName || defaultName || '';
  const [code, setCode] = useState('');

  const cleanName = name.trim();
  const nameOk = cleanName.length > 0;

  const run = (action: () => void) => () => {
    try {
      localStorage.setItem(NAME_KEY, cleanName);
    } catch {
      // storage band ho to bhi chalega
    }
    action();
  };

  return (
    <Card className="space-y-5">
      <label className="block text-sm">
        {t('home.name')}
        <input
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('home.namePlaceholder')}
          className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-amber-400"
        />
      </label>

      <Button className="w-full" disabled={!nameOk} onClick={run(() => onQuickMatch(cleanName))}>
        ⚡ {t('home.quick')}
      </Button>
      <Button variant="ghost" className="w-full" disabled={!nameOk} onClick={run(() => onCreate(cleanName))}>
        {t('home.create')}
      </Button>

      <div className="flex items-center gap-3 text-xs text-stone-400">
        <div className="h-px flex-1 bg-white/20" />
        {t('home.or')}
        <div className="h-px flex-1 bg-white/20" />
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          maxLength={ROOM_CODE_LENGTH}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('home.code')}
          aria-label={t('home.code')}
          className="w-full rounded-xl bg-black/30 px-4 py-3 text-center text-lg uppercase tracking-widest outline-none focus:ring-2 focus:ring-amber-400"
        />
        <Button
          variant="ghost"
          disabled={!nameOk || code.length !== ROOM_CODE_LENGTH}
          onClick={run(() => onJoin(code, cleanName))}
        >
          {t('home.join')}
        </Button>
      </div>
    </Card>
  );
}
