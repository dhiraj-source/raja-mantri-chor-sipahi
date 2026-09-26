import type { DrawGuessStrokePoint } from '@rmc/shared-types';

/**
 * Pointer events ko network-friendly banata hai: har mousemove/pointermove par ek message
 * bhejne ke bajaye, points ek batch me collect hote hain aur ek chhoti interval (throttle) ke
 * baad ek hi message me flush hote hain. Isse "thousands of unnecessary network messages" nahi
 * bante (owner ke spec ka explicit requirement).
 */
export class StrokeBatcher {
  private pending: DrawGuessStrokePoint[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly flush: (points: DrawGuessStrokePoint[]) => void,
  ) {}

  /** Naya point aaya (pointermove). Turant nahi bhejta — batch me jud jaata hai. */
  add(point: DrawGuessStrokePoint): void {
    this.pending.push(point);
    if (this.timer) return;
    this.timer = setTimeout(() => this.flushNow(), this.intervalMs);
  }

  /** Turant bhej do jo bhi collect hua hai (jaise stroke khatam hone par, pointerup). */
  flushNow(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.length === 0) return;
    const points = this.pending;
    this.pending = [];
    this.flush(points);
  }

  /** Pending points bina bheje discard (component unmount waghera). */
  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
  }
}

/** Canvas pixel coordinate -> 0..1 normalized (resolution-independent, har device par sahi dikhta hai). */
export function normalizePoint(x: number, y: number, width: number, height: number): DrawGuessStrokePoint {
  return {
    x: width > 0 ? clamp01(x / width) : 0,
    y: height > 0 ? clamp01(y / height) : 0,
  };
}

/** Normalized point -> canvas pixel coordinate (draw karte waqt). */
export function denormalizePoint(
  point: DrawGuessStrokePoint,
  width: number,
  height: number,
): DrawGuessStrokePoint {
  return { x: point.x * width, y: point.y * height };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
