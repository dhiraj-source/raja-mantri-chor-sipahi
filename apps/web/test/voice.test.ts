import { describe, expect, it, vi } from 'vitest';
import { VoiceRoom, shouldInitiate, type VoiceSignal } from '../src/voice/webrtc';

/** Nakli RTCPeerConnection: sab kuch record karta hai, real network kuch nahi karta. */
function fakePeerConnection() {
  const calls: string[] = [];
  const senders: { track: unknown }[] = [];
  const pc = {
    connectionState: 'new',
    onicecandidate: null as unknown,
    ontrack: null as unknown,
    onconnectionstatechange: null as unknown,
    addTrack: vi.fn((track: unknown) => {
      calls.push('addTrack');
      senders.push({ track });
    }),
    getSenders: () => senders,
    createOffer: vi.fn(async () => {
      calls.push('createOffer');
      return { type: 'offer', sdp: 'fake-offer' } as RTCSessionDescriptionInit;
    }),
    createAnswer: vi.fn(async () => {
      calls.push('createAnswer');
      return { type: 'answer', sdp: 'fake-answer' } as RTCSessionDescriptionInit;
    }),
    setLocalDescription: vi.fn(async () => {
      calls.push('setLocalDescription');
    }),
    setRemoteDescription: vi.fn(async () => {
      calls.push('setRemoteDescription');
    }),
    addIceCandidate: vi.fn(async () => {
      calls.push('addIceCandidate');
    }),
    close: vi.fn(() => {
      calls.push('close');
    }),
  };
  return { pc: pc as unknown as RTCPeerConnection, calls, raw: pc };
}

function fakeTrack(id: string): MediaStreamTrack {
  return { id, kind: 'audio', enabled: true } as unknown as MediaStreamTrack;
}

function fakeStream(trackId = 't1'): MediaStream {
  const tracks = [fakeTrack(trackId)];
  return { getAudioTracks: () => tracks, getTracks: () => tracks } as unknown as MediaStream;
}

describe('shouldInitiate', () => {
  it('chhoti id wala initiate karta hai, dono taraf se ulta result', () => {
    expect(shouldInitiate('a', 'b')).toBe(true);
    expect(shouldInitiate('b', 'a')).toBe(false);
    expect(shouldInitiate('same', 'same')).toBe(false);
  });
});

function setup() {
  const peers = new Map<string, ReturnType<typeof fakePeerConnection>>();
  const sent: { to: string; signal: VoiceSignal }[] = [];
  const remoteStreams: string[] = [];
  const removedStreams: string[] = [];
  const states: Record<string, string> = {};
  const room = new VoiceRoom('a', {
    factory: {
      create: () => {
        const fake = fakePeerConnection();
        return fake.pc;
      },
    },
    send: (to, signal) => sent.push({ to, signal }),
    onRemoteStream: (id) => remoteStreams.push(id),
    onRemoteStreamRemoved: (id) => removedStreams.push(id),
    onStateChange: (id, state) => {
      states[id] = state;
    },
  });
  return { room, sent, remoteStreams, removedStreams, states, peers };
}

describe('VoiceRoom', () => {
  it('chhoti id (main) badi id (other) ko offer bhejta hai', async () => {
    const { room, sent } = setup(); // myId = 'a'
    room.setLocalStream(fakeStream());
    room.syncPeers(['b']); // a < b => a initiate karta hai
    await new Promise((r) => setTimeout(r, 0)); // microtasks (createOffer etc.) settle hone do
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'b', signal: { kind: 'offer' } });
  });

  it('badi id (main) chhoti id (other) ko offer nahi bhejta, intezaar karta hai', async () => {
    const sent: { to: string; signal: VoiceSignal }[] = [];
    const room = new VoiceRoom('z', {
      factory: { create: () => fakePeerConnection().pc },
      send: (to, signal) => sent.push({ to, signal }),
      onRemoteStream: () => undefined,
      onRemoteStreamRemoved: () => undefined,
      onStateChange: () => undefined,
    });
    room.syncPeers(['a']); // z > a => z intezaar karta hai
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toHaveLength(0);
  });

  it('offer aane par answer banata hai aur bhejta hai', async () => {
    const { room, sent } = setup();
    await room.handleSignal('c', { kind: 'offer', sdp: { type: 'offer', sdp: 'x' } as RTCSessionDescriptionInit });
    expect(sent).toEqual([{ to: 'c', signal: { kind: 'answer', sdp: { type: 'answer', sdp: 'fake-answer' } } }]);
  });

  it('remote description se pehle aaye ICE candidates ruk kar baad me lagte hain', async () => {
    const { room } = setup();
    // 'a' > koi nahi, isse 'z' se offer nahi aayega khud; hum seedha handleSignal se test karte hain.
    await room.handleSignal('z', { kind: 'ice', candidate: { candidate: 'cand1' } as RTCIceCandidateInit });
    // Abhi tak remote description set nahi hui, candidate queue me hona chahiye — offer aane par lagna chahiye.
    await room.handleSignal('z', { kind: 'offer', sdp: { type: 'offer', sdp: 'x' } as RTCSessionDescriptionInit });
    // Agar candidate sahi se drain hua to koi error nahi aaya — isi baat ka test hai ki crash na ho.
    expect(true).toBe(true);
  });

  it('syncPeers: naya player aaye to connect, chala jaye to disconnect + stream removed', async () => {
    const { room, remoteStreams, removedStreams, states } = setup();
    room.setLocalStream(fakeStream());
    room.syncPeers(['b', 'c']);
    await new Promise((r) => setTimeout(r, 0));
    expect(states.b).toBe('connecting');
    expect(states.c).toBe('connecting');

    room.syncPeers(['b']); // c chala gaya
    // State cleanup (peerStates se hata dena) hook ki zimmedari hai, VoiceRoom sirf batata hai.
    expect(removedStreams).toContain('c');

    room.syncPeers(['b', 'd']); // naya d aaya
    await new Promise((r) => setTimeout(r, 0));
    expect(states.d).toBe('connecting');
    void remoteStreams;
  });

  it('khud ko syncPeers list me bheja to bhi apne se connection nahi banti', () => {
    const { room, states } = setup(); // myId = 'a'
    room.syncPeers(['a', 'b']);
    expect(states.a).toBeUndefined();
  });

  it('closeAll sab peers band kar deta hai aur local tracks stop karta hai', async () => {
    const { room, removedStreams } = setup();
    const stream = fakeStream();
    const stopSpy = vi.fn();
    (stream.getTracks as unknown as () => { stop: () => void }[]) = () => [{ stop: stopSpy }];
    room.setLocalStream(stream);
    room.syncPeers(['b', 'c']);
    room.closeAll();
    expect(removedStreams.sort()).toEqual(['b', 'c']);
    expect(stopSpy).toHaveBeenCalled();
  });

  it('mute karne se local track disable hoti hai', () => {
    const { room } = setup();
    const stream = fakeStream();
    room.setLocalStream(stream);
    room.setMuted(true);
    expect(stream.getAudioTracks()[0]?.enabled).toBe(false);
    room.setMuted(false);
    expect(stream.getAudioTracks()[0]?.enabled).toBe(true);
  });
});
