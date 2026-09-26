import { useEffect, useRef, useState } from 'react';
import { useSounds } from './audio/useSounds';
import { soundForReaction } from './audio/sounds';
import { MAX_NAME_LENGTH, MAX_ROOM_PLAYERS, type Reaction } from '@rmc/shared-types';
import { useAuth } from './auth/useAuth';
import { useFriends } from './auth/useFriends';
import { AccountPanel } from './components/AccountPanel';
import { FriendsPanel } from './components/FriendsPanel';
import { InviteToasts } from './components/InviteToasts';
import { ShopPanel } from './components/ShopPanel';
import { useGameSocket } from './net/useGameSocket';
import { useI18n } from './i18n/I18nProvider';
import { GameScreen } from './components/GameScreen';
import { Home } from './components/Home';
import { LanguageSwitch } from './components/LanguageSwitch';
import { Lobby } from './components/Lobby';
import { QueueScreen } from './components/QueueScreen';
import { ReactionFeed } from './components/Reactions';
import { Button, Card, ErrorBanner } from './components/ui';
import { VoiceBar } from './components/VoiceBar';
import { useVoiceChat } from './voice/useVoiceChat';
import { DrawGuessApp } from './draw-guess/DrawGuessApp';
import { ModeSelect } from './draw-guess/ModeSelect';
import { useDrawGuessSocket } from './draw-guess/useDrawGuessSocket';

/**
 * Browser sirf dikhata hai aur actions bhejta hai.
 * Roles, score aur result server decide karta hai.
 */
export function App() {
  const { t } = useI18n();
  const { state, send, reconnect, dismissError, expireReaction, dismissInvite, onRawMessage } = useGameSocket();
  const { room, game, queue, playerId, connection, error, reactions, reward, invites, friendsVersion } = state;
  const reconnecting = connection === 'reconnecting';
  // Draw & Guess: RMCS se bilkul alag state/screens, same shared socket (mounted yahin taaki
  // reload/reconnect ke baad turant sahi room dikhe — "mode" select ka intezaar na karna pade).
  const dg = useDrawGuessSocket(onRawMessage, send);
  const [mode, setMode] = useState<'menu' | 'rmcs' | 'draw_guess'>('menu');
  const auth = useAuth();
  const { authToken, refresh } = auth;
  const friends = useFriends(authToken, friendsVersion);
  const sounds = useSounds();
  const { play } = sounds;

  // ---- Awaazen: har event par ek baar ----
  const heardReaction = useRef(-1);
  useEffect(() => {
    for (const item of reactions) {
      if (item.key <= heardReaction.current) continue;
      heardReaction.current = item.key;
      const sound = soundForReaction(item.emoji);
      if (sound) play(sound);
    }
  }, [reactions, play]);

  const lastResult = game?.history[game.history.length - 1];
  const roundKey = game?.phase === 'ROUND_RESULT' ? `${game.currentRound}` : null;
  useEffect(() => {
    if (roundKey && lastResult) play(lastResult.guessCorrect ? 'CORRECT' : 'WRONG');
    // Sirf naye round result par (lastResult usi ke saath badalta hai).
  }, [roundKey]);

  const won = game?.phase === 'GAME_RESULT' && playerId !== null && game.winnerIds.includes(playerId);
  useEffect(() => {
    if (won) play('WIN');
  }, [won, play]);

  const inviteCount = invites.length;
  const heardInvites = useRef(0);
  useEffect(() => {
    if (inviteCount > heardInvites.current) play('INVITE');
    heardInvites.current = inviteCount;
  }, [inviteCount, play]);

  // Har naye/wapas aaye socket par (aur login/logout par) server ko batao ki hum kaun hain.
  useEffect(() => {
    if (connection === 'open') send({ event: 'AUTHENTICATE', data: { authToken } });
  }, [connection, playerId, authToken, send]);

  // Game ka reward aaya: profile (XP, level, history) server se dobara lo.
  useEffect(() => {
    if (reward) void refresh();
  }, [reward, refresh]);

  const react = (emoji: Reaction) => send({ event: 'REACTION', data: { emoji } });
  const leave = () => send({ event: 'LEAVE_ROOM' });
  const nameOf = (id: string) => room?.players.find((p) => p.id === id)?.name ?? '?';

  // Live voice chat: room me hote hi kaam karta hai (Lobby ya Game dono me), bots ke saath kabhi nahi.
  const voice = useVoiceChat({
    myId: playerId,
    players: room?.players ?? null,
    send: (toPlayerId, signal) => send({ event: 'VOICE_SIGNAL', data: { toPlayerId, signal } }),
    sendMute: (muted) => send({ event: 'VOICE_MUTE', data: { muted } }),
    onRawMessage,
  });

  let screen;
  if (connection === 'connecting' || (reconnecting && !room && !dg.state.room)) {
    screen = (
      <p className="animate-pulse text-center text-stone-300">
        {reconnecting ? t('app.reconnecting') : t('app.connecting')}
      </p>
    );
  } else if (connection === 'closed') {
    screen = (
      <Card className="space-y-3 text-center">
        <p>{t('app.closed')}</p>
        <Button onClick={reconnect}>{t('app.reconnect')}</Button>
      </Card>
    );
  } else if (dg.state.room) {
    // Reload/reconnect ke baad bhi server hi batata hai ye Draw & Guess room me hai — "mode"
    // state pe depend nahi karta (wo sirf pehli baar choose karne ke liye hai).
    screen = (
      <DrawGuessApp
        state={dg.state}
        playerId={playerId}
        defaultName={auth.profile?.displayName}
        send={dg.send}
        dismissError={dg.dismissError}
        onBackToModeSelect={() => setMode('menu')}
      />
    );
  } else if (room && game) {
    screen = (
      <GameScreen
        room={room}
        game={game}
        myId={playerId}
        reward={reward}
        onGuess={(guessedChorId) => send({ event: 'SUBMIT_GUESS', data: { guessedChorId } })}
        onNextRound={() => send({ event: 'NEXT_ROUND' })}
        onRematch={() => send({ event: 'REMATCH' })}
        onLeave={leave}
        onReact={react}
        onVote={(choice) => send({ event: 'VOTE', data: { choice } })}
      />
    );
  } else if (room) {
    screen = (
      <Lobby
        room={room}
        myId={playerId}
        onStart={() => send({ event: 'START_GAME' })}
        onLeave={leave}
        onReact={react}
        onAddBot={() => send({ event: 'ADD_BOT' })}
        onRemoveBot={(botId) => send({ event: 'REMOVE_BOT', data: { botId } })}
        friends={authToken ? friends.overview.friends : undefined}
        onInvite={(accountId) => send({ event: 'INVITE_FRIEND', data: { accountId } })}
      />
    );
  } else if (queue) {
    screen = (
      <QueueScreen
        size={queue.size}
        names={queue.names}
        onCancel={() => send({ event: 'CANCEL_QUICK_MATCH' })}
      />
    );
  } else if (mode === 'draw_guess') {
    screen = (
      <DrawGuessApp
        state={dg.state}
        playerId={playerId}
        defaultName={auth.profile?.displayName}
        send={dg.send}
        dismissError={dg.dismissError}
        onBackToModeSelect={() => setMode('menu')}
      />
    );
  } else if (mode === 'menu') {
    screen = (
      <ModeSelect onChooseRmcs={() => setMode('rmcs')} onChooseDrawGuess={() => setMode('draw_guess')} />
    );
  } else {
    screen = (
      <div className="space-y-4">
        <Button variant="ghost" className="w-full" onClick={() => setMode('menu')}>
          ← {t('app.backToModeSelect')}
        </Button>
        <InviteToasts
          invites={invites}
          onJoin={(invite) => {
            send({
              event: 'JOIN_ROOM',
              data: { code: invite.roomCode, name: auth.profile?.displayName ?? invite.fromName },
            });
            dismissInvite(invite.key);
          }}
          onDismiss={dismissInvite}
        />
        <AccountPanel
          profile={auth.profile}
          loggedIn={authToken !== null}
          error={auth.error}
          busy={auth.busy}
          onLogin={auth.login}
          onRegister={auth.register}
          onLogout={auth.logout}
        />
        {authToken && auth.profile && (
          <ShopPanel
            profile={auth.profile}
            error={auth.shopError}
            onBuy={(id) => void auth.buyCharacter(id)}
            onEquip={(id) => void auth.equipCharacter(id)}
          />
        )}
        {authToken && auth.profile && (
          <FriendsPanel
            overview={friends.overview}
            error={friends.error}
            onAdd={friends.addFriend}
            onAccept={(id) => void friends.accept(id)}
            onDecline={(id) => void friends.decline(id)}
            onUnfriend={(id) => void friends.unfriend(id)}
          />
        )}
        <Home
          defaultName={auth.profile?.displayName}
          onCreate={(name) => send({ event: 'CREATE_ROOM', data: { name } })}
          onJoin={(code, name) => send({ event: 'JOIN_ROOM', data: { code, name } })}
          onQuickMatch={(name) => send({ event: 'QUICK_MATCH', data: { name } })}
          onPlayWithBots={(name) => send({ event: 'PLAY_WITH_BOTS', data: { name } })}
        />
      </div>
    );
  }

  // Draw & Guess ke actual game (canvas) screen ko RMCS ke narrow mobile-card se zyada jagah
  // chahiye — sirf usi waqt container wide hota hai, baaki sab jagah waisa hi mobile-first rehta hai.
  const inDrawGuess = dg.state.room !== null || mode === 'draw_guess';
  const wide = inDrawGuess && dg.state.game !== null;

  return (
    <main className={`mx-auto min-h-screen w-full px-4 py-6 pb-24 ${wide ? 'max-w-4xl' : 'max-w-md'}`}>
      <LanguageSwitch muted={sounds.muted} onToggleMute={sounds.toggleMuted} />
      <h1 className="mb-6 mt-2 text-center text-3xl font-black text-amber-300">
        {inDrawGuess ? `🎨 ${t('dg.appTitle')}` : `👑 ${t('app.title')}`}
      </h1>
      {reconnecting && room && (
        <div role="status" className="mb-4 rounded-xl bg-amber-500/80 px-4 py-3 text-sm text-stone-900">
          {t('app.reconnectBanner')}
        </div>
      )}
      <ErrorBanner
        message={error ? t(`err.${error}`, { max: error === 'INVALID_NAME' ? MAX_NAME_LENGTH : MAX_ROOM_PLAYERS }) : null}
        closeLabel={t('app.close')}
        onClose={dismissError}
      />
      {room && (
        <div className="mb-4">
          <VoiceBar
            players={room.players}
            myId={playerId}
            micStatus={voice.micStatus}
            muted={voice.muted}
            peerStates={voice.peerStates}
            remoteMuted={voice.remoteMuted}
            onJoin={() => void voice.join()}
            onToggleMute={voice.toggleMute}
          />
        </div>
      )}
      {screen}
      {room && <ReactionFeed items={reactions} nameOf={nameOf} onExpire={expireReaction} />}
    </main>
  );
}
