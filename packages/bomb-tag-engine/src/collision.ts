import { distance, type Vec2 } from './geometry';

export interface Circle {
  id: string;
  pos: Vec2;
}

/**
 * Bomb-holder ke sabse paas (touch-range ke andar) koi alive player dhoondta hai — tag ka target.
 * Ek se zyada ek saath touch kar rahe hon (spec ka explicit edge case) to sabse paas wala jeetta
 * hai; barabar door ho to id ke alphabetical order se — hamesha deterministic, kabhi bhi do
 * clients alag nateeja na nikalein.
 */
export function findTagTarget(holder: Circle, others: readonly Circle[], touchDistance: number): string | null {
  let best: Circle | null = null;
  let bestDist = Infinity;
  for (const other of others) {
    if (other.id === holder.id) continue;
    const d = distance(holder.pos, other.pos);
    if (d > touchDistance) continue;
    if (d < bestDist || (d === bestDist && best !== null && other.id < best.id)) {
      best = other;
      bestDist = d;
    }
  }
  return best?.id ?? null;
}
