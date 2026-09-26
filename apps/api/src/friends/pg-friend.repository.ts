import type { Pool } from 'pg';
import { FriendRepository, orderedPair, type Friendship, type FriendshipStatus } from './friend.repository';

interface Row {
  account_low: string;
  account_high: string;
  requested_by: string;
  status: FriendshipStatus;
  created_at: Date;
}

const toFriendship = (r: Row): Friendship => ({
  a: r.account_low,
  b: r.account_high,
  requestedBy: r.requested_by,
  status: r.status,
  createdAt: r.created_at.toISOString(),
});

const UUID = /^[0-9a-f-]{36}$/i;

/** PostgreSQL implementation (parameterized queries). Galat format ke id par kuch nahi milta (error nahi). */
export class PgFriendRepository extends FriendRepository {
  constructor(private readonly pool: Pool) {
    super();
  }

  async find(x: string, y: string): Promise<Friendship | null> {
    if (!UUID.test(x) || !UUID.test(y)) return null;
    const [a, b] = orderedPair(x, y);
    const res = await this.pool.query<Row>(
      'SELECT * FROM friendships WHERE account_low = $1 AND account_high = $2',
      [a, b],
    );
    return res.rows[0] ? toFriendship(res.rows[0]) : null;
  }

  async create(x: string, y: string, requestedBy: string, createdAt: string): Promise<boolean> {
    const [a, b] = orderedPair(x, y);
    const res = await this.pool.query(
      `INSERT INTO friendships (account_low, account_high, requested_by, status, created_at)
       VALUES ($1, $2, $3, 'PENDING', $4)
       ON CONFLICT DO NOTHING`,
      [a, b, requestedBy, createdAt],
    );
    return res.rowCount === 1;
  }

  async accept(x: string, y: string): Promise<boolean> {
    const [a, b] = orderedPair(x, y);
    const res = await this.pool.query(
      `UPDATE friendships SET status = 'ACCEPTED'
        WHERE account_low = $1 AND account_high = $2 AND status = 'PENDING'`,
      [a, b],
    );
    return res.rowCount === 1;
  }

  async remove(x: string, y: string): Promise<boolean> {
    const [a, b] = orderedPair(x, y);
    const res = await this.pool.query('DELETE FROM friendships WHERE account_low = $1 AND account_high = $2', [a, b]);
    return res.rowCount === 1;
  }

  async listFor(accountId: string): Promise<Friendship[]> {
    if (!UUID.test(accountId)) return [];
    const res = await this.pool.query<Row>(
      'SELECT * FROM friendships WHERE account_low = $1 OR account_high = $1',
      [accountId],
    );
    return res.rows.map(toFriendship);
  }
}
