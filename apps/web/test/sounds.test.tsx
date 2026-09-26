import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { REACTIONS } from '@rmc/shared-types';
import { LanguageSwitch } from '../src/components/LanguageSwitch';
import { I18nProvider } from '../src/i18n/I18nProvider';
import {
  SOUNDS,
  SoundPlayer,
  loadMuted,
  saveMuted,
  soundForReaction,
  type AudioContextLike,
  type SoundName,
  type StorageLike,
} from '../src/audio/sounds';

/** Nakli AudioContext: record karta hai ki kya-kya schedule hua. */
function fakeContext(state = 'running') {
  const log: { freq: number; type: string; start: number; stop: number; volume: number }[] = [];
  const ctx: AudioContextLike & { resumed: number } = {
    currentTime: 10,
    destination: 'speakers',
    state,
    resumed: 0,
    async resume() {
      this.resumed++;
    },
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: () => undefined,
        start(t: number) {
          entry.start = t;
        },
        stop(t: number) {
          entry.stop = t;
        },
      };
      const entry = { freq: 0, type: '', start: 0, stop: 0, volume: 0 };
      log.push(entry);
      return new Proxy(osc, {
        set(target, key, value) {
          (target as Record<string | symbol, unknown>)[key] = value;
          if (key === 'type') entry.type = String(value);
          return true;
        },
        get(target, key) {
          if (key === 'frequency') {
            return new Proxy(target.frequency, {
              set(t, k, v) {
                (t as Record<string | symbol, unknown>)[k] = v;
                if (k === 'value') entry.freq = Number(v);
                return true;
              },
            });
          }
          return (target as Record<string | symbol, unknown>)[key];
        },
      });
    },
    createGain() {
      const last = log[log.length - 1];
      return {
        gain: {
          setValueAtTime: (v: number) => {
            if (last) last.volume = v;
          },
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      };
    },
  };
  return { ctx, log };
}

describe('SOUNDS table', () => {
  const names = Object.keys(SOUNDS) as SoundName[];

  it('har reaction emoji ki apni awaaz hai', () => {
    for (const emoji of REACTIONS) expect(SOUNDS[emoji], emoji).toBeDefined();
  });

  it('har awaaz theek: frequency audible, 1 second se chhoti, volume halka', () => {
    for (const name of names) {
      const tones = SOUNDS[name];
      expect(tones.length, name).toBeGreaterThan(0);
      for (const t of tones) {
        expect(t.freq).toBeGreaterThanOrEqual(80);
        expect(t.freq).toBeLessThanOrEqual(4000);
        expect(t.start).toBeGreaterThanOrEqual(0);
        expect(t.duration).toBeGreaterThan(0);
        expect(t.volume ?? 0.15).toBeLessThanOrEqual(0.3);
      }
      const end = Math.max(...tones.map((t) => t.start + t.duration));
      expect(end, name).toBeLessThan(1);
    }
  });

  it('soundForReaction: allowed emoji par awaaz, baaki par null', () => {
    expect(soundForReaction('😂')).toBe('😂');
    expect(soundForReaction('DROP TABLE')).toBeNull();
  });
});

describe('SoundPlayer', () => {
  it('sabhi tones sahi time par schedule hoti hain', () => {
    const { ctx, log } = fakeContext();
    const player = new SoundPlayer(() => ctx, () => false);
    expect(player.play('CORRECT')).toBe(SOUNDS.CORRECT.length);
    expect(log).toHaveLength(SOUNDS.CORRECT.length);
    const first = log[0];
    expect(first?.freq).toBe(SOUNDS.CORRECT[0]?.freq);
    expect(first?.start).toBe(10); // currentTime + tone.start
    expect((first?.stop ?? 0) > (first?.start ?? 0)).toBe(true);
    expect(log[1]?.start).toBeCloseTo(10 + (SOUNDS.CORRECT[1]?.start ?? 0));
  });

  it('muted ho to kuch nahi bajta aur context bhi nahi banta', () => {
    let created = 0;
    const player = new SoundPlayer(() => (created++, fakeContext().ctx), () => true);
    expect(player.play('WIN')).toBe(0);
    expect(created).toBe(0);
  });

  it('mute badalte hi turant asar (function har baar padha jata hai)', () => {
    const { ctx } = fakeContext();
    let muted = true;
    const player = new SoundPlayer(() => ctx, () => muted);
    expect(player.play('WIN')).toBe(0);
    muted = false;
    expect(player.play('WIN')).toBe(SOUNDS.WIN.length);
  });

  it('context sirf ek baar banta hai', () => {
    let created = 0;
    const { ctx } = fakeContext();
    const player = new SoundPlayer(() => (created++, ctx), () => false);
    player.play('INVITE');
    player.play('INVITE');
    expect(created).toBe(1);
  });

  it('audio available nahi (null context) ya error par crash nahi', () => {
    expect(new SoundPlayer(() => null, () => false).play('WIN')).toBe(0);
    const throwing = new SoundPlayer(() => { throw new Error('no audio'); }, () => false);
    expect(throwing.play('WIN')).toBe(0);
    expect(() => throwing.unlock()).not.toThrow();
  });

  it('suspended context resume hota hai (play par aur unlock par)', () => {
    const { ctx } = fakeContext('suspended');
    const player = new SoundPlayer(() => ctx, () => false);
    player.unlock();
    player.play('WRONG');
    expect(ctx.resumed).toBe(2);
  });
});

describe('mute yaad rakhna', () => {
  const store = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => ({
    data: { ...initial },
    getItem(k) {
      return this.data[k] ?? null;
    },
    setItem(k, v) {
      this.data[k] = v;
    },
  });

  it('save/load', () => {
    const s = store();
    expect(loadMuted(s)).toBe(false);
    saveMuted(s, true);
    expect(loadMuted(s)).toBe(true);
    saveMuted(s, false);
    expect(loadMuted(s)).toBe(false);
  });

  it('storage nahi ya error do to crash nahi', () => {
    expect(loadMuted(null)).toBe(false);
    expect(() => saveMuted(null, true)).not.toThrow();
    const broken: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(loadMuted(broken)).toBe(false);
    expect(() => saveMuted(broken, true)).not.toThrow();
  });
});

describe('mute button', () => {
  const render = (muted: boolean) =>
    renderToStaticMarkup(
      <I18nProvider>
        <LanguageSwitch muted={muted} onToggleMute={() => undefined} />
      </I18nProvider>,
    );

  it('chalu: 🔊 aur "Mute sounds"; band: 🔇 aur "Unmute sounds"', () => {
    const on = render(false);
    expect(on).toContain('🔊');
    expect(on).toContain('Mute sounds');
    expect(on).toContain('aria-pressed="false"');
    const off = render(true);
    expect(off).toContain('🔇');
    expect(off).toContain('Unmute sounds');
    expect(off).toContain('aria-pressed="true"');
  });
});
