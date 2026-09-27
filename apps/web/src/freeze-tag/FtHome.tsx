import { useState } from 'react';
import { FT_ROOM_CODE_LENGTH, DEFAULT_FT_SETTINGS, type FreezeTagSettings } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from '../components/ui';

const NAME_KEY = 'rmc:name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

interface Props {
  defaultName?: string;
  onCreate: (name: string, settings: Partial<FreezeTagSettings>) => void;
  onJoin: (code: string, name: string) => void;
  onBack: () => void;
}

export function FtHome({ defaultName, onCreate, onJoin, onBack }: Props) {
  const { t } = useI18n();
  const [typedName, setName] = useState(loadName);
  const name = typedName || defaultName || '';
  const [code, setCode] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_FT_SETTINGS.maxPlayers);
  const [roundSec, setRoundSec] = useState(DEFAULT_FT_SETTINGS.roundDurationMs / 1000);

  const cleanName = name.trim();
  const nameOk = cleanName.length > 0;

  const rememberName = () => {
    try {
      localStorage.setItem(NAME_KEY, cleanName);
    } catch {
      // storage band ho to bhi chalega
    }
  };

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-amber-300">💣 {t('ft.mode.title')}</h2>
        <button className="text-sm text-stone-400 underline" onClick={onBack}>
          ← {t('ft.home.back')}
        </button>
      </div>

      <label className="block text-sm">
        {t('ft.home.yourName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('ft.home.namePlaceholder')}
          className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-amber-400"
        />
      </label>

      <button
        className="text-xs uppercase tracking-wider text-stone-400 underline"
        onClick={() => setShowSettings((s) => !s)}
      >
        {showSettings ? t('ft.home.hideSettings') : t('ft.home.showSettings')}
      </button>

      {showSettings && (
        <div className="space-y-3 rounded-xl bg-black/20 p-3 text-sm">
          <NumberField label={t('ft.home.maxPlayers')} value={maxPlayers} min={2} max={10} onChange={setMaxPlayers} />
          <NumberField label={t('ft.home.roundDuration')} value={roundSec} min={30} max={300} onChange={setRoundSec} />
        </div>
      )}

      <Button
        className="w-full"
        disabled={!nameOk}
        onClick={() => {
          rememberName();
          onCreate(cleanName, { maxPlayers, roundDurationMs: roundSec * 1000 });
        }}
      >
        {t('ft.home.createRoom')}
      </Button>

      <div className="flex items-center gap-3 text-xs text-stone-400">
        <div className="h-px flex-1 bg-white/20" />
        {t('ft.home.or')}
        <div className="h-px flex-1 bg-white/20" />
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          maxLength={FT_ROOM_CODE_LENGTH}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('ft.home.roomCode')}
          aria-label={t('ft.home.roomCode')}
          className="w-full rounded-xl bg-black/30 px-4 py-3 text-center text-lg uppercase tracking-widest outline-none focus:ring-2 focus:ring-amber-400"
        />
        <Button
          variant="ghost"
          disabled={!nameOk || code.length !== FT_ROOM_CODE_LENGTH}
          onClick={() => {
            rememberName();
            onJoin(code, cleanName);
          }}
        >
          {t('ft.home.join')}
        </Button>
      </div>
    </Card>
  );
}

function NumberField({
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
