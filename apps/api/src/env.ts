import { join } from 'node:path';

/**
 * Repo root ki .env file (agar ho) se settings load karta hai (Node ka built-in, koi package nahi).
 * Ye main.ts me sabse pehle import hota hai, taaki baaki files env padh sakein.
 * Pehle se set environment variables ko override nahi karta.
 */
try {
  process.loadEnvFile(join(__dirname, '..', '..', '..', '.env'));
} catch {
  // .env nahi hai: theek hai, defaults chalenge.
}
