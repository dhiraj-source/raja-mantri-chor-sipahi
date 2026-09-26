import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Repo ki .env (agar ho) se DATABASE_URL lo, taaki PostgreSQL tests chal sakein.
try {
  process.loadEnvFile(src('../../.env'));
} catch {
  // .env nahi hai: PostgreSQL tests skip ho jayenge.
}

export default defineConfig({
  resolve: {
    alias: {
      // Tests ke liye packages ko seedha source se lo, build ki zaroorat nahi.
      '@rmc/shared-types': src('../../packages/shared-types/src/index.ts'),
      '@rmc/game-engine': src('../../packages/game-engine/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
