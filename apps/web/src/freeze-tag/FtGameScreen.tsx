import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FreezeTagGameView, FreezeTagRoomView, PlayerId } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from '../components/ui';
import { isTouchDevice, VirtualJoystick } from '../bomb-tag/VirtualJoystick';
import { useKeyboardInput } from '../bomb-tag/useKeyboardInput';
import { FtArena } from './FtArena';

interface Props {
  room: FreezeTagRoomView;
  game: FreezeTagGameView;
  myId: PlayerId | null;
  isHost: boolean;
  onInput: (x: number, y: number) => void;
  onLeave: () => void;
  onEndGame: () => void;
  onReturnToLobby: () => void;
}

/** Server ka endsAt sirf DISPLAY ke liye — kabhi kisi action ko gate nahi karta. */
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

/** 95 -> "01:35" */
function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FtGameScreen({
  room,
  game,
  myId,
  isHost,
  onInput,
  onLeave,
  onEndGame,
  onReturnToLobby,
}: Props) {
  const { t } = useI18n();
  const nameOf = (id: PlayerId | null) => (id ? room.players.find((p) => p.id === id)?.name ?? '?' : '?');
  const countdownSeconds = useCountdown(game.countdownEndsAt);
  const roundSeconds = useCountdown(game.roundEndsAt);
  const [showJoystick] = useState(isTouchDevice);

  const me = game.players.find((p) => p.id === myId);
  const iAmIt = me?.status === 'IT';
  const iAmFrozen = me?.status === 'FROZEN';
  const activeCount = game.players.filter((p) => p.status === 'ACTIVE').length;
  const frozenCount = game.players.filter((p) => p.status === 'FROZEN').length;
  // Frozen player hil nahi sakta — client bhi input bhejna band kar deta hai (server bhi rokta hai).
  const canMove = game.phase === 'PLAYING' && me !== undefined && !iAmFrozen;
  const lowTime = game.phase === 'PLAYING' && roundSeconds <= 10;

  useKeyboardInput(canMove, onInput);

  const roleLine = iAmIt
    ? { text: t('ft.game.youAreIt'), hint: t('ft.game.youAreItHint'), cls: 'bg-red-500/90 text-white' }
    : iAmFrozen
      ? { text: t('ft.game.youAreFrozen'), hint: t('ft.game.youAreFrozenHint'), cls: 'bg-sky-400/90 text-slate-900' }
      : { text: t('ft.game.youAreRunner'), hint: t('ft.game.youAreRunnerHint'), cls: 'bg-emerald-500/90 text-white' };

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="sr-only">
        {game.phase === 'PLAYING'
          ? t('ft.game.status', { it: nameOf(game.itId), active: activeCount, frozen: frozenCount })
          : ''}
      </div>

      <div className="flex items-center justify-between text-sm text-stone-300">
        <span>
          {game.phase === 'ROUND_OVER' ? t('ft.game.over') : t('ft.game.itIs', { name: nameOf(game.itId) })}
        </span>
        {isHost && game.phase !== 'ROUND_OVER' && (
          <button className="text-xs text-stone-400 underline" onClick={onEndGame}>
            {t('ft.game.endGame')}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {game.phase === 'COUNTDOWN' && (
          <motion.div key="countdown" exit={{ opacity: 0 }}>
            <Card className="space-y-2 text-center">
              <p className="text-lg">{t('ft.game.getReady')}</p>
              <p className="text-5xl font-black text-amber-300">{countdownSeconds || t('ft.game.go')}</p>
              <p className="text-sm text-stone-300">{t('ft.game.itIs', { name: nameOf(game.itId) })}</p>
            </Card>
          </motion.div>
        )}

        {game.phase === 'PLAYING' && (
          <motion.div key="playing" exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2">
              <span className="text-sm">
                <span className="text-emerald-400">🟢 {activeCount}</span>{' '}
                <span className="text-sky-300">❄️ {frozenCount}</span>
              </span>
              <span
                className={`font-black tabular-nums ${lowTime ? 'animate-pulse text-3xl text-red-400' : 'text-2xl text-amber-300'}`}
                data-testid="ft-timer"
              >
                ⏱ {mmss(roundSeconds)}
              </span>
            </div>

            <div className="flex justify-center">
              <span
                className={`rounded-full px-4 py-1.5 text-sm font-bold shadow-lg ${roleLine.cls}`}
                data-testid="ft-role"
              >
                {roleLine.text}
              </span>
            </div>
            <p className="text-center text-xs text-stone-400">{roleLine.hint}</p>

            <FtArena game={game} roster={room.players} myId={myId} />

            {iAmFrozen ? (
              <p className="text-center text-xs text-sky-300">{t('ft.game.frozenWait')}</p>
            ) : showJoystick ? (
              <div className="flex justify-center py-2">
                <VirtualJoystick onChange={onInput} />
              </div>
            ) : (
              <p className="text-center text-xs text-stone-400">{t('ft.game.controlsHint')}</p>
            )}

            <Card>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400">{t('ft.game.players')}</h3>
              <FtPlayerList room={room} game={game} myId={myId} />
            </Card>
          </motion.div>
        )}

        {game.phase === 'ROUND_OVER' && (
          <motion.div key="result" exit={{ opacity: 0 }}>
            <FtResult
              room={room}
              game={game}
              myId={myId}
              isHost={isHost}
              onReturnToLobby={onReturnToLobby}
              nameOf={nameOf}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Button variant="ghost" className="w-full" onClick={onLeave}>
        {t('ft.game.leave')}
      </Button>
    </div>
  );
}

function FtPlayerList({
  room,
  game,
  myId,
}: {
  room: FreezeTagRoomView;
  game: FreezeTagGameView;
  myId: PlayerId | null;
}) {
  const { t } = useI18n();
  return (
    <ul className="space-y-1 text-sm">
      {game.players.map((p) => {
        const info = room.players.find((rp) => rp.id === p.id);
        return (
          <li
            key={p.id}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
              p.status === 'IT' ? 'bg-red-500/20' : p.status === 'FROZEN' ? 'bg-sky-400/15' : 'bg-black/25'
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: info?.color ?? '#94a3b8' }}
              />
              <span className={p.id === myId ? 'font-semibold text-amber-300' : ''}>{info?.name ?? '?'}</span>
              {info && !info.connected && <span className="text-xs text-red-300">{t('ft.game.disconnected')}</span>}
            </span>
            <span className="text-xs">
              {p.status === 'IT' ? `🔴 ${t('ft.game.it')}` : p.status === 'FROZEN' ? '❄️' : '🟢'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FtResult({
  room,
  game,
  myId,
  isHost,
  onReturnToLobby,
  nameOf,
}: {
  room: FreezeTagRoomView;
  game: FreezeTagGameView;
  myId: PlayerId | null;
  isHost: boolean;
  onReturnToLobby: () => void;
  nameOf: (id: PlayerId | null) => string;
}) {
  const { t } = useI18n();
  const itWon = game.winner === 'IT';
  const iAmIt = game.itId === myId;
  const iWon = itWon ? iAmIt : !iAmIt;
  const survivors = game.stats.filter((s) => !s.frozenAtEnd && s.id !== game.itId).length;
  const frozen = game.stats.filter((s) => s.frozenAtEnd).length;

  return (
    <Card className="space-y-3 text-center">
      <div className="text-6xl">{itWon ? '🧊' : '🏃'}</div>
      <p className="text-2xl font-black text-amber-300" data-testid="ft-result">
        {itWon ? t('ft.game.itWins') : t('ft.game.playersWin')}
      </p>
      <p className="text-sm text-stone-300">
        {iWon ? t('ft.game.youWon') : t('ft.game.youLost')} · {t('ft.game.itWas', { name: nameOf(game.itId) })}
      </p>
      <p className="text-xs text-stone-400">
        {t('ft.game.survivors', { n: survivors })} · {t('ft.game.frozenCount', { n: frozen })}
      </p>

      <ul className="space-y-1 text-left text-sm">
        {game.stats.map((s) => {
          const info = room.players.find((p) => p.id === s.id);
          return (
            <li key={s.id} className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: info?.color ?? '#94a3b8' }}
                />
                {info?.name ?? '?'}
                {s.id === game.itId && <span className="text-xs text-red-300">🔴 {t('ft.game.it')}</span>}
              </span>
              <span className="font-mono text-xs text-stone-300">
                {s.id === game.itId
                  ? t('ft.game.statFreezes', { n: s.freezes })
                  : `${t('ft.game.statUnfreezes', { n: s.unfreezes })} · ${t('ft.game.statTimesFrozen', { n: s.timesFrozen })}`}
              </span>
            </li>
          );
        })}
      </ul>

      {isHost ? (
        <Button className="w-full" onClick={onReturnToLobby}>
          {t('ft.game.playAgain')}
        </Button>
      ) : (
        <p className="text-sm text-stone-300">{t('ft.game.waitHost')}</p>
      )}
    </Card>
  );
}
