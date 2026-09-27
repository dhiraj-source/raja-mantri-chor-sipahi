import { useCallback, useEffect, useRef, useState } from 'react';
import type { BombTagServerMessage, DrawGuessServerMessage, PlayerId, RoomPlayerView, ServerMessage } from '@rmc/shared-types';
import {
  VoiceRoom,
  defaultPeerConnectionFactory,
  type PeerConnectionState,
  type VoiceSignal,
} from './webrtc';

export type MicStatus = 'off' | 'requesting' | 'on' | 'denied' | 'unsupported';

interface Params {
  myId: PlayerId | null;
  /** Room ke abhi ke players (voice sirf inhi human, connected players se judti hai). */
  players: readonly RoomPlayerView[] | null;
  send: (toPlayerId: PlayerId, signal: VoiceSignal) => void;
  sendMute: (muted: boolean) => void;
  /**
   * VOICE_SIGNAL/VOICE_MUTE server messages yahan se milte hain (clientState se alag rakha hai).
   * Ek hi socket Draw & Guess aur Bomb Tag ke messages (DG_/BT_ prefix) bhi isi se guzarta hai —
   * voice chat unhe chhoo nahi paata (sirf VOICE_* check karta hai), isliye type yahan poora union accept karta hai.
   */
  onRawMessage: (listener: (message: ServerMessage | DrawGuessServerMessage | BombTagServerMessage) => void) => () => void;
}

/**
 * Live voice chat (WebRTC mesh, sirf public STUN). Audio kabhi server se nahi guzarta,
 * sirf signaling WebSocket se. Bots ke saath connection kabhi nahi banti (unke paas socket hi nahi).
 */
export function useVoiceChat({ myId, players, send, sendMute, onRawMessage }: Params) {
  const [micStatus, setMicStatus] = useState<MicStatus>('off');
  const [muted, setMuted] = useState(true);
  const [peerStates, setPeerStates] = useState<Record<PlayerId, PeerConnectionState>>({});
  const [remoteMuted, setRemoteMuted] = useState<Record<PlayerId, boolean>>({});

  const roomRef = useRef<VoiceRoom | null>(null);
  const audioElsRef = useRef(new Map<PlayerId, HTMLAudioElement>());

  const ensureRoom = useCallback((): VoiceRoom | null => {
    if (!myId) return null;
    if (!roomRef.current) {
      roomRef.current = new VoiceRoom(myId, {
        factory: defaultPeerConnectionFactory,
        send,
        onRemoteStream: (playerId, stream) => {
          let el = audioElsRef.current.get(playerId);
          if (!el) {
            el = new Audio();
            el.autoplay = true;
            audioElsRef.current.set(playerId, el);
          }
          el.srcObject = stream;
          void el.play().catch(() => undefined); // autoplay block ho to bhi crash na ho
        },
        onRemoteStreamRemoved: (playerId) => {
          const el = audioElsRef.current.get(playerId);
          if (el) {
            el.srcObject = null;
            audioElsRef.current.delete(playerId);
          }
          setPeerStates((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== playerId)));
        },
        onStateChange: (playerId, state) => setPeerStates((s) => ({ ...s, [playerId]: state })),
        onError: (playerId, e) => console.error('voice peer error', playerId, e),
      });
    }
    return roomRef.current;
  }, [myId, send]);

  /** Mic maango aur voice shuru karo (default muted). */
  const join = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus('unsupported');
      return;
    }
    setMicStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getAudioTracks().forEach((t) => (t.enabled = false)); // safe default: muted
      const room = ensureRoom();
      room?.setLocalStream(stream);
      setMuted(true);
      setMicStatus('on');
    } catch {
      setMicStatus('denied');
    }
  }, [ensureRoom]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      roomRef.current?.setMuted(next);
      sendMute(next);
      return next;
    });
  }, [sendMute]);

  const leave = useCallback(() => {
    roomRef.current?.closeAll();
    roomRef.current = null;
    audioElsRef.current.forEach((el) => (el.srcObject = null));
    audioElsRef.current.clear();
    setPeerStates({});
    setRemoteMuted({});
    setMicStatus('off');
    setMuted(true);
  }, []);

  // Room ke human, connected players badlein: connections sync karo. Room hi chhod di
  // (players null ho gaya) to voice bhi band kar do — warna App unmount hi nahi hota
  // (sirf screen badalti hai), to purani connections khuli reh jaatin.
  useEffect(() => {
    if (micStatus !== 'on') return;
    if (!players) {
      leave();
      return;
    }
    const humanIds = players.filter((p) => !p.isBot && p.connected).map((p) => p.id);
    roomRef.current?.syncPeers(humanIds);
  }, [players, micStatus, leave]);

  // Voice signaling messages sunno.
  useEffect(() => {
    return onRawMessage((message) => {
      if (message.event === 'VOICE_SIGNAL') {
        void roomRef.current?.handleSignal(message.data.fromPlayerId, message.data.signal as VoiceSignal);
      } else if (message.event === 'VOICE_MUTE') {
        setRemoteMuted((s) => ({ ...s, [message.data.playerId]: message.data.muted }));
      }
    });
  }, [onRawMessage]);

  // Unmount / room chhodne par sab band.
  useEffect(() => () => leave(), [leave]);

  return { micStatus, muted, peerStates, remoteMuted, join, toggleMute, leave };
}
