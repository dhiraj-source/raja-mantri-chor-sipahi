export type FriendshipStatus = 'PENDING' | 'ACCEPTED';

export interface Friendship {
  /** Dono accounts (sorted: a < b). */
  a: string;
  b: string;
  requestedBy: string;
  status: FriendshipStatus;
  createdAt: string;
}

/** (x, y) aur (y, x) ek hi pair hain. */
export function orderedPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** Friends ka storage interface (InMemory + PostgreSQL). */
export abstract class FriendRepository {
  abstract find(x: string, y: string): Promise<Friendship | null>;
  /** false = is pair ki row pehle se hai. */
  abstract create(x: string, y: string, requestedBy: string, createdAt: string): Promise<boolean>;
  /** PENDING -> ACCEPTED. false = pending row thi hi nahi. */
  abstract accept(x: string, y: string): Promise<boolean>;
  /** Row hatao (decline / cancel / unfriend). false = thi hi nahi. */
  abstract remove(x: string, y: string): Promise<boolean>;
  /** Is account ki saari rows (pending + accepted). */
  abstract listFor(accountId: string): Promise<Friendship[]>;
}

export class InMemoryFriendRepository extends FriendRepository {
  private readonly rows = new Map<string, Friendship>();
  private static key(x: string, y: string): string {
    return orderedPair(x, y).join('|');
  }

  async find(x: string, y: string): Promise<Friendship | null> {
    const row = this.rows.get(InMemoryFriendRepository.key(x, y));
    return row ? { ...row } : null;
  }

  async create(x: string, y: string, requestedBy: string, createdAt: string): Promise<boolean> {
    const key = InMemoryFriendRepository.key(x, y);
    if (this.rows.has(key)) return false;
    const [a, b] = orderedPair(x, y);
    this.rows.set(key, { a, b, requestedBy, status: 'PENDING', createdAt });
    return true;
  }

  async accept(x: string, y: string): Promise<boolean> {
    const row = this.rows.get(InMemoryFriendRepository.key(x, y));
    if (!row || row.status !== 'PENDING') return false;
    row.status = 'ACCEPTED';
    return true;
  }

  async remove(x: string, y: string): Promise<boolean> {
    return this.rows.delete(InMemoryFriendRepository.key(x, y));
  }

  async listFor(accountId: string): Promise<Friendship[]> {
    return [...this.rows.values()].filter((r) => r.a === accountId || r.b === accountId).map((r) => ({ ...r }));
  }
}
