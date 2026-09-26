import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // shared-types CommonJS me build hota hai (API ke liye); web ko source se lo.
      '@rmc/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  // host 0.0.0.0: same WiFi ke phone/laptop se http://<PC-ka-IP>:5173 khul sake.
  server: { host: '0.0.0.0', port: 5173 },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
