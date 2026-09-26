import type { DrawGuessClientMessage, PlayerId } from '@rmc/shared-types';
import { ErrorBanner } from '../components/ui';
import type { DgClientState } from './dgClientState';
import { DgGameScreen } from './DgGameScreen';
import { DgHome } from './DgHome';
import { DgLobby } from './DgLobby';

interface Props {
  state: DgClientState;
  playerId: PlayerId | null;
  defaultName?: string;
  send: (message: DrawGuessClientMessage) => void;
  dismissError: () => void;
  onBackToModeSelect: () => void;
}

/**
 * Draw & Guess: RMCS se bilkul alag screen-tree. `state` App.tsx se aata hai (socket-level hook
 * wahan already mounted rehta hai — reload/reconnect par bhi turant sahi room dikh jaaye, "mode"
 * select ka intezaar na karna pade).
 */
export function DrawGuessApp({ state, playerId, defaultName, send, dismissError, onBackToModeSelect }: Props) {
  const { room, game, chat, strokes, error } = state;
  const isHost = room?.hostId === playerId;

  let screen;
  if (room && game) {
    screen = (
      <DgGameScreen
        game={game}
        myId={playerId}
        chat={chat}
        incomingStrokes={strokes}
        isHost={isHost}
        onSelectWord={(word) => send({ event: 'DG_SELECT_WORD', data: { word } })}
        onStroke={(stroke) => send({ event: 'DG_STROKE', data: stroke })}
        onChat={(text) => send({ event: 'DG_CHAT', data: { text } })}
        onLeave={() => send({ event: 'DG_LEAVE_ROOM' })}
        onEndGame={() => send({ event: 'DG_END_GAME' })}
        onReturnToLobby={() => send({ event: 'DG_RETURN_TO_LOBBY' })}
      />
    );
  } else if (room) {
    screen = (
      <DgLobby
        room={room}
        myId={playerId}
        onReady={(ready) => send({ event: 'DG_READY', data: { ready } })}
        onStart={() => send({ event: 'DG_START_GAME' })}
        onLeave={() => send({ event: 'DG_LEAVE_ROOM' })}
        onKick={(id) => send({ event: 'DG_KICK_PLAYER', data: { playerId: id } })}
        onUpdateSettings={(settings) => send({ event: 'DG_UPDATE_SETTINGS', data: { settings } })}
      />
    );
  } else {
    screen = (
      <DgHome
        defaultName={defaultName}
        onCreate={(name, settings) => send({ event: 'DG_CREATE_ROOM', data: { name, settings } })}
        onJoin={(code, name) => send({ event: 'DG_JOIN_ROOM', data: { code, name } })}
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
