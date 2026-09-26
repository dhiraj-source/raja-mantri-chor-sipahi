import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SoundPlayer,
  loadMuted,
  saveMuted,
  type AudioContextLike,
  type SoundName,
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

/** Sounds + mute button ki state. Mute choice localStorage me yaad rehti hai. */
export function useSounds() {
  const [muted, setMuted] = useState(() => loadMuted(browserStorage()));
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const player = useMemo(() => new SoundPlayer(createBrowserContext, () => mutedRef.current), []);

  // Browser pehle click ke baad hi audio chalne deta hai.
  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [player]);

  const play = useCallback((name: SoundName) => void player.play(name), [player]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      saveMuted(browserStorage(), !current);
      return !current;
    });
  }, []);

  return { muted, toggleMuted, play };
}
