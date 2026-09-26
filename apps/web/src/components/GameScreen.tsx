import { AnimatePresence, motion } from 'framer-motion';
import type {
  GameReward,
  PlayerGameView,
  PlayerId,
  Reaction,
  RoomView,
  VoteChoice,
} from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { ROLE_EMOJI } from '../strings';
import { ReactionBar } from './Reactions';
import { Scoreboard } from './Scoreboard';
import { VotePanel } from './VotePanel';
import { Button, Card } from './ui';

interface Props {
  room: RoomView;
  game: PlayerGameView;
  myId: PlayerId | null;
  /** Logged-in player ka reward (server se); guest ke liye null. */
  reward: GameReward | null;
  onGuess: (chorId: PlayerId) => void;
  onNextRound: () => void;
  onRematch: () => void;
  onLeave: () => void;
  onReact: (emoji: Reaction) => void;
  onVote: (choice: VoteChoice) => void;
}

export function GameScreen({
  room,
  game,
  myId,
  reward,
  onGuess,
  onNextRound,
  onRematch,
  onLeave,
  onReact,
  onVote,
}: Props) {
  const { t } = useI18n();
  const nameOf = (id: PlayerId) => game.players.find((p) => p.id === id)?.name ?? '?';
  const isHost = room.hostId === myId;
  const lastResult = game.history[game.history.length - 1];
  const away = room.players.filter((p) => !p.connected);

  return (
    <div className="space-y-4">
      {away.length > 0 && (
        <div role="status" className="rounded-xl bg-amber-500/80 px-4 py-2 text-sm text-stone-900">
          {t('game.away', { names: away.map((p) => p.name).join(', ') })}
        </div>
      )}

      {room.vote && <VotePanel vote={room.vote} myId={myId} nameOf={nameOf} onVote={onVote} />}

      <div className="flex items-center justify-between text-sm text-stone-300">
        <span>
          {game.phase === 'GAME_RESULT'
            ? t('game.over')
            : t('game.round', { n: game.currentRound, total: game.totalRounds })}
        </span>
        <span>{t('game.room', { code: room.code })}</span>
      </div>

      <AnimatePresence mode="wait">
        {game.phase === 'ROUND_ACTIVE' && (
          <motion.div key={`active-${game.currentRound}`} exit={{ opacity: 0 }}>
            <ActiveRound game={game} myId={myId} nameOf={nameOf} onGuess={onGuess} />
          </motion.div>
        )}
        {game.phase === 'ROUND_RESULT' && lastResult && (
          <motion.div key={`result-${game.currentRound}`} exit={{ opacity: 0 }}>
            <RoundResult
              game={game}
              result={lastResult}
              nameOf={nameOf}
              isHost={isHost}
              isLast={game.currentRound >= game.totalRounds}
              onNextRound={onNextRound}
            />
          </motion.div>
        )}
        {game.phase === 'GAME_RESULT' && (
          <motion.div key="final" exit={{ opacity: 0 }}>
            <FinalResult
              game={game}
              myId={myId}
              nameOf={nameOf}
              isHost={isHost}
              reward={reward}
              onRematch={onRematch}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ReactionBar onReact={onReact} />

      <Card>
        <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400">
          {t('game.scoreboard')}
        </h3>
        <Scoreboard
          game={game}
          myId={myId}
          characterOf={(id) => room.players.find((p) => p.id === id)?.character}
        />
      </Card>

      <Button variant="ghost" className="w-full" onClick={onLeave}>
        {t('game.leave')}
      </Button>
    </div>
  );
}

function ActiveRound({
  game,
  myId,
  nameOf,
  onGuess,
}: {
  game: PlayerGameView;
  myId: PlayerId | null;
  nameOf: (id: PlayerId) => string;
  onGuess: (id: PlayerId) => void;
}) {
  const { t } = useI18n();
  const role = game.myRole;
  const raja = Object.entries(game.visibleRoles).find(([, r]) => r === 'RAJA')?.[0];
  const mantri = Object.entries(game.visibleRoles).find(([, r]) => r === 'MANTRI')?.[0];
  // Mantri ke liye guess ke options: wo dono jo na Raja hain na khud Mantri.
  const suspects = game.players.filter((p) => p.id !== raja && p.id !== myId);

  return (
    <Card className="space-y-4 text-center">
      {role && (
        <motion.div
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          className="rounded-2xl bg-black/30 p-6"
          data-testid="my-role"
        >
          <div className="text-6xl">{ROLE_EMOJI[role]}</div>
          <div className="mt-2 text-3xl font-black text-amber-300">{t(`role.${role}`)}</div>
          <p className="mt-2 text-sm text-stone-300">{t(`hint.${role}`)}</p>
        </motion.div>
      )}

      <p className="text-sm text-stone-300">
        {ROLE_EMOJI.RAJA} {t('game.raja')}: <b>{raja ? nameOf(raja) : '?'}</b> &nbsp;•&nbsp;{' '}
        {ROLE_EMOJI.MANTRI} {t('game.mantri')}: <b>{mantri ? nameOf(mantri) : '?'}</b>
      </p>

      {game.canGuess ? (
        <div className="space-y-2">
          <p className="font-semibold">{t('game.whoIsChor')}</p>
          <div className="grid grid-cols-2 gap-2">
            {suspects.map((p) => (
              <Button key={p.id} onClick={() => onGuess(p.id)}>
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="animate-pulse text-stone-300">{t('game.thinking')}</p>
      )}
    </Card>
  );
}

function RoundResult({
  game,
  result,
  nameOf,
  isHost,
  isLast,
  onNextRound,
}: {
  game: PlayerGameView;
  result: PlayerGameView['history'][number];
  nameOf: (id: PlayerId) => string;
  isHost: boolean;
  isLast: boolean;
  onNextRound: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="space-y-4">
      <p className="text-center text-xl font-bold">
        {result.guessCorrect ? t('game.correct') : t('game.wrong')}
      </p>
      <p className="text-center text-sm text-stone-300">
        {t('game.guessed', { name: nameOf(result.guessedChorId) })}
      </p>
      <ul className="space-y-1 text-sm">
        {game.players.map((p) => {
          const role = result.roles[p.id];
          return (
            <li key={p.id} className="flex justify-between rounded-lg bg-black/25 px-3 py-2">
              <span>
                {role ? ROLE_EMOJI[role] : ''} {p.name} — {role ? t(`role.${role}`) : ''}
              </span>
              <span className="font-mono">+{result.points[p.id] ?? 0}</span>
            </li>
          );
        })}
      </ul>
      {isHost ? (
        <Button className="w-full" onClick={onNextRound}>
          {isLast ? t('game.final') : t('game.next')}
        </Button>
      ) : (
        <p className="text-center text-sm text-stone-300">{t('game.waitNext')}</p>
      )}
    </Card>
  );
}

function FinalResult({
  game,
  myId,
  nameOf,
  isHost,
  reward,
  onRematch,
}: {
  game: PlayerGameView;
  myId: PlayerId | null;
  nameOf: (id: PlayerId) => string;
  isHost: boolean;
  reward: GameReward | null;
  onRematch: () => void;
}) {
  const { t } = useI18n();
  const iWon = myId !== null && game.winnerIds.includes(myId);
  return (
    <Card className="space-y-2 text-center">
      <div className="text-6xl">{iWon ? '🏆' : '🎉'}</div>
      <p className="text-2xl font-black text-amber-300">{iWon ? t('game.youWon') : t('game.done')}</p>
      <p className="text-stone-300">
        {game.winnerIds.length > 1 ? t('game.winners') : t('game.winner')}:{' '}
        <b>{game.winnerIds.map(nameOf).join(', ')}</b>
      </p>
      {reward && (
        <div className="mx-auto max-w-xs space-y-1 rounded-xl bg-black/25 p-3 text-sm" data-testid="reward">
          <p className="text-xs uppercase tracking-wider text-stone-400">{t('reward.title')}</p>
          <p className="font-mono text-base text-amber-300">
            {t('reward.xp', { n: reward.xpGained })} • 🪙 {t('reward.coins', { n: reward.coinsGained })}
          </p>
          {reward.leveledUp && <p>{t('reward.levelUp', { n: reward.level })}</p>}
          {reward.newAchievements.map((a) => (
            <p key={a}>{t('reward.achievement', { name: t(`ach.${a}`) })}</p>
          ))}
        </div>
      )}
      {isHost ? (
        <Button className="mt-2 w-full" onClick={onRematch}>
          {t('game.again')}
        </Button>
      ) : (
        <p className="text-sm text-stone-300">{t('game.waitAgain')}</p>
      )}
    </Card>
  );
}
