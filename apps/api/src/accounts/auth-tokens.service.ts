import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Login ke baad ka secret authToken -> accountId. Abhi in-memory (restart par dobara login). */
@Injectable()
export class AuthTokensService {
  /** Tests me fixed time dene ke liye. */
  now: () => number = Date.now;
  private readonly tokens = new Map<string, { accountId: string; expiresAt: number }>();

  issue(accountId: string): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, { accountId, expiresAt: this.now() + TOKEN_TTL_MS });
    return token;
  }

  resolve(token: unknown): string | null {
    if (typeof token !== 'string') return null;
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.tokens.delete(token);
      return null;
    }
    return entry.accountId;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }
}
