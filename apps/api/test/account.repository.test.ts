import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameHistoryEntry } from '@rmc/shared-types';
import {
  InMemoryAccountRepository,
  type AccountRecord,
  type AccountRepository,
} from '../src/accounts/account.repository';
import { PgAccountRepository } from '../src/accounts/pg-account.repository';
import { runMigrations } from '../src/database/migrate';

// ---- Real PostgreSQL mile to test chalte hain, warna PG wale tests skip (in-memory hamesha chalta hai) ----
const url = process.env.DATABASE_URL;
let pool: Pool | null = null;
if (url) {
  const candidate = new Pool({ connectionString: url });
  try {
    await candidate.query('SELECT 1');
    pool = candidate;
  } catch {
    await candidate.end().catch(() => undefined);
  }
}
const runId = randomUUID().slice(0, 8);
const T = '2026-01-01T00:00:00.000Z';

const makeAccount = (over: Partial<AccountRecord> = {}): AccountRecord => ({
  id: randomUUID(),
  username: `t_${runId}_${randomUUID().slice(0, 6)}`,
  displayName: 'Asha',
  passwordHash: 'scrypt$aa$bb',
  createdAt: new Date('2026-01-02T03:04:05.678Z').toISOString(),
  xp: 0,
  coins: 0,
  gamesPlayed: 0,
  wins: 0,
  achievements: [],
  equippedCharacter: 'DEFAULT',
  ...over,
});

const makeEntry = (over: Partial<GameHistoryEntry> = {}): GameHistoryEntry => ({
  id: randomUUID(),
  playedAt: new Date().toISOString(),
  roomCode: 'ABCD',
  points: 2300,
  isWinner: true,
  xpGained: 123,
  coinsGained: 30,
  ...over,
});

/** Dono implementations ek jaisa behave karein. */
function repositoryContract(name: string, getRepo: () => AccountRepository): void {
  describe(`AccountRepository contract: ${name}`, () => {
    it('create: pehli baar true, same username dobara false', async () => {
      const repo = getRepo();
      const a = makeAccount();
      expect(await repo.create(a)).toBe(true);
      expect(await repo.create(makeAccount({ username: a.username }))).toBe(false);
    });

    it('find: sab fields waise hi wapas aate hain', async () => {
      const repo = getRepo();
      const a = makeAccount({ xp: 50, coins: 10, gamesPlayed: 1, wins: 1, achievements: ['FIRST_GAME', 'FIRST_WIN'] });
      await repo.create(a);
      expect(await repo.findById(a.id)).toEqual(a);
      expect(await repo.findByUsername(a.username)).toEqual(a);
    });

    it('anjaan ya galat format ka id/username par null', async () => {
      const repo = getRepo();
      expect(await repo.findById(randomUUID())).toBeNull();
      expect(await repo.findById('not-a-uuid')).toBeNull();
      expect(await repo.findById("'; DROP TABLE accounts; --")).toBeNull();
      expect(await repo.findByUsername(`nobody_${runId}`)).toBeNull();
      expect(await repo.listHistory('not-a-uuid', 5)).toEqual([]);
    });

    it('SQL injection jaisa username sirf ek sadharan string hai', async () => {
      const repo = getRepo();
      expect(await repo.findByUsername("x' OR '1'='1")).toBeNull();
    });

    it('saveGameResult: numbers + history saath save, newest pehle, limit chalti hai', async () => {
      const repo = getRepo();
      const a = makeAccount();
      await repo.create(a);

      const first = makeEntry({ roomCode: 'AAAA' });
      await repo.saveGameResult({ ...a, xp: 123, coins: 30, gamesPlayed: 1, wins: 1, achievements: ['FIRST_GAME'] }, first);
      const second = makeEntry({ roomCode: 'BBBB', isWinner: false, xpGained: 60, coinsGained: 10 });
      await repo.saveGameResult({ ...a, xp: 183, coins: 40, gamesPlayed: 2, wins: 1, achievements: ['FIRST_GAME'] }, second);
      await repo.saveGameResult({ ...a, xp: 200, coins: 50, gamesPlayed: 3, wins: 1, achievements: ['FIRST_GAME'] }, makeEntry({ roomCode: 'CCCC' }));

      expect(await repo.findById(a.id)).toMatchObject({ xp: 200, coins: 50, gamesPlayed: 3, wins: 1 });
      const history = await repo.listHistory(a.id, 10);
      expect(history.map((h) => h.roomCode)).toEqual(['CCCC', 'BBBB', 'AAAA']);
      expect(history[1]).toEqual(second);
      expect(await repo.listHistory(a.id, 2)).toHaveLength(2);
    });

    it('character kharidna: coins ghatte hain, owned list me aata hai, dobara nahi', async () => {
      const repo = getRepo();
      const a = makeAccount({ coins: 120 });
      await repo.create(a);
      expect(await repo.listOwnedCharacters(a.id)).toEqual([]);
      expect(await repo.purchaseCharacter(a.id, 'LION', 100, T)).toBe('OK');
      expect((await repo.findById(a.id))?.coins).toBe(20);
      expect(await repo.listOwnedCharacters(a.id)).toEqual(['LION']);
      expect(await repo.purchaseCharacter(a.id, 'LION', 100, T)).toBe('ALREADY_OWNED');
      expect((await repo.findById(a.id))?.coins).toBe(20); // dobara paisa nahi kata
    });

    it('coins kam ho to kuch nahi badalta; ya bilkul barabar ho to ho jata hai', async () => {
      const repo = getRepo();
      const a = makeAccount({ coins: 99 });
      await repo.create(a);
      expect(await repo.purchaseCharacter(a.id, 'LION', 100, T)).toBe('NOT_ENOUGH_COINS');
      expect((await repo.findById(a.id))?.coins).toBe(99);
      expect(await repo.listOwnedCharacters(a.id)).toEqual([]);
      const b = makeAccount({ coins: 100 });
      await repo.create(b);
      expect(await repo.purchaseCharacter(b.id, 'LION', 100, T)).toBe('OK');
      expect((await repo.findById(b.id))?.coins).toBe(0);
    });

    it('anjaan account par kharidna NO_ACCOUNT', async () => {
      const repo = getRepo();
      expect(await repo.purchaseCharacter(randomUUID(), 'LION', 0, T)).toBe('NO_ACCOUNT');
      expect(await repo.purchaseCharacter('not-a-uuid', 'LION', 0, T)).toBe('NO_ACCOUNT');
      expect(await repo.listOwnedCharacters('not-a-uuid')).toEqual([]);
    });

    it('equip: sirf owned ya DEFAULT', async () => {
      const repo = getRepo();
      const a = makeAccount({ coins: 100 });
      await repo.create(a);
      expect(await repo.equipCharacter(a.id, 'LION')).toBe(false); // owned nahi
      expect((await repo.findById(a.id))?.equippedCharacter).toBe('DEFAULT');
      await repo.purchaseCharacter(a.id, 'LION', 100, T);
      expect(await repo.equipCharacter(a.id, 'LION')).toBe(true);
      expect((await repo.findById(a.id))?.equippedCharacter).toBe('LION');
      expect(await repo.equipCharacter(a.id, 'DEFAULT')).toBe(true);
      expect((await repo.findById(a.id))?.equippedCharacter).toBe('DEFAULT');
      expect(await repo.equipCharacter(randomUUID(), 'DEFAULT')).toBe(false);
      expect(await repo.equipCharacter('not-a-uuid', 'DEFAULT')).toBe(false);
    });

    it('anjaan account ke liye saveGameResult kuch save nahi karta', async () => {
      const repo = getRepo();
      const ghost = makeAccount();
      await repo.saveGameResult({ ...ghost, xp: 10 }, makeEntry());
      expect(await repo.findById(ghost.id)).toBeNull();
      expect(await repo.listHistory(ghost.id, 5)).toEqual([]);
    });
  });
}

repositoryContract('in-memory', () => new InMemoryAccountRepository());

describe.skipIf(!pool)('PostgreSQL', () => {
  const db = pool as Pool;
  const repo = () => new PgAccountRepository(db);

  beforeAll(async () => {
    await runMigrations(db);
  });

  afterAll(async () => {
    // Sirf is run ke test accounts hatao (history cascade se hat jaati hai).
    await db.query('DELETE FROM accounts WHERE username LIKE $1', [`t\\_${runId}\\_%`]);
    await db.end();
  });

  repositoryContract('PostgreSQL', repo);

  it('transaction: history insert fail ho to account ke naye numbers bhi save nahi hote', async () => {
    const r = repo();
    const a = makeAccount();
    await r.create(a);
    const entry = makeEntry();
    await r.saveGameResult({ ...a, xp: 100, gamesPlayed: 1 }, entry);

    // Same history id dobara => unique violation => poora transaction ROLLBACK.
    await expect(r.saveGameResult({ ...a, xp: 999, gamesPlayed: 2 }, entry)).rejects.toThrow();
    expect(await r.findById(a.id)).toMatchObject({ xp: 100, gamesPlayed: 1 });
    expect(await r.listHistory(a.id, 10)).toHaveLength(1);
  });

  it('database rules: username lowercase hi, negative coins nahi', async () => {
    await expect(
      db.query(
        `INSERT INTO accounts (id, username, display_name, password_hash, created_at) VALUES ($1, 'UPPER', 'x', 'x', now())`,
        [randomUUID()],
      ),
    ).rejects.toThrow();
    const a = makeAccount();
    await repo().create(a);
    await expect(db.query('UPDATE accounts SET coins = -1 WHERE id = $1', [a.id])).rejects.toThrow();
  });

  it('ek saath kai khareedari: coins sirf ek baar katte hain, negative nahi hote', async () => {
    const r = repo();
    const a = makeAccount({ coins: 100 });
    await r.create(a);
    const results = await Promise.all(Array.from({ length: 6 }, () => r.purchaseCharacter(a.id, 'LION', 100, T)));
    expect(results.filter((x) => x === 'OK')).toHaveLength(1);
    expect((await r.findById(a.id))?.coins).toBe(0);
    expect(await r.listOwnedCharacters(a.id)).toEqual(['LION']);
  });

  it('alag alag characters ek saath: coins se zyada kharch nahi ho sakta', async () => {
    const r = repo();
    const a = makeAccount({ coins: 250 });
    await r.create(a);
    const ids = ['LION', 'FOX', 'OWL', 'ROBOT']; // har ek 100 maano: 250 me sirf 2 aa sakte hain
    const results = await Promise.all(ids.map((id) => r.purchaseCharacter(a.id, id, 100, T)));
    expect(results.filter((x) => x === 'OK')).toHaveLength(2);
    expect((await r.findById(a.id))?.coins).toBe(50);
    expect(await r.listOwnedCharacters(a.id)).toHaveLength(2);
  });

  it('database rules: equipped_character khaali nahi, account delete par owned characters bhi hat jate hain', async () => {
    const r = repo();
    const a = makeAccount({ coins: 10 });
    await r.create(a);
    await r.purchaseCharacter(a.id, 'CAT', 10, T);
    await db.query('DELETE FROM accounts WHERE id = $1', [a.id]);
    const left = await db.query('SELECT 1 FROM account_characters WHERE account_id = $1', [a.id]);
    expect(left.rowCount).toBe(0);
  });

  it('do ek saath aaye create me sirf ek jeetta hai', async () => {
    const username = `t_${runId}_race`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repo().create(makeAccount({ username }))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  describe('migrations', () => {
    it('dobara chalane par kuch nahi chalta (idempotent)', async () => {
      expect(await runMigrations(db)).toEqual([]);
      const applied = await db.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
      expect(applied.rows.map((r) => r.name)).toContain('001_accounts.sql');
    });

    it('kharab migration rollback hoti hai, pehli wali bachi rehti hai', async () => {
      const schema = `test_mig_${runId}`;
      const dir = await mkdtemp(join(tmpdir(), 'rmc-mig-'));
      await db.query(`CREATE SCHEMA ${schema}`);
      const isolated = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
      try {
        await writeFile(join(dir, '001_ok.sql'), 'CREATE TABLE good (id int);');
        await writeFile(join(dir, '002_bad.sql'), 'CREATE TABLE half (id int); SELECT nonsense_column FROM good;');

        await expect(runMigrations(isolated, dir)).rejects.toThrow(/002_bad\.sql/);

        const tables = await isolated.query<{ table_name: string }>(
          'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
          [schema],
        );
        const names = tables.rows.map((r) => r.table_name);
        expect(names).toContain('good'); // 001 lag chuki
        expect(names).not.toContain('half'); // 002 poori rollback
        const done = await isolated.query<{ name: string }>('SELECT name FROM schema_migrations');
        expect(done.rows.map((r) => r.name)).toEqual(['001_ok.sql']);
      } finally {
        await isolated.end();
        await db.query(`DROP SCHEMA ${schema} CASCADE`);
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
