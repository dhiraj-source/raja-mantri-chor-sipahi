import { MAX_ROOM_PLAYERS } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from './ui';

export function QueueScreen({ size, onCancel }: { size: number; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="space-y-4 text-center">
      <p className="animate-pulse text-xl font-bold">{t('queue.title')}</p>
      <p className="text-4xl font-black text-amber-300" data-testid="queue-count">
        {t('queue.count', { n: size, max: MAX_ROOM_PLAYERS })}
      </p>
      <Button variant="ghost" className="w-full" onClick={onCancel}>
        {t('queue.cancel')}
      </Button>
    </Card>
  );
}
