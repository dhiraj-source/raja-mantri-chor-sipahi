import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { runMigrations } from './migrate';

/** DI token: PostgreSQL pool, ya null jab DATABASE_URL set nahi (tab in-memory storage). */
export const PG_POOL = Symbol('PG_POOL');

/**
 * DATABASE_URL set hai => ek shared pool; migrations start par ek baar chalti hain.
 * Set nahi => null (repositories in-memory chalti hain).
 */
async function createPool(): Promise<Pool | null> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('DATABASE_URL not set: data is stored in memory only (lost on restart).');
    return null;
  }
  const pool = new Pool({ connectionString: url });
  try {
    const ran = await runMigrations(pool);
    console.log(`PostgreSQL connected. Migrations applied now: ${ran.length ? ran.join(', ') : 'none (up to date)'}`);
  } catch (e) {
    await pool.end().catch(() => undefined);
    throw new Error(
      `Could not connect to PostgreSQL (${e instanceof Error ? e.message : String(e)}). ` +
        'Is Docker running? Try: npm run db:up',
    );
  }
  return pool;
}

@Module({
  providers: [{ provide: PG_POOL, useFactory: createPool }],
  exports: [PG_POOL],
})
export class DatabaseModule {}
