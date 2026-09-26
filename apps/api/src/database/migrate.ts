import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';

/** apps/api/migrations (src/database aur dist/database dono se do level upar). */
export const DEFAULT_MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

/** Ek fixed number: do servers ek saath start hon to migrations ek ke baad ek chalein. */
const MIGRATION_LOCK_ID = 727_274;

/**
 * migrations/*.sql ko naam ke order me chalata hai. Jo pehle chal chuki hain unhe skip karta hai.
 * Har file ek transaction me: poori chalti hai ya bilkul nahi. Chali hui files ke naam wapas milte hain.
 */
export async function runMigrations(pool: Pool, dir: string = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  const ran: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ran.push(file);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return ran;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
