import { useState } from 'react';
import { ACHIEVEMENTS, type Profile } from '@rmc/shared-types';
import type { AuthUiError } from '../auth/authApi';
import { avatarEmoji } from '../avatar';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from './ui';

interface Props {
  profile: Profile | null;
  /** Token hai par profile abhi load ho rahi hai. */
  loggedIn: boolean;
  error: AuthUiError | null;
  busy: boolean;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string) => void;
  onLogout: () => void;
}

export function AccountPanel({ profile, loggedIn, error, busy, onLogin, onRegister, onLogout }: Props) {
  if (loggedIn && profile) return <ProfileCard profile={profile} onLogout={onLogout} />;
  if (loggedIn) return null;
  return <AuthForm error={error} busy={busy} onLogin={onLogin} onRegister={onRegister} />;
}

function AuthForm({
  error,
  busy,
  onLogin,
  onRegister,
}: Pick<Props, 'error' | 'busy' | 'onLogin' | 'onRegister'>) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const ready = username.trim().length > 0 && password.length > 0 && !busy;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    (mode === 'login' ? onLogin : onRegister)(username.trim(), password);
  };

  const input =
    'w-full rounded-xl bg-black/30 px-4 py-2 outline-none focus:ring-2 focus:ring-amber-400';
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-stone-300">{t('account.hint')}</p>
        <div className="flex gap-2 text-sm">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-1 ${mode === m ? 'bg-amber-400 text-stone-900' : 'bg-white/10'}`}
            >
              {t(m === 'login' ? 'account.login' : 'account.register')}
            </button>
          ))}
        </div>
        <input
          className={input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t('account.username')}
          aria-label={t('account.username')}
          autoComplete="username"
          maxLength={20}
        />
        <input
          className={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('account.password')}
          aria-label={t('account.password')}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          maxLength={72}
        />
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {t(`autherr.${error}`)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={!ready}>
          {t(mode === 'login' ? 'account.login' : 'account.register')}
        </Button>
      </form>
    </Card>
  );
}

export function ProfileCard({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const { t } = useI18n();
  const span = Math.max(1, profile.nextLevelXp - profile.levelStartXp);
  const pct = Math.min(100, Math.max(0, ((profile.xp - profile.levelStartXp) / span) * 100));

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">
            <span aria-hidden="true">{avatarEmoji(profile.equippedCharacter)}</span> {profile.displayName}
          </p>
          <p className="text-xs text-stone-300">@{profile.username}</p>
        </div>
        <button onClick={onLogout} className="text-xs text-stone-300 underline">
          {t('account.logout')}
        </button>
      </div>

      <div>
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-amber-300">{t('account.level', { n: profile.level })}</span>
          <span>🪙 {t('account.coins', { n: profile.coins })}</span>
        </div>
        <div
          className="mt-1 h-2 overflow-hidden rounded-full bg-black/30"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-stone-300">
          {t('account.xp', { xp: profile.xp, next: profile.nextLevelXp })} •{' '}
          {t('account.stats', { games: profile.gamesPlayed, wins: profile.wins })}
        </p>
      </div>

      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wider text-stone-400">{t('account.achievements')}</h3>
        {profile.achievements.length === 0 ? (
          <p className="text-sm text-stone-300">{t('account.noAchievements')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1 text-xs">
            {ACHIEVEMENTS.filter((a) => profile.achievements.includes(a)).map((a) => (
              <li key={a} className="rounded-full bg-amber-400/20 px-2 py-1">
                🏅 {t(`ach.${a}`)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wider text-stone-400">{t('account.history')}</h3>
        {profile.history.length === 0 ? (
          <p className="text-sm text-stone-300">{t('account.noHistory')}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {profile.history.slice(0, 5).map((h) => (
              <li key={h.id} className="flex justify-between rounded-lg bg-black/20 px-3 py-1">
                <span>{h.isWinner ? `🏆 ${t('account.won')}` : t('account.played')}</span>
                <span className="font-mono">
                  {h.points} • +{h.xpGained} XP
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
