import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Test ke liye shared-types ko seedha source se lo, build ki zaroorat nahi.
      '@rmc/shared-types': fileURLToPath(
        new URL('../shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
