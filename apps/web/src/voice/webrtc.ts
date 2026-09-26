import type { PlayerId } from '@rmc/shared-types';

/**
 * Dono taraf se ek hi waqt offer na bane (glare), isliye ek seedha rule: chhoti id wala
 * offer banata hai, badi id wala uska intezaar karta hai. Dono taraf yahi function chalta hai.
 */
export function shouldInitiate(myId: PlayerId, otherId: PlayerId): boolean {
  return myId < otherId;
}

/** Signal jo do peers ke beech WebSocket se guzarta hai (server isse samajhta nahi, bas relay karta hai). */
export type VoiceSignal =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export type PeerConnectionState = 'connecting' | 'connected' | 'failed' | 'closed';

/** Ek RTCPeerConnection banane ke liye chahiye cheezein — real browser API isi shape ko poora karta hai. */
export interface PeerConnectionFactory {
  create(): RTCPeerConnection;
}

export interface VoiceRoomDeps {
  factory: PeerConnectionFactory;
  /** Signal doosre player tak WebSocket se bhejo. */
  send: (toPlayerId: PlayerId, signal: VoiceSignal) => void;
  /** Naya remote audio stream mila: chalao. */
  onRemoteStream: (playerId: PlayerId, stream: MediaStream) => void;
  /** Peer hata diya gaya: uska audio bhi hata do. */
  onRemoteStreamRemoved: (playerId: PlayerId) => void;
  onStateChange: (playerId: PlayerId, state: PeerConnectionState) => void;
  onError?: (playerId: PlayerId, error: unknown) => void;
}

interface Peer {
  pc: RTCPeerConnection;
  /** Remote description set hone se pehle aaye ICE candidates yahan rukte hain. */
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
}

/**
 * Ek room ke saare voice peer connections manage karta hai. Har naye human player ke liye
 * ek RTCPeerConnection, bots aur khud ke liye kabhi nahi. Audio kabhi server se nahi guzarta —
 * ye class sirf connections banati/todti hai; signaling `send`/`handleSignal` se hoti hai.
 */
export class VoiceRoom {
  private readonly peers = new Map<PlayerId, Peer>();
  private localStream: MediaStream | null = null;
  private muted = true;

  constructor(
    private readonly myId: PlayerId,
    private readonly deps: VoiceRoomDeps,
  ) {}

  /** Mic mila: ab se naye peers is stream ke saath bante hain. Purane peers me bhi track add hoti hai. */
  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    this.applyMute();
    for (const track of stream.getAudioTracks()) {
      for (const peer of this.peers.values()) {
        if (!peer.pc.getSenders().some((s) => s.track === track)) peer.pc.addTrack(track, stream);
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
  }

  private applyMute(): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !this.muted;
    });
  }

  /**
   * Room ke abhi ke human players (khud ko chhod kar) ke saath connections sahi rakho:
   * naye ke liye banao, jo ab room me nahi unhe hatao.
   */
  syncPeers(otherPlayerIds: readonly PlayerId[]): void {
    const wanted = new Set(otherPlayerIds.filter((id) => id !== this.myId));
    for (const id of wanted) {
      if (!this.peers.has(id)) this.connectTo(id);
    }
    for (const id of [...this.peers.keys()]) {
      if (!wanted.has(id)) this.disconnect(id);
    }
  }

  /** Doosre player se aaya signal (offer/answer/ice) handle karo. */
  async handleSignal(fromPlayerId: PlayerId, signal: VoiceSignal): Promise<void> {
    try {
      // initiate=false: hume unka offer/ice mil raha hai, isliye hum khud offer nahi bhejenge
      // (warna dono taraf offer bhejne lagte — "glare").
      const peer = this.peers.get(fromPlayerId) ?? this.connectTo(fromPlayerId, false);
      if (signal.kind === 'offer') {
        await peer.pc.setRemoteDescription(signal.sdp);
        peer.remoteDescriptionSet = true;
        await this.drainCandidates(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.deps.send(fromPlayerId, { kind: 'answer', sdp: answer });
      } else if (signal.kind === 'answer') {
        await peer.pc.setRemoteDescription(signal.sdp);
        peer.remoteDescriptionSet = true;
        await this.drainCandidates(peer);
      } else {
        if (peer.remoteDescriptionSet) await peer.pc.addIceCandidate(signal.candidate);
        else peer.pendingCandidates.push(signal.candidate);
      }
    } catch (e) {
      this.deps.onError?.(fromPlayerId, e);
    }
  }

  /** Sab connections band karo (room chhodte/voice band karte waqt). */
  closeAll(): void {
    for (const id of [...this.peers.keys()]) this.disconnect(id);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  /** initiate: hum offer bhejein ya unke offer ka intezaar karein. Default: id comparison se. */
  private connectTo(otherId: PlayerId, initiate = shouldInitiate(this.myId, otherId)): Peer {
    const pc = this.deps.factory.create();
    const peer: Peer = { pc, pendingCandidates: [], remoteDescriptionSet: false };
    this.peers.set(otherId, peer);
    this.deps.onStateChange(otherId, 'connecting');

    // Dono taraf apna audio track chahiye hi chahiye, initiator ho ya nahi.
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.deps.send(otherId, { kind: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (e.streams[0]) this.deps.onRemoteStream(otherId, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') this.deps.onStateChange(otherId, 'connected');
      else if (state === 'failed') this.deps.onStateChange(otherId, 'failed');
      else if (state === 'closed') this.deps.onStateChange(otherId, 'closed');
    };

    if (initiate) void this.makeOffer(otherId, peer);
    return peer;
  }

  private async makeOffer(otherId: PlayerId, peer: Peer): Promise<void> {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.deps.send(otherId, { kind: 'offer', sdp: offer });
    } catch (e) {
      this.deps.onError?.(otherId, e);
    }
  }

  private async drainCandidates(peer: Peer): Promise<void> {
    const queued = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of queued) await peer.pc.addIceCandidate(candidate);
  }

  private disconnect(otherId: PlayerId): void {
    const peer = this.peers.get(otherId);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.peers.delete(otherId);
    this.deps.onRemoteStreamRemoved(otherId);
  }
}

/** Real browser: Google ka free public STUN. Audio server se nahi guzarta, sirf connect karne me madad. */
export const defaultPeerConnectionFactory: PeerConnectionFactory = {
  create: () => new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }),
};
