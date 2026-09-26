import { useI18n } from '../i18n/I18nProvider';
import type { DrawTool } from './Canvas';

const COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#facc15',
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#78350f', '#6b7280',
];

const SIZES = [
  { label: 'S', size: 4 },
  { label: 'M', size: 10 },
  { label: 'L', size: 20 },
] as const;

interface Props {
  tool: DrawTool;
  onChange: (tool: DrawTool) => void;
  onClear: () => void;
}

/** Sirf drawer ko dikhta hai (server bhi enforce karta hai — ye sirf UI ki suvidha hai). */
export function Toolbar({ tool, onChange, onClear }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-xl bg-black/25 p-3" data-testid="dg-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <ToolButton active={tool.kind === 'PEN'} label={`✏️ ${t('dg.tool.brush')}`} onClick={() => onChange({ ...tool, kind: 'PEN' })} />
        <ToolButton
          active={tool.kind === 'ERASER'}
          label={`🧹 ${t('dg.tool.eraser')}`}
          onClick={() => onChange({ ...tool, kind: 'ERASER' })}
        />
        <ToolButton active={tool.kind === 'FILL'} label={`🪣 ${t('dg.tool.fill')}`} onClick={() => onChange({ ...tool, kind: 'FILL' })} />
        <button
          className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold active:scale-95"
          onClick={onClear}
        >
          🗑️ {t('dg.tool.clear')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            aria-pressed={tool.color === c}
            className={`h-8 w-8 rounded-full border-2 transition active:scale-90 ${
              tool.color === c ? 'border-amber-300' : 'border-white/30'
            }`}
            style={{ backgroundColor: c }}
            onClick={() => onChange({ ...tool, color: c })}
          />
        ))}
        <input
          type="color"
          aria-label="Custom color"
          value={tool.color}
          onChange={(e) => onChange({ ...tool, color: e.target.value })}
          className="h-8 w-8 cursor-pointer rounded-full border-2 border-white/30 bg-transparent"
        />
      </div>

      <div className="flex items-center gap-2">
        {SIZES.map(({ label, size }) => (
          <button
            key={label}
            aria-pressed={tool.size === size}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold active:scale-95 ${
              tool.size === size ? 'bg-amber-400 text-stone-900' : 'bg-white/10'
            }`}
            onClick={() => onChange({ ...tool, size })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-lg px-3 py-2 text-sm font-semibold active:scale-95 ${
        active ? 'bg-amber-400 text-stone-900' : 'bg-white/10'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
