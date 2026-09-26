import { useState } from 'react';
import { DEFAULT_DG_SETTINGS, DG_ROOM_CODE_LENGTH, type DrawGuessSettings } from '@rmc/shared-types';
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
  onCreate: (name: string, settings: Partial<DrawGuessSettings>) => void;
  onJoin: (code: string, name: string) => void;
  onBack: () => void;
}

export function DgHome({ defaultName, onCreate, onJoin, onBack }: Props) {
  const { t } = useI18n();
  const [typedName, setName] = useState(loadName);
  const name = typedName || defaultName || '';
  const [code, setCode] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [rounds, setRounds] = useState(DEFAULT_DG_SETTINGS.totalRounds);
  const [drawTimeSec, setDrawTimeSec] = useState(DEFAULT_DG_SETTINGS.drawTimeMs / 1000);
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_DG_SETTINGS.maxPlayers);

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
        <h2 className="text-lg font-bold text-amber-300">🎨 {t('dg.mode.title')}</h2>
        <button className="text-sm text-stone-400 underline" onClick={onBack}>
          ← {t('dg.home.back')}
        </button>
      </div>

      <label className="block text-sm">
        {t('dg.home.yourName')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('dg.home.namePlaceholder')}
          className="mt-1 w-full rounded-xl bg-black/30 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-amber-400"
        />
      </label>

      <button
        className="text-xs uppercase tracking-wider text-stone-400 underline"
        onClick={() => setShowSettings((s) => !s)}
      >
        {showSettings ? t('dg.home.hideSettings') : t('dg.home.showSettings')}
      </button>

      {showSettings && (
        <div className="space-y-3 rounded-xl bg-black/20 p-3 text-sm">
          <NumberField label={t('dg.home.maxPlayers')} value={maxPlayers} min={2} max={12} onChange={setMaxPlayers} />
          <NumberField label={t('dg.home.rounds')} value={rounds} min={1} max={20} onChange={setRounds} />
          <NumberField
            label={t('dg.home.drawTime')}
            value={drawTimeSec}
            min={15}
            max={240}
            onChange={setDrawTimeSec}
          />
        </div>
      )}

      <Button
        className="w-full"
        disabled={!nameOk}
        onClick={() => {
          rememberName();
          onCreate(cleanName, { maxPlayers, totalRounds: rounds, drawTimeMs: drawTimeSec * 1000 });
        }}
      >
        {t('dg.home.createRoom')}
      </Button>

      <div className="flex items-center gap-3 text-xs text-stone-400">
        <div className="h-px flex-1 bg-white/20" />
        {t('dg.home.or')}
        <div className="h-px flex-1 bg-white/20" />
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          maxLength={DG_ROOM_CODE_LENGTH}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('dg.home.roomCode')}
          aria-label={t('dg.home.roomCode')}
          className="w-full rounded-xl bg-black/30 px-4 py-3 text-center text-lg uppercase tracking-widest outline-none focus:ring-2 focus:ring-amber-400"
        />
        <Button
          variant="ghost"
          disabled={!nameOk || code.length !== DG_ROOM_CODE_LENGTH}
          onClick={() => {
            rememberName();
            onJoin(code, cleanName);
          }}
        >
          {t('dg.home.join')}
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
