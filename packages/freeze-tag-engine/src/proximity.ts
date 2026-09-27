import { distance, type Vec2 } from '@rmc/arena-kit';

export interface Positioned {
  id: string;
  pos: Vec2;
}

/**
 * `from` ke `radius` ke andar aane wale saare ids — sabse paas wala pehle, barabar door hon to id
 * ke order se. Hamesha deterministic: do clients/do runs kabhi alag nateeja na nikaalein.
 *
 * Bomb Tag ka `findTagTarget` sirf ek (sabse paas) target deta hai kyunki bomb ek hi jagah jaati
 * hai. Freeze Tag ko poori list chahiye — ek hi tick me IT do players ko chhoo sakta hai, aur ek
 * rescuer ke paas do frozen saathi ho sakte hain.
 */
export function withinRadius(from: Positioned, others: readonly Positioned[], radius: number): string[] {
  return others
    .filter((o) => o.id !== from.id && distance(from.pos, o.pos) <= radius)
    .map((o) => ({ id: o.id, d: distance(from.pos, o.pos) }))
    .sort((a, b) => (a.d === b.d ? (a.id < b.id ? -1 : 1) : a.d - b.d))
    .map((o) => o.id);
}
