import type { FreezeTagClientMessage, PlayerId } from '@rmc/shared-types';
import { ErrorBanner } from '../components/ui';
import type { FtClientState } from './ftClientState';
import { FtGameScreen } from './FtGameScreen';
import { FtHome } from './FtHome';
import { FtLobby } from './FtLobby';

interface Props {
  state: FtClientState;
  playerId: PlayerId | null;
  defaultName?: string;
  send: (message: FreezeTagClientMessage) => void;
  dismissError: () => void;
  onBackToModeSelect: () => void;
}

/**
 * Freeze Tag ka apna screen-tree. `state` App.tsx se aata hai (socket hook wahin mounted rehta
 * hai) — isse reload/reconnect par bhi turant sahi room dikh jaata hai.
 */
export function FreezeTagApp({
  state,
  playerId,
  defaultName,
  send,
  dismissError,
  onBackToModeSelect,
}: Props) {
  const { room, game, error } = state;
  const isHost = room?.hostId === playerId;

  let screen;
  if (room && game) {
    screen = (
      <FtGameScreen
        room={room}
        game={game}
        myId={playerId}
        isHost={isHost}
        onInput={(x, y) => send({ event: 'FT_INPUT', data: { x, y } })}
        onLeave={() => send({ event: 'FT_LEAVE_ROOM' })}
        onEndGame={() => send({ event: 'FT_END_GAME' })}
        onReturnToLobby={() => send({ event: 'FT_RETURN_TO_LOBBY' })}
      />
    );
  } else if (room) {
    screen = (
      <FtLobby
        room={room}
        myId={playerId}
        onReady={(ready) => send({ event: 'FT_READY', data: { ready } })}
        onStart={() => send({ event: 'FT_START_GAME' })}
        onLeave={() => send({ event: 'FT_LEAVE_ROOM' })}
        onKick={(id) => send({ event: 'FT_KICK_PLAYER', data: { playerId: id } })}
        onUpdateSettings={(settings) => send({ event: 'FT_UPDATE_SETTINGS', data: { settings } })}
      />
    );
  } else {
    screen = (
      <FtHome
        defaultName={defaultName}
        onCreate={(name, settings) => send({ event: 'FT_CREATE_ROOM', data: { name, settings } })}
        onJoin={(code, name) => send({ event: 'FT_JOIN_ROOM', data: { code, name } })}
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
