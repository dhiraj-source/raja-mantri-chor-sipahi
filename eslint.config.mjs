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
    // GameEngine pure rahna chahiye: koi framework import nahi. Draw & Guess aur Bomb Tag ke
    // engines bhi waisi hi pure packages hain (RMCS engine se alag, par same rule apply hoti hai).
    files: [
      'packages/game-engine/src/**/*.ts',
      'packages/draw-guess-engine/src/**/*.ts',
      'packages/bomb-tag-engine/src/**/*.ts',
    ],
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
