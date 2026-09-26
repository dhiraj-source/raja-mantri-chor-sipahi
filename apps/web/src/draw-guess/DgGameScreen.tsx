import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DrawGuessChatEntry, DrawGuessGameView, DrawGuessStroke, PlayerId } from '@rmc/shared-types';
import { useI18n } from '../i18n/I18nProvider';
import { Button, Card } from '../components/ui';
import { Canvas, type CanvasHandle, type DrawTool, type IncomingStroke } from './Canvas';
import { DgChatPanel } from './DgChatPanel';
import { DgScoreboard } from './DgScoreboard';
import { Toolbar } from './Toolbar';

interface Props {
  game: DrawGuessGameView;
  myId: PlayerId | null;
  chat: readonly DrawGuessChatEntry[];
  incomingStrokes: readonly IncomingStroke[];
  onSelectWord: (word: string) => void;
  onStroke: (stroke: DrawGuessStroke) => void;
  onChat: (text: string) => void;
  onLeave: () => void;
  onEndGame: () => void;
  onReturnToLobby: () => void;
  isHost: boolean;
}

/** Server ka turnEndsAt sirf DISPLAY ke liye — kabhi kisi action ko gate nahi karta (server-authoritative rehta hai). */
function useCountdown(endsAt: number | null): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));
  useEffect(() => {
    setRemaining(secondsLeft(endsAt));
    if (endsAt === null) return;
    const id = setInterval(() => setRemaining(secondsLeft(endsAt)), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

function secondsLeft(endsAt: number | null): number {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

export function DgGameScreen({
  game,
  myId,
  chat,
  incomingStrokes,
  onSelectWord,
  onStroke,
  onChat,
  onLeave,
  onEndGame,
  onReturnToLobby,
  isHost,
}: Props) {
  const { t } = useI18n();
  const [tool, setTool] = useState<DrawTool>({ kind: 'PEN', color: '#000000', size: 10 });
  const canvasRef = useRef<CanvasHandle | null>(null);
  const seconds = useCountdown(game.turnEndsAt);
  const nameOf = (id: PlayerId) => game.players.find((p) => p.id === id)?.name ?? '?';
  const drawerName = game.drawerId ? nameOf(game.drawerId) : '?';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-stone-300">
        <span>
          {game.phase === 'GAME_RESULTS' ? t('dg.game.over') : t('dg.game.round', { n: game.round, total: game.totalRounds })}
        </span>
        {isHost && game.phase !== 'GAME_RESULTS' && (
          <button className="text-xs text-stone-400 underline" onClick={onEndGame}>
            {t('dg.game.endGame')}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {game.phase === 'COUNTDOWN' && (
          <motion.div key="countdown" exit={{ opacity: 0 }}>
            <Card className="space-y-2 text-center">
              <p className="text-lg">{t('dg.game.getReady')}</p>
              <p className="text-5xl font-black text-amber-300">{seconds}</p>
            </Card>
          </motion.div>
        )}

        {game.phase === 'CHOOSING_WORD' && (
          <motion.div key="choosing" exit={{ opacity: 0 }}>
            <Card className="space-y-4 text-center">
              {game.isDrawer && game.wordChoices ? (
                <>
                  <p className="font-semibold">{t('dg.game.chooseWord')}</p>
                  <div className="grid grid-cols-1 gap-2">
                    {game.wordChoices.map((w) => (
                      <Button key={w} onClick={() => onSelectWord(w)}>
                        {w}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="animate-pulse text-stone-300">{t('dg.game.choosingWord', { name: drawerName })}</p>
              )}
              <p className="text-xs text-stone-400">{seconds}s</p>
            </Card>
          </motion.div>
        )}

        {game.phase === 'DRAWING' && (
          <motion.div key="drawing" exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2">
              <span className="text-sm text-stone-300">
                {game.isDrawer ? t('dg.game.yourWord') : t('dg.game.isDrawing', { name: drawerName })}
              </span>
              <span className="text-2xl font-black text-amber-300" data-testid="dg-timer">
                {seconds}
              </span>
            </div>
            <p className="text-center font-mono text-2xl tracking-widest" data-testid="dg-word">
              {game.isDrawer ? game.word : game.maskedWord}
            </p>
            {!game.isDrawer && (
              <p className="text-center text-xs text-stone-400">
                {t('dg.game.guessedCount', { n: game.correctGuesserIds.length, total: game.players.length - 1 })}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
              <div className="space-y-2">
                <Canvas ref={canvasRef} isDrawer={game.isDrawer} tool={tool} incoming={incomingStrokes} onStroke={onStroke} />
                {game.isDrawer && (
                  <Toolbar
                    tool={tool}
                    onChange={setTool}
                    onClear={() => {
                      canvasRef.current?.clearLocal();
                      onStroke({ tool: 'CLEAR' });
                    }}
                  />
                )}
              </div>
              <div className="space-y-3">
                <Card>
                  <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400">{t('dg.game.players')}</h3>
                  <DgScoreboard game={game} myId={myId} nameOf={nameOf} />
                </Card>
                <DgChatPanel entries={chat} canType={!game.isDrawer && !game.myGuessedCorrectly} onSend={onChat} />
              </div>
            </div>
          </motion.div>
        )}

        {game.phase === 'ROUND_RESULTS' && (
          <motion.div key="results" exit={{ opacity: 0 }}>
            <RoundResults game={game} nameOf={nameOf} />
          </motion.div>
        )}

        {game.phase === 'GAME_RESULTS' && (
          <motion.div key="final" exit={{ opacity: 0 }}>
            <FinalResults game={game} myId={myId} nameOf={nameOf} isHost={isHost} onReturnToLobby={onReturnToLobby} />
          </motion.div>
        )}
      </AnimatePresence>

      {game.phase !== 'DRAWING' && (
        <Card>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-stone-400">{t('dg.game.players')}</h3>
          <DgScoreboard game={game} myId={myId} nameOf={nameOf} />
        </Card>
      )}

      <Button variant="ghost" className="w-full" onClick={onLeave}>
        {t('dg.game.leave')}
      </Button>
    </div>
  );
}

function RoundResults({ game, nameOf }: { game: DrawGuessGameView; nameOf: (id: PlayerId) => string }) {
  const { t } = useI18n();
  const last = game.history[game.history.length - 1];
  if (!last) return null;
  return (
    <Card className="space-y-3 text-center">
      <p className="text-sm text-stone-300">{t('dg.game.wordWas')}</p>
      <p className="text-3xl font-black text-amber-300">{last.word}</p>
      <ul className="space-y-1 text-left text-sm">
        {last.correctGuessers.length === 0 && <li className="text-stone-400">{t('dg.game.nobodyGuessed')}</li>}
        {last.correctGuessers.map((c) => (
          <li key={c.playerId} className="flex justify-between rounded-lg bg-black/25 px-3 py-2">
            <span>{nameOf(c.playerId)}</span>
            <span className="font-mono">+{c.points}</span>
          </li>
        ))}
        <li className="flex justify-between rounded-lg bg-amber-400/20 px-3 py-2">
          <span>
            {nameOf(last.drawerId)} {t('dg.game.drawingLabel')}
          </span>
          <span className="font-mono">+{last.drawerPoints}</span>
        </li>
      </ul>
      <p className="text-xs text-stone-400">{t('dg.game.nextTurn')}</p>
    </Card>
  );
}

function FinalResults({
  game,
  myId,
  nameOf,
  isHost,
  onReturnToLobby,
}: {
  game: DrawGuessGameView;
  myId: PlayerId | null;
  nameOf: (id: PlayerId) => string;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const { t } = useI18n();
  const iWon = myId !== null && game.winnerIds.includes(myId);
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  return (
    <Card className="space-y-3 text-center">
      <div className="text-6xl">🏆</div>
      <p className="text-2xl font-black text-amber-300">{iWon ? t('dg.game.youWon') : t('dg.game.done')}</p>
      <p className="text-stone-300">
        {game.winnerIds.length > 1 ? t('dg.game.winners') : t('dg.game.winner')}:{' '}
        <b>{game.winnerIds.map(nameOf).join(', ')}</b>
      </p>
      <ul className="space-y-1 text-left text-sm">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between rounded-lg bg-black/25 px-3 py-2">
            <span>
              #{i + 1} {nameOf(p.id)}
            </span>
            <span className="font-mono">{p.score}</span>
          </li>
        ))}
      </ul>
      {isHost ? (
        <Button className="w-full" onClick={onReturnToLobby}>
          {t('dg.game.playAgain')}
        </Button>
      ) : (
        <p className="text-sm text-stone-300">{t('dg.game.waitHost')}</p>
      )}
    </Card>
  );
}
