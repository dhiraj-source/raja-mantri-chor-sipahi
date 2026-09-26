import { useEffect, useMemo, useState } from 'react';
import type { PlayerId, RoomVoteView, VoteChoice } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from './ui';

interface Props {
  vote: RoomVoteView;
  myId: PlayerId | null;
  nameOf: (id: PlayerId) => string;
  onVote: (choice: VoteChoice) => void;
}

/** Gayab player ke baare me vote: intezaar ya game cancel. Faisla aur ginti server ki hai. */
export function VotePanel({ vote, myId, nameOf, onVote }: Props) {
  const { t } = useI18n();
  const secondsLeft = useCountdown(vote.expiresInMs, vote);
  const canVote = myId !== null && vote.eligibleIds.includes(myId);
  const myChoice = myId ? vote.votes[myId] : undefined;
  const values = Object.values(vote.votes);
  const need = Math.floor(vote.eligibleIds.length / 2) + 1;

  return (
    <Card className="space-y-3 border border-amber-400/60">
      <p className="font-semibold">
        {t('vote.title', { names: vote.missingIds.map(nameOf).join(', ') })}
      </p>
      <p className="text-xs text-stone-300">
        {t('vote.tally', {
          wait: values.filter((v) => v === 'WAIT').length,
          cancel: values.filter((v) => v === 'CANCEL').length,
          need,
        })}{' '}
        • {t('vote.seconds', { n: secondsLeft })}
      </p>
      {canVote ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={myChoice === 'WAIT' ? 'primary' : 'ghost'}
            aria-pressed={myChoice === 'WAIT'}
            onClick={() => onVote('WAIT')}
          >
            ⏳ {t('vote.wait')}
          </Button>
          <Button
            variant={myChoice === 'CANCEL' ? 'primary' : 'ghost'}
            aria-pressed={myChoice === 'CANCEL'}
            onClick={() => onVote('CANCEL')}
          >
            ✖ {t('vote.cancel')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-stone-300">{t('vote.onlyVoters')}</p>
      )}
    </Card>
  );
}

/**
 * Server ne jo "bacha hua waqt" bheja uska ulti ginti. Har naye server message par
 * (dependency `resetKey`) dobara shuru hoti hai, isliye ghadi ka farq jama nahi hota.
 */
function useCountdown(expiresInMs: number, resetKey: unknown): number {
  const deadline = useMemo(() => Date.now() + expiresInMs, [expiresInMs, resetKey]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
