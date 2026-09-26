import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  calculateRewards,
  evaluateAchievements,
  levelForXp,
  xpForLevel,
  type PlayerGameSummary,
} from '@rmc/game-engine';
import {
  DEFAULT_CHARACTER_ID,
  MAX_NAME_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
  findCharacter,
  type AuthErrorCode,
  type AuthResponse,
  type GameReward,
  type Profile,
  type ShopErrorCode,
} from '@rmc/shared-types';
import { RateLimiter } from '../rooms/rate-limiter';
import { AccountRepository, type AccountRecord } from './account.repository';
import { AuthTokensService } from './auth-tokens.service';
import { hashPassword, verifyPassword } from './password';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ShopError extends Error {
  constructor(
    public readonly code: ShopErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ShopError';
  }
}

const HISTORY_LIMIT = 10;
/** Ek username par ek minute me itni login koshishen. */
const LOGIN_ATTEMPTS_PER_MINUTE = 5;

@Injectable()
export class AccountsService {
  /** Tests me fixed time dene ke liye. */
  now: () => number = Date.now;
  /** Gateway set karta hai: pehna hua character badla (room me sabko naya avatar dikhane ke liye). */
  onCharacterChanged: ((accountId: string, characterId: string) => void) | null = null;
  private readonly loginLimiter = new RateLimiter(LOGIN_ATTEMPTS_PER_MINUTE, 60_000, () => this.now());
  /** Ek account ke updates ek ke baad ek chalte hain (lost update se bachav). */
  private readonly queues = new Map<string, Promise<unknown>>();
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly repo: AccountRepository,
    private readonly tokens: AuthTokensService,
  ) {}

  async register(rawUsername: unknown, rawPassword: unknown, rawDisplayName?: unknown): Promise<AuthResponse> {
    const username = this.normalizeUsername(rawUsername);
    const password = this.validatePassword(rawPassword);
    const displayName =
      typeof rawDisplayName === 'string' && rawDisplayName.trim().length > 0
        ? rawDisplayName.trim().slice(0, MAX_NAME_LENGTH)
        : username;

    const account: AccountRecord = {
      id: randomUUID(),
      username,
      displayName,
      passwordHash: await hashPassword(password),
      createdAt: new Date(this.now()).toISOString(),
      xp: 0,
      coins: 0,
      gamesPlayed: 0,
      wins: 0,
      achievements: [],
      equippedCharacter: DEFAULT_CHARACTER_ID,
    };
    if (!(await this.repo.create(account))) {
      throw new AuthError('USERNAME_TAKEN', 'Ye username pehle se le liya gaya hai.');
    }
    return { authToken: this.tokens.issue(account.id), profile: await this.buildProfile(account) };
  }

  async login(rawUsername: unknown, rawPassword: unknown): Promise<AuthResponse> {
    const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
    const password = typeof rawPassword === 'string' ? rawPassword : '';
    if (!this.loginLimiter.allow(username)) {
      throw new AuthError('RATE_LIMITED', 'Bahut zyada koshishen. Thodi der baad try karo.');
    }
    const account = await this.repo.findByUsername(username);
    // Account na ho tab bhi hash chalao, taaki timing se username pata na chale.
    const ok = await verifyPassword(password, account?.passwordHash ?? (await this.getDummyHash()));
    if (!account || !ok) throw new AuthError('BAD_CREDENTIALS', 'Username ya password galat hai.');
    return { authToken: this.tokens.issue(account.id), profile: await this.buildProfile(account) };
  }

  logout(authToken: string): void {
    this.tokens.revoke(authToken);
  }

  /** Valid authToken se accountId, warna null. */
  authenticate(authToken: unknown): string | null {
    return this.tokens.resolve(authToken);
  }

  async getProfile(accountId: string): Promise<Profile> {
    const account = await this.repo.findById(accountId);
    if (!account) throw new AuthError('UNAUTHORIZED', 'Account nahi mila.');
    return this.buildProfile(account);
  }

  /**
   * Game khatam hone par rewards. Server ne summary khud history se nikali hai.
   * null = account nahi mila.
   */
  recordGame(
    accountId: string,
    game: { roomCode: string; summary: PlayerGameSummary },
  ): Promise<GameReward | null> {
    return this.serialized(accountId, async () => {
      const account = await this.repo.findById(accountId);
      if (!account) return null;

      const { xp, coins } = calculateRewards(game.summary);
      const levelBefore = levelForXp(account.xp);
      account.xp += xp;
      account.coins += coins;
      account.gamesPlayed += 1;
      if (game.summary.isWinner) account.wins += 1;
      const newAchievements = evaluateAchievements(account, game.summary, account.achievements);
      account.achievements = [...account.achievements, ...newAchievements];

      await this.repo.saveGameResult(account, {
        id: randomUUID(),
        playedAt: new Date(this.now()).toISOString(),
        roomCode: game.roomCode,
        points: game.summary.points,
        isWinner: game.summary.isWinner,
        xpGained: xp,
        coinsGained: coins,
      });

      const level = levelForXp(account.xp);
      return {
        xpGained: xp,
        coinsGained: coins,
        level,
        leveledUp: level > levelBefore,
        newAchievements,
      };
    });
  }

  /**
   * Character kharidna. Server hi daam, level aur coins check karta hai; browser sirf "kharidna hai" bolta hai.
   * Updates ek account ke liye ek ke baad ek chalte hain (game ke reward ke saath bhi takraav nahi).
   */
  purchaseCharacter(accountId: string, rawCharacterId: unknown): Promise<Profile> {
    return this.serialized(accountId, async () => {
      const def = typeof rawCharacterId === 'string' ? findCharacter(rawCharacterId) : undefined;
      if (!def) throw new ShopError('UNKNOWN_ITEM', 'Ye character nahi mila.');
      if (def.price === 0) throw new ShopError('ALREADY_OWNED', 'Ye character aapke paas pehle se hai.');
      const account = await this.repo.findById(accountId);
      if (!account) throw new ShopError('UNAUTHORIZED', 'Account nahi mila.');
      if (levelForXp(account.xp) < def.minLevel) {
        throw new ShopError('LEVEL_TOO_LOW', `Ye character level ${def.minLevel} par milta hai.`);
      }
      const result = await this.repo.purchaseCharacter(
        accountId,
        def.id,
        def.price,
        new Date(this.now()).toISOString(),
      );
      if (result === 'ALREADY_OWNED') throw new ShopError('ALREADY_OWNED', 'Ye character aapke paas pehle se hai.');
      if (result === 'NOT_ENOUGH_COINS') throw new ShopError('NOT_ENOUGH_COINS', 'Coins kam hain.');
      if (result === 'NO_ACCOUNT') throw new ShopError('UNAUTHORIZED', 'Account nahi mila.');
      return this.getProfile(accountId);
    });
  }

  /** Apna khareeda hua (ya DEFAULT) character pehnna. */
  equipCharacter(accountId: string, rawCharacterId: unknown): Promise<Profile> {
    return this.serialized(accountId, async () => {
      const def = typeof rawCharacterId === 'string' ? findCharacter(rawCharacterId) : undefined;
      if (!def) throw new ShopError('UNKNOWN_ITEM', 'Ye character nahi mila.');
      if (!(await this.repo.equipCharacter(accountId, def.id))) {
        throw new ShopError('NOT_OWNED', 'Ye character aapke paas nahi hai.');
      }
      this.onCharacterChanged?.(accountId, def.id);
      return this.getProfile(accountId);
    });
  }

  private async buildProfile(account: AccountRecord): Promise<Profile> {
    const level = levelForXp(account.xp);
    return {
      accountId: account.id,
      username: account.username,
      displayName: account.displayName,
      xp: account.xp,
      level,
      levelStartXp: xpForLevel(level),
      nextLevelXp: xpForLevel(level + 1),
      coins: account.coins,
      gamesPlayed: account.gamesPlayed,
      wins: account.wins,
      achievements: [...account.achievements],
      ownedCharacters: [DEFAULT_CHARACTER_ID, ...(await this.repo.listOwnedCharacters(account.id))],
      equippedCharacter: findCharacter(account.equippedCharacter) ? account.equippedCharacter : DEFAULT_CHARACTER_ID,
      history: await this.repo.listHistory(account.id, HISTORY_LIMIT),
    };
  }

  private normalizeUsername(raw: unknown): string {
    const username = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!USERNAME_PATTERN.test(username)) {
      throw new AuthError('INVALID_USERNAME', 'Username 3-20 characters: a-z, 0-9, _.');
    }
    return username;
  }

  private validatePassword(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) {
      throw new AuthError(
        'INVALID_PASSWORD',
        `Password ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters ka hona chahiye.`,
      );
    }
    return raw;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword('dummy-password-for-timing');
    return this.dummyHash;
  }

  private serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => undefined);
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
    return run;
  }
}
