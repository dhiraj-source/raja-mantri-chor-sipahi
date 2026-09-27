import { REACTIONS, type Reaction } from '@rmc/shared-types';

/** Ek chhoti awaaz: freq (Hz), kab shuru (sec), kitni der (sec). */
export interface Tone {
  freq: number;
  start: number;
  duration: number;
  type?: 'sine' | 'square' | 'triangle' | 'sawtooth';
  /** 0..1 (default 0.15: halka). */
  volume?: number;
}

export type SoundName = Reaction | 'CORRECT' | 'WRONG' | 'WIN' | 'INVITE' | 'BT_TAG' | 'BT_EXPLODE' | 'BT_ROUND_WIN';

/** Sab awaazen code me hi hain (koi audio file nahi). Har ek 1 second se chhoti. */
export const SOUNDS: Record<SoundName, readonly Tone[]> = {
  '😂': [
    { freq: 660, start: 0, duration: 0.08, type: 'square' },
    { freq: 550, start: 0.1, duration: 0.08, type: 'square' },
    { freq: 660, start: 0.2, duration: 0.08, type: 'square' },
    { freq: 550, start: 0.3, duration: 0.1, type: 'square' },
  ],
  '😡': [
    { freq: 180, start: 0, duration: 0.18, type: 'sawtooth' },
    { freq: 140, start: 0.16, duration: 0.25, type: 'sawtooth' },
  ],
  '👏': [
    { freq: 900, start: 0, duration: 0.04, type: 'square' },
    { freq: 900, start: 0.12, duration: 0.04, type: 'square' },
    { freq: 900, start: 0.24, duration: 0.04, type: 'square' },
    { freq: 900, start: 0.36, duration: 0.04, type: 'square' },
  ],
  '😱': [{ freq: 1200, start: 0, duration: 0.35, type: 'triangle' }, { freq: 400, start: 0.3, duration: 0.3, type: 'triangle' }],
  '🤔': [
    { freq: 330, start: 0, duration: 0.2, type: 'sine' },
    { freq: 392, start: 0.25, duration: 0.3, type: 'sine' },
  ],
  '❤️': [
    { freq: 523, start: 0, duration: 0.15, type: 'sine' },
    { freq: 659, start: 0.15, duration: 0.15, type: 'sine' },
    { freq: 784, start: 0.3, duration: 0.25, type: 'sine' },
  ],
  CORRECT: [
    { freq: 523, start: 0, duration: 0.12, type: 'triangle' },
    { freq: 784, start: 0.12, duration: 0.25, type: 'triangle' },
  ],
  WRONG: [
    { freq: 300, start: 0, duration: 0.15, type: 'sawtooth' },
    { freq: 200, start: 0.15, duration: 0.3, type: 'sawtooth' },
  ],
  WIN: [
    { freq: 523, start: 0, duration: 0.12, type: 'triangle' },
    { freq: 659, start: 0.12, duration: 0.12, type: 'triangle' },
    { freq: 784, start: 0.24, duration: 0.12, type: 'triangle' },
    { freq: 1047, start: 0.36, duration: 0.4, type: 'triangle' },
  ],
  INVITE: [
    { freq: 880, start: 0, duration: 0.1, type: 'sine' },
    { freq: 1175, start: 0.14, duration: 0.18, type: 'sine' },
  ],
  // ---- Bomb Tag (Phase 4, Milestone 5) ----
  BT_TAG: [
    { freq: 700, start: 0, duration: 0.04, type: 'square', volume: 0.12 },
    { freq: 950, start: 0.05, duration: 0.06, type: 'square', volume: 0.12 },
  ],
  BT_EXPLODE: [
    { freq: 160, start: 0, duration: 0.3, type: 'sawtooth', volume: 0.22 },
    { freq: 80, start: 0.04, duration: 0.35, type: 'sawtooth', volume: 0.18 },
  ],
  BT_ROUND_WIN: [
    { freq: 660, start: 0, duration: 0.1, type: 'triangle' },
    { freq: 880, start: 0.1, duration: 0.22, type: 'triangle' },
  ],
};

/**
 * PUBG/BGMI-jaisi chhoti announcer-style voice lines — koi audio file nahi, browser ka apna
 * text-to-speech "bolta" hai. Sirf bade round-result/win moments par (baar-baar tap hone
 * wali reaction emojis par nahi, warna bolna hi bolna ho jaata).
 */
export const VOICE_LINES: Partial<Record<SoundName, string>> = {
  CORRECT: 'Busted!',
  WRONG: 'Escaped!',
  WIN: 'Victory!',
};

/**
 * Real recorded animal sounds (CC0/public-domain, from OpenGameArt.org — commercial use OK,
 * no attribution needed) — TTS ko bhaunk/mya u nahi karwa sakte, isliye asli files.
 * Cat "catches" the Chor (CORRECT), dog barks as the Chor gets away (WRONG).
 */
export const ANIMAL_SOUNDS: Partial<Record<SoundName, string>> = {
  CORRECT: '/audio/cat-meow.wav',
  WRONG: '/audio/dog-bark.wav',
};

// ---- Minimal audio interfaces: asli AudioContext inse match karta hai, tests me fake chalta hai ----
export interface ParamLike {
  setValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}
export interface OscillatorLike {
  type: string;
  frequency: { value: number };
  connect(node: unknown): unknown;
  start(time: number): void;
  stop(time: number): void;
}
export interface GainLike {
  gain: ParamLike;
  connect(node: unknown): unknown;
}
export interface AudioContextLike {
  currentTime: number;
  destination: unknown;
  state: string;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

const DEFAULT_VOLUME = 0.15;

/**
 * Awaaz bajata hai. Muted ho ya audio available na ho to chup-chaap kuch nahi karta (game na ruke).
 * Context pehli awaaz par banta hai (browser ko user click ke baad hi audio chalane deta hai).
 */
export class SoundPlayer {
  private ctx: AudioContextLike | null = null;

  constructor(
    private readonly createContext: () => AudioContextLike | null,
    private readonly isMuted: () => boolean,
  ) {}

  /** Kitni tones schedule hui (0 = muted / audio nahi). */
  play(name: SoundName): number {
    if (this.isMuted()) return 0;
    const tones = SOUNDS[name];
    if (!tones) return 0;
    try {
      this.ctx ??= this.createContext();
      const ctx = this.ctx;
      if (!ctx) return 0;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      const base = ctx.currentTime;
      for (const tone of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.type ?? 'sine';
        osc.frequency.value = tone.freq;
        const start = base + tone.start;
        const end = start + tone.duration;
        // Halka fade-out taaki "click" ki awaaz na aaye.
        gain.gain.setValueAtTime(tone.volume ?? DEFAULT_VOLUME, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(end + 0.02);
      }
      return tones.length;
    } catch {
      return 0;
    }
  }

  /** Browser ko user click par audio "unlock" karne do. */
  unlock(): void {
    try {
      this.ctx ??= this.createContext();
      if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      // audio nahi hai: theek hai
    }
  }
}

// ---- Voice lines: text-to-speech, asli SpeechSynthesis inse match karta hai, tests me fake ----
export interface SpeechUtteranceLike {
  text: string;
  rate: number;
  pitch: number;
  volume: number;
}
export interface SpeechSynthesisLike {
  speak(utterance: SpeechUtteranceLike): void;
}

/** Voice-line bolta hai (agar us naam ke liye koi line ho). Muted ho ya TTS available na ho to chup. */
export class VoiceLinePlayer {
  constructor(
    private readonly getSynth: () => SpeechSynthesisLike | null,
    private readonly createUtterance: (text: string) => SpeechUtteranceLike,
    private readonly isMuted: () => boolean,
  ) {}

  /** Bola gaya to true. */
  speak(name: SoundName): boolean {
    if (this.isMuted()) return false;
    const line = VOICE_LINES[name];
    if (!line) return false;
    try {
      const synth = this.getSynth();
      if (!synth) return false;
      const utterance = this.createUtterance(line);
      utterance.rate = 1.1; // thoda tez, announcer jaisa punchy
      utterance.pitch = 0.8; // thoda bhaari
      utterance.volume = 0.9;
      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }
}

// ---- Animal sounds: real audio files, asli HTMLAudioElement inse match karta hai, tests me fake ----
export interface AudioElementLike {
  volume: number;
  play(): Promise<void> | void;
}

/** Awaaz file bajata hai (real recorded clip). Muted ho ya audio na chale to chup-chaap. */
export class AnimalSoundPlayer {
  private readonly cache = new Map<string, AudioElementLike>();

  constructor(
    private readonly createAudio: (src: string) => AudioElementLike | null,
    private readonly isMuted: () => boolean,
  ) {}

  /** Bajaya gaya to true. */
  play(name: SoundName): boolean {
    if (this.isMuted()) return false;
    const src = ANIMAL_SOUNDS[name];
    if (!src) return false;
    try {
      let audio = this.cache.get(src);
      if (!audio) {
        const created = this.createAudio(src);
        if (!created) return false;
        audio = created;
        audio.volume = 0.5;
        this.cache.set(src, audio);
      }
      void Promise.resolve(audio.play()).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }
}

/** Kisi bhi reaction emoji ki awaaz (list se bahar ka emoji ho to null). */
export function soundForReaction(emoji: string): SoundName | null {
  return (REACTIONS as readonly string[]).includes(emoji) ? (emoji as Reaction) : null;
}

const MUTE_KEY = 'rmc:muted';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadMuted(storage: StorageLike | null): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(storage: StorageLike | null, muted: boolean): void {
  try {
    storage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage band: is session me hi yaad rahega
  }
}
