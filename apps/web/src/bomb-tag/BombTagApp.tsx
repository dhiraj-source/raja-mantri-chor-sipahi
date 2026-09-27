import type { BombTagClientMessage, PlayerId } from '@rmc/shared-types';
import { ErrorBanner } from '../components/ui';
import type { BtClientState } from './btClientState';
import { BtGameScreen } from './BtGameScreen';
import { BtHome } from './BtHome';
import { BtLobby } from './BtLobby';

interface Props {
  state: BtClientState;
  playerId: PlayerId | null;
  defaultName?: string;
  send: (message: BombTagClientMessage) => void;
  dismissError: () => void;
  onBackToModeSelect: () => void;
}

/**
 * Bomb Tag: RMCS/Draw & Guess se bilkul alag screen-tree. `state` App.tsx se aata hai (socket-level
 * hook wahan already mounted rehta hai — reload/reconnect par bhi turant sahi room dikh jaaye).
 */
export function BombTagApp({ state, playerId, defaultName, send, dismissError, onBackToModeSelect }: Props) {
  const { room, game, error } = state;
  const isHost = room?.hostId === playerId;

  let screen;
  if (room && game) {
    screen = (
      <BtGameScreen
        room={room}
        game={game}
        myId={playerId}
        isHost={isHost}
        recentEvents={state.recentEvents}
        onInput={(x, y) => send({ event: 'BT_INPUT', data: { x, y } })}
        onLeave={() => send({ event: 'BT_LEAVE_ROOM' })}
        onEndGame={() => send({ event: 'BT_END_GAME' })}
        onReturnToLobby={() => send({ event: 'BT_RETURN_TO_LOBBY' })}
      />
    );
  } else if (room) {
    screen = (
      <BtLobby
        room={room}
        myId={playerId}
        onReady={(ready) => send({ event: 'BT_READY', data: { ready } })}
        onStart={() => send({ event: 'BT_START_GAME' })}
        onLeave={() => send({ event: 'BT_LEAVE_ROOM' })}
        onKick={(id) => send({ event: 'BT_KICK_PLAYER', data: { playerId: id } })}
        onUpdateSettings={(settings) => send({ event: 'BT_UPDATE_SETTINGS', data: { settings } })}
      />
    );
  } else {
    screen = (
      <BtHome
        defaultName={defaultName}
        onCreate={(name, settings) => send({ event: 'BT_CREATE_ROOM', data: { name, settings } })}
        onJoin={(code, name) => send({ event: 'BT_JOIN_ROOM', data: { code, name } })}
        onBack={onBackToModeSelect}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error ? `Error: ${error}` : null} closeLabel="Close" onClose={dismissError} />
      {screen}
    </div>
  );
}
