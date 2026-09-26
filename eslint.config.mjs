import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts (jaise smoke test) ke liye Node globals. ui-check ke browser-side code ke liye DOM globals.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    // GameEngine pure rahna chahiye: koi framework import nahi.
    files: ['packages/game-engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nestjs/*',
            'react',
            'react-dom',
            'pg',
            'ioredis',
            'redis',
            'ws',
            'express',
          ],
        },
      ],
    },
  },
);
