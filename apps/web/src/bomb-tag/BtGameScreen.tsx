import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BombTagGameView, BombTagRoomView, PlayerId } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from '../components/ui';
import { Arena } from './Arena';
import type { BtUiEvent } from './btClientState';
import { BtScoreboard } from './BtScoreboard';
import { useKeyboardInput } from './useKeyboardInput';
import { isTouchDevice, VirtualJoystick } from './VirtualJoystick';

interface Props {
  room: BombTagRoomView;
  game: BombTagGameView;
  myId: PlayerId | null;
  isHost: boolean;
  recentEvents: readonly BtUiEvent[];
  onInput: (x: number, y: number) => void;
  onLeave: () => void;
  onEndGame: () => void;
  onReturnToLobby: () => void;
}

const BANNER_MS = 1400;

/** Server ka endsAt sirf DISPLAY ke liye — kabhi kisi action ko gate nahi karta (server-authoritative rehta hai). */
function useCountdown(endsAt: number | null): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));
  useEffect(() => {
    setRemaining(secondsLeft(endsAt));
    if (endsAt === null) return;
    const id = setInterval(() => setRemaining(secondsLeft(endsAt)), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

function secondsLeft(endsAt: number | null): number {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

export function BtGameScreen({ room, game, myId, isHost, recentEvents, onInput, onLeave, onEndGame, onReturnToLobby }: Props) {
  const { t } = useI18n();
  const nameOf = (id: PlayerId) => room.players.find((p) => p.id === id)?.name ?? '?';
  const countdownSeconds = useCountdown(game.countdownEndsAt);
  const bombSeconds = useCountdown(game.bombEndsAt);
  const me = game.players.find((p) => p.id === myId);
  const aliveCount = game.players.filter((p) => p.alive).length;
  const canMove = game.phase === 'PLAYING' && me?.alive === true;
  const [showJoystick] = useState(isTouchDevice);

  useKeyboardInput(canMove, onInput);

  // "Aapko bomb mili" / "aap khatam ho gaye" — chhota transient banner, sirf apne khud ke liye.
  const [banner, setBanner] = useState<string | null>(null);
  const heardEvent = useRef(-1);
  useEffect(() => {
    for (const event of recentEvents) {
      if (event.key <= heardEvent.current) continue;
      heardEvent.current = event.key;
      if (event.playerId !== myId) continue;
      if (event.type === 'TAG') setBanner(t('bt.game.bannerYouHaveBomb'));
      else if (event.type === 'EXPLODE') setBanner(t('bt.game.bannerEliminated'));
    }
  }, [recentEvents, myId, t]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(id);
  }, [banner]);

  // Screen-reader ke liye: canvas khud kuch nahi bolta, isliye har meaningful state change par
  // ek chhota status update — text hi nahi badla to browser dobara announce nahi karta (khud hi
  // throttle ho jaata hai, alag se koi extra logic nahi chahiye).
  const bombHolderName = game.bombHolderId ? nameOf(game.bombHolderId) : null;
  const statusText =
    game.phase === 'PLAYING'
      ? t('bt.game.statusLive', { n: aliveCount, holder: bombHolderName ?? '?' })
      : game.phase === 'ROUND_OVER'
        ? t('bt.game.roundWinner') + ': ' + (game.roundWinnerId ? nameOf(game.roundWinnerId) : t('bt.game.nobody'))
        : '';

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="sr-only">
        {statusText}
      </div>
      <div className="flex items-center justify-between text-sm text-stone-300">
        <span>
          {game.phase === 'GAME_OVER'
            ? t('bt.game.over')
            : t('bt.game.round', { n: game.round, total: game.roundsToWin })}
        </span>
        {isHost && game.phase !== 'GAME_OVER' && (
          <button className="text-xs text-stone-400 underline" onClick={onEndGame}>
            {t('bt.game.endGame')}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {game.phase === 'COUNTDOWN' && (
          <motion.div key="countdown" exit={{ opacity: 0 }}>
            <Card className="space-y-2 text-center">
              <p className="text-lg">{t('bt.game.getReady')}</p>
              <p className="text-5xl font-black text-amber-300">{countdownSeconds}</p>
            </Card>
          </motion.div>
        )}

        {game.phase === 'PLAYING' && (
          <motion.div key="playing" exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2">
              <span className="text-sm text-stone-300">
                {me?.alive === false ? t('bt.game.eliminated') : t('bt.game.aliveCount', { n: aliveCount })}
              </span>
              <span
                className={`text-2xl font-black ${bombSeconds <= 3 ? 'animate-pulse text-red-400' : 'text-amber-300'}`}
                data-testid="bt-bomb-timer"
              >
                💣 {bombSeconds}s
              </span>
            </div>
            <div className="relative">
              <Arena game={game} roster={room.players} myId={myId} />
              <AnimatePresence>
                {banner && (
                  <motion.div
                    key={banner}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"
                  >
                    <span className="rounded-full bg-black/70 px-4 py-1.5 text-sm font-bold text-amber-300 shadow-lg">
                      {banner}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {me?.alive === false ? (
              <p className="text-center text-xs text-stone-400">{t('bt.game.spectating')}</p>
            ) : showJoystick ? (
              <div className="flex justify-center py-2">
                <VirtualJoystick onChange={onInput} />
              </div>
            ) : (
              <p className="text-center text-xs text-stone-400">{t('bt.game.controlsHint')}</p>
            )}
            <Card>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400">{t('bt.game.players')}</h3>
              <BtScoreboard roster={room.players} myId={myId} game={game} />
            </Card>
          </motion.div>
        )}

        {game.phase === 'ROUND_OVER' && (
          <motion.div key="round-over" exit={{ opacity: 0 }}>
            <RoundResult game={game} nameOf={nameOf} />
          </motion.div>
        )}

        {game.phase === 'GAME_OVER' && (
          <motion.div key="game-over" exit={{ opacity: 0 }}>
            <FinalResult room={room} game={game} myId={myId} isHost={isHost} onReturnToLobby={onReturnToLobby} />
          </motion.div>
        )}
      </AnimatePresence>

      {game.phase !== 'PLAYING' && (
        <Card>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400">{t('bt.game.players')}</h3>
          <BtScoreboard roster={room.players} myId={myId} game={game} />
        </Card>
      )}

      <Button variant="ghost" className="w-full" onClick={onLeave}>
        {t('bt.game.leave')}
      </Button>
    </div>
  );
}

function RoundResult({ game, nameOf }: { game: BombTagGameView; nameOf: (id: PlayerId) => string }) {
  const { t } = useI18n();
  return (
    <Card className="space-y-3 text-center">
      <div className="text-5xl">🏆</div>
      <p className="text-sm text-stone-300">{t('bt.game.roundWinner')}</p>
      <p className="text-3xl font-black text-amber-300">
        {game.roundWinnerId ? nameOf(game.roundWinnerId) : t('bt.game.nobody')}
      </p>
      <p className="text-xs text-stone-400">{t('bt.game.nextRound')}</p>
    </Card>
  );
}

function FinalResult({
  room,
  game,
  myId,
  isHost,
  onReturnToLobby,
}: {
  room: BombTagRoomView;
  game: BombTagGameView;
  myId: PlayerId | null;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const { t } = useI18n();
  const iWon = myId !== null && game.matchWinnerId === myId;
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const winnerName = room.players.find((p) => p.id === game.matchWinnerId)?.name ?? '?';
  return (
    <Card className="space-y-3 text-center">
      <div className="text-6xl">🏆</div>
      <p className="text-2xl font-black text-amber-300">{iWon ? t('bt.game.youWon') : t('bt.game.done')}</p>
      <p className="text-stone-300">
        {t('bt.game.winner')}: <b>{winnerName}</b>
      </p>
      <ul className="space-y-1 text-left text-sm">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between rounded-lg bg-black/25 px-3 py-2">
            <span>
              #{i + 1} {p.name}
            </span>
            <span className="font-mono">{p.score}</span>
          </li>
        ))}
      </ul>
      {isHost ? (
        <Button className="w-full" onClick={onReturnToLobby}>
          {t('bt.game.playAgain')}
        </Button>
      ) : (
        <p className="text-sm text-stone-300">{t('bt.game.waitHost')}</p>
      )}
    </Card>
  );
}
