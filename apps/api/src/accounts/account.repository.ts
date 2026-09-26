import type { Achievement, GameHistoryEntry } from '@rmc/shared-types';

export interface AccountRecord {
  id: string;
  /** Hamesha lowercase, unique. */
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  xp: number;
  coins: number;
  gamesPlayed: number;
  wins: number;
  achievements: Achievement[];
  /** Abhi pehna hua character id (DEFAULT ya khareeda hua). */
  equippedCharacter: string;
}

export type PurchaseResult = 'OK' | 'ALREADY_OWNED' | 'NOT_ENOUGH_COINS' | 'NO_ACCOUNT';

/**
 * Storage ka interface. Do implementations: InMemoryAccountRepository (tests / DATABASE_URL ke bina)
 * aur PgAccountRepository (PostgreSQL). Service code dono me ek jaisa chalta hai.
 * Abstract class isliye ki NestJS use DI token ki tarah use kar sake.
 */
export abstract class AccountRepository {
  /** false = username pehle se le liya gaya hai. */
  abstract create(account: AccountRecord): Promise<boolean>;
  abstract findByUsername(username: string): Promise<AccountRecord | null>;
  abstract findById(id: string): Promise<AccountRecord | null>;
  /**
   * Game ka result ek saath save: account ke naye numbers + history entry.
   * Dono ya to saath save hote hain ya dono nahi (transaction).
   */
  abstract saveGameResult(account: AccountRecord, entry: GameHistoryEntry): Promise<void>;
  /** Sabse naya pehle. */
  abstract listHistory(accountId: string, limit: number): Promise<GameHistoryEntry[]>;
  /** Khareede hue characters (DEFAULT isme nahi aata; wo sabke paas hai). */
  abstract listOwnedCharacters(accountId: string): Promise<string[]>;
  /**
   * Character kharidna: coins ghatana + ownership likhna ek saath (atomic).
   * Coins kabhi negative nahi hote; pehle se owned ho to kuch nahi badalta.
   */
  abstract purchaseCharacter(
    accountId: string,
    characterId: string,
    price: number,
    acquiredAt: string,
  ): Promise<PurchaseResult>;
  /** Character pehnna. true = pehna diya (DEFAULT ya owned), false = owned nahi / account nahi. */
  abstract equipCharacter(accountId: string, characterId: string): Promise<boolean>;
}

export class InMemoryAccountRepository extends AccountRepository {
  private readonly byId = new Map<string, AccountRecord>();
  private readonly idByUsername = new Map<string, string>();
  private readonly history = new Map<string, GameHistoryEntry[]>();

  async create(account: AccountRecord): Promise<boolean> {
    if (this.idByUsername.has(account.username)) return false;
    this.byId.set(account.id, structuredClone(account));
    this.idByUsername.set(account.username, account.id);
    return true;
  }

  async findByUsername(username: string): Promise<AccountRecord | null> {
    const id = this.idByUsername.get(username);
    return id ? this.findById(id) : null;
  }

  async findById(id: string): Promise<AccountRecord | null> {
    const found = this.byId.get(id);
    return found ? structuredClone(found) : null;
  }

  async saveGameResult(account: AccountRecord, entry: GameHistoryEntry): Promise<void> {
    if (!this.byId.has(account.id)) return;
    this.byId.set(account.id, structuredClone(account));
    const list = this.history.get(account.id) ?? [];
    list.unshift(structuredClone(entry));
    this.history.set(account.id, list);
  }

  async listHistory(accountId: string, limit: number): Promise<GameHistoryEntry[]> {
    return structuredClone((this.history.get(accountId) ?? []).slice(0, limit));
  }

  private readonly owned = new Map<string, Set<string>>();

  async listOwnedCharacters(accountId: string): Promise<string[]> {
    return [...(this.owned.get(accountId) ?? [])];
  }

  async purchaseCharacter(accountId: string, characterId: string, price: number): Promise<PurchaseResult> {
    const account = this.byId.get(accountId);
    if (!account) return 'NO_ACCOUNT';
    const owned = this.owned.get(accountId) ?? new Set<string>();
    if (owned.has(characterId)) return 'ALREADY_OWNED';
    if (account.coins < price) return 'NOT_ENOUGH_COINS';
    account.coins -= price;
    owned.add(characterId);
    this.owned.set(accountId, owned);
    return 'OK';
  }

  async equipCharacter(accountId: string, characterId: string): Promise<boolean> {
    const account = this.byId.get(accountId);
    if (!account) return false;
    if (characterId !== 'DEFAULT' && !this.owned.get(accountId)?.has(characterId)) return false;
    account.equippedCharacter = characterId;
    return true;
  }
}
