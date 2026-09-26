import type { InviteItem } from '../net/clientState';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from './ui';

/** Dost ka "room me aao" bulava. Join dabane par server room ke rules dobara check karta hai. */
export function InviteToasts({
  invites,
  onJoin,
  onDismiss,
}: {
  invites: InviteItem[];
  onJoin: (invite: InviteItem) => void;
  onDismiss: (key: number) => void;
}) {
  const { t } = useI18n();
  if (invites.length === 0) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {invites.map((invite) => (
        <Card key={invite.key} className="flex items-center justify-between gap-2 border border-amber-400/60">
          <span className="text-sm">
            📨 {t('invite.title', { name: invite.fromName })}
            <span className="ml-2 font-mono text-xs text-stone-300">{invite.roomCode}</span>
          </span>
          <span className="flex gap-1">
            <Button className="px-3 py-1 text-sm" onClick={() => onJoin(invite)}>
              {t('invite.join')}
            </Button>
            <Button variant="ghost" className="px-3 py-1 text-sm" onClick={() => onDismiss(invite.key)}>
              {t('invite.dismiss')}
            </Button>
          </span>
        </Card>
      ))}
    </div>
  );
}
