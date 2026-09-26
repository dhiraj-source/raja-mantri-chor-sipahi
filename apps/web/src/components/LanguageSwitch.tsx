import { LANGUAGES, type Language } from '../i18n/messages';
import { useI18n } from '../i18n/I18nProvider';

export function LanguageSwitch({ muted, onToggleMute }: { muted: boolean; onToggleMute: () => void }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex items-center justify-end gap-1 text-xs" role="group" aria-label="Language">
      <button
        onClick={onToggleMute}
        aria-pressed={muted}
        aria-label={t(muted ? 'audio.unmute' : 'audio.mute')}
        title={t(muted ? 'audio.unmute' : 'audio.mute')}
        className="mr-1 rounded-full bg-white/10 px-3 py-1 text-base"
      >
        {muted ? '🔇' : '🔊'}
      </button>
      {(Object.keys(LANGUAGES) as Language[]).map((code) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`rounded-full px-3 py-1 ${
            lang === code ? 'bg-amber-400 text-stone-900' : 'bg-white/10 text-stone-200'
          }`}
        >
          {LANGUAGES[code].label}
        </button>
      ))}
    </div>
  );
}
