import { useEffect, useRef, useState } from 'react';
import { DG_MAX_CHAT_LENGTH, type DrawGuessChatEntry } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';

interface Props {
  entries: readonly DrawGuessChatEntry[];
  /** Drawer ke paas guess/chat input nahi hota (server bhi enforce karta hai). */
  canType: boolean;
  onSend: (text: string) => void;
}

export function DgChatPanel({ entries, canType, onSend }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries.length]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex h-72 flex-col rounded-xl bg-black/25">
      <ul ref={listRef} className="flex-1 space-y-1 overflow-y-auto p-3 text-sm" aria-live="polite">
        {entries.map((e) => (
          <li key={e.key}>
            {e.kind === 'SYSTEM' && <span className="italic text-stone-400">{e.text}</span>}
            {e.kind === 'CORRECT_GUESS' && (
              <span className="font-semibold text-green-400">🎉 {t('dg.chat.guessedCorrectly', { name: e.name })}</span>
            )}
            {e.kind === 'CHAT' && (
              <span>
                <span className="font-semibold text-amber-300">{e.name}:</span> {e.text}
              </span>
            )}
          </li>
        ))}
      </ul>
      {canType && (
        <div className="flex gap-2 border-t border-white/10 p-2">
          <input
            value={text}
            maxLength={DG_MAX_CHAT_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t('dg.chat.placeholder')}
            aria-label={t('dg.chat.label')}
            className="w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-stone-900 active:scale-95"
            onClick={submit}
          >
            {t('dg.chat.send')}
          </button>
        </div>
      )}
    </div>
  );
}
