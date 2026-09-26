import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SoundPlayer,
  VoiceLinePlayer,
  loadMuted,
  saveMuted,
  type AudioContextLike,
  type SoundName,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
  type StorageLike,
} from './sounds';

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function createBrowserContext(): AudioContextLike | null {
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : ((window as unknown as { AudioContext?: new () => AudioContextLike }).AudioContext ??
        (window as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext);
  return Ctor ? new Ctor() : null;
}

function browserSynth(): SpeechSynthesisLike | null {
  return typeof window === 'undefined' || !window.speechSynthesis ? null : window.speechSynthesis;
}

function createBrowserUtterance(text: string): SpeechUtteranceLike {
  return new SpeechSynthesisUtterance(text);
}

/** Sounds + mute button ki state. Mute choice localStorage me yaad rehti hai. */
export function useSounds() {
  const [muted, setMuted] = useState(() => loadMuted(browserStorage()));
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const player = useMemo(() => new SoundPlayer(createBrowserContext, () => mutedRef.current), []);
  const voice = useMemo(
    () => new VoiceLinePlayer(browserSynth, createBrowserUtterance, () => mutedRef.current),
    [],
  );

  // Browser pehle click ke baad hi audio chalne deta hai.
  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [player]);

  const play = useCallback(
    (name: SoundName) => {
      player.play(name);
      voice.speak(name);
    },
    [player, voice],
  );

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      saveMuted(browserStorage(), !current);
      return !current;
    });
  }, []);

  return { muted, toggleMuted, play };
}
