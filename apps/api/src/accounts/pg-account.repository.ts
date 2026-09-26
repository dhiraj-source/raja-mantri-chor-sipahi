import type { Pool } from 'pg';
import type { Achievement, GameHistoryEntry } from '@rmc/shared-types';
import { AccountRepository, type AccountRecord, type PurchaseResult } from './account.repository';

const UUID = /^[0-9a-f-]{36}$/i;

interface AccountRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: Date;
  xp: number;
  coins: number;
  games_played: number;
  wins: number;
  achievements: string[];
  equipped_character: string;
}

interface HistoryRow {
  id: string;
  played_at: Date;
  room_code: string;
  points: number;
  is_winner: boolean;
  xp_gained: number;
  coins_gained: number;
}

const toAccount = (row: AccountRow): AccountRecord => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  passwordHash: row.password_hash,
  createdAt: row.created_at.toISOString(),
  xp: row.xp,
  coins: row.coins,
  gamesPlayed: row.games_played,
  wins: row.wins,
  achievements: row.achievements as Achievement[],
  equippedCharacter: row.equipped_character,
});

const toHistory = (row: HistoryRow): GameHistoryEntry => ({
  id: row.id,
  playedAt: row.played_at.toISOString(),
  roomCode: row.room_code,
  points: row.points,
  isWinner: row.is_winner,
  xpGained: row.xp_gained,
  coinsGained: row.coins_gained,
});

/** PostgreSQL implementation. Saari queries parameterized hain ($1, $2 ...): SQL injection nahi. */
export class PgAccountRepository extends AccountRepository {
  constructor(private readonly pool: Pool) {
    super();
  }

  async create(a: AccountRecord): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO accounts
         (id, username, display_name, password_hash, created_at, xp, coins, games_played, wins, achievements, equipped_character)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (username) DO NOTHING`,
      [
        a.id, a.username, a.displayName, a.passwordHash, a.createdAt,
        a.xp, a.coins, a.gamesPlayed, a.wins, a.achievements, a.equippedCharacter,
      ],
    );
    return res.rowCount === 1;
  }

  async findByUsername(username: string): Promise<AccountRecord | null> {
    const res = await this.pool.query<AccountRow>('SELECT * FROM accounts WHERE username = $1', [username]);
    return res.rows[0] ? toAccount(res.rows[0]) : null;
  }

  async findById(id: string): Promise<AccountRecord | null> {
    // uuid column: galat format ka id error deta hai, isliye pehle check.
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const res = await this.pool.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [id]);
    return res.rows[0] ? toAccount(res.rows[0]) : null;
  }

  async saveGameResult(a: AccountRecord, entry: GameHistoryEntry): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE accounts
            SET display_name = $2, xp = $3, coins = $4, games_played = $5, wins = $6, achievements = $7
          WHERE id = $1`,
        [a.id, a.displayName, a.xp, a.coins, a.gamesPlayed, a.wins, a.achievements],
      );
      if (updated.rowCount === 1) {
        await client.query(
          `INSERT INTO game_history
             (id, account_id, played_at, room_code, points, is_winner, xp_gained, coins_gained)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [entry.id, a.id, entry.playedAt, entry.roomCode, entry.points, entry.isWinner, entry.xpGained, entry.coinsGained],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async listHistory(accountId: string, limit: number): Promise<GameHistoryEntry[]> {
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) return [];
    const res = await this.pool.query<HistoryRow>(
      'SELECT * FROM game_history WHERE account_id = $1 ORDER BY seq DESC LIMIT $2',
      [accountId, limit],
    );
    return res.rows.map(toHistory);
  }

  async listOwnedCharacters(accountId: string): Promise<string[]> {
    if (!UUID.test(accountId)) return [];
    const res = await this.pool.query<{ character_id: string }>(
      'SELECT character_id FROM account_characters WHERE account_id = $1 ORDER BY acquired_at, character_id',
      [accountId],
    );
    return res.rows.map((r) => r.character_id);
  }

  async purchaseCharacter(
    accountId: string,
    characterId: string,
    price: number,
    acquiredAt: string,
  ): Promise<PurchaseResult> {
    if (!UUID.test(accountId)) return 'NO_ACCOUNT';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Row lock: do ek saath aayi khareedari ek ke baad ek chalti hain.
      const row = await client.query<{ coins: number }>(
        'SELECT coins FROM accounts WHERE id = $1 FOR UPDATE',
        [accountId],
      );
      let result: PurchaseResult = 'OK';
      if (!row.rows[0]) {
        result = 'NO_ACCOUNT';
      } else {
        const inserted = await client.query(
          `INSERT INTO account_characters (account_id, character_id, acquired_at)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [accountId, characterId, acquiredAt],
        );
        if (inserted.rowCount === 0) result = 'ALREADY_OWNED';
        else if (row.rows[0].coins < price) result = 'NOT_ENOUGH_COINS';
        else await client.query('UPDATE accounts SET coins = coins - $2 WHERE id = $1', [accountId, price]);
      }
      await client.query(result === 'OK' ? 'COMMIT' : 'ROLLBACK');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async equipCharacter(accountId: string, characterId: string): Promise<boolean> {
    if (!UUID.test(accountId)) return false;
    const res = await this.pool.query(
      `UPDATE accounts SET equipped_character = $2
        WHERE id = $1
          AND ($2 = 'DEFAULT'
               OR EXISTS (SELECT 1 FROM account_characters WHERE account_id = $1 AND character_id = $2))`,
      [accountId, characterId],
    );
    return res.rowCount === 1;
  }
}
