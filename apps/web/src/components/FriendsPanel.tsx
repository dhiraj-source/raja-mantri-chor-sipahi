import { useState } from 'react';
import type { FriendInfo, FriendsOverview } from '@rmc/shared-types';
import type { FriendUiError } from '../auth/authApi';
import { useI18n } from '../i18n/I18nProvider';
import { Card } from './ui';

interface Props {
  overview: FriendsOverview;
  error: FriendUiError | null;
  onAdd: (username: string) => Promise<boolean>;
  onAccept: (accountId: string) => void;
  onDecline: (accountId: string) => void;
  onUnfriend: (accountId: string) => void;
}

const small = 'rounded-lg px-3 py-1 text-xs font-semibold transition active:scale-95';

/** Dost list, aayi hui requests aur nayi request. Sab data server ka; yahan sirf dikhana aur click bhejna. */
export function FriendsPanel({ overview, error, onAdd, onAccept, onDecline, onUnfriend }: Props) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (await onAdd(username)) setUsername('');
  };

  return (
    <Card className="space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-stone-400">{t('friends.title')}</h2>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t('friends.usernamePlaceholder')}
          aria-label={t('friends.usernamePlaceholder')}
          maxLength={20}
          className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button type="submit" disabled={!username.trim()} className={`${small} bg-amber-400 text-stone-900 disabled:opacity-40`}>
          {t('friends.add')}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {t(`frerr.${error}`)}
        </p>
      )}

      {overview.incoming.length > 0 && (
        <Section title={t('friends.requests')}>
          {overview.incoming.map((f) => (
            <Row key={f.accountId} friend={f}>
              <button className={`${small} bg-amber-400 text-stone-900`} onClick={() => onAccept(f.accountId)}>
                {t('friends.accept')}
              </button>
              <button className={`${small} bg-white/10`} onClick={() => onDecline(f.accountId)}>
                {t('friends.decline')}
              </button>
            </Row>
          ))}
        </Section>
      )}

      {overview.friends.length === 0 && overview.incoming.length === 0 && overview.outgoing.length === 0 ? (
        <p className="text-sm text-stone-300">{t('friends.none')}</p>
      ) : (
        <ul className="space-y-1">
          {overview.friends.map((f) => (
            <Row key={f.accountId} friend={f} showStatus>
              <button className={`${small} bg-white/10`} onClick={() => onUnfriend(f.accountId)}>
                {t('friends.remove')}
              </button>
            </Row>
          ))}
        </ul>
      )}

      {overview.outgoing.length > 0 && (
        <Section title={t('friends.sent')}>
          {overview.outgoing.map((f) => (
            <Row key={f.accountId} friend={f}>
              <button className={`${small} bg-white/10`} onClick={() => onDecline(f.accountId)}>
                {t('friends.cancel')}
              </button>
            </Row>
          ))}
        </Section>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs uppercase tracking-wider text-stone-400">{title}</h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Row({
  friend,
  showStatus = false,
  children,
}: {
  friend: FriendInfo;
  showStatus?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm">
      <span>
        {showStatus && (
          <span
            className={friend.online ? 'text-green-400' : 'text-stone-500'}
            title={t(friend.online ? 'friends.online' : 'friends.offline')}
          >
            ●{' '}
          </span>
        )}
        {friend.displayName} <span className="text-xs text-stone-400">@{friend.username}</span>
      </span>
      <span className="flex gap-1">{children}</span>
    </li>
  );
}
