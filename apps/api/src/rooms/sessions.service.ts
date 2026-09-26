import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PlayerId } from '@rmc/shared-types';

/**
 * Guest sessions: token (secret) -> playerId.
 * Reconnect par browser token dikhata hai aur wahi player wapas milta hai.
 * Token sirf usi player ko jata hai; baaki players sirf playerId dekhte hain.
 */
@Injectable()
export class SessionsService {
  private readonly playerByToken = new Map<string, PlayerId>();
  private readonly tokenByPlayer = new Map<PlayerId, string>();
  private readonly accountByPlayer = new Map<PlayerId, string>();

  private readonly playersByAccount = new Map<string, Set<PlayerId>>();

  /** Guest player ko account se jodta hai (accountId null = guest). */
  bindAccount(playerId: PlayerId, accountId: string | null): void {
    const previous = this.accountByPlayer.get(playerId);
    if (previous) {
      const set = this.playersByAccount.get(previous);
      set?.delete(playerId);
      if (set?.size === 0) this.playersByAccount.delete(previous);
    }
    if (!accountId) {
      this.accountByPlayer.delete(playerId);
      return;
    }
    this.accountByPlayer.set(playerId, accountId);
    const players = this.playersByAccount.get(accountId) ?? new Set<PlayerId>();
    players.add(playerId);
    this.playersByAccount.set(accountId, players);
  }

  accountOf(playerId: PlayerId): string | null {
    return this.accountByPlayer.get(playerId) ?? null;
  }

  /** Is account se jude saare players (kai tabs ho sakte hain). */
  playersOf(accountId: string): PlayerId[] {
    return [...(this.playersByAccount.get(accountId) ?? [])];
  }

  create(): { playerId: PlayerId; token: string } {
    const playerId = randomUUID();
    const token = randomUUID();
    this.playerByToken.set(token, playerId);
    this.tokenByPlayer.set(playerId, token);
    return { playerId, token };
  }

  /** Token sahi aur abhi valid hai to playerId, warna null. */
  resolve(token: unknown): PlayerId | null {
    return typeof token === 'string' ? (this.playerByToken.get(token) ?? null) : null;
  }

  tokenOf(playerId: PlayerId): string | null {
    return this.tokenByPlayer.get(playerId) ?? null;
  }

  remove(playerId: PlayerId): void {
    const token = this.tokenByPlayer.get(playerId);
    if (token) this.playerByToken.delete(token);
    this.tokenByPlayer.delete(playerId);
    this.bindAccount(playerId, null);
  }
}
