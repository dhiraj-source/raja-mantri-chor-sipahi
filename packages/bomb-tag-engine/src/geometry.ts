export interface Vec2 {
  x: number;
  y: number;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Vector ki length 0..1 tak clamp karta hai (diagonal movement seedhi se tez na ho). */
export function clampMagnitude(v: Vec2, max: number): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= max || len === 0) return v;
  const scale = max / len;
  return { x: v.x * scale, y: v.y * scale };
}

/** Point ko arena ke andar rakhta hai (player radius jitni jagah deewaron se chhodta hai). */
export function clampToArena(
  p: Vec2,
  radius: number,
  arenaWidth: number,
  arenaHeight: number,
): Vec2 {
  return {
    x: Math.min(arenaWidth - radius, Math.max(radius, p.x)),
    y: Math.min(arenaHeight - radius, Math.max(radius, p.y)),
  };
}

/**
 * `count` spawn points arena ke andar circle me arrange karta hai — barabar door-door, taaki
 * koi do players seedhe ek-doosre ke upar spawn na ho.
 */
export function generateSpawnPoints(
  count: number,
  arenaWidth: number,
  arenaHeight: number,
  radius: number,
): Vec2[] {
  const cx = arenaWidth / 2;
  const cy = arenaHeight / 2;
  const ringRadius = Math.min(arenaWidth, arenaHeight) / 2 - radius * 2.5;
  const points: Vec2[] = [];
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2; // pehla point upar se shuru
    points.push({
      x: cx + ringRadius * Math.cos(angle),
      y: cy + ringRadius * Math.sin(angle),
    });
  }
  return points;
}
